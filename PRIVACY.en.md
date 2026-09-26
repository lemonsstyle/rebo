# rebo Privacy Policy

> 语言 / Language: [中文](PRIVACY.md) · **English**

Effective date: August 4, 2026

rebo (the "extension") improves the reading experience of the weibo web app on wide-screen devices by re-laying the feed into a multi-column layout, and — only when the user acts explicitly — showing weibo detail views, comments, and media, and performing like, comment, and repost actions.

The extension is maintained by an independent developer and is not affiliated with or endorsed by weibo. This policy explains how the extension handles user data.

## 1. Data the extension handles

### 1.1 Local settings

The extension uses `chrome.storage.local` to store the following settings:

- whether the multi-column reading mode is enabled;
- the number of columns the user has chosen.

These settings are stored only in the user's browser and are never sent to the developer's servers.

### 1.2 weibo page content

To provide the multi-column feed and the reading of weibo detail views, long text, media, and comments, the extension processes the weibo content on the current page — as well as the data returned by weibo's same-origin endpoints — while the user is on `weibo.com` or `www.weibo.com`.

This data may include post text, an author's public information, image and video URLs, comments, repost content, like state, page route, and follow-group identifiers. The extension uses this data only within the current browser page session; it does not persist it to browser storage and does not send it to any server controlled by the developer.

### 1.3 Authentication information

The extension temporarily reads the non-`HttpOnly` `XSRF-TOKEN` that the weibo web page exposes, in order to send the anti-CSRF request header required by weibo's own same-origin endpoints.

The extension does not store, log, or send the `XSRF-TOKEN`, weibo cookies, passwords, or any other login credentials to the developer's servers.

### 1.4 User input and account actions

When the user actively submits a comment, reply, or repost, or clicks buttons such as like or unlike, the extension sends the corresponding text, the relevant post or comment identifier, and the action request to weibo's own same-origin endpoints.

These actions run only when the user clicks or submits them. The extension never publishes content, comments, reposts, or likes automatically in the background. Content and action records the user submits to weibo are handled by weibo under its own terms of service and privacy policy.

### 1.5 External image resources

Post text, emoji, and comment images may come from resource domains operated by weibo or Sina, such as `face.t.sinajs.cn`, `t.cn`, and `*.sinaimg.cn`. The browser requests these images just as it would on a normal weibo page.

To improve the load success rate of some comment images, requests may carry the Referer of the current weibo page. The Referer may include the current page path or a follow-group identifier, but the extension does not deliberately add cookies, the `XSRF-TOKEN`, or comment text to it.

## 2. Purpose of data use

The extension processes the data above only to:

- identify the current weibo page and follow group;
- fetch and display the weibo feed the user can currently access;
- provide the multi-column layout and the reading of detail views, long text, media, and comments;
- store the user's local layout preferences;
- perform the comment, reply, repost, and like actions the user initiates;
- diagnose failed requests and, when necessary, restore weibo's original feed.

The extension does not use user data for advertising, cross-site tracking, user profiling, credit scoring, data trading, or any purpose unrelated to the core functions above.

## 3. Data storage and retention

- Layout settings are stored in `chrome.storage.local` until the user clears the extension's data or uninstalls the extension;
- weibo feed, post text, comments, media information, and request templates are kept only in the current page's memory and are cleared when the page is refreshed or closed, or when the extension is reloaded;
- the `XSRF-TOKEN` is read only temporarily while constructing the current same-origin request, and is not persisted by the extension;
- comment, reply, repost, and like records the user submits to weibo are stored by weibo; the extension cannot control their retention period or deletion rules.

## 4. Data sharing and transfer

The extension does not operate a developer server that collects user data, and does not sell, rent, or trade user data.

Data is sent only when it is necessary to provide core functions, to:

- weibo's own same-origin endpoints, to read weibo content or perform account actions the user initiates;
- image resource servers operated by weibo or Sina, to load the emoji, images, and media resources on weibo pages.

The extension does not use any third-party analytics, advertising, crash-reporting, or user-tracking services.

## 5. Browser permissions

The extension requests the following permissions:

- `storage`: to store, in the browser locally, whether the multi-column mode is enabled and the column-count setting;
- `https://weibo.com/*`, `https://www.weibo.com/*`: to read and re-layout page content on weibo pages, call weibo's same-origin endpoints, and respond to user actions.

The extension does not request permissions for browsing history, downloads, notifications, the clipboard, identity, camera, microphone, or the Chrome Cookies API.

## 6. Data security and limited use

The extension accesses weibo and Sina resources over HTTPS only, and does not load or execute remote JavaScript code. Requests that change account state are made only when the user acts explicitly.

The extension's use of user data is limited to providing and maintaining its single purpose. It does not transfer data to unrelated third parties, and does not use data for advertising, data brokerage, credit scoring, or any purpose unrelated to user-facing functionality.

## 7. User control

Users can disable the multi-column reading mode with the toggle in the extension's panel, and can disable or uninstall the extension from the browser's extension management page. Uninstalling the extension or clearing its storage deletes the layout settings stored locally.

To delete comments, replies, reposts, or likes already submitted to weibo, users should manage them through the features weibo provides.

## 8. Third-party services

The extension relies on weibo web pages, weibo's same-origin endpoints, and media resources from weibo or Sina. The extension cannot control how these services process data, their availability, or their privacy practices. When using these services, please also consult the privacy policies of weibo and the relevant providers.

## 9. Policy changes

If the way the extension handles data changes materially, this policy will be updated accordingly, and the effective date at the top will be revised. The updated policy will be published in this project's public code repository.

## 10. Contact

If you have questions about this privacy policy or how the extension handles data, please contact the maintainer through the project's GitHub Issues:

https://github.com/lemonsstyle/rebo/issues
