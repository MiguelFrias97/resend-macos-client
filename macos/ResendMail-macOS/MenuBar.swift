import Foundation
import AppKit
import React

@objc(MenuBar)
class MenuBar: NSObject {
  private var statusItem: NSStatusItem?

  // Touches NSStatusBar (UI), so init on the main queue.
  @objc static func requiresMainQueueSetup() -> Bool { true }

  override init() {
    super.init()
    DispatchQueue.main.async { self.setup() }
  }

  private func setup() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    if let button = item.button {
      let img = NSImage(systemSymbolName: "envelope", accessibilityDescription: "ResendMail")
      img?.isTemplate = true
      button.image = img
      button.imagePosition = .imageLeading
    }
    let menu = NSMenu()
    let open = NSMenuItem(title: "Open Inbox", action: #selector(openInbox), keyEquivalent: "")
    let sync = NSMenuItem(title: "Sync Now", action: #selector(syncNow), keyEquivalent: "")
    let quit = NSMenuItem(title: "Quit ResendMail", action: #selector(quitApp), keyEquivalent: "")
    for i in [open, sync] { i.target = self; menu.addItem(i) }
    menu.addItem(NSMenuItem.separator())
    quit.target = self
    menu.addItem(quit)
    item.menu = menu
    self.statusItem = item
  }

  @objc(setUnread:)
  func setUnread(_ count: NSNumber) {
    DispatchQueue.main.async {
      guard let button = self.statusItem?.button else { return }
      let n = count.intValue
      button.title = n > 0 ? " \(n)" : ""
    }
  }

  deinit {
    let item = statusItem
    DispatchQueue.main.async {
      if let item = item { NSStatusBar.system.removeStatusItem(item) }
    }
  }

  @objc private func openInbox() {
    NSApp.activate(ignoringOtherApps: true)
    // Bring the main content window forward. NSApp.windows also contains the
    // status-item window (and any panels) in an unspecified order, so pick the
    // first window that can actually become main rather than windows.first.
    let target = NSApp.windows.first(where: { $0.canBecomeMain }) ?? NSApp.windows.first
    target?.makeKeyAndOrderFront(nil)
  }

  @objc private func syncNow() {
    NotificationCenter.default.post(
      name: Notification.Name("RMMenuCommand"), object: "syncNow")
  }

  @objc private func quitApp() {
    NSApp.terminate(nil)
  }
}
