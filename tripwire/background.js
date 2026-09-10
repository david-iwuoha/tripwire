const STORAGE_KEY = "watches";
const DEFAULT_INTERVAL = 30;
const OFFSCREEN_PATH = "offscreen.html";

let offscreenSetup = null;

async function getWatches() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || {};
}

async function saveWatches(watches) {
  await chrome.storage.local.set({ [STORAGE_KEY]: watches });
}

async function updateWatch(id, patch) {
  const watches = await getWatches();
  if (!watches[id]) return null;
  watches[id] = { ...watches[id], ...patch };
  await saveWatches(watches);
  return watches[id];
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function alarmName(id) {
  return "tripwire:" + id;
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"]
  });

  if (existing.length > 0) return;

  if (offscreenSetup) {
    await offscreenSetup;
    return;
  }

  offscreenSetup = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["DOM_PARSER"],
    justification: "Parse fetched HTML to read a watched element."
  });

  try {
    await offscreenSetup;
  } finally {
    offscreenSetup = null;
  }
}

async function extractText(html, selector) {
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PARSE_HTML",
    html,
    selector
  });
  return response;
}

async function checkWatch(id, options = {}) {
  const watches = await getWatches();
  const watch = watches[id];
  if (!watch) return null;

  if (watch.paused && !options.force) return watch;

  try {
    const response = await fetch(watch.url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow"
    });

    if (!response.ok) {
      return await updateWatch(id, {
        status: "error",
        error: "Page returned " + response.status,
        lastChecked: Date.now()
      });
    }

    const html = await response.text();
    const parsed = await extractText(html, watch.selector);

    if (!parsed || !parsed.found) {
      return await updateWatch(id, {
        status: "error",
        error: "Element not found on the page.",
        lastChecked: Date.now()
      });
    }

    const freshText = parsed.text;

    if (watch.lastText === null || watch.lastText === undefined) {
      return await updateWatch(id, {
        status: "watching",
        error: null,
        lastText: freshText,
        lastChecked: Date.now()
      });
    }

    if (freshText !== watch.lastText) {
      const updated = await updateWatch(id, {
        status: "changed",
        error: null,
        previousText: watch.lastText,
        lastText: freshText,
        lastChanged: Date.now(),
        lastChecked: Date.now()
      });

      notifyChange(updated);
      return updated;
    }

    return await updateWatch(id, {
      status: watch.status === "changed" ? "changed" : "watching",
      error: null,
      lastChecked: Date.now()
    });
  } catch (error) {
    return await updateWatch(id, {
      status: "error",
      error: "Could not reach the page.",
      lastChecked: Date.now()
    });
  }
}

function notifyChange(watch) {
  let host = watch.url;
  try {
    host = new URL(watch.url).hostname.replace(/^www\./, "");
  } catch (error) {
    host = watch.url;
  }

  chrome.notifications.create("tripwire:" + watch.id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Changed on " + host,
    message: watch.lastText.slice(0, 180) || "The watched element changed.",
    priority: 2,
    requireInteraction: false
  });
}

async function createWatch(payload) {
  const watches = await getWatches();
  const id = makeId();

  watches[id] = {
    id,
    url: payload.url,
    title: payload.title || payload.url,
    selector: payload.selector,
    label: payload.label || "Watched element",
    intervalMinutes: DEFAULT_INTERVAL,
    lastText: null,
    previousText: null,
    status: "watching",
    error: null,
    paused: false,
    createdAt: Date.now(),
    lastChecked: null,
    lastChanged: null
  };

  await saveWatches(watches);

  chrome.alarms.create(alarmName(id), {
    periodInMinutes: DEFAULT_INTERVAL,
    delayInMinutes: 1
  });

  await checkWatch(id, { force: true });
  await refreshBadge();
  return id;
}

async function deleteWatch(id) {
  const watches = await getWatches();
  delete watches[id];
  await saveWatches(watches);
  await chrome.alarms.clear(alarmName(id));
  await refreshBadge();
}

async function changeInterval(id, minutes) {
  await updateWatch(id, { intervalMinutes: minutes });
  await chrome.alarms.clear(alarmName(id));
  chrome.alarms.create(alarmName(id), {
    periodInMinutes: minutes,
    delayInMinutes: minutes
  });
}

async function togglePause(id) {
  const watches = await getWatches();
  const watch = watches[id];
  if (!watch) return;

  const paused = !watch.paused;
  await updateWatch(id, { paused, status: paused ? "paused" : "watching" });

  if (paused) {
    await chrome.alarms.clear(alarmName(id));
  } else {
    chrome.alarms.create(alarmName(id), {
      periodInMinutes: watch.intervalMinutes,
      delayInMinutes: 1
    });
  }
  await refreshBadge();
}

async function acknowledge(id) {
  await updateWatch(id, { status: "watching" });
  await refreshBadge();
}

async function refreshBadge() {
  const watches = await getWatches();
  const count = Object.values(watches).filter(
    (watch) => watch.status === "changed"
  ).length;

  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2f6bff" });
}

async function rebuildAlarms() {
  const watches = await getWatches();
  for (const watch of Object.values(watches)) {
    if (watch.paused) continue;
    const existing = await chrome.alarms.get(alarmName(watch.id));
    if (!existing) {
      chrome.alarms.create(alarmName(watch.id), {
        periodInMinutes: watch.intervalMinutes,
        delayInMinutes: 1
      });
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "tripwire-watch",
      title: "Watch this with Tripwire",
      contexts: ["all"]
    });
  });
  rebuildAlarms();
  refreshBadge();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildAlarms();
  refreshBadge();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "tripwire-watch" || !tab || !tab.id) return;

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, {
      type: "CAPTURE_TARGET"
    });
  } catch (error) {
    response = null;
  }

  if (!response || !response.ok) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Tripwire",
      message:
        "Could not read that element. Reload the page and try again.",
      priority: 1
    });
    return;
  }

  await createWatch(response);

  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Now watching",
    message: response.label,
    priority: 1
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("tripwire:")) return;
  const id = alarm.name.slice("tripwire:".length);
  await checkWatch(id);
  await refreshBadge();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith("tripwire:")) return;
  const id = notificationId.slice("tripwire:".length);
  const watches = await getWatches();
  const watch = watches[id];
  if (watch) chrome.tabs.create({ url: watch.url });
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") return;

  (async () => {
    switch (message.type) {
      case "LIST_WATCHES":
        sendResponse({ watches: await getWatches() });
        break;
      case "CHECK_NOW":
        await checkWatch(message.id, { force: true });
        await refreshBadge();
        sendResponse({ watches: await getWatches() });
        break;
      case "CHECK_ALL": {
        const watches = await getWatches();
        for (const id of Object.keys(watches)) {
          await checkWatch(id, { force: true });
        }
        await refreshBadge();
        sendResponse({ watches: await getWatches() });
        break;
      }
      case "DELETE_WATCH":
        await deleteWatch(message.id);
        sendResponse({ watches: await getWatches() });
        break;
      case "SET_INTERVAL":
        await changeInterval(message.id, message.minutes);
        sendResponse({ watches: await getWatches() });
        break;
      case "TOGGLE_PAUSE":
        await togglePause(message.id);
        sendResponse({ watches: await getWatches() });
        break;
      case "ACKNOWLEDGE":
        await acknowledge(message.id);
        sendResponse({ watches: await getWatches() });
        break;
      default:
        sendResponse({ error: "Unknown message type." });
    }
  })();

  return true;
});
