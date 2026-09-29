/* eslint-disable @typescript-eslint/no-explicit-any */
import { definesRenderSuspension, withRenderSuspension, } from "./renderSuspension.js";
function updateEventListener(el, eventName, newHandler, oldHandler) {
    if (oldHandler && oldHandler !== newHandler) {
        el.removeEventListener(eventName, oldHandler);
    }
    if (newHandler && oldHandler !== newHandler) {
        el.addEventListener(eventName, newHandler);
        el.__webjsx_listeners =
            el.__webjsx_listeners ?? {};
        el.__webjsx_listeners[eventName] = newHandler;
    }
}
function updatePropOrAttr(el, key, value) {
    if (el.namespaceURI === "http://www.w3.org/2000/svg") {
        if (value === false || value === undefined || value === null) {
            el.removeAttribute(key);
        }
        else {
            el.setAttribute(key, String(value));
        }
        return;
    }
    if (key in el) {
        el[key] = value;
        return;
    }
    if (value === false || value === undefined || value === null) {
        el.removeAttribute(key);
    }
    else {
        el.setAttribute(key, String(value));
    }
}
function updateAttributesCore(el, newProps, oldProps = {}) {
    for (const key of Object.keys(newProps)) {
        const value = newProps[key];
        if (key === "children" ||
            key === "key" ||
            key === "dangerouslySetInnerHTML" ||
            key === "nodes")
            continue;
        if (key.startsWith("on") && typeof value === "function") {
            const eventName = key.substring(2).toLowerCase();
            updateEventListener(el, eventName, value, el.__webjsx_listeners?.[eventName]);
        }
        else if (value !== oldProps[key]) {
            updatePropOrAttr(el, key, value);
        }
    }
    if (newProps.dangerouslySetInnerHTML) {
        if (!oldProps.dangerouslySetInnerHTML ||
            newProps.dangerouslySetInnerHTML.__html !==
                oldProps.dangerouslySetInnerHTML.__html) {
            const html = newProps.dangerouslySetInnerHTML?.__html || "";
            el.innerHTML = html;
        }
    }
    else {
        if (oldProps.dangerouslySetInnerHTML) {
            el.innerHTML = "";
        }
    }
    for (const key of Object.keys(oldProps)) {
        if (!(key in newProps) &&
            key !== "children" &&
            key !== "key" &&
            key !== "dangerouslySetInnerHTML" &&
            key !== "nodes") {
            if (key.startsWith("on")) {
                const eventName = key.substring(2).toLowerCase();
                const existingListener = el
                    .__webjsx_listeners?.[eventName];
                if (existingListener) {
                    el.removeEventListener(eventName, existingListener);
                    delete el.__webjsx_listeners[eventName];
                }
            }
            else if (el.namespaceURI === "http://www.w3.org/2000/svg") {
                el.removeAttribute(key);
            }
            else if (key in el) {
                el[key] = undefined;
            }
            else {
                el.removeAttribute(key);
            }
        }
    }
}
export function setAttributes(el, props) {
    if (definesRenderSuspension(el)) {
        withRenderSuspension(el, () => {
            updateAttributesCore(el, props);
        });
    }
    else {
        updateAttributesCore(el, props);
    }
}
export function updateAttributes(el, newProps, oldProps) {
    if (definesRenderSuspension(el)) {
        withRenderSuspension(el, () => {
            updateAttributesCore(el, newProps, oldProps);
        });
    }
    else {
        updateAttributesCore(el, newProps, oldProps);
    }
}
