# 微博网格阅读器 / Weibo Grid Reader

[中文版](#zh) · [English](#en)

<a id="zh"></a>

## 中文版

English version: [Read in English](#en)

一个无需构建步骤的 Chrome / Edge Manifest V3 扩展，用于改善微博网页版首页和分组页的信息流阅读。

完整的架构、接口、滚动规则、隐私取舍与维护限制见：[技术总结](TECHNICAL_SUMMARY.md)。

### tidy 更新

- 顶部发布微博区域会扩展到与卡片墙相同的可用宽度；控制浮窗点击外部区域会自动收起。
- 纯文字详情按正文实际高度放置评论，避免固定空白；评论栏加宽，并与底部博主资料栏以背景和分隔线区分。
- 评论区会显示微博响应中的嵌套回复，并按评论 ID 去重；博主回复其他评论时隐藏重复的博主名。
- 嵌套回复不重复引用父评论，使用缩进和留白表达层级；同一父评论下的回复不再使用分隔线。
- 评论者头像和昵称、详情底部博主头像和昵称均可在新标签页打开对应微博主页。

### fatigue 更新

- 详情右栏现在只保留评论列表，不再加载转发或点赞列表。
- 打开详情后，滚轮只会滚动命中的详情内部区域：左侧正文、图片、缩略图列或右侧评论列表；背景信息流保持不动，关闭详情后恢复正常页面滚动。
- 详情卡片使用固定高度，右栏评论内容在卡片内部滚动。
- 同时包含视频和图片的微博会同时展示两类媒体；视频无法播放时，图片仍可显示。
- 微博正文和转发中的 `t.cn` 短链会作为普通外链打开；带标题或封面的外站网页、视频会显示可点击预览卡。已识别的新浪图床正文链接仍交给微博原生查看器；评论图片则直接显示在评论区，点击后在详情卡片内预览。
- 详情图片只有在实际溢出超过可视区域约 `12%` 时才启用独立滚动；接近完整显示时会自动缩放以避免无意义的短距离滚动。

### 功能

- 在 `https://weibo.com/` 和 `/mygroups` 信息流页面左下角显示悬浮阅读器按钮。
- 默认隐藏原生右栏，扩大中间信息流，并使左侧分组导航在桌面宽度保持可见。
- 点击悬浮按钮打开紧凑控制面板，可通过开关启用新布局，并拖动“稀疏 / 适中 / 密集”三档滑杆选择卡片密度（分别对应 `3 / 4 / 5` 列）；点击浮窗外部会自动收起。
- 扩展从当前已登录的微博页面请求同一分组的信息流，在本地渲染响应式瀑布流卡片墙，不依赖微博纵向虚拟列表。
- 多图微博会按图片方向组成紧凑拼图；视频微博使用原视频流预览；带元数据的外站网页或视频会显示封面预览；转发微博会显示被转发微博的作者、正文和媒体内容；长微博可在卡片中点击“展开全文”，详情卡片会自动请求并显示全文。
- 下拉到卡片墙底部附近时，扩展使用响应中的 `max_id` 请求下一页；切换分组或从详情返回信息流后会重新挂载卡片墙。
- 点击卡片会在原卡片附近打开详情层：背景轻微变暗，左侧显示正文和媒体，右侧显示评论和嵌套回复。纯文字详情会让评论紧随正文；接近显示区尺寸的单图会自动完整显示，明显超出显示区的竖图可纵向滚动、横图可用滚轮横向浏览，多图可通过中间缩略图切换。

### 本地安装

1. 打开 `chrome://extensions`；Edge 使用 `edge://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本目录 `weibo_grid`。
4. 打开或刷新 `https://weibo.com/mygroups?gid=...`，页面左下角会出现橙色阅读器按钮。

首次使用时，新布局默认开启，默认三列。布局开关和列数偏好仅保存在浏览器本地扩展存储中。

### 验证清单

1. 切换“使用新布局”开关并拖动“稀疏 / 适中 / 密集”滑杆，确认卡片墙与原始信息流切换正常。
2. 下拉至少三屏，确认卡片墙持续加载且没有行高空白。
3. 点击图文、转发、视频和外站预览卡，确认普通链接不会误触发详情；微博图片链接会打开原生查看器，评论图片会直接显示并可在详情内预览。
4. 打开详情后，在正文、图片和评论区分别滚动，确认只有命中的内部区域滚动，背景页面不滚动；检查纯文字详情没有固定大空白，并确认顶级评论下的嵌套回复仅显示一次。
5. 打开单图、多图、“视频+图片”和外站视频微博，确认媒体可以正常展示与浏览；分别检查近适配单图不会独立滚动、明显长图或宽图仍可滚动浏览。

### 隐私与限制

扩展只申请 `storage` 权限及微博页面访问权限。为加载评论和长微博全文，它只在微博页面内读取非 HttpOnly 的 `XSRF-TOKEN` 并发送给同源微博接口；不会保存该值，也不会向微博以外的服务上传 Cookie 或信息流内容。评论图片由浏览器直接向微博图床加载；为降低图床防盗链失败，图片请求会携带当前微博页面 Referer，详见[技术总结](TECHNICAL_SUMMARY.md#11-安全隐私与权限)。

微博会频繁更新接口与响应字段。若信息流请求失败，扩展会自动恢复原版信息流；也可关闭“使用新布局”立即恢复。

<a id="en"></a>

## English

中文版本：[阅读中文版](#zh)

A build-free Chrome / Edge Manifest V3 extension that improves reading Weibo's web home and group feeds.

For the detailed architecture, APIs, scrolling rules, privacy trade-offs, and maintenance limits, see the [technical summary (Chinese)](TECHNICAL_SUMMARY.md).

### What Changed in tidy

- The top post composer expands to the same available width as the card wall, and the control drawer closes automatically when clicking elsewhere.
- Text-only details size the post row from its actual content instead of leaving a fixed blank area; the comments sidebar is wider and visually separated from the author footer.
- The comments area renders nested replies from Weibo's response and deduplicates them by comment ID. The author's name is hidden when replying to another comment.
- Nested replies use indentation and spacing rather than repeating the parent text; replies under the same parent no longer use divider lines.
- Commenter avatars and names, plus the author avatar and name in the detail footer, open the corresponding Weibo profile in a new tab.

### What Changed in fatigue

- The detail sidebar now contains comments only; repost and like lists are no longer requested or rendered.
- While a detail card is open, wheel input is routed only to the detail area beneath the pointer: the post body, image viewer, thumbnail rail, or comments list. The background feed remains fixed until the detail card closes.
- Detail cards have a fixed height, and long comments scroll inside the sidebar.
- Posts that contain both video and pictures now render both media types. Pictures remain available if video playback fails.
- `t.cn` links in post and repost text open as ordinary external links. External webpages and videos with returned preview metadata render as clickable cards. Recognized Sina image-host links still use Weibo's native viewer; comment images render inline and open in the detail card when selected.
- Detail images receive their own scroll behavior only when actual overflow exceeds roughly `12%` of the viewport. Near-fitting images scale down to avoid a pointless short scroll.

### Features

- Shows a floating reader button at the lower-left corner of `https://weibo.com/` and `/mygroups` feed pages.
- Hides the native right sidebar by default, widens the feed, and preserves the left group navigation on desktop screens.
- Provides a compact switch to enable the reader and a draggable `Sparse / Balanced / Dense` density slider for `3 / 4 / 5` columns. The drawer closes automatically when clicking elsewhere.
- Requests the current logged-in user's feed for the active group and renders a local responsive masonry wall without relying on Weibo's vertical virtual list.
- Builds compact direction-aware collages for multi-image posts, previews original video streams and metadata-rich external webpages or videos, displays quoted-post author, text, and media, and supports expanding long posts in cards or loading them automatically in detail cards.
- Requests additional pages using the returned `max_id` near the end of the wall, and remounts cleanly after group changes or returning from a detail view.
- Opens an anchored detail card near the source post: the background dims slightly, the left side shows full text and media, and the right side shows comments and nested replies. Text-only details place comments directly after the text. Near-fitting single images display in full, while overflowing portrait images scroll vertically and landscape images scroll horizontally with the wheel; multi-image posts expose a thumbnail rail.

### Local Installation

1. Open `chrome://extensions`; use `edge://extensions` for Edge.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `weibo_grid` directory.
4. Open or refresh `https://weibo.com/mygroups?gid=...`; the orange reader button appears at the lower-left corner.

The reader is enabled with three columns by default. Layout and column preferences are stored only in browser extension storage.

### Verification Checklist

1. Toggle the new-layout switch and drag the `Sparse / Balanced / Dense` slider; confirm switching between the card wall and native feed works.
2. Scroll down at least three screen heights; confirm that more cards load without row-height gaps.
3. Open image, repost, video, and external-preview cards; ordinary links should not accidentally open the detail card, while Weibo image links should open the native viewer and comment images render inline and can preview in-card.
4. With a detail card open, scroll over the post body, images, and comments separately; only the pointed detail region should scroll, never the background feed. Check that a text-only detail does not have a fixed blank area and that nested replies appear only once.
5. Check single-image, multi-image, combined video-plus-image, and external-video posts for correct media display and browsing; near-fitting images should not gain a separate scroll range, while clearly oversized images should remain scrollable.

### Privacy and Limitations

The extension requests only `storage` permission and access to Weibo pages. To load comments and long-post bodies, it reads the non-HttpOnly `XSRF-TOKEN` only inside the Weibo page and sends it only to same-origin Weibo endpoints. It neither stores that value nor uploads cookies or feed content to any external service. Comment images are loaded by the browser from Weibo's image hosts; the requests carry the current Weibo-page Referer to reduce hotlink failures. See the [technical summary](TECHNICAL_SUMMARY.md#11-安全隐私与权限) for the trade-off.

Weibo changes its APIs and response fields frequently. If a feed request fails, the extension automatically restores the native feed; disabling the new layout also restores it immediately.
