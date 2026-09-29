# web

## Rationale

- `index.html` inline timer script: if the first script of the page never runs (a syntax error or a 404 in `main.js` or anything it imports statically) nothing can draw the boot page and the document stays blank with no message. The timer needs no module graph, so after 10 seconds it writes a static "The app did not start" line with a reload link into the still-empty `#root`; a page that booted has children in `#root` and is left alone.
