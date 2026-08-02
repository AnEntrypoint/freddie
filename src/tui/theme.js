import { style } from './style.js'

// pi-tui theme objects over the local ANSI helpers. Shapes are dictated by
// pi-tui's .d.ts: SelectListTheme (5 fns), EditorTheme { borderColor,
// selectList }, MarkdownTheme (every fn required, highlightCode optional).
export const selectListTheme = {
    selectedPrefix: (t) => style.cyan(t),
    selectedText: (t) => style.bold(t),
    description: (t) => style.dim(t),
    scrollInfo: (t) => style.dim(t),
    noMatch: (t) => style.yellow(t),
}

export const editorTheme = {
    borderColor: (t) => style.dim(t),
    selectList: selectListTheme,
}

export const markdownTheme = {
    heading: (t) => style.bold(style.cyan(t)),
    link: (t) => style.underline(style.cyan(t)),
    linkUrl: (t) => style.dim(t),
    code: (t) => style.yellow(t),
    codeBlock: (t) => t,
    codeBlockBorder: (t) => style.dim(t),
    quote: (t) => style.italic(t),
    quoteBorder: (t) => style.dim(t),
    hr: (t) => style.dim(t),
    listBullet: (t) => style.cyan(t),
    bold: (t) => style.bold(t),
    italic: (t) => style.italic(t),
    strikethrough: (t) => style.strikethrough(t),
    underline: (t) => style.underline(t),
}
