# Tripwire

Watch any part of any web page and get notified the moment it changes.

Stop refreshing a results portal, an admission status page, a restock listing, or a grant announcement ten times a day. Right-click the part you care about, walk away, and Tripwire taps you on the shoulder when it changes.

No accounts. No servers. No tracking. Everything stays in your browser.

## Install

Tripwire has no build step, so there is nothing to compile.

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome, Edge, Brave, or any Chromium browser.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder containing `manifest.json`.

## Use

1. Go to the page you want to monitor.
2. Right-click directly on the text you care about, for example a line that says `Status: Pending`.
3. Choose **Watch this with Tripwire**.
4. Open the toolbar icon to see everything you are watching, change how often each one is checked, pause a watch, or remove it.

The first check after you add a watch records a baseline and does not notify you. Every check after that compares against it. When something changes you get a desktop notification, the toolbar icon shows a badge, and clicking either one opens the page.

## How it works

| Piece | Job |
| --- | --- |
| `content.js` | Records the element you right-clicked and builds a CSS selector for it |
| `background.js` | Stores watches, runs the timer, fetches pages, compares text, sends notifications |
| `offscreen.js` | Parses fetched HTML with `DOMParser`, which a service worker cannot do directly |
| `popup.js` / `popup.html` / `popup.css` | The interface for managing watches |

Watches are stored in `chrome.storage.local`. Timers use `chrome.alarms`, so checks keep running after the service worker is unloaded by the browser.

## Known limits

- **JavaScript-rendered pages will not work.** Tripwire fetches raw HTML, so content injected by scripts after load is invisible to it.
- **Pages behind a login will not work.** Requests are sent without credentials.
- **The minimum interval is 5 minutes.** Chrome will not fire alarms more often than once a minute, and hammering a server is a good way to get blocked.
- **Selectors can break** if a site restructures its markup. Tripwire will show an error on that watch rather than silently going quiet.

## Roadmap

- Read pages in a background tab so JavaScript-rendered and logged-in pages work
- Show a diff of what actually changed instead of just the new text
- Ignore-list for parts of an element that always change, like timestamps
- Export and import watches

## Contributing

Issues and pull requests are welcome. The whole thing is plain JavaScript with no dependencies, so you can clone it and start editing immediately.

## License

MIT
