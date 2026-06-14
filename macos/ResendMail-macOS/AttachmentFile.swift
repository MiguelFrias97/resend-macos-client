import Foundation
import AppKit
import React

@objc(AttachmentFile)
class AttachmentFile: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  private func attachmentsBase() throws -> URL {
    let fm = FileManager.default
    let appSupport = try fm.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    return appSupport.appendingPathComponent("ResendMail/attachments", isDirectory: true)
  }

  private func dir(for messageId: String) throws -> URL {
    let safeId = (messageId as NSString).lastPathComponent
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
    guard let remote = URL(string: url) else {
      reject("bad_url", "invalid download url", nil)
      return
    }
    let task = URLSession.shared.dataTask(with: remote) { data, _, error in
      if let error = error {
        reject("download", error.localizedDescription, error)
        return
      }
      guard let data = data else {
        reject("download", "no data", nil)
        return
      }
      do {
        let safeName = (name as NSString).lastPathComponent
        let fileURL = try self.dir(for: messageId).appendingPathComponent(safeName)
        try data.write(to: fileURL)
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

  @objc(saveAs:suggestedName:resolver:rejecter:)
  func saveAs(_ srcPath: String, suggestedName: String,
              resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
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
