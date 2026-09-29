# @freddie/freddie-client-ui-open-in-app

Web "Open In..." feature owner: contributes one split button to `conversation.session.header.utilities`. The primary half opens the current session's workspace directory (the session summary's `cwd`) in the remembered application, else the first one the host detected; the chevron lists every detected application with its real icon, marks the primary one "(default)", and launches the one picked. It is the browser half of [`freddie-host-open-in-app`](../../host/open-in-app/README.md); mount the two together.

The package reads three plain-`fetch` routes, no Typert remote:

| Route | Use |
|---|---|
| `GET /open-in-app/apps` | Read once per page: the resolved catalog ids in menu order. |
| `GET /open-in-app/icon/<id>` | One `<img>` per application; a 404 or decode failure swaps in the generic glyph for that application only. |
| `POST /open-in-app/open` | `{ "app": <id>, "path": <session cwd> }` with `content-type: application/json`; the only fields the host validates. |

All three routes are pinned to loopback host-side. A `403`, any other non-2xx answer, a network failure, a body that is not `{ apps: [...] }`, or an answer naming no catalog application leaves the control rendering nothing at all: no button, no raw error. The same holds for a session without a working directory. A failed launch (any non-2xx or network error) shows one localized toast and leaves the remembered choice unchanged.

The last successfully launched application is remembered per browser in `localStorage` (`freddie.open-in-app.choice`). Every read and write is guarded, so blocked or empty storage only means the first detected application stays primary. Choosing the primary half never changes the remembered choice; picking from the menu does, once the host acknowledged the launch.

The buttons are native `<button>` elements: `Tab` reaches the primary and chevron halves in order, `ArrowDown`/`ArrowUp` on the chevron opens the menu on its first item, `ArrowDown`/`ArrowUp` move between items, `Escape` closes and returns focus to the chevron, and focus leaving the control or a pointer press outside closes it. While a launch is in flight the halves carry `aria-disabled` instead of `disabled`, so focus is never dropped. Copy goes through the package's own `open-in-app` locale namespace; styling uses the `--freddie-alias-*` tokens.

## Model Experience

None, as this package is browser chrome and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends a provider request.

## Known Limitations and Deferred Work

- **Availability is read once per page.** An application installed while the page is open appears after a reload (and, host-side, after a host restart); a failed first read hides the control until reload.
- **The dictionaries gate the menu.** A host catalog id with no `app.<id>` entry in both dictionaries stays invisible instead of showing a raw id; extending the host catalog means extending `applications.js` and `locales.js` together.
- **Directory only.** The document-preview file controls, delivery-card and change-review openers, and the `Open locally` keyboard shortcut of the upstream feature are not ported; the host exposes no file routes and freddie has no matching seats.
- **Loopback only.** On a deployment reached over the network the control is absent by design.
