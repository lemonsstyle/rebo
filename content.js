(() => {
  "use strict";

  const CHANNEL = "weibo-grid-reader";
  const ROOT_ID = "weibo-grid-reader-root";
  const SURFACE_ID = "weibo-grid-reader-surface";
  const DETAIL_ID = "weibo-grid-reader-detail";
  const SETTINGS_KEY = "weiboGridReaderSettings";
  const DEFAULT_SETTINGS = Object.freeze({
    readerEnabled: true,
    columnCount: 3
  });

  let settings = { ...DEFAULT_SETTINGS };
  let drawerOpen = false;
  let bridgeReady = false;
  let currentFeedShell = null;
  let currentNavigationPanel = null;
  let currentPageLayout = null;
  let currentUtilityPanel = null;
  let mountedScroller = null;
  let readerRouteKey = "";
  let readerActive = false;
  let readerLoading = false;
  let readerExhausted = false;
  let readerMaxId = "";
  let readerGeneration = 0;
  let readerFailedRouteKey = "";
  let refreshTimer = null;
  let masonryTimer = null;
  let readerResizeObserver = null;
  let observedReaderWidth = 0;
  let activeDetailStatusId = "";
  let activeDetailAnchor = null;
  let detailHistoryPushed = false;
  let lastUrl = window.location.href;
  const readerSeenIds = new Set();
  const pendingBridgeRequests = new Map();
  let sentinelObserver = null;

  function hasValidExtensionContext() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function isFeedRoute() {
    return window.location.pathname === "/" || window.location.pathname === "/mygroups";
  }

  function getReaderRouteKey() {
    const url = new URL(window.location.href);
    return `${url.pathname}?gid=${url.searchParams.get("gid") || ""}`;
  }

  function getExtensionRoot() {
    return document.getElementById(ROOT_ID);
  }

  function getReaderSurface() {
    return document.getElementById(SURFACE_ID);
  }

  function getDetailOverlay() {
    return document.getElementById(DETAIL_ID);
  }

  function getControls() {
    const root = getExtensionRoot();
    if (!root) {
      return {};
    }

    return {
      root,
      button: root.querySelector("[data-reader-button]"),
      panel: root.querySelector("[data-reader-panel]"),
      readerToggle: root.querySelector("[data-reader-toggle]"),
      columnChoices: [...root.querySelectorAll("[data-column-choice]")]
    };
  }

  function updateControlState() {
    const { root, button, panel, readerToggle, columnChoices } = getControls();
    const available = isFeedRoute();

    if (!root) {
      return;
    }

    root.hidden = !available;
    root.classList.toggle("weibo-grid-reader--open", drawerOpen);
    button?.setAttribute("aria-expanded", String(drawerOpen));
    panel?.setAttribute("aria-hidden", String(!drawerOpen));

    if (readerToggle) {
      readerToggle.checked = settings.readerEnabled;
    }

    for (const choice of columnChoices || []) {
      const isSelected = Number(choice.dataset.columnChoice) === settings.columnCount;
      choice.classList.toggle("weibo-grid-reader__column-choice--active", isSelected);
      choice.setAttribute("aria-pressed", String(isSelected));
      choice.disabled = !settings.readerEnabled;
    }
  }

  function findScroller() {
    return document.querySelector(".vue-recycle-scroller");
  }

  function findFeedShell() {
    const scroller = findScroller();
    let shell = scroller;

    for (let depth = 0; shell?.parentElement && depth < 3; depth += 1) {
      shell = shell.parentElement;
    }

    return shell || null;
  }

  function findNavigationPanel() {
    return [...document.querySelectorAll(".woo-panel-left")].find((panel) => {
      return panel.tagName !== "ARTICLE" && panel.querySelector('a[href="/"], a[href^="/mygroups"]');
    }) || null;
  }

  function findPageLayout(feedShell, navigationPanel) {
    let layout = feedShell;

    while (layout && layout !== document.body) {
      if (navigationPanel && layout.contains(navigationPanel)) {
        return layout;
      }
      layout = layout.parentElement;
    }

    return null;
  }

  function updatePageAnchors() {
    const nextFeedShell = findFeedShell();
    const nextNavigationPanel = findNavigationPanel();
    const nextPageLayout = findPageLayout(nextFeedShell, nextNavigationPanel);

    if (currentFeedShell && currentFeedShell !== nextFeedShell) {
      currentFeedShell.classList.remove("weibo-grid-reader-feed-shell");
    }

    if (currentNavigationPanel && currentNavigationPanel !== nextNavigationPanel) {
      currentNavigationPanel.classList.remove("weibo-grid-reader-navigation-panel");
    }

    if (currentPageLayout && currentPageLayout !== nextPageLayout) {
      currentPageLayout.classList.remove("weibo-grid-reader-page-layout");
    }

    currentFeedShell = nextFeedShell;
    currentNavigationPanel = nextNavigationPanel;
    currentPageLayout = nextPageLayout;
    currentFeedShell?.classList.add("weibo-grid-reader-feed-shell");
    currentNavigationPanel?.classList.add("weibo-grid-reader-navigation-panel");
    currentPageLayout?.classList.add("weibo-grid-reader-page-layout");
  }

  function hideUtilityFooter() {
    if (currentUtilityPanel?.isConnected) {
      return;
    }

    const labels = ["帮助中心", "举报中心", "关于微博"];
    const matchingScale = [...document.querySelectorAll("div.scale")].find((element) => {
      const text = element.innerText;
      return labels.every((label) => text.includes(label))
        && (text.includes("合作&服务") || text.includes("合作 & 服务"));
    });
    if (matchingScale) {
      currentUtilityPanel = matchingScale;
      currentUtilityPanel.classList.add("weibo-grid-reader-utility-hidden");
      return;
    }

    const candidates = [...document.querySelectorAll("div, footer, section")]
      .filter((element) => {
        const text = element.innerText;
        return labels.every((label) => text.includes(label))
          && (text.includes("合作&服务") || text.includes("合作 & 服务"));
      })
      .sort((first, second) => first.innerText.length - second.innerText.length);

    currentUtilityPanel = candidates[0] || null;
    currentUtilityPanel?.classList.add("weibo-grid-reader-utility-hidden");
  }

  function updatePageClasses() {
    const root = document.documentElement;
    const enabled = isFeedRoute() && settings.readerEnabled;

    root.classList.toggle("weibo-grid-reader-enabled", enabled);
    root.classList.toggle("weibo-grid-reader-active", enabled && readerActive);
  }

  function bridgeRequest(type, payload = {}) {
    return new Promise((resolve) => {
      if (!hasValidExtensionContext()) {
        resolve({ ok: false, reason: "扩展已重新加载。" });
        return;
      }

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timeout = window.setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        resolve({ ok: false, reason: "未收到微博页面的响应。" });
      }, 8000);

      pendingBridgeRequests.set(requestId, (response) => {
        window.clearTimeout(timeout);
        resolve(response);
      });

      window.postMessage(
        { channel: CHANNEL, sender: "content", requestId, type, ...payload },
        window.location.origin
      );
    });
  }

  function createReaderSurface() {
    let surface = getReaderSurface();
    if (surface) {
      return surface;
    }

    surface = document.createElement("section");
    surface.id = SURFACE_ID;
    surface.hidden = true;
    surface.innerHTML = `
      <div class="weibo-grid-reader__grid" data-reader-grid></div>
      <div class="weibo-grid-reader__sentinel" data-reader-sentinel aria-hidden="true"></div>
    `;
    return surface;
  }

  function getReaderGrid() {
    return getReaderSurface()?.querySelector("[data-reader-grid]") || null;
  }

  function getMasonryColumnCount() {
    if (window.innerWidth <= 760) {
      return 2;
    }

    return settings.columnCount;
  }

  function layoutMasonry() {
    const grid = getReaderGrid();
    if (!grid || getReaderSurface()?.hidden) {
      return;
    }

    const cards = [...grid.querySelectorAll(".weibo-grid-reader__card")];
    if (!cards.length || !grid.clientWidth) {
      grid.style.height = "";
      return;
    }

    const columns = getMasonryColumnCount();
    const gap = 16;
    const cardWidth = (grid.clientWidth - gap * (columns - 1)) / columns;
    const columnHeights = Array(columns).fill(0);

    for (const card of cards) {
      card.style.width = `${cardWidth}px`;
      card.style.position = "absolute";
    }

    for (const card of cards) {
      const shortestColumn = columnHeights.reduce((shortestIndex, height, index) => {
        return height < columnHeights[shortestIndex] ? index : shortestIndex;
      }, 0);
      const cardHeight = card.offsetHeight;

      card.style.left = `${shortestColumn * (cardWidth + gap)}px`;
      card.style.top = `${columnHeights[shortestColumn]}px`;
      columnHeights[shortestColumn] += cardHeight + gap;
    }

    grid.style.height = `${Math.max(...columnHeights) - gap}px`;
  }

  function scheduleMasonryLayout() {
    window.clearTimeout(masonryTimer);
    masonryTimer = window.setTimeout(layoutMasonry, 0);
  }

  function mountReaderSurface() {
    const scroller = findScroller();
    if (!scroller?.parentElement) {
      return false;
    }

    const surface = createReaderSurface();
    if (surface.parentElement !== scroller.parentElement) {
      scroller.parentElement.insertBefore(surface, scroller);
    }

    surface.hidden = false;
    surface.dataset.columns = String(settings.columnCount);
    scroller.classList.add("weibo-grid-reader-source-hidden");
    mountedScroller = scroller;
    readerActive = true;
    return true;
  }

  function unmountReaderSurface() {
    closeDetail(false);
    mountedScroller?.classList.remove("weibo-grid-reader-source-hidden");
    findScroller()?.classList.remove("weibo-grid-reader-source-hidden");
    mountedScroller = null;
    readerActive = false;
    readerRouteKey = "";
    readerLoading = false;
    readerExhausted = false;
    readerMaxId = "";
    readerGeneration += 1;
    readerFailedRouteKey = "";
    readerSeenIds.clear();
    window.clearTimeout(masonryTimer);
    sentinelObserver?.disconnect();
    sentinelObserver = null;
    readerResizeObserver?.disconnect();
    readerResizeObserver = null;
    observedReaderWidth = 0;

    const surface = getReaderSurface();
    if (surface) {
      surface.hidden = true;
      getReaderGrid()?.replaceChildren();
    }
  }

  function getFeedQuery() {
    const url = new URL(window.location.href);
    const groupId = url.searchParams.get("gid");
    const query = {
      refresh: "4",
      count: "25"
    };

    if (readerMaxId) {
      query.max_id = readerMaxId;
    } else {
      query.since_id = "0";
    }

    if (groupId) {
      query.list_id = groupId;
      query.fid = groupId;
    }

    return query;
  }

  function formatCreatedAt(createdAt) {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
      return createdAt || "";
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (elapsedSeconds < 60) {
      return "刚刚";
    }
    if (elapsedSeconds < 3600) {
      return `${Math.floor(elapsedSeconds / 60)}分钟前`;
    }
    if (elapsedSeconds < 86400) {
      return `${Math.floor(elapsedSeconds / 3600)}小时前`;
    }

    const month = date.getMonth() + 1;
    const day = date.getDate();
    if (date.getFullYear() === new Date().getFullYear()) {
      return `${month}-${day}`;
    }
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function plainText(value) {
    if (!value) {
      return "";
    }

    const documentFragment = document.createElement("div");
    documentFragment.innerHTML = String(value);
    return documentFragment.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function getStatusId(status) {
    return String(status.idstr || status.id || status.mid || status.mblogid || "");
  }

  function getStatusUrl(status) {
    const userId = status.user?.idstr || status.user?.id;
    const postId = status.mblogid || status.idstr || status.id;

    if (userId && postId) {
      return `https://weibo.com/${encodeURIComponent(userId)}/${encodeURIComponent(postId)}`;
    }

    return "https://weibo.com/";
  }

  function getPictureUrls(status) {
    const pictureInfos = status.pic_infos;
    if (!pictureInfos || typeof pictureInfos !== "object") {
      return [];
    }

    const pictureIds = status.pic_ids?.length ? status.pic_ids : Object.keys(pictureInfos);
    return pictureIds
      .map((pictureId) => pictureInfos[pictureId])
      .filter((picture) => picture && typeof picture === "object")
      .map((picture) => picture.largest?.url
        || picture.large?.url
        || picture.original?.url
        || picture.mw2000?.url
        || picture.thumbnail?.url
        || "")
      .filter(Boolean);
  }

  function getVideoMedia(status) {
    const pageInfo = status.page_info || status.pageInfo;
    const mediaInfo = pageInfo?.media_info || pageInfo?.mediaInfo || {};
    const playbackSource = mediaInfo.playback_list?.find((item) => item.play_info?.url)?.play_info?.url;
    const source = mediaInfo.stream_url_hd
      || mediaInfo.stream_url
      || mediaInfo.mp4_hd_url
      || mediaInfo.mp4_sd_url
      || playbackSource
      || "";

    if (!source) {
      return null;
    }

    return {
      source,
      poster: pageInfo?.page_pic || mediaInfo.poster || "",
      pageUrl: pageInfo?.page_url || ""
    };
  }

  function formatCount(count) {
    const value = Number(count || 0);
    if (value >= 10000) {
      return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
    }
    return String(value);
  }

  function createMetric(label, count) {
    const metric = document.createElement("span");
    metric.textContent = `${label} ${formatCount(count)}`;
    return metric;
  }

  function hasRichStatusText(status) {
    return /<(?:a|img)\b/i.test(status.text || "");
  }

  function getSafeLinkHref(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function appendRichStatusText(container, status) {
    const template = document.createElement("template");
    const source = status.text || status.text_raw || "";
    const hideVideoLink = Boolean(getVideoMedia(status));
    template.innerHTML = source;

    const appendNodes = (nodes, target) => {
      for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = hideVideoLink ? node.textContent.replace(/https?:\/\/\S+/g, "") : node.textContent;
          target.append(text);
          continue;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        if (node.tagName === "BR") {
          target.append(document.createElement("br"));
          continue;
        }

        if (node.tagName === "IMG" && node.getAttribute("src")) {
          const emoji = document.createElement("img");
          emoji.className = "weibo-grid-reader__emoji";
          emoji.alt = node.getAttribute("alt") || "";
          emoji.src = node.getAttribute("src");
          emoji.addEventListener("error", () => {
            emoji.replaceWith(document.createTextNode(emoji.alt));
            scheduleMasonryLayout();
          }, { once: true });
          emoji.addEventListener("load", scheduleMasonryLayout, { once: true });
          target.append(emoji);
          continue;
        }

        if (node.tagName === "A") {
          const href = getSafeLinkHref(node.getAttribute("href") || "");
          if (href) {
            const link = document.createElement("a");
            link.className = "weibo-grid-reader__rich-link";
            link.href = href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.addEventListener("click", (event) => event.stopPropagation());
            target.append(link);
            appendNodes(node.childNodes, link);
            continue;
          }
        }

        appendNodes(node.childNodes, target);
      }
    };

    appendNodes(template.content.childNodes, container);
  }

  function appendRichCommentText(container, comment) {
    appendRichStatusText(container, {
      text: comment.text || comment.text_raw || "",
      page_info: null
    });
  }

  function createTextBlock(className, status) {
    const text = document.createElement("p");
    text.className = className;
    const displayText = getDisplayText(status);
    if (hasRichStatusText(status)) {
      appendRichStatusText(text, status);
    } else {
      text.textContent = displayText || "转发微博";
    }
    return text;
  }

  function getDisplayText(status) {
    const text = status.text_raw || plainText(status.text);
    if (!getVideoMedia(status)) {
      return text;
    }

    return text.replace(/https?:\/\/\S+/g, "").trim() || "视频微博";
  }

  function createPictureMedia(status) {
    const pictureUrls = getPictureUrls(status);
    if (!pictureUrls.length) {
      return null;
    }

    const imageWrap = document.createElement("div");
    const visiblePictureUrls = pictureUrls.slice(0, 4);
    const hiddenPictureCount = pictureUrls.length - visiblePictureUrls.length;
    const isMultiImage = visiblePictureUrls.length > 1;
    imageWrap.className = isMultiImage
      ? "weibo-grid-reader__image-wrap weibo-grid-reader__image-wrap--multi"
      : "weibo-grid-reader__image-wrap weibo-grid-reader__image-wrap--single";
    imageWrap.dataset.count = String(visiblePictureUrls.length);

    for (const [index, pictureUrl] of visiblePictureUrls.entries()) {
      const imageCell = isMultiImage ? document.createElement("div") : imageWrap;
      if (isMultiImage) {
        imageCell.className = "weibo-grid-reader__image-cell";
      }

      const image = document.createElement("img");
      image.className = "weibo-grid-reader__image";
      image.alt = "";
      image.loading = "lazy";
      image.src = pictureUrl;
      image.addEventListener("load", () => {
        if (!isMultiImage && image.naturalWidth && image.naturalHeight) {
          const naturalRatio = image.naturalWidth / image.naturalHeight;
          const constrainedRatio = Math.max(0.8, Math.min(1.78, naturalRatio));
          imageWrap.style.aspectRatio = String(constrainedRatio);
        }
        if (isMultiImage) {
          image.dataset.orientation = image.naturalWidth < image.naturalHeight ? "portrait" : "landscape";
          updateMultiImageLayout(imageWrap);
        }
        scheduleMasonryLayout();
      }, { once: true });
      image.addEventListener("error", () => {
        if (isMultiImage) {
          imageCell.remove();
          imageWrap.dataset.count = String(imageWrap.querySelectorAll(".weibo-grid-reader__image-cell").length);
          updateMultiImageLayout(imageWrap);
        } else {
          imageWrap.remove();
        }
        scheduleMasonryLayout();
      }, { once: true });

      imageCell.append(image);
      if (isMultiImage && hiddenPictureCount > 0 && index === visiblePictureUrls.length - 1) {
        const more = document.createElement("span");
        more.className = "weibo-grid-reader__image-more";
        more.textContent = `+${hiddenPictureCount}`;
        imageCell.append(more);
      }

      if (isMultiImage) {
        imageWrap.append(imageCell);
      }
    }

    if (isMultiImage) {
      updateMultiImageLayout(imageWrap);
    }
    return imageWrap;
  }

  function updateMultiImageLayout(imageWrap) {
    const layoutClasses = [
      "weibo-grid-reader__image-wrap--two-portrait",
      "weibo-grid-reader__image-wrap--two-landscape",
      "weibo-grid-reader__image-wrap--two-mixed",
      "weibo-grid-reader__image-wrap--three-first-portrait",
      "weibo-grid-reader__image-wrap--three-first-landscape",
      "weibo-grid-reader__image-wrap--four"
    ];
    imageWrap.classList.remove(...layoutClasses);

    const images = [...imageWrap.querySelectorAll(".weibo-grid-reader__image")];
    const count = images.length;
    if (count === 2) {
      const orientations = images.map((image) => image.dataset.orientation);
      if (orientations.every((orientation) => orientation === "portrait")) {
        imageWrap.classList.add("weibo-grid-reader__image-wrap--two-portrait");
      } else if (orientations.every((orientation) => orientation === "landscape")) {
        imageWrap.classList.add("weibo-grid-reader__image-wrap--two-landscape");
      } else {
        imageWrap.classList.add("weibo-grid-reader__image-wrap--two-mixed");
      }
      return;
    }

    if (count === 3) {
      const firstOrientation = images[0]?.dataset.orientation;
      imageWrap.classList.add(
        firstOrientation === "portrait"
          ? "weibo-grid-reader__image-wrap--three-first-portrait"
          : "weibo-grid-reader__image-wrap--three-first-landscape"
      );
      return;
    }

    if (count >= 4) {
      imageWrap.classList.add("weibo-grid-reader__image-wrap--four");
    }
  }

  function createVideoMedia(status) {
    const videoMedia = getVideoMedia(status);
    if (!videoMedia) {
      return null;
    }

    const videoWrap = document.createElement("div");
    videoWrap.className = "weibo-grid-reader__video-wrap";

    const video = document.createElement("video");
    video.className = "weibo-grid-reader__video";
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.src = videoMedia.source;
    if (videoMedia.poster) {
      video.poster = videoMedia.poster;
    }

    video.addEventListener("loadedmetadata", scheduleMasonryLayout, { once: true });
    video.addEventListener("error", () => {
      if (!videoMedia.pageUrl) {
        videoWrap.remove();
        scheduleMasonryLayout();
        return;
      }

      const fallback = document.createElement("span");
      fallback.className = "weibo-grid-reader__video-fallback";
      fallback.textContent = "视频无法预览，点击卡片打开微博观看";
      video.replaceWith(fallback);
      scheduleMasonryLayout();
    }, { once: true });

    videoWrap.append(video);
    return videoWrap;
  }

  function createStatusMedia(status) {
    const video = createVideoMedia(status);
    const pictures = createPictureMedia(status);
    if (!video || !pictures) {
      return video || pictures;
    }

    const media = document.createElement("div");
    media.className = "weibo-grid-reader__status-media-stack";
    media.append(video, pictures);
    return media;
  }

  function createStatusCard(status) {
    const card = document.createElement("article");
    card.className = "weibo-grid-reader__card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `打开 ${status.user?.screen_name || "微博用户"} 的微博`);
    card.addEventListener("click", (event) => {
      if (
        event.defaultPrevented
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
        || event.target.closest("a, button, input, video, .weibo-grid-reader__video-wrap")
      ) {
        return;
      }

      openDetail(status, card);
    });
    card.addEventListener("keydown", (event) => {
      if (
        (event.key !== "Enter" && event.key !== " ")
        || event.target.closest("a, button, input, video, .weibo-grid-reader__video-wrap")
      ) {
        return;
      }

      event.preventDefault();
      openDetail(status, card);
    });

    const header = document.createElement("div");
    header.className = "weibo-grid-reader__card-header";

    const avatar = document.createElement("img");
    avatar.className = "weibo-grid-reader__avatar";
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.src = status.user?.avatar_hd || status.user?.avatar_large || status.user?.profile_image_url || "";
    avatar.addEventListener("error", () => avatar.remove(), { once: true });

    const identity = document.createElement("div");
    identity.className = "weibo-grid-reader__identity";

    const name = document.createElement("strong");
    name.textContent = status.user?.screen_name || "微博用户";

    const metadata = document.createElement("span");
    metadata.textContent = formatCreatedAt(status.created_at);

    identity.append(name, metadata);
    header.append(avatar, identity);

    const repostedStatus = status.retweeted_status;
    card.append(header, createTextBlock("weibo-grid-reader__text", status));

    if (repostedStatus) {
      const repost = document.createElement("section");
      repost.className = "weibo-grid-reader__repost";

      const repostAuthor = document.createElement("strong");
      repostAuthor.className = "weibo-grid-reader__repost-author";
      repostAuthor.textContent = `@${repostedStatus.user?.screen_name || "原微博作者"}`;

      repost.append(
        repostAuthor,
        createTextBlock("weibo-grid-reader__repost-text", repostedStatus)
      );

      const repostMedia = createStatusMedia(repostedStatus);
      if (repostMedia) {
        repost.append(repostMedia);
      }

      card.append(repost);
    } else {
      const media = createStatusMedia(status);
      if (media) {
        card.append(media);
      }
    }

    const footer = document.createElement("div");
    footer.className = "weibo-grid-reader__metrics";
    footer.append(
      createMetric("转发", status.reposts_count),
      createMetric("评论", status.comments_count),
      createMetric("赞", status.attitudes_count)
    );
    card.append(footer);

    return card;
  }

  function createDetailText(status, className = "weibo-grid-reader__detail-text") {
    const text = document.createElement("div");
    text.className = className;
    if (hasRichStatusText(status)) {
      appendRichStatusText(text, status);
    } else {
      text.textContent = getDisplayText(status) || "转发微博";
    }
    return text;
  }

  function createDetailImageViewer(initialUrl, alt = "微博图片") {
    const viewer = document.createElement("div");
    viewer.className = "weibo-grid-reader__detail-image-viewer";
    viewer.tabIndex = 0;
    viewer.setAttribute("aria-label", "图片浏览区域");

    const image = document.createElement("img");
    image.className = "weibo-grid-reader__detail-full-image";
    image.alt = alt;
    image.addEventListener("load", () => {
      const isPortrait = image.naturalHeight > image.naturalWidth;
      viewer.classList.toggle("weibo-grid-reader__detail-image-viewer--portrait", isPortrait);
      viewer.classList.toggle("weibo-grid-reader__detail-image-viewer--landscape", !isPortrait);
      viewer.scrollLeft = 0;
      viewer.scrollTop = 0;
      repositionActiveDetail();
    });
    image.addEventListener("error", () => {
      image.alt = "图片加载失败";
      image.removeAttribute("src");
    }, { once: true });
    viewer.addEventListener("wheel", (event) => {
      if (!viewer.classList.contains("weibo-grid-reader__detail-image-viewer--landscape")) {
        return;
      }

      const distance = event.deltaX || event.deltaY;
      if (!distance) {
        return;
      }

      event.preventDefault();
      viewer.scrollLeft += distance;
    }, { passive: false });
    viewer.append(image);

    const setImage = (url, nextAlt = alt) => {
      viewer.classList.remove(
        "weibo-grid-reader__detail-image-viewer--portrait",
        "weibo-grid-reader__detail-image-viewer--landscape"
      );
      viewer.scrollLeft = 0;
      viewer.scrollTop = 0;
      image.alt = nextAlt;
      image.src = url;
    };

    setImage(initialUrl, alt);
    return { element: viewer, setImage };
  }

  function createDetailGallery(pictureUrls) {
    const viewer = createDetailImageViewer(pictureUrls[0], "微博图片 1");
    const rail = document.createElement("nav");
    rail.className = "weibo-grid-reader__detail-thumbnail-rail";
    rail.setAttribute("aria-label", "微博图片缩略图");
    const buttons = [];

    const selectImage = (index) => {
      viewer.setImage(pictureUrls[index], `微博图片 ${index + 1}`);
      buttons.forEach((button, buttonIndex) => {
        button.classList.toggle("weibo-grid-reader__detail-thumbnail--active", buttonIndex === index);
        button.setAttribute("aria-pressed", String(buttonIndex === index));
      });
    };

    for (const [index, pictureUrl] of pictureUrls.entries()) {
      const thumbnail = document.createElement("button");
      thumbnail.type = "button";
      thumbnail.className = "weibo-grid-reader__detail-thumbnail";
      thumbnail.setAttribute("aria-label", `查看第 ${index + 1} 张图片`);
      thumbnail.addEventListener("click", () => selectImage(index));

      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.src = pictureUrl;
      image.addEventListener("error", () => thumbnail.remove(), { once: true });
      thumbnail.append(image);
      rail.append(thumbnail);
      buttons.push(thumbnail);
    }

    selectImage(0);
    return { media: viewer.element, rail, isImage: true };
  }

  function createDetailPictures(pictureUrls) {
    if (pictureUrls.length === 1) {
      return {
        media: createDetailImageViewer(pictureUrls[0]).element,
        rail: null,
        isImage: true
      };
    }

    if (pictureUrls.length > 1) {
      return createDetailGallery(pictureUrls);
    }

    return { media: null, rail: null, isImage: false };
  }

  function createDetailMedia(status) {
    const video = createVideoMedia(status);
    const pictures = createDetailPictures(getPictureUrls(status));
    if (!video || !pictures.media) {
      return video
        ? { media: video, rail: null, isImage: false }
        : pictures;
    }

    const media = document.createElement("div");
    media.className = "weibo-grid-reader__detail-media-stack";
    media.append(video, pictures.media);
    return { media, rail: pictures.rail, isImage: false };
  }

  function createDetailPost(status, isRepost = false, media = undefined) {
    const post = document.createElement("article");
    post.className = isRepost
      ? "weibo-grid-reader__detail-repost"
      : "weibo-grid-reader__detail-post";

    if (isRepost) {
      const repostAuthor = document.createElement("strong");
      repostAuthor.className = "weibo-grid-reader__detail-repost-author";
      repostAuthor.textContent = `@${status.user?.screen_name || "原微博作者"}`;
      post.append(repostAuthor);
    }

    post.append(createDetailText(status));
    const postMedia = media === undefined ? createStatusMedia(status) : media;
    if (postMedia) {
      post.append(postMedia);
    }

    return post;
  }

  function createCommentItem(comment) {
    const item = document.createElement("article");
    item.className = "weibo-grid-reader__comment";

    const avatar = document.createElement("img");
    avatar.className = "weibo-grid-reader__comment-avatar";
    avatar.alt = "";
    avatar.src = comment.user?.avatar_hd || comment.user?.profile_image_url || "";
    avatar.addEventListener("error", () => avatar.remove(), { once: true });

    const content = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = comment.user?.screen_name || "微博用户";
    const text = document.createElement("p");
    if (hasRichStatusText(comment)) {
      appendRichCommentText(text, comment);
    } else {
      text.textContent = comment.text_raw || plainText(comment.text) || "";
    }
    content.append(name, text);

    item.append(avatar, content);
    return item;
  }

  async function loadDetailComments(status, comments) {
    const statusId = getStatusId(status);
    const result = await bridgeRequest("fetch-comments", { statusId });
    if (!hasValidExtensionContext() || activeDetailStatusId !== statusId) {
      return;
    }

    comments.replaceChildren();
    if (!result.ok || !result.payload.comments.length) {
      const empty = document.createElement("p");
      empty.className = "weibo-grid-reader__comment-empty";
      empty.textContent = result.ok
        ? "暂时没有可展示的评论"
        : `评论加载失败：${result.reason || "请在微博原页查看"}`;
      comments.append(empty);
      repositionActiveDetail();
      return;
    }

    comments.append(...result.payload.comments.map(createCommentItem));
    repositionActiveDetail();
  }

  function closeDetail(restoreHistory = true) {
    const overlay = getDetailOverlay();
    if (!overlay) {
      return;
    }

    overlay.remove();
    document.documentElement.classList.remove("weibo-grid-reader-detail-open");
    activeDetailStatusId = "";
    activeDetailAnchor = null;

    const shouldGoBack = restoreHistory && detailHistoryPushed;
    detailHistoryPushed = false;
    if (shouldGoBack) {
      history.back();
    }
  }

  function positionDetailDialog(dialog) {
    const margin = 14;
    const anchorRect = activeDetailAnchor?.getBoundingClientRect();
    const anchorCenter = anchorRect ? anchorRect.left + anchorRect.width / 2 : window.innerWidth / 2;
    let preferredLeft = anchorCenter - dialog.offsetWidth / 2;
    if (anchorRect && anchorCenter < window.innerWidth / 3) {
      preferredLeft = anchorRect.left;
    } else if (anchorRect && anchorCenter > (window.innerWidth * 2) / 3) {
      preferredLeft = anchorRect.right - dialog.offsetWidth;
    }
    const preferredTop = anchorRect
      ? anchorRect.top + anchorRect.height / 2 - dialog.offsetHeight / 2
      : (window.innerHeight - dialog.offsetHeight) / 2;
    const left = Math.min(Math.max(margin, preferredLeft), window.innerWidth - dialog.offsetWidth - margin);
    const top = Math.min(Math.max(margin, preferredTop), window.innerHeight - dialog.offsetHeight - margin);

    dialog.style.left = `${Math.max(margin, left)}px`;
    dialog.style.top = `${Math.max(margin, top)}px`;
  }

  function repositionActiveDetail() {
    const dialog = getDetailOverlay()?.querySelector(".weibo-grid-reader__detail-dialog");
    if (dialog) {
      positionDetailDialog(dialog);
    }
  }

  function handleDetailWheel(event, dialog) {
    if (event.defaultPrevented) {
      return;
    }

    const origin = event.target instanceof Element ? event.target : null;
    const scrollTarget = origin?.closest(
      ".weibo-grid-reader__detail-image-viewer, .weibo-grid-reader__detail-text, .weibo-grid-reader__detail-side-content, .weibo-grid-reader__detail-main, .weibo-grid-reader__detail-thumbnail-rail"
    );
    event.preventDefault();

    if (!scrollTarget || !dialog.contains(scrollTarget)) {
      return;
    }

    if (scrollTarget.classList.contains("weibo-grid-reader__detail-thumbnail-rail")) {
      const scrollsVertically = scrollTarget.scrollHeight > scrollTarget.clientHeight;
      if (scrollsVertically) {
        scrollTarget.scrollTop += event.deltaY;
      } else {
        scrollTarget.scrollLeft += event.deltaX || event.deltaY;
      }
      return;
    }

    scrollTarget.scrollTop += event.deltaY;
    scrollTarget.scrollLeft += event.deltaX;
  }

  function openDetail(status, anchor = null) {
    const statusId = getStatusId(status);
    if (!statusId) {
      window.location.assign(getStatusUrl(status));
      return;
    }

    closeDetail(false);
    activeDetailStatusId = statusId;
    activeDetailAnchor = anchor;
    const scrollPosition = { left: window.scrollX, top: window.scrollY };

    const overlay = document.createElement("section");
    overlay.id = DETAIL_ID;
    overlay.className = "weibo-grid-reader__detail-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "微博详情");

    const dialog = document.createElement("div");
    dialog.className = "weibo-grid-reader__detail-dialog";
    const detailMedia = createDetailMedia(status);
    const main = document.createElement("main");
    main.className = "weibo-grid-reader__detail-main";
    if (detailMedia.isImage && !status.retweeted_status) {
      main.classList.add("weibo-grid-reader__detail-main--image-focus");
      dialog.classList.add("weibo-grid-reader__detail-dialog--image-focus");
    }
    main.append(createDetailPost(status, false, detailMedia.media));

    if (status.retweeted_status) {
      main.append(createDetailPost(status.retweeted_status, true));
    }

    const commentsSection = document.createElement("section");
    commentsSection.className = "weibo-grid-reader__comments";
    const heading = document.createElement("h2");
    heading.textContent = `评论 ${formatCount(status.comments_count)}`;
    const comments = document.createElement("div");
    comments.className = "weibo-grid-reader__comment-list";
    const loading = document.createElement("p");
    loading.className = "weibo-grid-reader__comment-empty";
    loading.textContent = "正在加载评论…";
    comments.append(loading);
    commentsSection.append(heading, comments);
    const side = document.createElement("aside");
    side.className = "weibo-grid-reader__detail-side";
    const sideContent = document.createElement("div");
    sideContent.className = "weibo-grid-reader__detail-side-content";
    sideContent.append(commentsSection);

    const original = document.createElement("a");
    original.className = "weibo-grid-reader__detail-original";
    original.href = getStatusUrl(status);
    original.textContent = "在微博中打开";
    const sourceAvatar = document.createElement("img");
    sourceAvatar.className = "weibo-grid-reader__detail-source-avatar";
    sourceAvatar.alt = "";
    sourceAvatar.src = status.user?.avatar_hd || status.user?.avatar_large || status.user?.profile_image_url || "";
    sourceAvatar.addEventListener("error", () => sourceAvatar.remove(), { once: true });
    const sourceActions = document.createElement("div");
    sourceActions.className = "weibo-grid-reader__detail-source-actions";
    sourceActions.append(sourceAvatar, original);
    side.append(sideContent, sourceActions);

    if (detailMedia.rail) {
      dialog.classList.add("weibo-grid-reader__detail-dialog--gallery");
      dialog.append(main, detailMedia.rail, side);
    } else {
      dialog.append(main, side);
    }
    overlay.append(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeDetail(true);
      }
    });
    overlay.addEventListener("wheel", (event) => {
      handleDetailWheel(event, dialog);
    }, { passive: false });
    document.documentElement.append(overlay);
    document.documentElement.classList.add("weibo-grid-reader-detail-open");
    window.requestAnimationFrame(() => {
      window.scrollTo(scrollPosition.left, scrollPosition.top);
      positionDetailDialog(dialog);
    });

    try {
      history.pushState({ weiboGridReaderDetail: statusId }, "", window.location.href);
      detailHistoryPushed = true;
    } catch {
      detailHistoryPushed = false;
    }

    void loadDetailComments(status, comments);
  }

  function renderStatuses(statuses) {
    const grid = getReaderGrid();
    if (!grid) {
      return 0;
    }

    const cards = [];
    for (const status of statuses) {
      const statusId = getStatusId(status);
      if (!statusId || readerSeenIds.has(statusId)) {
        continue;
      }

      readerSeenIds.add(statusId);
      cards.push(createStatusCard(status));
    }

    grid.append(...cards);
    scheduleMasonryLayout();
    window.setTimeout(loadMoreWhenNearEnd, 50);
    return cards.length;
  }

  async function loadTimeline() {
    if (!hasValidExtensionContext() || readerLoading || readerExhausted || !settings.readerEnabled || !isFeedRoute()) {
      return;
    }

    if (!bridgeReady) {
      return;
    }

    readerLoading = true;
    const generation = readerGeneration;
    const result = await bridgeRequest("fetch-timeline", { query: getFeedQuery() });
    readerLoading = false;

    if (!hasValidExtensionContext() || generation !== readerGeneration || !settings.readerEnabled || !isFeedRoute()) {
      return;
    }

    if (!result.ok) {
      if (readerSeenIds.size === 0) {
        readerFailedRouteKey = readerRouteKey;
        const surface = getReaderSurface();
        if (surface) {
          surface.hidden = true;
        }
        mountedScroller?.classList.remove("weibo-grid-reader-source-hidden");
        findScroller()?.classList.remove("weibo-grid-reader-source-hidden");
        readerActive = false;
        updatePageClasses();
        return;
      }
      return;
    }

    const added = renderStatuses(result.payload.statuses);
    const nextMaxId = String(result.payload.maxId || "");
    readerMaxId = nextMaxId;
    readerExhausted = !nextMaxId || nextMaxId === "0" || result.payload.statuses.length === 0;

    if (!added && !readerExhausted) {
      readerExhausted = true;
    }
  }

  function resetReader() {
    readerGeneration += 1;
    readerLoading = false;
    readerExhausted = false;
    readerMaxId = "";
    readerFailedRouteKey = "";
    readerSeenIds.clear();
    getReaderGrid()?.replaceChildren();
    getReaderGrid()?.style.removeProperty("height");
    void loadTimeline();
  }

  function observeReaderSentinel() {
    const sentinel = getReaderSurface()?.querySelector("[data-reader-sentinel]");
    if (!sentinel || sentinelObserver) {
      return;
    }

    sentinelObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadTimeline();
      }
    }, { rootMargin: "900px 0px" });
    sentinelObserver.observe(sentinel);
  }

  function observeReaderWidth() {
    const grid = getReaderGrid();
    if (!grid || readerResizeObserver) {
      return;
    }

    readerResizeObserver = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width || 0);
      if (width && width !== observedReaderWidth) {
        observedReaderWidth = width;
        scheduleMasonryLayout();
      }
    });
    readerResizeObserver.observe(grid);
  }

  function loadMoreWhenNearEnd() {
    const surface = getReaderSurface();
    if (!surface || surface.hidden || !readerActive) {
      return;
    }

    if (surface.getBoundingClientRect().bottom <= window.innerHeight + 900) {
      void loadTimeline();
    }
  }

  function synchronizeReader() {
    if (!isFeedRoute() || !settings.readerEnabled) {
      unmountReaderSurface();
      return;
    }

    const routeKey = getReaderRouteKey();
    if (readerFailedRouteKey === routeKey) {
      return;
    }

    if (!mountReaderSurface()) {
      return;
    }

    observeReaderSentinel();
    observeReaderWidth();
    if (readerRouteKey !== routeKey) {
      readerRouteKey = routeKey;
      resetReader();
    }
  }

  function saveSettings() {
    if (!hasValidExtensionContext()) {
      return;
    }

    try {
      chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    } catch {
      return;
    }
  }

  function setDrawerOpen(nextDrawerOpen) {
    drawerOpen = nextDrawerOpen;
    updatePageClasses();
    updateControlState();
  }

  function createControls() {
    if (getExtensionRoot()) {
      return;
    }

    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button class="weibo-grid-reader__button" type="button" data-reader-button aria-label="打开微博阅读器" aria-expanded="false">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 6h16"></path>
          <path d="M4 12h16"></path>
          <path d="M4 18h16"></path>
          <circle cx="8" cy="6" r="1.5" fill="currentColor"></circle>
          <circle cx="16" cy="12" r="1.5" fill="currentColor"></circle>
          <circle cx="11" cy="18" r="1.5" fill="currentColor"></circle>
        </svg>
      </button>
      <aside class="weibo-grid-reader__drawer" data-reader-panel aria-hidden="true" aria-label="微博阅读器设置">
        <header class="weibo-grid-reader__header">
          <div>
            <p class="weibo-grid-reader__eyebrow">WEIBO READER</p>
            <h2>阅读布局</h2>
          </div>
          <button class="weibo-grid-reader__close" type="button" data-reader-close aria-label="关闭抽屉">×</button>
        </header>
        <div class="weibo-grid-reader__settings">
          <label class="weibo-grid-reader__setting">
            <span>
              <strong>使用新布局</strong>
              <small>独立多列卡片墙</small>
            </span>
            <input type="checkbox" data-reader-toggle>
          </label>
          <div class="weibo-grid-reader__setting weibo-grid-reader__column-setting">
            <span>
              <strong>卡片列数</strong>
              <small>卡片更宽或显示更多内容</small>
            </span>
            <div class="weibo-grid-reader__column-choices" role="group" aria-label="选择卡片列数">
              <button type="button" data-column-choice="3">3</button>
              <button type="button" data-column-choice="4">4</button>
              <button type="button" data-column-choice="5">5</button>
            </div>
          </div>
        </div>
      </aside>
    `;

    document.documentElement.appendChild(root);

    root.querySelector("[data-reader-button]")?.addEventListener("click", () => {
      setDrawerOpen(!drawerOpen);
    });

    root.querySelector("[data-reader-close]")?.addEventListener("click", () => {
      setDrawerOpen(false);
    });

    root.querySelector("[data-reader-toggle]")?.addEventListener("change", (event) => {
      settings.readerEnabled = event.currentTarget.checked;
      if (!settings.readerEnabled) {
        setDrawerOpen(false);
      }
      saveSettings();
      refreshPage();
    });

    root.querySelectorAll("[data-column-choice]").forEach((choice) => {
      choice.addEventListener("click", () => {
        const nextColumnCount = Number(choice.dataset.columnChoice);
        if (![3, 4, 5].includes(nextColumnCount)) {
          return;
        }

        settings.columnCount = nextColumnCount;
        getReaderSurface()?.setAttribute("data-columns", String(nextColumnCount));
        saveSettings();
        updateControlState();
        scheduleMasonryLayout();
      });
    });
  }

  function injectBridge() {
    return new Promise((resolve) => {
      if (!hasValidExtensionContext()) {
        resolve();
        return;
      }

      const bridge = document.createElement("script");
      try {
        bridge.src = chrome.runtime.getURL("page-bridge.js");
      } catch {
        resolve();
        return;
      }
      bridge.async = false;
      bridge.addEventListener("load", () => {
        bridgeReady = true;
        bridge.remove();
        resolve();
      }, { once: true });
      bridge.addEventListener("error", () => {
        bridge.remove();
        resolve();
      }, { once: true });
      (document.head || document.documentElement).appendChild(bridge);
    });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      if (!hasValidExtensionContext()) {
        resolve();
        return;
      }

      try {
        chrome.storage.local.get(SETTINGS_KEY, (stored) => {
          const storedSettings = { ...DEFAULT_SETTINGS, ...stored[SETTINGS_KEY] };
          settings = {
            ...storedSettings,
            columnCount: [3, 4, 5].includes(Number(storedSettings.columnCount))
              ? Number(storedSettings.columnCount)
              : DEFAULT_SETTINGS.columnCount
          };
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  function listenForBridgeResponses() {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const response = event.data;
      if (response?.channel !== CHANNEL || response.sender !== "page" || !response.requestId) {
        return;
      }

      const resolver = pendingBridgeRequests.get(response.requestId);
      if (!resolver) {
        return;
      }

      pendingBridgeRequests.delete(response.requestId);
      resolver(response);
    });
  }

  function refreshPage() {
    if (!hasValidExtensionContext()) {
      return;
    }

    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (!hasValidExtensionContext()) {
        return;
      }

      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
      }

      updatePageAnchors();
      hideUtilityFooter();
      updateControlState();
      synchronizeReader();
      updatePageClasses();
      scheduleMasonryLayout();
      loadMoreWhenNearEnd();
    }, 100);
  }

  function observePage() {
    const observer = new MutationObserver(() => {
      refreshPage();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", () => {
      refreshPage();
      repositionActiveDetail();
    }, { passive: true });
    window.addEventListener("scroll", loadMoreWhenNearEnd, { passive: true });
    window.addEventListener("popstate", () => {
      if (activeDetailStatusId) {
        closeDetail(false);
      }
      refreshPage();
    });
    window.addEventListener("hashchange", refreshPage);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && activeDetailStatusId) {
        closeDetail(true);
        return;
      }

      if (event.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
      }
    });
    window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        refreshPage();
      }
    }, 750);
  }

  async function start() {
    if (!hasValidExtensionContext()) {
      return;
    }

    listenForBridgeResponses();
    createControls();
    observePage();
    await loadSettings();
    await injectBridge();
    refreshPage();
  }

  void start();
})();
