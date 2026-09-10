const listEl = document.getElementById("list");
const subtitleEl = document.getElementById("subtitle");
const refreshEl = document.getElementById("refresh");
const itemTemplate = document.getElementById("item-template");
const emptyTemplate = document.getElementById("empty-template");

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return url;
  }
}

function timeAgo(timestamp) {
  if (!timestamp) return "not checked yet";

  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + "m ago";

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + "h ago";

  return Math.round(hours / 24) + "d ago";
}

function statusOf(watch) {
  if (watch.paused) return "paused";
  if (watch.status === "error") return "error";
  if (watch.status === "changed") return "changed";
  return "ok";
}

function render(watches) {
  const items = Object.values(watches).sort(
    (a, b) => (b.lastChanged || 0) - (a.lastChanged || 0) || b.createdAt - a.createdAt
  );

  listEl.replaceChildren();

  if (items.length === 0) {
    listEl.append(emptyTemplate.content.cloneNode(true));
    subtitleEl.textContent = "No active watches";
    return;
  }

  const changed = items.filter((watch) => watch.status === "changed").length;
  subtitleEl.textContent =
    items.length +
    (items.length === 1 ? " watch" : " watches") +
    (changed ? ", " + changed + " changed" : "");

  for (const watch of items) {
    const node = itemTemplate.content.cloneNode(true);
    const article = node.querySelector(".item");
    const state = statusOf(watch);

    article.dataset.id = watch.id;
    if (state === "changed") article.classList.add("is-changed");

    node.querySelector("[data-dot]").classList.add(state);
    node.querySelector("[data-label]").textContent = watch.label;
    node.querySelector("[data-host]").textContent = hostOf(watch.url);

    const textEl = node.querySelector("[data-text]");
    if (watch.error) {
      textEl.textContent = watch.error;
      textEl.classList.add("is-error");
    } else {
      textEl.textContent = watch.lastText || "Reading the page for the first time.";
    }

    const metaParts = [];
    if (state === "changed" && watch.lastChanged) {
      metaParts.push("Changed " + timeAgo(watch.lastChanged));
    } else {
      metaParts.push("Checked " + timeAgo(watch.lastChecked));
    }
    node.querySelector("[data-meta]").textContent = metaParts.join(" ");

    const intervalEl = node.querySelector("[data-interval]");
    intervalEl.value = String(watch.intervalMinutes);

    const pauseEl = node.querySelector("[data-pause]");
    pauseEl.textContent = watch.paused ? "Resume" : "Pause";

    listEl.append(node);
  }
}

async function refresh() {
  const response = await send({ type: "LIST_WATCHES" });
  render(response.watches || {});
}

listEl.addEventListener("click", async (event) => {
  const article = event.target.closest(".item");
  if (!article) return;
  const id = article.dataset.id;

  if (event.target.closest("[data-delete]")) {
    const response = await send({ type: "DELETE_WATCH", id });
    render(response.watches || {});
    return;
  }

  if (event.target.closest("[data-check]")) {
    const button = event.target.closest("[data-check]");
    button.textContent = "...";
    const response = await send({ type: "CHECK_NOW", id });
    render(response.watches || {});
    return;
  }

  if (event.target.closest("[data-pause]")) {
    const response = await send({ type: "TOGGLE_PAUSE", id });
    render(response.watches || {});
    return;
  }

  if (article.classList.contains("is-changed")) {
    await send({ type: "ACKNOWLEDGE", id });
    const watches = (await send({ type: "LIST_WATCHES" })).watches || {};
    const watch = watches[id];
    if (watch) chrome.tabs.create({ url: watch.url });
  }
});

listEl.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-interval]");
  if (!select) return;

  const article = select.closest(".item");
  const response = await send({
    type: "SET_INTERVAL",
    id: article.dataset.id,
    minutes: Number(select.value)
  });
  render(response.watches || {});
});

refreshEl.addEventListener("click", async () => {
  const icon = refreshEl.querySelector("svg");
  icon.classList.add("spinning");
  subtitleEl.textContent = "Checking";

  const response = await send({ type: "CHECK_ALL" });
  render(response.watches || {});
  icon.classList.remove("spinning");
});

refresh();
