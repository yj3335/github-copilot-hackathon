# Extension Shell

This folder now uses a single implementation path:

- `src/*` contains the TypeScript and React entry points
- `public/*` contains the extension manifest and HTML/CSS shell copied into `dist/`
- `scripts/build.mjs` bundles the extension and prepares the package output

The older top-level HTML, JS, and CSS shell files were removed to avoid maintaining two parallel versions of the extension UI.

Current focus areas:

- popup entry point with quick actions
- workspace page for local PDF loading and staged operations
- settings page for persistent preferences
- strict manifest defaults with minimal permissions

The current implementation is still a scaffold for the PDF engine, packaging, and browser-specific release work.
