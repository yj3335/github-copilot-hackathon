import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runExecFile = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = resolve(rootDir, "dist");
const packageRoot = resolve(rootDir, "dist-packages");

const browserTargets = ["chrome", "edge", "firefox", "safari"];

function withBrowserManifest(baseManifest, browser) {
  const manifest = structuredClone(baseManifest);

  if (browser === "firefox") {
    manifest.browser_specific_settings = {
      gecko: {
        id: "local-pdf-toolkit@pdf-toolkit.local",
        strict_min_version: "109.0"
      }
    };
  }

  if (browser !== "firefox") {
    delete manifest.browser_specific_settings;
  }

  return manifest;
}

async function zipBundle(directoryPath, outputZipPath) {
  try {
    if (process.platform === "win32") {
      await runExecFile("powershell", ["-Command", `Compress-Archive -Path '${directoryPath}\\*' -DestinationPath '${outputZipPath}' -Force`]);
    } else {
      await runExecFile("zip", ["-qr", outputZipPath, "."], { cwd: directoryPath });
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to create zip archive for ${directoryPath}: ${details}`);
  }
}

async function main() {
  const manifestPath = resolve(distDir, "manifest.json");
  const baseManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const extensionVersion = baseManifest.version ?? "0.1.0";

  await rm(packageRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });

  for (const browser of browserTargets) {
    const browserOutDir = resolve(packageRoot, browser);
    await cp(distDir, browserOutDir, { recursive: true });

    const browserManifest = withBrowserManifest(baseManifest, browser);
    await writeFile(
      resolve(browserOutDir, "manifest.json"),
      `${JSON.stringify(browserManifest, null, 2)}\n`,
      "utf8"
    );

    const outputZipPath = resolve(packageRoot, `local-pdf-toolkit-${browser}-v${extensionVersion}.zip`);
    await zipBundle(browserOutDir, outputZipPath);
  }

  console.log(`Created browser packages in ${packageRoot}`);
}

await main();
