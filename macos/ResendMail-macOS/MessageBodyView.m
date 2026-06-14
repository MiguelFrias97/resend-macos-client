#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(MessageBodyViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(html, NSString)
RCT_EXPORT_VIEW_PROPERTY(allowRemote, BOOL)
RCT_EXPORT_VIEW_PROPERTY(cacheDir, NSString)
@end
