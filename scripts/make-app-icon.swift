import AppKit

let outDir = CommandLine.arguments[1]

// Render a white SF Symbol into a tinted NSImage.
func whiteSymbol(_ name: String, pointSize: CGFloat) -> NSImage {
  let cfg = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .regular)
  guard let base = NSImage(systemSymbolName: name, accessibilityDescription: nil)?
    .withSymbolConfiguration(cfg) else { return NSImage(size: NSSize(width: pointSize, height: pointSize)) }
  let out = NSImage(size: base.size)
  out.lockFocus()
  NSColor.white.setFill()
  let r = NSRect(origin: .zero, size: base.size)
  r.fill()
  base.draw(in: r, from: .zero, operation: .destinationIn, fraction: 1.0)
  out.unlockFocus()
  return out
}

func drawIcon(size S: CGFloat) -> NSBitmapImageRep {
  let px = Int(S)
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: S, height: S)

  let ctx = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = ctx
  ctx.imageInterpolation = .high

  // The rounded-square art floats with a margin + soft shadow (macOS style).
  let margin = S * 0.092
  let art = NSRect(x: margin, y: margin, width: S - margin * 2, height: S - margin * 2)
  let cr = art.width * 0.2237
  let path = NSBezierPath(roundedRect: art, xRadius: cr, yRadius: cr)

  // Soft drop shadow (fill an opaque shape to cast it).
  ctx.saveGraphicsState()
  let shadow = NSShadow()
  shadow.shadowOffset = NSSize(width: 0, height: -S * 0.012)
  shadow.shadowBlurRadius = S * 0.025
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
  shadow.set()
  NSColor.black.setFill()
  path.fill()
  ctx.restoreGraphicsState()

  // Blue vertical gradient inside the squircle.
  ctx.saveGraphicsState()
  path.addClip()
  let top = NSColor(srgbRed: 0.16, green: 0.55, blue: 1.0, alpha: 1.0)
  let bottom = NSColor(srgbRed: 0.0, green: 0.36, blue: 0.95, alpha: 1.0)
  let gradient = NSGradient(colors: [top, bottom])!
  gradient.draw(in: art, angle: -90)
  // A subtle top highlight for depth.
  let hi = NSGradient(colors: [NSColor.white.withAlphaComponent(0.18), NSColor.white.withAlphaComponent(0.0)])!
  hi.draw(in: NSRect(x: art.minX, y: art.midY, width: art.width, height: art.height / 2), angle: -90)
  ctx.restoreGraphicsState()

  // White envelope centered.
  let sym = whiteSymbol("envelope.fill", pointSize: art.width * 0.46)
  let sw = sym.size.width, sh = sym.size.height
  let symRect = NSRect(x: art.midX - sw / 2, y: art.midY - sh / 2, width: sw, height: sh)
  sym.draw(in: symRect, from: .zero, operation: .sourceOver, fraction: 1.0)

  NSGraphicsContext.restoreGraphicsState()
  return rep
}

for size in [16, 32, 64, 128, 256, 512, 1024] {
  let rep = drawIcon(size: CGFloat(size))
  let data = rep.representation(using: .png, properties: [:])!
  let url = URL(fileURLWithPath: "\(outDir)/icon_\(size).png")
  try! data.write(to: url)
  print("wrote icon_\(size).png")
}
