import { KNOWN_ELEMENTS } from "./elementTags.js";
import { flattenVNodes } from "./utils.js";
import { Fragment } from "./types.js";
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
            // Set children property only if dangerouslySetInnerHTML is not present
            if (!normalizedProps.dangerouslySetInnerHTML) {
                normalizedProps.children = flatChildren;
            }
            else {
                normalizedProps.children = [];
                console.warn("WebJSX: Ignoring children since dangerouslySetInnerHTML is set.");
            }
        }
        else if (children.length > 0) {
            // Children were explicitly passed but flattened to nothing
            // (e.g. all-null/false JSX children) -- an explicit empty list,
            // still eligible for the "clear existing children" diff path.
            normalizedProps.children = [];
        }
        // Else: no children argument was passed at all (self-closing JSX,
        // e.g. `<dsh-slot-outlet ref={...} />`). Leave `children` UNSET
        // rather than defaulting to `[]`. A self-closing custom element is
        // frequently one that manages its own subtree imperatively (its own
        // nested `applyDiff(this, ...)` call in `connectedCallback`/
        // `setProps`, see DshSlotOutlet/DshRootOutlet) — `applyDiff`'s own
        // diff pass on the PARENT only recurses into a node's children when
        // `props.children != null` (applyDiff.js's update branch), so an
        // explicit `[]` here previously made every ancestor re-render
        // clobber the outlet's self-managed real DOM children on each pass
        // (`diffChildren` sees newVNodes.length===0 against a non-empty
        // cached oldVNodes and does `parent.innerHTML = ""`) even though the
        // JSX itself never described any children to diff. Leaving
        // `children` undefined here restores the "don't touch this node's
        // children" default for every self-closing tag, matching the
        // contract callers must already rely on for self-owned subtrees.
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
        // Function component (e.g. `Button`, `Modal`, an icon): actually
        // invoke it with its props, same as React's function-component
        // contract. Previously this branch silently discarded `type` and
        // returned only the flattened JSX children, which meant a
        // function-typed tag's own props (including `children` consumed
        // internally, like Modal's `open`/`title`/`footer`) were dropped
        // entirely and the function itself was never called -- its JSX
        // children resurfaced as bare siblings in the OUTER tree instead of
        // being rendered by the component (the stray-rename-input bug: a
        // closed <Modal> never gated its own <input> children because
        // Modal() was never run to begin with).
        const normalizedProps = props ? props : {};
        if (children.length > 0) {
            normalizedProps.children = flattenVNodes(children);
        }
        return type(normalizedProps);
    }
}
// As called from jsx-runtime.jsx function.
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
            // Set children property only if dangerouslySetInnerHTML is not present
            if (!props.dangerouslySetInnerHTML) {
                props.children = flatChildren;
            }
            else {
                props.children = [];
                console.warn("WebJSX: Ignoring children since dangerouslySetInnerHTML is set.");
            }
        }
        else if (hadChildrenProp) {
            // See createElement's identical branch above: a `children` key
            // was explicitly present on props (even if it flattened to
            // nothing) vs. a self-closing tag that never had one at all --
            // only the former should mark this node eligible for the
            // "clear existing children" diff path.
            props.children = [];
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
        // See createElement's identical branch above: actually call the
        // function component instead of discarding `type` and returning
        // only its flattened children.
        return type(props || {});
    }
}
//# sourceMappingURL=createElement.js.map