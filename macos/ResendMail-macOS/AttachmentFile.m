#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AttachmentFile, NSObject)
RCT_EXTERN_METHOD(cacheDir:(NSString *)messageId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(writeToCache:(NSString *)messageId name:(NSString *)name base64:(NSString *)base64
                  quarantine:(BOOL)quarantine
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(saveAs:(NSString *)srcPath suggestedName:(NSString *)suggestedName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
