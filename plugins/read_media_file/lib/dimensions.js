// --- Pure-JS image dimension detection ---
// Parses the minimal header bytes to extract width/height from common formats.
// No external deps (sharp is not installed in this project).

function detectPngDimensions(buf) {
    // PNG signature: 8 bytes, then IHDR chunk at offset 16
    // width = uint32 at offset 16, height = uint32 at offset 20
    if (buf.length < 24) return null
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
    }
}

function detectJpegDimensions(buf) {
    // Scan for SOF0 (0xFFC0), SOF1 (0xFFC1), or SOF2 (0xFFC2) markers
    const sofMarkers = [0xFFC0, 0xFFC1, 0xFFC2]
    let i = 2 // skip SOI marker
    while (i < buf.length - 9) {
        if (buf[i] !== 0xFF) { i++; continue }
        const marker = (buf[i] << 8) | buf[i + 1]
        if (sofMarkers.includes(marker)) {
            // SOFn segment: marker(2) + length(2) + precision(1) + height(2) + width(2)
            return {
                height: buf.readUInt16BE(i + 5),
                width: buf.readUInt16BE(i + 7),
            }
        }
        if (marker >= 0xFFC0 && marker <= 0xFFCF) {
            // Other SOF markers we don't handle
            return null
        }
        // Skip to next marker
        const segLen = buf.readUInt16BE(i + 2)
        if (segLen < 2) break
        i += 2 + segLen
    }
    return null
}

function detectGifDimensions(buf) {
    if (buf.length < 10) return null
    return {
        width: buf.readUInt16LE(6),
        height: buf.readUInt16LE(8),
    }
}

function detectWebpDimensions(buf) {
    if (buf.length < 30) return null
    // VP8 (lossy): bytes 26-29 (LE)
    if (buf.slice(12, 16).toString() === 'VP8 ' && buf.length >= 30) {
        return {
            width: buf.readUInt16LE(26) & 0x3FFF,
            height: buf.readUInt16LE(28) & 0x3FFF,
        }
    }
    // VP8L (lossless): bytes 21-24 (LE, packed)
    if (buf.slice(12, 16).toString() === 'VP8L' && buf.length >= 25) {
        const bits = buf.readUInt32LE(21)
        return {
            width: (bits & 0x3FFF) + 1,
            height: ((bits >> 14) & 0x3FFF) + 1,
        }
    }
    // VP8X (extended): bytes 24-27 (LE) + 1 each
    if (buf.slice(12, 16).toString() === 'VP8X' && buf.length >= 30) {
        return {
            width: (buf.readUInt32LE(24) & 0x00FFFFFF) + 1,
            height: ((buf.readUInt32LE(26) >> 8) & 0x00FFFFFF) + 1,
        }
    }
    return null
}

function detectBmpDimensions(buf) {
    if (buf.length < 26) return null
    // BMP header: offset 18 = width (signed int32 LE), offset 22 = height (signed int32 LE)
    return {
        width: Math.abs(buf.readInt32LE(18)),
        height: Math.abs(buf.readInt32LE(22)),
    }
}

function detectSvgDimensions(buf) {
    try {
        const text = buf.toString('utf8', 0, Math.min(buf.length, 4096))
        const viewBoxMatch = text.match(/viewBox=["']([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)["']/)
        if (viewBoxMatch) {
            return { width: parseFloat(viewBoxMatch[3]), height: parseFloat(viewBoxMatch[4]) }
        }
        const widthMatch = text.match(/width=["']([\d.]+)(px|em|%)?["']/)
        const heightMatch = text.match(/height=["']([\d.]+)(px|em|%)?["']/)
        if (widthMatch && heightMatch) {
            return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) }
        }
        return null
    } catch {
        return null
    }
}

export function detectDimensions(buf, ext) {
    switch (ext) {
        case '.png': return detectPngDimensions(buf)
        case '.jpg':
        case '.jpeg': return detectJpegDimensions(buf)
        case '.gif': return detectGifDimensions(buf)
        case '.webp': return detectWebpDimensions(buf)
        case '.bmp': return detectBmpDimensions(buf)
        // SVG is text-based; parse the viewBox or width/height attributes
        case '.svg': return detectSvgDimensions(buf)
        default: return null
    }
}
