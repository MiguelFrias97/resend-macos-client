#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AttachmentFile, NSObject)
RCT_EXTERN_METHOD(cacheDir:(NSString *)messageId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(downloadToCache:(NSString *)messageId name:(NSString *)name url:(NSString *)url
                  quarantine:(BOOL)quarantine
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(exists:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readBase64:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(saveAs:(NSString *)srcPath suggestedName:(NSString *)suggestedName
                  dangerous:(BOOL)dangerous
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(pickAttachments:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
