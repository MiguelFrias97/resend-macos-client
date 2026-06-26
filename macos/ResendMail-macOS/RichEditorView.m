#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(RichEditorViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(onChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSubmit, RCTBubblingEventBlock)
@end
