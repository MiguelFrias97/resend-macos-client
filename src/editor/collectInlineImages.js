export function collectInlineImages(model) {
  if (!model || !Array.isArray(model.blocks)) return [];
  return model.blocks
    .filter(b => b && b.type === 'image')
    .map(b => ({
      contentId: b.contentId,
      filename: b.filename,
      contentType: b.contentType,
      base64: b.base64,
    }));
}
