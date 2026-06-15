// Bound inline images so a few huge pasted/dropped bitmaps can't blow up memory
// or produce an outbound message the API will reject. base64 is ~4/3 of the raw
// bytes, so ~6.7MB base64 ≈ 5MB image; ~33MB total ≈ 25MB of attachments.
export const MAX_INLINE_IMAGES = 20;
export const MAX_INLINE_IMAGE_B64 = 6.7 * 1024 * 1024;
export const MAX_INLINE_TOTAL_B64 = 33 * 1024 * 1024;

export function collectInlineImages(model) {
  if (!model || !Array.isArray(model.blocks)) return [];
  const out = [];
  let total = 0;
  for (const b of model.blocks) {
    if (!b || b.type !== 'image') continue;
    if (out.length >= MAX_INLINE_IMAGES) break;
    const base64 = typeof b.base64 === 'string' ? b.base64 : '';
    if (!base64 || base64.length > MAX_INLINE_IMAGE_B64) continue;
    if (total + base64.length > MAX_INLINE_TOTAL_B64) break;
    total += base64.length;
    out.push({
      contentId: b.contentId,
      filename: b.filename,
      contentType: b.contentType,
      base64,
    });
  }
  return out;
}
