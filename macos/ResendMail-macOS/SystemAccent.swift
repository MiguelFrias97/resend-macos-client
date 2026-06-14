import Foundation
import AppKit
import React

@objc(SystemAccent)
class SystemAccent: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(getAccentColor:rejecter:)
  func getAccentColor(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let c = NSColor.controlAccentColor.usingColorSpace(.sRGB) ?? NSColor.systemBlue
      let r = Int(round(c.redComponent * 255))
      let g = Int(round(c.greenComponent * 255))
      let b = Int(round(c.blueComponent * 255))
      resolve(String(format: "#%02x%02x%02x", r, g, b))
    }
  }
}
