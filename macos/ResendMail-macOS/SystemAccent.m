#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SystemAccent, NSObject)
RCT_EXTERN_METHOD(getAccentColor:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
