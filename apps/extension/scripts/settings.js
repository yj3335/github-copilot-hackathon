const extensionApi = globalThis.browser || globalThis.chrome;

const defaults = {
  filenamePattern: "{original}-{operation}-{date}",
  layoutPreference: "grid"
};

const filenamePatternInput = document.querySelector("#filename-pattern");
const layoutPreferenceInput = document.querySelector("#layout-preference");
const message = document.querySelector("#settings-message");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.dataset.error = String(isError);
}

function validatePattern(value) {
  const invalid = value.match(/[\\/:*?"<>|]/g);

  if (invalid) {
    return `Invalid filename characters: ${[...new Set(invalid)].join(" ")}`;
  }

  return "";
}

function loadSettings() {
  extensionApi.storage.local.get(defaults, (items) => {
    filenamePatternInput.value = items.filenamePattern;
    layoutPreferenceInput.value = items.layoutPreference;
  });
}

document.querySelector("#save-settings").addEventListener("click", () => {
  const validationMessage = validatePattern(filenamePatternInput.value);

  if (validationMessage) {
    setMessage(validationMessage, true);
    return;
  }

  extensionApi.storage.local.set({
    filenamePattern: filenamePatternInput.value,
    layoutPreference: layoutPreferenceInput.value
  }, () => {
    setMessage("Settings saved.");
  });
});

document.querySelector("#reset-settings").addEventListener("click", () => {
  if (!window.confirm("Reset all settings to defaults?")) {
    return;
  }

  extensionApi.storage.local.set(defaults, loadSettings);
  setMessage("Defaults restored.");
});

loadSettings();
