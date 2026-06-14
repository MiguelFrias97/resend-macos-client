import Foundation
import React
import WebKit

// React Native view manager. RN strips the "Manager" suffix, so this is
// registered as the `MessageBodyView` component on the JS side.
@objc(MessageBodyViewManager)
class MessageBodyViewManager: RCTViewManager {
  override func view() -> NSView! {
    return MessageBodyNSView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}

// Renders sanitized email HTML in a WKWebView with JavaScript disabled,
// remote content blocked by default, and inline images served from a local
// cache through a custom `cidcache://` scheme.
class MessageBodyNSView: NSView, WKNavigationDelegate, WKURLSchemeHandler {
  private var html: String = ""
  private var allowRemote: Bool = false
  private var cacheDir: String = ""

  // MARK: - WebView (lazy)

  private lazy var webView: WKWebView = {
    let config = WKWebViewConfiguration()

    // Disable JavaScript for message bodies.
    if #available(macOS 11.0, *) {
      config.defaultWebpagePreferences.allowsContentJavaScript = false
    }
    // Belt-and-suspenders for older runtimes (deprecated but harmless).
    config.preferences.javaScriptEnabled = false

    // Inline images: cidcache://<contentId> -> <cacheDir>/<contentId>.
    config.setURLSchemeHandler(self, forURLScheme: "cidcache")

    let wv = WKWebView(frame: self.bounds, configuration: config)
    wv.navigationDelegate = self
    wv.autoresizingMask = [.width, .height]
    return wv
  }()

  // MARK: - Init

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    addSubview(webView)
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    addSubview(webView)
  }

  // MARK: - Props (exported via the .m bridge)

  @objc var onHeight: RCTBubblingEventBlock?

  @objc func setHtml(_ value: NSString) {
    html = value as String
    reload()
  }

  @objc func setAllowRemote(_ value: Bool) {
    allowRemote = value
    // Reload so the navigation policy takes effect for existing content.
    reload()
  }

  @objc func setCacheDir(_ value: NSString) {
    cacheDir = value as String
  }

  private func reload() {
    webView.loadHTMLString(html, baseURL: nil)
  }

  // MARK: - WKNavigationDelegate

  func webView(_ webView: WKWebView,
               decidePolicyFor navigationAction: WKNavigationAction,
               decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    let url = navigationAction.request.url
    let scheme = url?.scheme?.lowercased() ?? ""

    // Always allow the local document load and our inline-image scheme.
    if scheme.isEmpty || scheme == "about" || scheme == "file" || scheme == "cidcache" {
      decisionHandler(.allow)
      return
    }

    // http / https (and any other remote scheme): gated by allowRemote.
    decisionHandler(allowRemote ? .allow : .cancel)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // Host-initiated evaluateJavaScript works even with content JS disabled.
    webView.evaluateJavaScript("document.body ? document.body.scrollHeight : 0") { [weak self] result, _ in
      guard let self = self, let block = self.onHeight else { return }
      let height: CGFloat
      if let n = result as? CGFloat {
        height = n
      } else if let n = result as? NSNumber {
        height = CGFloat(truncating: n)
      } else {
        height = self.webView.frame.height
      }
      block(["height": height])
    }
  }

  // MARK: - WKURLSchemeHandler (cidcache://)

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(schemeError("missing url"))
      return
    }

    // cidcache://<contentId> -> host carries the id; fall back to path.
    var contentId = url.host ?? ""
    if contentId.isEmpty {
      contentId = url.path.replacingOccurrences(of: "/", with: "")
    }
    contentId = contentId.removingPercentEncoding ?? contentId

    guard !contentId.isEmpty, !cacheDir.isEmpty else {
      urlSchemeTask.didFailWithError(schemeError("empty content id or cache dir"))
      return
    }

    let filePath = (cacheDir as NSString).appendingPathComponent(contentId)
    guard let data = FileManager.default.contents(atPath: filePath) else {
      urlSchemeTask.didFailWithError(schemeError("not found: \(filePath)"))
      return
    }

    let mime = mimeType(forPath: filePath, data: data)
    let response = URLResponse(url: url,
                              mimeType: mime,
                              expectedContentLength: data.count,
                              textEncodingName: nil)
    urlSchemeTask.didReceive(response)
    urlSchemeTask.didReceive(data)
    urlSchemeTask.didFinish()
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    // No-op: loads are synchronous from the local cache.
  }

  // MARK: - Helpers

  private func schemeError(_ message: String) -> NSError {
    return NSError(domain: "MessageBodyView",
                  code: -1,
                  userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func mimeType(forPath path: String, data: Data) -> String {
    // cid images are cached under their content id with no extension, so sniff
    // the magic bytes first; fall back to the extension.
    if data.count >= 4 {
      let b = [UInt8](data.prefix(4))
      if b[0] == 0x89, b[1] == 0x50, b[2] == 0x4E, b[3] == 0x47 { return "image/png" }
      if b[0] == 0xFF, b[1] == 0xD8, b[2] == 0xFF { return "image/jpeg" }
      if b[0] == 0x47, b[1] == 0x49, b[2] == 0x46 { return "image/gif" }
      if b[0] == 0x52, b[1] == 0x49, b[2] == 0x46, b[3] == 0x46 { return "image/webp" }
    }
    // SVG is text-based (no magic bytes): detect a leading XML/svg marker.
    if let head = String(data: data.prefix(256), encoding: .utf8) {
      let trimmed = head.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if trimmed.hasPrefix("<?xml") || trimmed.hasPrefix("<svg") { return "image/svg+xml" }
    }
    let ext = (path as NSString).pathExtension.lowercased()
    switch ext {
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "gif": return "image/gif"
    case "webp": return "image/webp"
    case "svg": return "image/svg+xml"
    case "bmp": return "image/bmp"
    case "tif", "tiff": return "image/tiff"
    case "ico": return "image/x-icon"
    default: return "application/octet-stream"
    }
  }
}
