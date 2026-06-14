#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AttachmentFile, NSObject)
RCT_EXTERN_METHOD(cacheDir:(NSString *)messageId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(downloadToCache:(NSString *)messageId name:(NSString *)name url:(NSString *)url
                  quarantine:(BOOL)quarantine
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(saveAs:(NSString *)srcPath suggestedName:(NSString *)suggestedName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
