import { createElementJSX } from "./createElement.js";
import { Fragment } from "./types.js";
export * from "./jsx.js";
export { Fragment };
export function jsx(type, props, key) {
    return createElementJSX(type, props, key);
}
export function jsxs(type, props, key) {
    return jsx(type, props, key);
}
export function jsxDEV(type, props, key) {
    return jsx(type, props, key);
}
export const JSXFragment = Fragment;
