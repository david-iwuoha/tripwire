let lastRightClicked = null;

document.addEventListener(
  "contextmenu",
  (event) => {
    lastRightClicked = event.target;
  },
  true
);

function buildSelector(element) {
  if (!element || element.nodeType !== 1) return null;

  if (element.id) {
    const candidate = "#" + CSS.escape(element.id);
    if (document.querySelectorAll(candidate).length === 1) return candidate;
  }

  const parts = [];
  let node = element;

  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node.id) {
      const idPart = "#" + CSS.escape(node.id);
      if (document.querySelectorAll(idPart).length === 1) {
        parts.unshift(idPart);
        break;
      }
    }

    let part = node.tagName.toLowerCase();
    const parent = node.parentElement;

    if (parent) {
      const twins = Array.from(parent.children).filter(
        (child) => child.tagName === node.tagName
      );
      if (twins.length > 1) {
        part += ":nth-of-type(" + (twins.indexOf(node) + 1) + ")";
      }
    }

    parts.unshift(part);
    node = parent;
  }

  return parts.length ? parts.join(" > ") : null;
}

function readText(element) {
  return (element.innerText || element.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLabel(element) {
  const text = readText(element);
  if (text) return text.slice(0, 60);
  return element.tagName.toLowerCase();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "CAPTURE_TARGET") return;

  const element = lastRightClicked;

  if (!element) {
    sendResponse({ ok: false, error: "No element captured." });
    return;
  }

  const selector = buildSelector(element);

  if (!selector) {
    sendResponse({ ok: false, error: "Could not identify that element." });
    return;
  }

  sendResponse({
    ok: true,
    selector,
    label: buildLabel(element),
    url: location.href,
    title: document.title
  });
});
