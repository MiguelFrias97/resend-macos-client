import Foundation
import AppKit
import UserNotifications
import React

@objc(Notifications)
class Notifications: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  // Prompt for notification permission once, at app launch (AppDelegate calls
  // this in applicationDidFinishLaunching). The system only shows the prompt the
  // first time; later calls are no-ops.
  @objc static func authorize() {
    UNUserNotificationCenter.current()
      .requestAuthorization(options: [.alert, .sound]) { _, _ in }
  }

  @objc(notify:body:)
  func notify(_ title: String, body: String) {
    DispatchQueue.main.async {
      // Don't notify while the app is focused.
      if NSApp.isActive { return }
      let center = UNUserNotificationCenter.current()
      // Read the live authorization status on every call rather than caching a
      // one-time flag: this way a permission the user grants later in the session
      // takes effect immediately, and we never post after a denial. Avoids the
      // stale-gate and cross-thread-static problems of a cached Bool.
      center.getNotificationSettings { settings in
        guard settings.authorizationStatus == .authorized
          || settings.authorizationStatus == .provisional else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        center.add(
          UNNotificationRequest(
            identifier: UUID().uuidString, content: content, trigger: nil))
      }
    }
  }
}
