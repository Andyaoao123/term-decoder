const STORAGE_KEYS = {
  provider: "td_provider",
  model: "td_model",
  apiKeys: "td_api_keys",
  history: "td_history",
  washerFeedback: "td_washer_feedback",
};

function isExtensionStorageAvailable() {
  return typeof chrome !== "undefined" && chrome.storage?.local;
}

function localGet(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(key);
    if (rawValue == null) {
      return fallbackValue;
    }

    return JSON.parse(rawValue);
  } catch {
    return fallbackValue;
  }
}

function localSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function loadSettings() {
  if (isExtensionStorageAvailable()) {
    const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
    return {
      provider: data[STORAGE_KEYS.provider] || "deepseek",
      model: data[STORAGE_KEYS.model] || "deepseek-chat",
      apiKeys: data[STORAGE_KEYS.apiKeys] || {},
      history: data[STORAGE_KEYS.history] || [],
    };
  }

  return {
    provider: localGet(STORAGE_KEYS.provider, "deepseek"),
    model: localGet(STORAGE_KEYS.model, "deepseek-chat"),
    apiKeys: localGet(STORAGE_KEYS.apiKeys, {}),
    history: localGet(STORAGE_KEYS.history, []),
  };
}

export async function saveSetting(key, value) {
  const storageKey = STORAGE_KEYS[key];
  if (!storageKey) {
    return;
  }

  if (isExtensionStorageAvailable()) {
    await chrome.storage.local.set({ [storageKey]: value });
    return;
  }

  localSet(storageKey, value);
}

export async function saveHistoryItems(history) {
  await saveSetting("history", history);
}

export async function clearHistoryItems() {
  if (isExtensionStorageAvailable()) {
    await chrome.storage.local.remove(STORAGE_KEYS.history);
    return;
  }

  localStorage.removeItem(STORAGE_KEYS.history);
}

export async function loadWasherFeedback() {
  if (isExtensionStorageAvailable()) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.washerFeedback);
    return data[STORAGE_KEYS.washerFeedback] || [];
  }

  return localGet(STORAGE_KEYS.washerFeedback, []);
}

export async function saveWasherFeedback(items) {
  await saveSetting("washerFeedback", items);
}
