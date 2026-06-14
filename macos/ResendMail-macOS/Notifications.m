#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Notifications, NSObject)
RCT_EXTERN_METHOD(notify:(NSString *)title body:(NSString *)body)
@end
