import { KNOWN_ELEMENTS } from "./elementTags.js";
import { flattenVNodes } from "./utils.js";
import { Fragment } from "./types.js";
function assignChildrenUnlessRawHtml(props, flatChildren) {
    if (!props.dangerouslySetInnerHTML) {
        props.children = flatChildren;
    }
    else {
        props.children = [];
        console.warn("WebJSX: Ignoring children since dangerouslySetInnerHTML is set.");
    }
}
function markChildrenForClearing(props) {
    props.children = [];
}
/**
 * Creates a virtual element representing a DOM node or Fragment.
 * @param type Element type (tag name) or Fragment
 * @param props Properties and attributes for the element
 * @param children Child elements or content
 * @returns Virtual element representation
 */
export function createElement(type, props, ...children) {
    if (typeof type === "string") {
        const normalizedProps = props ? props : {};
        const flatChildren = flattenVNodes(children);
        if (flatChildren.length > 0) {
            assignChildrenUnlessRawHtml(normalizedProps, flatChildren);
        }
        else if (children.length > 0) {
            markChildrenForClearing(normalizedProps);
        }
        const result = {
            type,
            tagName: KNOWN_ELEMENTS.get(type) ?? type.toUpperCase(),
            props: normalizedProps ?? {},
        };
        return result;
    }
    else if (type === Fragment) {
        return flattenVNodes(children);
    }
    else {
        const normalizedProps = props ? props : {};
        if (children.length > 0) {
            normalizedProps.children = flattenVNodes(children);
        }
        return type(normalizedProps);
    }
}
export function createElementJSX(type, props, key) {
    if (typeof type === "string") {
        props = props || {};
        const hadChildrenProp = Object.prototype.hasOwnProperty.call(props, "children");
        const flatChildren = props
            ? flattenVNodes(props.children)
            : [];
        if (key !== undefined) {
            props.key = key;
        }
        if (flatChildren.length > 0) {
            assignChildrenUnlessRawHtml(props, flatChildren);
        }
        else if (hadChildrenProp) {
            markChildrenForClearing(props);
        }
        const result = {
            type,
            tagName: KNOWN_ELEMENTS.get(type) ?? type.toUpperCase(),
            props: props ?? {},
        };
        return result;
    }
    else if (type === Fragment) {
        const flatChildren = props
            ? flattenVNodes(props.children)
            : [];
        return flatChildren;
    }
    else {
        return type(props || {});
    }
}
