import Foundation
import AppKit
import React

// React Native view manager. RN strips the "Manager" suffix, so this is
// registered as the `RichEditorView` component on the JS side.
@objc(RichEditorViewManager)
class RichEditorViewManager: RCTViewManager {
  override func view() -> NSView! {
    return RichEditorNSView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}

// An editable NSTextView (inside a scroll view) that accepts rich text and
// dropped images, and serializes its content to the JSON document model the
// JS layer turns into email HTML.
class RichEditorNSView: NSView, NSTextViewDelegate {
  // The text view currently being edited — the RichEditor command module acts
  // on this. Weak so it doesn't outlive the view.
  static weak var active: RichEditorNSView?

  let textView: NSTextView
  private let scrollView: NSScrollView

  @objc var onChange: RCTBubblingEventBlock?

  override init(frame frameRect: NSRect) {
    scrollView = NSScrollView(frame: frameRect)
    textView = NSTextView(frame: scrollView.bounds)
    super.init(frame: frameRect)
    configure()
  }

  required init?(coder: NSCoder) {
    scrollView = NSScrollView()
    textView = NSTextView()
    super.init(coder: coder)
    configure()
  }

  private func configure() {
    textView.isEditable = true
    textView.isRichText = true
    textView.importsGraphics = true
    textView.allowsImageEditing = true
    textView.isAutomaticLinkDetectionEnabled = true
    textView.font = NSFont.systemFont(ofSize: 14)
    textView.delegate = self
    textView.autoresizingMask = [.width]
    textView.isVerticallyResizable = true
    textView.isHorizontallyResizable = false
    textView.textContainer?.widthTracksTextView = true

    scrollView.documentView = textView
    scrollView.hasVerticalScroller = true
    scrollView.autoresizingMask = [.width, .height]
    addSubview(scrollView)
    RichEditorNSView.active = self
  }

  override func becomeFirstResponder() -> Bool {
    RichEditorNSView.active = self
    return super.becomeFirstResponder()
  }

  // MARK: - NSTextViewDelegate

  func textDidChange(_ notification: Notification) {
    RichEditorNSView.active = self
    onChange?(["model": serializeModel()])
  }

  func textDidBeginEditing(_ notification: Notification) {
    RichEditorNSView.active = self
  }

  // MARK: - Serialization (text storage -> document model)

  func serializeModel() -> [String: Any] {
    guard let storage = textView.textStorage else { return ["blocks": []] }
    var blocks: [[String: Any]] = []
    var imageCounter = 0

    // Current paragraph accumulator.
    var currentSpans: [[String: Any]] = []
    var currentIsList = false
    var currentOrdered = false
    var listItems: [[[String: Any]]] = []

    func flushParagraph() {
      if currentIsList {
        if !currentSpans.isEmpty { listItems.append(currentSpans) }
      } else if !currentSpans.isEmpty {
        blocks.append(["type": "paragraph", "spans": currentSpans])
      }
      currentSpans = []
    }

    func flushList() {
      if currentIsList && !listItems.isEmpty {
        blocks.append(["type": "list", "ordered": currentOrdered, "items": listItems])
      }
      listItems = []
      currentIsList = false
    }

    let fullRange = NSRange(location: 0, length: storage.length)
    storage.enumerateAttributes(in: fullRange, options: []) { attrs, range, _ in
      // Image attachment -> its own image block.
      if let attachment = attrs[.attachment] as? NSTextAttachment,
         let data = self.imageData(from: attachment) {
        flushParagraph()
        flushList()
        imageCounter += 1
        blocks.append([
          "type": "image",
          "contentId": "img_\(imageCounter)",
          "filename": "image\(imageCounter).png",
          "contentType": "image/png",
          "base64": data.base64EncodedString(),
        ])
        return
      }

      // Determine list membership for this run's paragraph.
      var runIsList = false
      var runOrdered = false
      if let pstyle = attrs[.paragraphStyle] as? NSParagraphStyle, let list = pstyle.textLists.first {
        runIsList = true
        runOrdered = (list.markerFormat == .decimal || list.markerFormat == .lowercaseHexadecimal)
      }
      if runIsList != currentIsList {
        flushParagraph()
        flushList()
        currentIsList = runIsList
        currentOrdered = runOrdered
      }

      // Split the run's text on newlines; each newline ends a paragraph / list item.
      let text = (storage.string as NSString).substring(with: range)
      let pieces = text.components(separatedBy: "\n")
      for (i, piece) in pieces.enumerated() {
        if !piece.isEmpty {
          currentSpans.append(self.span(for: attrs, text: piece))
        }
        if i < pieces.count - 1 {
          flushParagraph()
        }
      }
    }
    flushParagraph()
    flushList()

    return ["blocks": blocks]
  }

  private func span(for attrs: [NSAttributedString.Key: Any], text: String) -> [String: Any] {
    var span: [String: Any] = ["text": text]
    if let font = attrs[.font] as? NSFont {
      let traits = NSFontManager.shared.traits(of: font)
      if traits.contains(.boldFontMask) { span["bold"] = true }
      if traits.contains(.italicFontMask) { span["italic"] = true }
    }
    if let underline = attrs[.underlineStyle] as? Int, underline != 0 {
      span["underline"] = true
    }
    if let link = attrs[.link] {
      if let url = link as? URL { span["href"] = url.absoluteString }
      else if let s = link as? String { span["href"] = s }
    }
    return span
  }

  private func imageData(from attachment: NSTextAttachment) -> Data? {
    if let contents = attachment.fileWrapper?.regularFileContents {
      return pngData(from: contents) ?? contents
    }
    if let cell = attachment.attachmentCell as? NSTextAttachmentCell, let image = cell.image {
      return pngData(fromImage: image)
    }
    return nil
  }

  private func pngData(from raw: Data) -> Data? {
    guard let image = NSImage(data: raw) else { return nil }
    return pngData(fromImage: image)
  }

  private func pngData(fromImage image: NSImage) -> Data? {
    guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else {
      return nil
    }
    return rep.representation(using: .png, properties: [:])
  }
}
