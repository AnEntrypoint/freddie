import { HTML_NAMESPACE } from "./constants.js";
export function flattenVNodes(vnodes, result = []) {
    if (Array.isArray(vnodes)) {
        for (const vnode of vnodes) {
            flattenVNodes(vnode, result);
        }
    }
    else if (isValidVNode(vnodes)) {
        result.push(vnodes);
    }
    return result;
}
export function isValidVNode(vnode) {
    const typeofVNode = typeof vnode;
    return (vnode !== null &&
        vnode !== undefined &&
        (typeofVNode === "string" ||
            typeofVNode === "object" ||
            typeofVNode === "number" ||
            typeofVNode === "bigint"));
}
export function getChildNodes(parent) {
    const nodes = [];
    let current = parent.firstChild;
    while (current) {
        nodes.push(current);
        current = current.nextSibling;
    }
    return nodes;
}
export function assignRef(node, ref) {
    if (typeof ref === "function") {
        ref(node);
    }
    else if (ref && typeof ref === "object") {
        ref.current = node;
    }
}
export function isVElement(vnode) {
    const typeofVNode = typeof vnode;
    return (typeofVNode !== "string" &&
        typeofVNode !== "number" &&
        typeofVNode !== "bigint");
}
export function isNonBooleanPrimitive(vnode) {
    const typeofVNode = typeof vnode;
    return (typeofVNode === "string" ||
        typeofVNode === "number" ||
        typeofVNode === "bigint");
}
export function getNamespaceURI(node) {
    return node instanceof Element && node.namespaceURI !== HTML_NAMESPACE
        ? node.namespaceURI ?? undefined
        : undefined;
}
export function setWebJSXProps(element, props) {
    element.__webjsx_props = props;
}
export function getWebJSXProps(element) {
    let props = element.__webjsx_props;
    if (!props) {
        props = {};
        element.__webjsx_props = props;
    }
    return props;
}
export function setWebJSXChildNodeCache(element, childNodes) {
    element.__webjsx_childNodes = childNodes;
}
export function getWebJSXChildNodeCache(element) {
    return element.__webjsx_childNodes;
}
