import Foundation
import ServiceManagement
import React

@objc(LoginItem)
class LoginItem: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(isEnabled:rejecter:)
  func isEnabled(_ resolve: RCTPromiseResolveBlock,
                 rejecter reject: RCTPromiseRejectBlock) {
    if #available(macOS 13.0, *) {
      resolve(SMAppService.mainApp.status == .enabled)
    } else {
      resolve(false)
    }
  }

  @objc(setEnabled:resolver:rejecter:)
  func setEnabled(_ enabled: Bool,
                  resolver resolve: RCTPromiseResolveBlock,
                  rejecter reject: RCTPromiseRejectBlock) {
    if #available(macOS 13.0, *) {
      do {
        if enabled { try SMAppService.mainApp.register() }
        else { try SMAppService.mainApp.unregister() }
        resolve(SMAppService.mainApp.status == .enabled)
      } catch {
        // Non-fatal: ad-hoc builds can't register. Report so JS can reflect it.
        reject("login_item", error.localizedDescription, error)
      }
    } else {
      reject("login_item", "Launch at login requires macOS 13 or later", nil)
    }
  }
}
