import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = resolve(rootDir, "dist");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  absWorkingDir: rootDir,
  bundle: true,
  entryPoints: {
    background: "src/background.ts",
    popup: "src/popup.tsx",
    workspace: "src/workspace.tsx",
    settings: "src/settings.tsx"
  },
  format: "esm",
  minify: false,
  outdir: distDir,
  sourcemap: true,
  target: ["chrome110", "firefox109", "safari16"]
});

await cp(resolve(rootDir, "public"), distDir, { recursive: true });
await cp(resolve(rootDir, "../../node_modules/pdfjs-dist/build/pdf.worker.mjs"), resolve(distDir, "pdf.worker.mjs"));