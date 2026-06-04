# PDF Toolkit Platform

Cross-browser, local-first PDF toolkit platform with three delivery surfaces:

- `apps/extension`: browser extension shell for Chrome, Edge, Firefox, and Safari-style WebExtensions.
- `apps/landing-page`: Azure-hosted landing page and download/distribution API.
- `packages/*`: shared logic for PDF validation, browser detection, and future engine abstractions.
- `infra`: Docker and Azure deployment scaffolding.

## Repository Status

This repo is now initialized as the starter workspace for the requirements document. The current codebase focuses on foundation work:

- monorepo structure and workspace boundaries
- extension popup, workspace, and settings shells
- landing page server with browser-aware download routing
- shared validation helpers and basic tests
- Azure Container Apps and CI scaffolding

It is not a full implementation of all PDF operations yet. The current implementation is the baseline for building the PDF engine, browser packaging, and release automation next.

## Project Layout

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

## Local Setup

```sh
npm install
npm test
npm run build
```

## Design Constraints

- PDF content is intended to stay local to the browser runtime.
- Extension manifests keep permissions minimal.
- Landing page delivery is structured for Azure Container Apps plus CDN-backed downloads.
- Shared utilities are kept outside app folders to reduce browser drift.

## Next Build Steps

1. Wire a real PDF worker and operation queue into the extension workspace.
2. Add browser-specific packaging outputs for Chrome, Firefox, Edge, and Safari.
3. Replace placeholder CDN URLs with Azure Blob Storage and update manifest feeds.
