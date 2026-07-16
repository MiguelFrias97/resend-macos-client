#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MenuBar, NSObject)
RCT_EXTERN_METHOD(setUnread:(nonnull NSNumber *)count)
RCT_EXTERN_METHOD(setVisible:(BOOL)visible)
@end
