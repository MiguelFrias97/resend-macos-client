#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RichEditor, NSObject)
RCT_EXTERN_METHOD(toggleBold)
RCT_EXTERN_METHOD(toggleItalic)
RCT_EXTERN_METHOD(toggleUnderline)
RCT_EXTERN_METHOD(insertList:(BOOL)ordered)
RCT_EXTERN_METHOD(setLink:(NSString *)url)
@end
