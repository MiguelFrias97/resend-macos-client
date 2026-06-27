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

// NSTextView that reports ⌘↵ (Cmd+Return/Enter) so the composer can send. A
// plain Return still inserts a newline as usual.
class SubmitTextView: NSTextView {
  var onCmdReturn: (() -> Void)?
  override func keyDown(with event: NSEvent) {
    // keyCode 36 = Return, 76 = numeric-keypad Enter.
    if event.modifierFlags.contains(.command),
       event.keyCode == 36 || event.keyCode == 76 {
      onCmdReturn?()
      return
    }
    super.keyDown(with: event)
  }
}

// An editable NSTextView (inside a scroll view) that accepts rich text and
// dropped images, and serializes its content to the JSON document model the
// JS layer turns into email HTML.
class RichEditorNSView: NSView, NSTextViewDelegate {
  // The text view currently being edited — the RichEditor command module acts
  // on this. Weak so it doesn't outlive the view.
  static weak var active: RichEditorNSView?

  let textView: SubmitTextView
  private let scrollView: NSScrollView

  // Caches each inline image's base64 so we don't re-encode the full image on
  // every keystroke (textDidChange re-serializes the whole document).
  private var imageCache: [ObjectIdentifier: String] = [:]

  @objc var onChange: RCTBubblingEventBlock?
  @objc var onSubmit: RCTBubblingEventBlock?
  @objc var onContentSizeChange: RCTBubblingEventBlock?
  private var lastReportedHeight: CGFloat = -1

  override init(frame frameRect: NSRect) {
    scrollView = NSScrollView(frame: frameRect)
    textView = SubmitTextView(frame: scrollView.bounds)
    super.init(frame: frameRect)
    configure()
  }

  required init?(coder: NSCoder) {
    scrollView = NSScrollView()
    textView = SubmitTextView()
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

    textView.onCmdReturn = { [weak self] in
      self?.onSubmit?([:])
    }

    scrollView.documentView = textView
    scrollView.hasVerticalScroller = true
    scrollView.autoresizingMask = [.width, .height]
    addSubview(scrollView)
    RichEditorNSView.active = self

    // Report the initial (single-line) height once layout settles, so the JS
    // container starts compact instead of at a fixed tall box.
    DispatchQueue.main.async { [weak self] in self?.emitContentHeight() }
  }

  override func becomeFirstResponder() -> Bool {
    RichEditorNSView.active = self
    return super.becomeFirstResponder()
  }

  // The laid-out height of the text, so the JS side can grow the editor with its
  // content (clamped between a min and a max on the JS side).
  private func emitContentHeight() {
    guard let lm = textView.layoutManager, let tc = textView.textContainer else { return }
    lm.ensureLayout(for: tc)
    let used = lm.usedRect(for: tc)
    let height = ceil(used.height + textView.textContainerInset.height * 2)
    if abs(height - lastReportedHeight) >= 1 {
      lastReportedHeight = height
      onContentSizeChange?(["height": height])
    }
  }

  // MARK: - NSTextViewDelegate

  func textDidChange(_ notification: Notification) {
    RichEditorNSView.active = self
    onChange?(["model": serializeModel()])
    emitContentHeight()
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
      // Image attachment -> its own image block. NOTE (v1 limitation): an inline
      // image splits its surrounding paragraph into separate blocks; images on
      // their own line serialize cleanly.
      if let attachment = attrs[.attachment] as? NSTextAttachment {
        let key = ObjectIdentifier(attachment)
        var base64 = self.imageCache[key]
        if base64 == nil, let data = self.imageData(from: attachment) {
          base64 = data.base64EncodedString()
          self.imageCache[key] = base64
        }
        if let base64 = base64 {
          flushParagraph()
          flushList()
          imageCounter += 1
          blocks.append([
            "type": "image",
            "contentId": "img_\(imageCounter)",
            "filename": "image\(imageCounter).png",
            "contentType": "image/png",
            "base64": base64,
          ])
        }
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
    if let underline = (attrs[.underlineStyle] as? NSNumber)?.intValue, underline != 0 {
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

// MARK: - SymbolView (SF Symbols)

// Renders an SF Symbol, tinted to follow the app theme/accent. Registered as the
// `SymbolView` RN component. Lives here (an already-compiled file) so no new file
// needs to be added to the Xcode target.
@objc(SymbolViewManager)
class SymbolViewManager: RCTViewManager {
  override func view() -> NSView! { return SymbolNSView() }
  override static func requiresMainQueueSetup() -> Bool { return true }
}

class SymbolNSView: NSView {
  private let imageView = NSImageView()
  private var symbolName = ""
  private var pointSize: CGFloat = 15
  private var weightName = "regular"
  private var tintHex = ""

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    setup()
  }
  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setup()
  }
  private func setup() {
    imageView.imageScaling = .scaleProportionallyUpOrDown
    imageView.frame = bounds
    imageView.autoresizingMask = [.width, .height]
    addSubview(imageView)
  }

  override func setFrameSize(_ newSize: NSSize) {
    super.setFrameSize(newSize)
    imageView.frame = bounds
  }

  @objc func setName(_ value: NSString) { symbolName = value as String; update() }
  @objc func setPointSize(_ value: NSNumber) { pointSize = CGFloat(truncating: value); update() }
  @objc func setWeight(_ value: NSString) { weightName = value as String; update() }
  @objc func setTintColor(_ value: NSString) { tintHex = value as String; update() }

  private func update() {
    guard !symbolName.isEmpty else { imageView.image = nil; return }
    let img = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)
    let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: symbolWeight())
    imageView.image = img?.withSymbolConfiguration(config)
    if let color = SymbolNSView.color(fromHex: tintHex) {
      imageView.contentTintColor = color
    }
  }

  private func symbolWeight() -> NSFont.Weight {
    switch weightName {
    case "semibold": return .semibold
    case "bold": return .bold
    case "medium": return .medium
    case "light": return .light
    default: return .regular
    }
  }

  static func color(fromHex hex: String) -> NSColor? {
    var s = hex.trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let n = UInt32(s, radix: 16) else { return nil }
    return NSColor(
      red: CGFloat((n >> 16) & 0xff) / 255.0,
      green: CGFloat((n >> 8) & 0xff) / 255.0,
      blue: CGFloat(n & 0xff) / 255.0,
      alpha: 1.0)
  }
}

// MARK: - MenuEvents

// Forwards native menu commands (⌘N/⌘R/⌘⇧F from the app menu, see AppDelegate)
// to JS. The AppDelegate posts an "RMMenuCommand" notification with the command
// string; this emitter relays it as a `menuCommand` event the inbox subscribes to.
@objc(MenuEvents)
class MenuEvents: RCTEventEmitter {
  private var listening = false
  override static func requiresMainQueueSetup() -> Bool { return false }
  override func supportedEvents() -> [String]! { return ["menuCommand"] }

  override func startObserving() {
    listening = true
    NotificationCenter.default.addObserver(
      self, selector: #selector(onCommand(_:)),
      name: Notification.Name("RMMenuCommand"), object: nil)
  }
  override func stopObserving() {
    listening = false
    NotificationCenter.default.removeObserver(self)
  }
  @objc private func onCommand(_ note: Notification) {
    guard listening, let cmd = note.object as? String else { return }
    sendEvent(withName: "menuCommand", body: ["command": cmd])
  }
}
