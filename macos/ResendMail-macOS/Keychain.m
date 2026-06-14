#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Keychain, NSObject)
RCT_EXTERN_METHOD(setApiKey:(NSString *)service key:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getApiKey:(NSString *)service
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearApiKey:(NSString *)service
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
