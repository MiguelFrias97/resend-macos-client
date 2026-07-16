import Foundation
import AppKit
import UserNotifications
import React

@objc(Notifications)
class Notifications: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  // Cached authorization result, set once by authorize().
  private static var granted = false

  // Request notification permission exactly once, at app launch. Safe to call
  // more than once — UNUserNotificationCenter only prompts the first time — but
  // AppDelegate calls it a single time in applicationDidFinishLaunching.
  @objc static func authorize() {
    UNUserNotificationCenter.current()
      .requestAuthorization(options: [.alert, .sound]) { ok, _ in
        granted = ok
      }
  }

  @objc(notify:body:)
  func notify(_ title: String, body: String) {
    DispatchQueue.main.async {
      // Don't notify while the app is focused.
      if NSApp.isActive { return }
      guard Notifications.granted else { return }
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      UNUserNotificationCenter.current().add(
        UNNotificationRequest(
          identifier: UUID().uuidString, content: content, trigger: nil))
    }
  }
}
