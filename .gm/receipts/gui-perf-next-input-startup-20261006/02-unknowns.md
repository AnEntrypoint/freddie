# 02-unknowns: gui-perf-next-input-startup-20261006
session: mcp-codemode-3535970-1793542718115-1-16

Recorded with mutable-add (files in .gm/unknowns/, status pending):

- U1 gui-perf-next-input-startup-20261006-u1: real-keyboard composer input-to-paint ms on the committed tree, no profiler attached.
- U2 gui-perf-next-input-startup-20261006-u2: which function on the keystroke path (InputBar.js:376-401 #onChange, 191-263 #afterRender, keyboard.setDraft, #render) holds the measured cost.
- U3 gui-perf-next-input-startup-20261006-u3: whether a browser with real key injection is available here (binary, version, adapter), and whether the GPU lease is held.
- U4 gui-perf-next-input-startup-20261006-u4: fresh owned browser startup critical module/activation path, boot to first composer paint.
- U5 gui-perf-next-input-startup-20261006-u5: which entry (packages/bundle/web-app entry or client index) owns browser boot and module activation order.
- U6 gui-perf-next-input-startup-20261006-u6: whether draft, caret and scroll preservation can be asserted before and after the measured action in one run.

Open: 6. Next: gm-eliminate (each unknown needs a live JIT run before any edit).
