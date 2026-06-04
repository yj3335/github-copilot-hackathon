# pdfsave Extension

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

## Build And Package

- `npm run build --workspace @pdf-toolkit/extension`
- `npm run package:browsers --workspace @pdf-toolkit/extension`

The packaging command creates browser-specific outputs in `apps/extension/dist-packages`:

- unpacked folders: `chrome`, `edge`, `firefox`, `safari`
- zipped artifacts: `local-pdf-toolkit-<browser>-v<version>.zip`

## Encrypted PDFs

The workspace prompts for a password when loading protected PDFs and reuses that context for local single-file actions.

## Tooling

The contextual workspace toolbar supports:

- extract
- delete
- rotate
- split
- merge (with sidebar staging and drag-and-drop ordering)
- compress
- watermark (configurable text, font, color, opacity, rotation, and position)
- unlock/remove-password (owner-password restricted PDFs)
- e-sign (text signature placement with style and date options)

The current implementation is still a scaffold for the PDF engine, packaging, and browser-specific release work.
