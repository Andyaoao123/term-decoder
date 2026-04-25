export async function readActiveSelection() {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return "";
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab?.id) {
    return "";
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "TD_GET_SELECTION",
    });
    return response?.text || "";
  } catch {
    return "";
  }
}
