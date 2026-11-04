import AppKit
import CoreImage
// Renders the app icon from the FilmFlow logo (black background artwork, drawn with screen blending)
// usage: icon <logo.png> <out.png> <size> [glow 0..1]
let a = CommandLine.arguments
let logo = NSImage(contentsOfFile: a[1])!
let S = CGFloat(Double(a[3]) ?? 1024)
let glowAmt = CGFloat(Double(a.count > 4 ? a[4] : "0.6") ?? 0.6)
let k = S / 1024
let src = logo.cgImage(forProposedRect: nil, context: nil, hints: nil)!
let cictx = CIContext()
// clean the artwork's black point so only the logo itself is drawn, and pad it so the glow can fade out
let pad = CGFloat(src.width) * 0.12
let base = CIImage(cgImage: src)
let cleaned = base.applyingFilter("CIColorMatrix", parameters: [
    "inputRVector": CIVector(x: 1, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 1, z: 0, w: 0),
    "inputBVector": CIVector(x: 0, y: 0, z: 1, w: 0), "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0)])
    .applyingFilter("CIColorClamp")
let padded = base.extent.insetBy(dx: -pad, dy: -pad)
let onBlack = cleaned.composited(over: CIImage(color: .black).cropped(to: padded))
let cg = cictx.createCGImage(onBlack, from: padded)!
let glowCI = onBlack.clampedToExtent().applyingGaussianBlur(sigma: Double(src.width) / 70).cropped(to: padded)
let blurred = cictx.createCGImage(glowCI, from: padded)!
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(S), pixelsHigh: Int(S), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext
let tile = CGRect(x: 100*k, y: 100*k, width: 824*k, height: 824*k)
let path = CGPath(roundedRect: tile, cornerWidth: 186*k, cornerHeight: 186*k, transform: nil)
// drop shadow
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10*k), blur: 28*k, color: NSColor.black.withAlphaComponent(0.45).cgColor)
ctx.addPath(path); ctx.setFillColor(NSColor.black.cgColor); ctx.fillPath()
ctx.restoreGState()
// tile body: deep black with a faint green-tinted vertical gradient
ctx.saveGState()
ctx.addPath(path); ctx.clip()
let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [NSColor(srgbRed: 0.075, green: 0.09, blue: 0.08, alpha: 1).cgColor, NSColor(srgbRed: 0.01, green: 0.012, blue: 0.011, alpha: 1).cgColor] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: tile.maxY), end: CGPoint(x: 0, y: tile.minY), options: [])
// soft green halo behind the logo
let halo = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [NSColor(srgbRed: 0, green: 0.85, blue: 0.1, alpha: 0.16).cgColor, NSColor(srgbRed: 0, green: 0.85, blue: 0.1, alpha: 0).cgColor] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(halo, startCenter: CGPoint(x: S/2, y: S/2 + 10*k), startRadius: 0, endCenter: CGPoint(x: S/2, y: S/2 + 10*k), endRadius: 400*k, options: [])
// logo, fitted inside the tile
let maxW = 640*k * (1 + 0.24), maxH = 470*k * (1 + 0.24 * CGFloat(cg.width) / CGFloat(cg.height) * 0 + 0.3)
let ar = CGFloat(cg.width) / CGFloat(cg.height)
var w = maxW, h = maxW / ar
if h > maxH { h = maxH; w = h * ar }
let r = CGRect(x: (S - w)/2, y: (S - h)/2, width: w, height: h)
ctx.setBlendMode(.screen)
ctx.setAlpha(glowAmt); ctx.draw(blurred, in: r)
ctx.setAlpha(1); ctx.draw(cg, in: r)
ctx.setBlendMode(.normal)
// subtle top edge highlight
ctx.addPath(path); ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.09).cgColor); ctx.setLineWidth(3*k); ctx.strokePath()
ctx.restoreGState()
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
