import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

type LayoutPreference = "grid" | "list";

interface ExtensionSettings {
  filenamePattern: string;
  workspaceLayout: LayoutPreference;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  filenamePattern: "{original}-{operation}-{date}",
  workspaceLayout: "grid"
};

function SettingsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get(["filenamePattern", "workspaceLayout"], (storedSettings) => {
      setSettings({
        filenamePattern:
          typeof storedSettings.filenamePattern === "string"
            ? storedSettings.filenamePattern
            : DEFAULT_SETTINGS.filenamePattern,
        workspaceLayout:
          storedSettings.workspaceLayout === "list" ? "list" : DEFAULT_SETTINGS.workspaceLayout
      });
    });
  }, []);

  const saveSettings = () => {
    chrome.storage.local.set(settings, () => {
      setSaved("Preferences saved locally.");
    });
  };

  const resetSettings = () => {
    if (!window.confirm("Reset settings to default values?")) {
      return;
    }

    setSettings(DEFAULT_SETTINGS);
    chrome.storage.local.set(DEFAULT_SETTINGS, () => {
      setSaved("Defaults restored.");
    });
  };

  return (
    <main className="settings-shell">
      <section className="settings-card panel">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="title">Preference control</h1>
        </div>

        <label className="field" htmlFor="pattern">
          <span>Default filename pattern</span>
          <input
            id="pattern"
            maxLength={255}
            value={settings.filenamePattern}
            onChange={(event) => setSettings((current) => ({ ...current, filenamePattern: event.target.value }))}
          />
        </label>

        <label className="field" htmlFor="layout">
          <span>Workspace layout</span>
          <select
            id="layout"
            value={settings.workspaceLayout}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                workspaceLayout: event.target.value as LayoutPreference
              }))
            }
          >
            <option value="grid">Grid</option>
            <option value="list">List</option>
          </select>
        </label>

        <div className="settings-actions">
          <button className="button" onClick={saveSettings} type="button">
            Save settings
          </button>
          <button className="button secondary" onClick={resetSettings} type="button">
            Reset to defaults
          </button>
        </div>

        {saved ? <div className="tag">{saved}</div> : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<SettingsApp />);