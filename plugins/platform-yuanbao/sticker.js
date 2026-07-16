export const STICKER_PACK = ['cute', 'work', 'celebration', 'thinking', 'thumbs-up']
export function buildStickerMessage({ to, sticker }) {
    if (!STICKER_PACK.includes(sticker)) throw new Error('unknown sticker: ' + sticker)
    return { to, type: 'sticker', sticker }
}
export function listStickers() { return STICKER_PACK }
