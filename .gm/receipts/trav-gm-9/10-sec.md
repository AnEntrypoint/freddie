# 10-SEC: trav-gm-9

- secrets: none read or written. The probe ran with a `document` and `customElements` stub, in `/tmp/gm-trav-9`, outside the repo.
- injection: no input handling changed; `content` is read exactly as before.
- identity: commit author is the configured git identity (lanmower), no trailers.
- the mutant file (`.trav-gm-9-mutant.js`) was created inside the component directory for one run and removed in the same run (`mutantLeft: false`).
