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

  @objc(writeToCache:name:base64:resolver:rejecter:)
  func writeToCache(_ messageId: String, name: String, base64: String,
                    resolver resolve: RCTPromiseResolveBlock,
                    rejecter reject: RCTPromiseRejectBlock) {
    guard let data = Data(base64Encoded: base64) else {
      reject("write_decode", "invalid base64", nil)
      return
    }
    do {
      let safeName = (name as NSString).lastPathComponent
      let fileURL = try dir(for: messageId).appendingPathComponent(safeName)
      try data.write(to: fileURL)
      // Mark quarantined so Gatekeeper/XProtect screen it when the user opens it.
      let quarantine = "0181;00000000;ResendMail;"
      _ = quarantine.withCString { cstr in
        setxattr(fileURL.path, "com.apple.quarantine", cstr, strlen(cstr), 0, 0)
      }
      resolve(fileURL.path)
    } catch {
      reject("write_cache", error.localizedDescription, error)
    }
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
