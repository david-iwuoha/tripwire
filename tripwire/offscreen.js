chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen" || message.type !== "PARSE_HTML") return;

  try {
    const doc = new DOMParser().parseFromString(message.html, "text/html");
    const element = doc.querySelector(message.selector);

    if (!element) {
      sendResponse({ found: false, text: null });
      return;
    }

    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    sendResponse({ found: true, text });
  } catch (error) {
    sendResponse({ found: false, text: null, error: String(error) });
  }
});
