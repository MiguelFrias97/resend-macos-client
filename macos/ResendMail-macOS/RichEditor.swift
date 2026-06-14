import Foundation
import AppKit
import React

// Formatting commands dispatched from the JS toolbar. They act on the most
// recently active RichEditor's NSTextView, over its current selection.
@objc(RichEditor)
class RichEditor: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  private func withEditor(_ body: @escaping (NSTextView, NSRange) -> Void) {
    DispatchQueue.main.async {
      guard let view = RichEditorNSView.active else { return }
      let tv = view.textView
      body(tv, tv.selectedRange())
    }
  }

  private func toggleFontTrait(_ trait: NSFontTraitMask) {
    withEditor { tv, range in
      let fm = NSFontManager.shared
      // No selection: toggle the typing attributes so the next typed run uses it
      // (matches every standard editor's toggle-then-type behavior).
      if range.length == 0 {
        let current = (tv.typingAttributes[.font] as? NSFont)
          ?? tv.font ?? NSFont.systemFont(ofSize: 14)
        let has = fm.traits(of: current).contains(trait)
        tv.typingAttributes[.font] = has
          ? fm.convert(current, toNotHaveTrait: trait)
          : fm.convert(current, toHaveTrait: trait)
        return
      }
      guard let storage = tv.textStorage else { return }
      let firstFont = (storage.attribute(.font, at: range.location, effectiveRange: nil) as? NSFont)
        ?? NSFont.systemFont(ofSize: 14)
      let has = fm.traits(of: firstFont).contains(trait)
      storage.enumerateAttribute(.font, in: range, options: []) { value, sub, _ in
        let font = (value as? NSFont) ?? NSFont.systemFont(ofSize: 14)
        let newFont = has
          ? fm.convert(font, toNotHaveTrait: trait)
          : fm.convert(font, toHaveTrait: trait)
        storage.addAttribute(.font, value: newFont, range: sub)
      }
      tv.didChangeText()
    }
  }

  @objc func toggleBold() { toggleFontTrait(.boldFontMask) }
  @objc func toggleItalic() { toggleFontTrait(.italicFontMask) }

  @objc func toggleUnderline() {
    withEditor { tv, range in
      if range.length == 0 {
        let current = (tv.typingAttributes[.underlineStyle] as? NSNumber)?.intValue ?? 0
        tv.typingAttributes[.underlineStyle] =
          current == 0 ? NSUnderlineStyle.single.rawValue : 0
        return
      }
      guard let storage = tv.textStorage else { return }
      let current = (storage.attribute(.underlineStyle, at: range.location, effectiveRange: nil) as? NSNumber)?.intValue ?? 0
      let next = current == 0 ? NSUnderlineStyle.single.rawValue : 0
      storage.addAttribute(.underlineStyle, value: next, range: range)
      tv.didChangeText()
    }
  }

  @objc func insertList(_ ordered: Bool) {
    withEditor { tv, range in
      guard let storage = tv.textStorage else { return }
      let list = NSTextList(markerFormat: ordered ? .decimal : .disc, options: 0)
      let nsString = storage.string as NSString
      let paraRange = nsString.paragraphRange(for: range)
      let style = NSMutableParagraphStyle()
      style.textLists = [list]
      style.headIndent = 24
      style.firstLineHeadIndent = 0
      storage.addAttribute(.paragraphStyle, value: style, range: paraRange)
      tv.didChangeText()
    }
  }

  @objc func setLink(_ url: String) {
    withEditor { tv, range in
      guard range.length > 0, let storage = tv.textStorage else { return }
      storage.addAttribute(.link, value: url, range: range)
      tv.didChangeText()
    }
  }
}
