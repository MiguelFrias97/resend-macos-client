import Foundation
import AppKit
import React
import UniformTypeIdentifiers

@objc(AttachmentFile)
class AttachmentFile: NSObject, URLSessionTaskDelegate {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  // Per-file cap for outgoing attachments (Resend's total limit is ~40MB; keep
  // each file well under so a couple of files don't blow the budget).
  private static let maxAttachmentBytes = 20 * 1024 * 1024

  // Present a native open panel and return the chosen files as Resend attachment
  // parts: { filename, content (base64), contentType, size }. Files over the cap
  // are returned with `tooLarge: true` (no content) so the UI can flag them.
  @objc(pickAttachments:rejecter:)
  func pickAttachments(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let panel = NSOpenPanel()
      panel.canChooseFiles = true
      panel.canChooseDirectories = false
      panel.allowsMultipleSelection = true
      panel.message = "Choose files to attach"
      guard panel.runModal() == .OK else {
        resolve([])
        return
      }
      var out: [[String: Any]] = []
      for url in panel.urls {
        let name = url.lastPathComponent
        let mime = AttachmentFile.mimeType(for: url)
        guard let data = try? Data(contentsOf: url) else { continue }
        if data.count > AttachmentFile.maxAttachmentBytes {
          out.append(["filename": name, "contentType": mime, "size": data.count, "tooLarge": true])
          continue
        }
        out.append([
          "filename": name,
          "content": data.base64EncodedString(),
          "contentType": mime,
          "size": data.count,
        ])
      }
      resolve(out)
    }
  }

  private static func mimeType(for url: URL) -> String {
    if let type = UTType(filenameExtension: url.pathExtension),
       let mime = type.preferredMIMEType {
      return mime
    }
    return "application/octet-stream"
  }

  // A session that refuses to follow a redirect to anything but https, so an
  // https download URL can't 302 us to http://localhost or an internal host
  // (the scheme guard on downloadToCache only covers the first hop).
  private lazy var session: URLSession = {
    URLSession(configuration: .default, delegate: self, delegateQueue: nil)
  }()

  func urlSession(_ session: URLSession,
                  task: URLSessionTask,
                  willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest,
                  completionHandler: @escaping (URLRequest?) -> Void) {
    if request.url?.scheme?.lowercased() == "https" {
      completionHandler(request)
    } else {
      completionHandler(nil) // cancel the redirect; the task ends with what it has
    }
  }

  private func attachmentsBase() throws -> URL {
    let fm = FileManager.default
    let appSupport = try fm.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    return appSupport.appendingPathComponent("ResendMail/attachments", isDirectory: true)
  }

  // Reduce an untrusted string to a single safe filename component. lastPathComponent
  // alone does NOT neutralize ".." (it returns ".."), so reject traversal/empty
  // components explicitly. Returns nil if nothing safe remains.
  static func safeComponent(_ raw: String) -> String? {
    let base = (raw as NSString).lastPathComponent
    if base.isEmpty || base == "." || base == ".." || base.contains("/") || base.contains("\0") {
      return nil
    }
    return base
  }

  private func dir(for messageId: String) throws -> URL {
    guard let safeId = AttachmentFile.safeComponent(messageId) else {
      throw NSError(domain: "AttachmentFile", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "invalid message id"])
    }
    let url = try attachmentsBase().appendingPathComponent(safeId, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  @objc(cacheDir:resolver:rejecter:)
  func cacheDir(_ messageId: String,
                resolver resolve: RCTPromiseResolveBlock,
                rejecter reject: RCTPromiseRejectBlock) {
    do {
      resolve(try dir(for: messageId).path)
    } catch {
      reject("cache_dir", error.localizedDescription, error)
    }
  }

  // Quarantine user-facing files so Gatekeeper/XProtect screen them on open.
  private func setQuarantine(_ path: String) {
    let hexTime = String(format: "%08x", UInt(Date().timeIntervalSince1970))
    let value = "0181;\(hexTime);ResendMail;\(UUID().uuidString)"
    let ok = value.withCString { cstr in
      setxattr(path, "com.apple.quarantine", cstr, strlen(cstr), 0, 0)
    }
    if ok != 0 {
      NSLog("AttachmentFile: failed to set quarantine xattr on \(path)")
    }
  }

  // Download bytes from a presigned URL straight into the per-message cache.
  // Done natively (no base64 across the bridge) so large attachments don't
  // block the JS thread. Inline (cid) images pass quarantine=false.
  @objc(downloadToCache:name:url:quarantine:resolver:rejecter:)
  func downloadToCache(_ messageId: String, name: String, url: String, quarantine: Bool,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    // download url is server-supplied: require https so a spoofed response can't
    // point us at file:// (local-file read) or an internal host (SSRF).
    guard let remote = URL(string: url), remote.scheme?.lowercased() == "https" else {
      reject("bad_url", "download url must be https", nil)
      return
    }
    let task = session.dataTask(with: remote) { data, response, error in
      if let error = error {
        reject("download", error.localizedDescription, error)
        return
      }
      // A non-200 presigned URL (expired/forbidden) returns error=nil with an
      // error body — guard so we never write that body as the file.
      if let http = response as? HTTPURLResponse, http.statusCode != 200 {
        reject("download", "http \(http.statusCode)", nil)
        return
      }
      guard let data = data else {
        reject("download", "no data", nil)
        return
      }
      do {
        guard let safeName = AttachmentFile.safeComponent(name) else {
          reject("bad_name", "invalid attachment name", nil)
          return
        }
        let fileURL = try self.dir(for: messageId).appendingPathComponent(safeName)
        try data.write(to: fileURL, options: .atomic)
        if quarantine {
          self.setQuarantine(fileURL.path)
        }
        resolve(fileURL.path)
      } catch {
        reject("write_cache", error.localizedDescription, error)
      }
    }
    task.resume()
  }

  @objc(exists:resolver:rejecter:)
  func exists(_ path: String,
              resolver resolve: RCTPromiseResolveBlock,
              rejecter reject: RCTPromiseRejectBlock) {
    resolve(FileManager.default.fileExists(atPath: path))
  }

  // Read a cached file as base64 — used to embed forwarded attachment bytes
  // directly in the send payload (durable, unlike a presigned URL that expires).
  @objc(readBase64:resolver:rejecter:)
  func readBase64(_ path: String,
                  resolver resolve: RCTPromiseResolveBlock,
                  rejecter reject: RCTPromiseRejectBlock) {
    guard let data = FileManager.default.contents(atPath: path) else {
      reject("read", "file not found: \(path)", nil)
      return
    }
    resolve(data.base64EncodedString())
  }

  @objc(saveAs:suggestedName:dangerous:resolver:rejecter:)
  func saveAs(_ srcPath: String, suggestedName: String, dangerous: Bool,
              resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      // Warn before saving a file whose type looks unsafe or mismatched.
      if dangerous {
        let alert = NSAlert()
        alert.messageText = "This attachment may be unsafe"
        alert.informativeText =
          "\"\(suggestedName)\" looks like it could be executable, or its type "
          + "doesn't match its name. Only save it if you trust the sender."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Save Anyway")
        alert.addButton(withTitle: "Cancel")
        if alert.runModal() != .alertFirstButtonReturn {
          reject("cancelled", "user declined unsafe save", nil)
          return
        }
      }
      let panel = NSSavePanel()
      panel.nameFieldStringValue = (suggestedName as NSString).lastPathComponent
      guard panel.runModal() == .OK, let dest = panel.url else {
        reject("cancelled", "save cancelled", nil)
        return
      }
      do {
        let fm = FileManager.default
        if fm.fileExists(atPath: dest.path) {
          try fm.removeItem(at: dest)
        }
        try fm.copyItem(at: URL(fileURLWithPath: srcPath), to: dest)
        resolve(dest.path)
      } catch {
        reject("save_copy", error.localizedDescription, error)
      }
    }
  }
}
