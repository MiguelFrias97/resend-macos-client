#import "AppDelegate.h"

#import <AppKit/AppKit.h>
#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import "ResendMail-Swift.h"

@implementation AppDelegate

// Retained for the app's lifetime so App Nap can't throttle/coalesce the JS
// sync timer (src/core/sync.js) when the window is buried in the background.
static id<NSObject> gSyncActivity = nil;

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"ResendMail";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};
  self.dependencyProvider = [RCTAppDependencyProvider new];

  [super applicationDidFinishLaunching:notification];

  // Keep the main window object alive after the user clicks the red close
  // button, so it can be reshown from the Dock (see applicationShouldHandleReopen
  // below). Without this, the closed window is released and clicking the Dock
  // icon does nothing.
  self.window.releasedWhenClosed = NO;

  [self installMessageMenu];

  // Ask for notification permission once (see Notifications.swift).
  [Notifications authorize];

  // Keep the periodic mail sync running at cadence in the background.
  gSyncActivity = [[NSProcessInfo processInfo]
      beginActivityWithOptions:NSActivityBackground
                        reason:@"Periodic mail sync"];
}

// Add a "Message" menu with key equivalents. Each item posts an RMMenuCommand
// notification; the MenuEvents emitter relays it to JS, which runs the action.
// This is the correct macOS way to do app-wide shortcuts (instead of a focusable
// RN view, which swallowed mouse clicks).
- (void)installMessageMenu
{
  NSMenu *mainMenu = [NSApp mainMenu];
  if (mainMenu == nil) {
    return;
  }
  NSMenu *msgMenu = [[NSMenu alloc] initWithTitle:@"Message"];

  [[msgMenu addItemWithTitle:@"New Message"
                      action:@selector(rmCompose:)
               keyEquivalent:@"n"] setTarget:self];
  [[msgMenu addItemWithTitle:@"Reply"
                      action:@selector(rmReply:)
               keyEquivalent:@"r"] setTarget:self];
  NSMenuItem *fwd = [msgMenu addItemWithTitle:@"Forward"
                                       action:@selector(rmForward:)
                                keyEquivalent:@"f"];
  fwd.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
  [fwd setTarget:self];

  NSMenuItem *msgItem = [[NSMenuItem alloc] init];
  msgItem.submenu = msgMenu;
  // Insert before the trailing Window/Help menus when present.
  NSInteger idx = mainMenu.numberOfItems > 1 ? mainMenu.numberOfItems - 1 : mainMenu.numberOfItems;
  [mainMenu insertItem:msgItem atIndex:idx];
}

- (void)rmCompose:(id)sender { [self rmPost:@"compose"]; }
- (void)rmReply:(id)sender { [self rmPost:@"reply"]; }
- (void)rmForward:(id)sender { [self rmPost:@"forward"]; }
- (void)rmPost:(NSString *)command
{
  [[NSNotificationCenter defaultCenter] postNotificationName:@"RMMenuCommand" object:command];
}

// macOS keeps the app running after its last window closes. When the user then
// clicks the Dock icon (no visible windows), bring the existing window back
// instead of leaving the app with no UI.
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag
{
  if (!flag && self.window != nil) {
    [self.window makeKeyAndOrderFront:self];
  }
  return YES;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
#ifdef RN_FABRIC_ENABLED
  return true;
#else
  return false;
#endif
}

@end
