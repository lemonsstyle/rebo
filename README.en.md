# rebo: turn weibo into a more readable, redbook-style feed

> 语言 / Language: [中文](README.md) · **English**

The weibo web app wastes most of the screen on large displays. The middle is a single narrow column; apart from the useful group list on the left, the right side is packed with trending topics and recommendations, and the rest is blank.
rebo is a local Chrome / Edge extension. It does not take weibo over for you — it only lays the page out as a multi-column feed that is easier to read, for people who like to browse weibo slowly on a wide screen.

## Before and after

### Before rebo

![Official web app: a narrow single-column feed with a trending sidebar](img/before.png)

### After rebo

![rebo: a three-column card feed that keeps the left-hand groups](img/after.png)


## Highlights

- **More content at a glance.** The feed can switch between two, three, and four columns; images, short posts, and long content no longer share one vertical queue.
- **The layout you already know.** Posting from the top, the follow groups on the left, and multi-image and video posts all keep working as usual.


## Install

1. Download the latest [release archive](https://github.com/lemonsstyle/rebo/releases/) from this repository and unzip it into a folder.
2. In Chrome, open `chrome://extensions` in the address bar (in Edge, open `edge://extensions`).
3. Turn on "Developer mode" in the top-right corner (in Edge, "Developer mode" on the left).
4. Choose "Load unpacked" (in Edge, "Load unpacked"), then select the folder.
5. Refresh `https://weibo.com/`. An orange eye button in the bottom-left corner means the extension is running.
6. Click that button and turn on "Use the new layout".

## To-do
- Image comments.
- Multi-column rebo mode on profile pages.
- Blocking ads in the home feed (may not happen).


## Permissions

rebo never sends weibo content, cookies, the `XSRF-TOKEN`, or account data to the developer's servers. Layout preferences are stored only in your browser; weibo content and user-initiated actions are handled only within the current page and, when necessary, sent to weibo's own same-origin services.

See the [Privacy Policy](PRIVACY.en.md) for the full data-handling description.

weibo's page structure and private endpoints may change. If you run into display issues, click the bottom-left button to temporarily turn off "Use the new layout" and return to the official single-column feed.

Feel free to open an issue. The extension is updated monthly to keep the experience comfortable.

For implementation details, endpoint trade-offs, and maintenance checks, see [TECHNICAL_SUMMARY.md](TECHNICAL_SUMMARY.md) (Chinese only).

## License

This project is open-sourced under the [MIT License](LICENSE).

This project is not affiliated with or endorsed by weibo; weibo and related names, trademarks, and content belong to their respective owners.
