# pdfsave

Local-first PDF editing for teams that care about privacy, speed, and cross-browser access.

pdfsave delivers a complete browser-extension workflow for day-to-day PDF operations while keeping files on-device, plus a landing and distribution surface for browser-specific installs.

Presentation (Slides) : https://drive.google.com/file/d/1bBPDmOWNREFMRQpdg6y49clW2O33VQ5l/view?usp=sharing

## Why This Project

- Privacy-first: PDF files are processed locally in the extension runtime, not uploaded to a server.
- Cross-browser delivery: one codebase, packaged outputs for Chrome, Edge, Firefox, and Safari-style distribution.
- Real workflows: merge, split, extract, delete, rotate, and compress are already working in the workspace.
- Product-ready shell: extension UI, settings, landing page API, CI, and infra are in place.

## Features Implemented Today

### Extension workspace

- Local PDF load with validation and safety confirmation for large files.
- Progressive thumbnail rendering for full documents.
- Page targeting through range input plus click, multi-select, and shift-range selection.
- Preview modal for page inspection.
- Contextual tool toolbar with dedicated modes:
	- Extract pages
	- Delete pages
	- Rotate pages (90/180/270)
	- Split to ZIP (ranges, equal parts, every N pages)
	- Compress PDF (balanced and maximum modes)
	- Merge PDFs
	- Watermark (text overlay with configurable font, size, color, opacity, rotation, position)
	- Unlock (remove password protection from owner-password PDFs)
- Merge staging in sidebar with Up/Down controls and drag-and-drop ordering.
- Undo for in-workspace document mutations.
- Human-readable metadata dates and cleaner filename normalization across operations.

### Password and protected files

- Password prompt flow on protected PDF load.
- Password context reused for single-file operations in the workspace flow.
- Remove password tool: strips permission restrictions from owner-password PDFs and outputs an unlocked copy.

### Popup and settings

- Popup quick actions for opening single files, opening merge flow, and opening workspace/settings.
- Local settings persistence in extension storage for filename pattern and layout preference.

### Packaging and distribution

- Build pipeline for extension bundles.
- Browser packaging command that generates:
	- unpacked outputs for chrome, edge, firefox, safari
	- zipped artifacts per browser in apps/extension/dist-packages

### Landing page and APIs

- Express landing server with static site hosting.
- Health endpoint: /health
- Browser detection endpoint: /api/browser
- Download selection endpoint: /api/download (browser-aware package URL response)

### Platform and engineering foundation

- npm workspace monorepo structure.
- Shared utility package for browser detection, filename safety, and range parsing.
- PDF core package with local mutation helpers.
- CI workflow and Azure Container Apps infrastructure scaffolding.

## Repository Layout

```text
.
├── apps
│   ├── extension
│   └── landing-page
├── infra
├── packages
│   ├── pdf-core
│   └── shared
└── .github
```

## Quick Start

```sh
npm install
npm test
npm run build
```

Build extension only:

```sh
npm run build --workspace @pdf-toolkit/extension
```

Generate browser-specific packages:

```sh
npm run package:browsers --workspace @pdf-toolkit/extension
```

## Design Principles

- Keep PDF bytes local to the browser runtime wherever possible.
- Keep extension permissions minimal.
- Share logic across apps to reduce browser drift and duplicated behavior.
- Keep shipping in small, testable increments.

## What Is Next

- Harden encrypted PDF support across all mutation paths.
- Expand e-sign from text signatures to handwritten/image signature capture.
- Finalize CDN-backed release artifact flow and update-feed automation.
- Continue UX polish, broader test coverage, and cross-browser production hardening.
