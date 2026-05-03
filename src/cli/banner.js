import { getActiveSkin } from '../skin/engine.js'
const ART = [
    '  _____ _           _   _     ',
    ' |_   _| |__   ___ | |_| |__  ',
    '   | | | _ \\ / _ \\| __| _ \\ ',
    '   | | | | | | (_)| |_| | | |',
    '   |_| |_| |_|\\___/ \\__|_| |_|',
]
export function renderBanner() {
    const skin = getActiveSkin()
    return ART.join('\n') + '\n' + skin.branding.welcome
}
export function printBanner(out = process.stdout) { out.write(renderBanner() + '\n') }
