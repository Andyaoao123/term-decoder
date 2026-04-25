chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TD_GET_SELECTION") {
    return false;
  }

  const text = window.getSelection?.().toString() || "";
  sendResponse({ text });
  return false;
});
