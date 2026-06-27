#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(RichEditorViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(onChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onSubmit, RCTBubblingEventBlock)
@end

@interface RCT_EXTERN_MODULE(SymbolViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(name, NSString)
RCT_EXPORT_VIEW_PROPERTY(pointSize, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(weight, NSString)
RCT_EXPORT_VIEW_PROPERTY(tintColor, NSString)
@end
