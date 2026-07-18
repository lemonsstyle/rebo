(() => {
  "use strict";

  const CHANNEL = "weibo-grid-reader-v2";
  const ROOT_ID = "weibo-grid-reader-root";
  const SURFACE_ID = "weibo-grid-reader-surface";
  const DETAIL_ID = "weibo-grid-reader-detail";
  const SETTINGS_KEY = "weiboGridReaderSettings";
  const DEFAULT_SETTINGS = Object.freeze({
    readerEnabled: true,
    columnCount: 3
  });
  const DENSITY_OPTIONS = Object.freeze({
    3: { label: "稀疏" },
    4: { label: "适中" },
    5: { label: "密集" }
  });
  const DETAIL_IMAGE_NEAR_FIT_THRESHOLD = 0.12;

  let settings = { ...DEFAULT_SETTINGS };
  let drawerOpen = false;
  let bridgeReady = false;
  let currentFeedShell = null;
  let currentNavigationPanel = null;
  let currentPageLayout = null;
  let currentComposerPanel = null;
  let currentUtilityPanel = null;
  let mountedScroller = null;
  let readerRouteKey = "";
  let readerActive = false;
  let readerLoading = false;
  let readerExhausted = false;
  let readerMaxId = "";
  let readerGeneration = 0;
  let readerFailedRouteKey = "";
  let readerRetryTimer = 0;
  let readerRetryAttempt = 0;
  let readerSelectionRouteKey = "";
  let readerSelectionStartedAt = 0;
  let refreshTimer = null;
  let masonryFrame = 0;
  let loadMoreFrame = 0;
  let readerResizeObserver = null;
  let readerCardResizeObserver = null;
  let observedReaderWidth = 0;
  let masonryColumnCount = 0;
  let masonryCardWidth = 0;
  let masonryEpoch = 0;
  let activeDetailStatusId = "";
  let activeDetailAnchor = null;
  let activeDetailImageFitObserver = null;
  let detailHistoryPushed = false;
  let lastUrl = window.location.href;
  const readerSeenIds = new Set();
  const masonryCardState = new WeakMap();
  const longTextCache = new Map();
  const pendingLongTextRequests = new Map();
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

  function getReaderRouteKeyFromUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname !== "/" && url.pathname !== "/mygroups")) {
        return "";
      }
      return `${url.pathname}?gid=${url.searchParams.get("gid") || ""}`;
    } catch {
      return "";
    }
  }

  function getReaderRouteKey() {
    return getReaderRouteKeyFromUrl(window.location.href);
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
      densitySlider: root.querySelector("[data-density-slider]"),
      densityLabels: [...root.querySelectorAll("[data-density-label]")]
    };
  }

  function getDensityOption(columnCount) {
    return DENSITY_OPTIONS[columnCount] || DENSITY_OPTIONS[DEFAULT_SETTINGS.columnCount];
  }

  function updateControlState() {
    const { root, button, panel, readerToggle, densitySlider, densityLabels } = getControls();
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

    const density = getDensityOption(settings.columnCount);
    if (densitySlider) {
      densitySlider.value = String(settings.columnCount);
      densitySlider.disabled = !settings.readerEnabled;
      densitySlider.setAttribute("aria-valuetext", density.label);
      densitySlider.style.setProperty(
        "--weibo-grid-reader-density-progress",
        `${((settings.columnCount - 3) / 2) * 100}%`
      );
    }
    for (const label of densityLabels || []) {
      const isSelected = Number(label.dataset.densityLabel) === settings.columnCount;
      label.classList.toggle("weibo-grid-reader__density-label--active", isSelected);
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

  function findComposerPanel() {
    const panels = [...document.querySelectorAll(".woo-panel-main")];
    const composerPanels = panels.filter((panel) => {
      const text = panel.innerText || "";
      const hasComposerHint = /有什么新鲜事想分享给大家|分享新鲜事/.test(text);
      const hasEditor = Boolean(panel.querySelector('textarea, [contenteditable="true"], [role="textbox"]'));
      return (hasComposerHint || hasEditor) && text.includes("发送");
    });

    return composerPanels.sort((first, second) => first.innerText.length - second.innerText.length)[0] || null;
  }

  function updatePageAnchors() {
    const nextFeedShell = findFeedShell();
    const nextNavigationPanel = findNavigationPanel();
    const nextPageLayout = findPageLayout(nextFeedShell, nextNavigationPanel);
    const nextComposerPanel = findComposerPanel();

    if (currentFeedShell && currentFeedShell !== nextFeedShell) {
      currentFeedShell.classList.remove("weibo-grid-reader-feed-shell");
    }

    if (currentNavigationPanel && currentNavigationPanel !== nextNavigationPanel) {
      currentNavigationPanel.classList.remove("weibo-grid-reader-navigation-panel");
    }

    if (currentPageLayout && currentPageLayout !== nextPageLayout) {
      currentPageLayout.classList.remove("weibo-grid-reader-page-layout");
    }

    if (currentComposerPanel && currentComposerPanel !== nextComposerPanel) {
      currentComposerPanel.classList.remove("weibo-grid-reader-composer-panel");
    }

    currentFeedShell = nextFeedShell;
    currentNavigationPanel = nextNavigationPanel;
    currentPageLayout = nextPageLayout;
    currentComposerPanel = nextComposerPanel;
    currentFeedShell?.classList.add("weibo-grid-reader-feed-shell");
    currentNavigationPanel?.classList.add("weibo-grid-reader-navigation-panel");
    currentPageLayout?.classList.add("weibo-grid-reader-page-layout");
    currentComposerPanel?.classList.add("weibo-grid-reader-composer-panel");
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
      grid.removeAttribute("data-masonry-height");
      return;
    }

    const columns = getMasonryColumnCount();
    const gap = 16;
    const cardWidth = (grid.clientWidth - gap * (columns - 1)) / columns;
    const columnHeights = Array(columns).fill(0);
    const shouldReassignColumns = columns !== masonryColumnCount
      || Math.abs(cardWidth - masonryCardWidth) > 0.5;

    if (shouldReassignColumns) {
      masonryColumnCount = columns;
      masonryCardWidth = cardWidth;
      masonryEpoch += 1;
    }

    for (const card of cards) {
      const state = masonryCardState.get(card) || {};
      const widthChanged = shouldReassignColumns || Math.abs((state.width || 0) - cardWidth) > 0.5;
      if (widthChanged) {
        card.style.width = `${cardWidth}px`;
        state.width = cardWidth;
        state.height = 0;
      }
      if (card.style.position !== "absolute") {
        card.style.position = "absolute";
      }
      if (card.style.left !== "0px") {
        card.style.left = "0px";
      }
      if (card.style.top !== "0px") {
        card.style.top = "0px";
      }
      masonryCardState.set(card, state);
    }

    for (const card of cards) {
      const state = masonryCardState.get(card);
      if (!state.height) {
        state.height = Math.ceil(card.getBoundingClientRect().height);
      }
      const shortestColumn = columnHeights.reduce((shortestIndex, height, index) => {
        return height < columnHeights[shortestIndex] ? index : shortestIndex;
      }, 0);
      const column = state.epoch === masonryEpoch && state.column < columns
        ? state.column
        : shortestColumn;
      const top = columnHeights[column];
      const positionKey = `${masonryEpoch}:${column}:${top}`;
      if (state.positionKey !== positionKey) {
        card.style.setProperty("--weibo-grid-reader-card-x", `${column * (cardWidth + gap)}px`);
        card.style.setProperty("--weibo-grid-reader-card-y", `${top}px`);
        state.positionKey = positionKey;
      }
      state.column = column;
      state.epoch = masonryEpoch;
      columnHeights[column] += state.height + gap;
    }

    const gridHeight = Math.max(0, Math.max(...columnHeights) - gap);
    if (grid.dataset.masonryHeight !== String(gridHeight)) {
      grid.style.height = `${gridHeight}px`;
      grid.dataset.masonryHeight = String(gridHeight);
    }
  }

  function observeReaderCards(cards) {
    if (!readerCardResizeObserver) {
      readerCardResizeObserver = new ResizeObserver((entries) => {
        let sizeChanged = false;
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement) || !entry.target.isConnected) {
            continue;
          }
          const borderBox = Array.isArray(entry.borderBoxSize)
            ? entry.borderBoxSize[0]
            : entry.borderBoxSize;
          const height = Math.ceil(borderBox?.blockSize || entry.contentRect.height);
          const state = masonryCardState.get(entry.target) || {};
          if (height && Math.abs((state.height || 0) - height) > 0.5) {
            state.height = height;
            masonryCardState.set(entry.target, state);
            sizeChanged = true;
          }
        }
        if (sizeChanged) {
          scheduleMasonryLayout();
        }
      });
    }

    for (const card of cards) {
      readerCardResizeObserver.observe(card);
    }
  }

  function scheduleMasonryLayout() {
    if (masonryFrame) {
      return;
    }

    masonryFrame = window.requestAnimationFrame(() => {
      masonryFrame = 0;
      layoutMasonry();
    });
  }

  function scheduleLoadMore() {
    if (loadMoreFrame) {
      return;
    }

    loadMoreFrame = window.requestAnimationFrame(() => {
      loadMoreFrame = 0;
      loadMoreWhenNearEnd();
    });
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

    surface.dataset.columns = String(settings.columnCount);
    surface.hidden = !readerActive;
    if (readerActive) {
      scroller.classList.add("weibo-grid-reader-source-hidden");
    }
    mountedScroller = scroller;
    return true;
  }

  function activateReaderSurface() {
    const surface = getReaderSurface();
    const scroller = findScroller();
    if (!surface || !scroller) {
      return false;
    }

    surface.hidden = false;
    scroller.classList.add("weibo-grid-reader-source-hidden");
    mountedScroller = scroller;
    readerActive = true;
    updatePageClasses();
    return true;
  }

  function deactivateReaderSurface() {
    const surface = getReaderSurface();
    if (surface) {
      surface.hidden = true;
    }
    mountedScroller?.classList.remove("weibo-grid-reader-source-hidden");
    findScroller()?.classList.remove("weibo-grid-reader-source-hidden");
    readerActive = false;
    updatePageClasses();
  }

  function cancelReaderRetry(resetAttempt = true) {
    if (readerRetryTimer) {
      window.clearTimeout(readerRetryTimer);
      readerRetryTimer = 0;
    }
    if (resetAttempt) {
      readerRetryAttempt = 0;
    }
  }

  function scheduleReaderRetry(routeKey = readerRouteKey) {
    if (readerRetryTimer || !routeKey) {
      return;
    }

    const delay = Math.min(4000, 400 * (2 ** Math.min(readerRetryAttempt, 4)));
    readerRetryAttempt += 1;
    readerRetryTimer = window.setTimeout(() => {
      readerRetryTimer = 0;
      if (
        !hasValidExtensionContext()
        || !settings.readerEnabled
        || !isFeedRoute()
        || getReaderRouteKey() !== routeKey
      ) {
        return;
      }

      readerFailedRouteKey = "";
      if (!mountReaderSurface()) {
        scheduleReaderRetry(routeKey);
        return;
      }
      readerRouteKey = routeKey;
      resetReader(true);
    }, delay);
  }

  function unmountReaderSurface() {
    closeDetail(false);
    cancelReaderRetry();
    deactivateReaderSurface();
    mountedScroller = null;
    readerRouteKey = "";
    readerLoading = false;
    readerExhausted = false;
    readerMaxId = "";
    readerGeneration += 1;
    readerFailedRouteKey = "";
    readerSeenIds.clear();
    window.cancelAnimationFrame(masonryFrame);
    masonryFrame = 0;
    window.cancelAnimationFrame(loadMoreFrame);
    loadMoreFrame = 0;
    sentinelObserver?.disconnect();
    sentinelObserver = null;
    readerResizeObserver?.disconnect();
    readerResizeObserver = null;
    readerCardResizeObserver?.disconnect();
    readerCardResizeObserver = null;
    observedReaderWidth = 0;
    masonryColumnCount = 0;
    masonryCardWidth = 0;
    masonryEpoch += 1;

    const surface = getReaderSurface();
    if (surface) {
      surface.hidden = true;
      getReaderGrid()?.replaceChildren();
      getReaderGrid()?.removeAttribute("data-masonry-height");
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

  function getProfileUrl(user) {
    const userId = user?.idstr || user?.id;
    return userId ? `https://weibo.com/u/${encodeURIComponent(userId)}` : "";
  }

  function isLongTextStatus(status) {
    return Boolean(status?.isLongText || status?.is_long_text || status?.longText || status?.long_text);
  }

  function applyLongText(status, text) {
    status.text = text;
    status.text_raw = plainText(text);
    status.isLongText = false;
    status.is_long_text = false;
    status.__weiboGridLongTextLoaded = true;
  }

  async function loadStatusLongText(status) {
    if (!isLongTextStatus(status) && !status.__weiboGridLongTextLoaded) {
      return false;
    }
    if (status.__weiboGridLongTextLoaded) {
      return true;
    }

    const statusId = getStatusId(status);
    if (!statusId) {
      return false;
    }
    const cachedText = longTextCache.get(statusId);
    if (cachedText) {
      applyLongText(status, cachedText);
      return true;
    }

    let request = pendingLongTextRequests.get(statusId);
    if (!request) {
      request = bridgeRequest("fetch-long-text", { statusId })
        .then((result) => result.ok && result.payload?.text ? result.payload.text : "")
        .catch(() => "");
      pendingLongTextRequests.set(statusId, request);
    }

    const text = await request;
    if (pendingLongTextRequests.get(statusId) === request) {
      pendingLongTextRequests.delete(statusId);
    }
    if (!text) {
      return false;
    }

    longTextCache.set(statusId, text);
    applyLongText(status, text);
    return true;
  }

  function getMixedMediaItems(status) {
    const sources = [
      status.mix_media_info?.items,
      status.mix_media_info?.media_items,
      status.page_info?.mix_media_info?.items,
      status.pageInfo?.mix_media_info?.items
    ];
    return sources.filter(Array.isArray).flat();
  }

  function getPictureUrl(picture) {
    if (!picture || typeof picture !== "object") {
      return "";
    }

    return picture.largest?.url
      || picture.large?.url
      || picture.original?.url
      || picture.mw2000?.url
      || picture.pic_big?.url
      || picture.pic_small?.url
      || picture.bmiddle?.url
      || picture.thumbnail?.url
      || picture.url
      || "";
  }

  function getPictureUrls(status) {
    const urls = [];
    const addPicture = (picture) => {
      const url = getPictureUrl(picture);
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    };

    const pictureInfos = status.pic_infos;
    if (pictureInfos && typeof pictureInfos === "object") {
      const pictureIds = status.pic_ids?.length ? status.pic_ids : Object.keys(pictureInfos);
      pictureIds.forEach((pictureId) => addPicture(pictureInfos[pictureId]));
    }

    for (const item of getMixedMediaItems(status)) {
      const data = item?.data || item;
      const type = String(item?.type || data?.type || data?.object_type || "").toLowerCase();
      const pictureInfo = data?.pic_info || data?.picInfo || item?.pic_info || item?.picInfo || data?.picture;
      if (pictureInfo || type === "pic" || type === "image") {
        addPicture(pictureInfo || data);
      }
    }

    return urls;
  }

  function getVideoMedia(status) {
    const pageInfo = status.page_info || status.pageInfo || {};
    const candidates = [{
      mediaInfo: pageInfo.media_info || pageInfo.mediaInfo || {},
      pageInfo
    }];

    for (const item of getMixedMediaItems(status)) {
      const data = item?.data || item || {};
      const type = String(item?.type || data?.type || data?.object_type || "").toLowerCase();
      const mediaInfo = data.media_info || data.mediaInfo || item?.media_info || item?.mediaInfo || {};
      if (type === "video" || Object.keys(mediaInfo).length) {
        candidates.push({ mediaInfo, pageInfo: data });
      }
    }

    for (const candidate of candidates) {
      const { mediaInfo, pageInfo: sourcePageInfo } = candidate;
      const playbackSource = mediaInfo.playback_list?.find((item) => item.play_info?.url)?.play_info?.url;
      const source = mediaInfo.stream_url_hd
        || mediaInfo.stream_url
        || mediaInfo.mp4_hd_url
        || mediaInfo.mp4_sd_url
        || playbackSource
        || "";
      if (source) {
        return {
          source,
          poster: sourcePageInfo?.page_pic || mediaInfo.poster || "",
          pageUrl: sourcePageInfo?.page_url || ""
        };
      }
    }

    return null;
  }

  function getArticleMedia(status) {
    const pageInfo = status.page_info || status.pageInfo || {};
    const type = String(pageInfo.type || pageInfo.object_type || pageInfo.objectType || "").toLowerCase();
    const pageUrl = pageInfo.page_url || pageInfo.pageUrl || pageInfo.url || "";
    const isArticle = type.includes("article") || /(?:ttarticle|article\.weibo\.com)/i.test(pageUrl);
    if (!isArticle || !pageUrl) {
      return null;
    }

    const cover = typeof pageInfo.page_pic === "string"
      ? pageInfo.page_pic
      : getPictureUrl(pageInfo.page_pic || pageInfo.pic_info || pageInfo.picInfo);
    return {
      title: pageInfo.page_title || pageInfo.title || "微博文章",
      description: pageInfo.page_desc || pageInfo.desc || pageInfo.content2 || "",
      cover,
      url: pageUrl
    };
  }

  function getExternalLinkMedia(status) {
    if (getVideoMedia(status) || getArticleMedia(status)) {
      return null;
    }

    const pageInfo = status.page_info || status.pageInfo || {};
    const pageUrl = getSafeLinkHref(pageInfo.page_url || pageInfo.pageUrl || pageInfo.url || "");
    const title = pageInfo.page_title || pageInfo.title || "";
    const description = pageInfo.page_desc || pageInfo.desc || pageInfo.content2 || "";
    const cover = typeof pageInfo.page_pic === "string"
      ? pageInfo.page_pic
      : getPictureUrl(pageInfo.page_pic || pageInfo.pic_info || pageInfo.picInfo);

    if (!pageUrl || (!title && !description && !cover)) {
      return null;
    }

    const type = String(pageInfo.type || pageInfo.object_type || pageInfo.objectType || "").toLowerCase();
    return {
      title: title || new URL(pageUrl).hostname,
      description,
      cover,
      label: type.includes("video") ? "外部视频" : "网页链接",
      url: pageUrl
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

  function createRichLink(href, textContent = "", preserveReferrer = false) {
    const link = document.createElement("a");
    const imageViewerLink = isNativeImageLink(href);
    link.className = "weibo-grid-reader__rich-link";
    link.href = imageViewerLink ? getNativeImageViewerUrl() : href;
    link.target = imageViewerLink ? "_self" : "_blank";
    link.rel = imageViewerLink || preserveReferrer ? "noopener" : "noopener noreferrer";
    link.textContent = textContent;
    link.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!imageViewerLink) {
        return;
      }
      event.preventDefault();
      openNativeImageViewer(href);
    });
    return link;
  }

  function isWeiboImageLink(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.hostname === "t.cn"
        || isNativeImageLink(value);
    } catch {
      return false;
    }
  }

  function isNativeImageLink(value) {
    try {
      const url = new URL(value, window.location.href);
      return /(^|\.)sinaimg\.cn$/i.test(url.hostname)
        && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function normalizeCommentImageUrl(value) {
    const url = new URL(value, window.location.href);
    url.protocol = "https:";
    return url.href;
  }

  function addCommentImageUrl(urls, value) {
    const normalized = getSafeLinkHref(value);
    if (!normalized || urls.includes(normalized)) {
      return;
    }
    urls.push(normalized);
  }

  function collectCommentImageUrls(value, urls, depth = 0) {
    if (depth > 5 || value === null || value === undefined) {
      return;
    }

    if (typeof value === "string") {
      if (isNativeImageLink(value)) {
        addCommentImageUrl(urls, value);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectCommentImageUrls(item, urls, depth + 1));
      return;
    }

    if (typeof value === "object") {
      Object.values(value).forEach((item) => collectCommentImageUrls(item, urls, depth + 1));
    }
  }

  function metadataReferencesCommentImageLink(metadata, linkUrl, propertyName = "") {
    const comparableLinkUrl = getComparableImageUrl(linkUrl);
    if (!comparableLinkUrl) {
      return false;
    }

    if (getComparableImageUrl(propertyName) === comparableLinkUrl) {
      return true;
    }

    return Object.values(metadata).some((value) => (
      typeof value === "string" && getComparableImageUrl(value) === comparableLinkUrl
    ));
  }

  function collectLinkedCommentImageUrls(value, linkUrl, urls, depth = 0, propertyName = "") {
    if (depth > 5 || !value) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectLinkedCommentImageUrls(item, linkUrl, urls, depth + 1));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    if (metadataReferencesCommentImageLink(value, linkUrl, propertyName)) {
      collectCommentImageUrls(value, urls);
      return;
    }

    Object.entries(value).forEach(([key, item]) => {
      collectLinkedCommentImageUrls(item, linkUrl, urls, depth + 1, key);
    });
  }

  function getCommentImageVariants(value) {
    const normalized = normalizeCommentImageUrl(value);
    if (!isNativeImageLink(normalized)) {
      return [normalized];
    }

    const url = new URL(normalized);
    const match = url.pathname.match(/^\/(?:large|mw\d+|orj360|bmiddle|thumbnail|thumb\d+)\/(.+)$/i);
    if (!match) {
      return [url.href];
    }

    const variants = [];
    for (const size of [url.pathname.split("/")[1], "orj360", "mw1024", "mw690", "thumbnail"]) {
      const candidate = new URL(url.href);
      candidate.pathname = `/${size}/${match[1]}`;
      if (!variants.includes(candidate.href)) {
        variants.push(candidate.href);
      }
    }
    return variants;
  }

  function getCommentImageSources(comment, value) {
    const directUrls = [];
    collectLinkedCommentImageUrls(comment?.url_struct, value, directUrls);
    collectLinkedCommentImageUrls(comment?.url_objects, value, directUrls);
    if (!directUrls.length) {
      collectCommentImageUrls(comment?.url_struct, directUrls);
      collectCommentImageUrls(comment?.url_objects, directUrls);
    }

    const sources = [];
    for (const directUrl of directUrls) {
      getCommentImageVariants(directUrl).forEach((variant) => addCommentImageUrl(sources, variant));
    }
    getCommentImageVariants(value).forEach((variant) => addCommentImageUrl(sources, variant));
    return sources;
  }

  function getNativeImageViewerUrl() {
    const url = new URL(window.location.href);
    url.hash = "&viewer";
    return url.href;
  }

  function getComparableImageUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      if (url.hostname === "t.cn") {
        url.protocol = "https:";
      }
      return url.href;
    } catch {
      return "";
    }
  }

  function getImageResourceKey(value) {
    try {
      const url = new URL(value, window.location.href);
      return /(^|\.)sinaimg\.cn$/i.test(url.hostname)
        ? url.pathname.split("/").pop() || ""
        : "";
    } catch {
      return "";
    }
  }

  function isExtensionElement(element) {
    return Boolean(
      getExtensionRoot()?.contains(element)
      || getReaderSurface()?.contains(element)
      || getDetailOverlay()?.contains(element)
    );
  }

  function findNativeImageTrigger(imageUrl) {
    const comparableUrl = getComparableImageUrl(imageUrl);
    const resourceKey = getImageResourceKey(imageUrl);

    for (const link of document.querySelectorAll("a[href]")) {
      if (isExtensionElement(link)) {
        continue;
      }
      if (getComparableImageUrl(link.href) === comparableUrl) {
        return link;
      }
    }

    if (!resourceKey) {
      return null;
    }

    for (const image of document.querySelectorAll("img[src]")) {
      if (isExtensionElement(image) || getImageResourceKey(image.currentSrc || image.src) !== resourceKey) {
        continue;
      }
      return image.closest("a, .woo-picture-main, .woo-picture-hover") || image;
    }

    return null;
  }

  function openNativeImageViewer(imageUrl) {
    const trigger = findNativeImageTrigger(imageUrl);
    if (trigger) {
      const cancelDirectNavigation = (event) => {
        if (event.composedPath().includes(trigger)) {
          event.preventDefault();
        }
      };
      document.addEventListener("click", cancelDirectNavigation, { capture: true, once: true });
      trigger.click();
    }

    window.setTimeout(() => {
      if (!window.location.hash.includes("viewer")) {
        window.location.assign(getNativeImageViewerUrl());
      }
    }, 60);
  }

  function closeCommentImagePreview() {
    getDetailOverlay()?.querySelector(".weibo-grid-reader__comment-image-preview-layer")?.remove();
  }

  function openCommentImagePreview(imageSources) {
    const dialog = getDetailOverlay()?.querySelector(".weibo-grid-reader__detail-dialog");
    if (!dialog) {
      return;
    }

    closeCommentImagePreview();
    const layer = document.createElement("section");
    layer.className = "weibo-grid-reader__comment-image-preview-layer";
    layer.setAttribute("aria-label", "评论图片预览");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "weibo-grid-reader__comment-image-preview-close";
    close.setAttribute("aria-label", "关闭图片预览");
    close.textContent = "×";
    close.addEventListener("click", closeCommentImagePreview);
    const image = document.createElement("img");
    image.className = "weibo-grid-reader__comment-image-preview-full";
    image.alt = "评论图片";
    image.referrerPolicy = "unsafe-url";
    let sourceIndex = 0;
    const loadSource = () => {
      image.src = imageSources[sourceIndex] || "";
    };
    image.addEventListener("error", () => {
      sourceIndex += 1;
      if (sourceIndex < imageSources.length) {
        loadSource();
        return;
      }
      image.replaceWith(document.createTextNode("评论图片暂时无法显示"));
    });
    loadSource();
    layer.append(close, image);
    layer.addEventListener("click", (event) => {
      if (event.target === layer) {
        closeCommentImagePreview();
      }
    });
    dialog.append(layer);
  }

  function createCommentImagePreview(url, comment) {
    const preview = document.createElement("span");
    preview.className = "weibo-grid-reader__comment-image-preview";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "weibo-grid-reader__comment-image-thumbnail";
    button.setAttribute("aria-label", "预览评论图片");
    const imageSources = getCommentImageSources(comment, url);
    let sourceIndex = 0;
    button.addEventListener("click", () => openCommentImagePreview(imageSources.slice(sourceIndex)));
    const image = document.createElement("img");
    image.alt = "评论图片";
    image.loading = "lazy";
    image.referrerPolicy = "unsafe-url";
    image.decoding = "async";
    const loadSource = () => {
      image.src = imageSources[sourceIndex] || "";
    };
    image.addEventListener("load", () => preview.classList.add("weibo-grid-reader__comment-image-preview--loaded"));
    image.addEventListener("error", () => {
      sourceIndex += 1;
      if (sourceIndex < imageSources.length) {
        loadSource();
        return;
      }
      button.remove();
      preview.classList.add("weibo-grid-reader__comment-image-preview--failed");
      preview.textContent = "评论图片暂时无法显示";
    });
    button.append(image);
    preview.append(button);
    loadSource();
    return preview;
  }

  function appendPlainTextWithLinks(container, value, renderCommentImages = false, comment = null) {
    const source = String(value || "");
    const urlPattern = /https?:\/\/[^\s<]+/g;
    let previousEnd = 0;

    for (const match of source.matchAll(urlPattern)) {
      const matchIndex = match.index || 0;
      container.append(source.slice(previousEnd, matchIndex));
      const url = getSafeLinkHref(match[0]);
      if (url && renderCommentImages && isWeiboImageLink(url)) {
        container.append(createCommentImagePreview(url, comment));
      } else {
        container.append(url ? createRichLink(url, match[0]) : match[0]);
      }
      previousEnd = matchIndex + match[0].length;
    }

    container.append(source.slice(previousEnd));
  }

  function appendRichStatusText(container, status, linkifyText = false, renderCommentImages = false, comment = null) {
    const template = document.createElement("template");
    const source = status.text || status.text_raw || "";
    const hideVideoLink = Boolean(getVideoMedia(status));
    template.innerHTML = source;

    const appendNodes = (nodes, target) => {
      for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = hideVideoLink ? node.textContent.replace(/https?:\/\/\S+/g, "") : node.textContent;
          if (linkifyText) {
            appendPlainTextWithLinks(target, text, renderCommentImages, comment);
          } else {
            target.append(text);
          }
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
            if (renderCommentImages && isWeiboImageLink(href)) {
              target.append(createCommentImagePreview(href, comment));
              continue;
            }
            const link = createRichLink(href);
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
    }, true, true, comment);
  }

  function populateStatusText(container, status) {
    container.replaceChildren();
    const displayText = getDisplayText(status);
    if (hasRichStatusText(status)) {
      appendRichStatusText(container, status, true);
    } else {
      appendPlainTextWithLinks(container, displayText || "转发微博");
    }
  }

  function createTextBlock(className, status) {
    const text = document.createElement("p");
    text.className = className;
    populateStatusText(text, status);
    return text;
  }

  function createLongTextToggle(status, text) {
    if (!isLongTextStatus(status) && !status.__weiboGridLongTextLoaded) {
      return null;
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "weibo-grid-reader__long-text-toggle";
    let expanded = false;
    const updateState = () => {
      text.classList.toggle("weibo-grid-reader__text--expanded", expanded);
      text.classList.toggle("weibo-grid-reader__repost-text--expanded", expanded);
      toggle.textContent = expanded ? "收起" : "展开全文";
      toggle.setAttribute("aria-expanded", String(expanded));
    };

    toggle.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (status.__weiboGridLongTextLoaded) {
        expanded = !expanded;
        updateState();
        scheduleMasonryLayout();
        return;
      }

      toggle.disabled = true;
      toggle.textContent = "正在加载…";
      const loaded = await loadStatusLongText(status);
      toggle.disabled = false;
      if (!loaded) {
        toggle.textContent = "加载失败，重试";
        return;
      }

      populateStatusText(text, status);
      expanded = true;
      updateState();
      scheduleMasonryLayout();
    });

    updateState();
    return toggle;
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

  function createArticleMedia(status) {
    const article = getArticleMedia(status);
    if (!article) {
      return null;
    }

    const link = document.createElement("a");
    link.className = "weibo-grid-reader__article-media";
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", (event) => event.stopPropagation());

    if (article.cover) {
      const cover = document.createElement("img");
      cover.className = "weibo-grid-reader__article-cover";
      cover.alt = "";
      cover.loading = "lazy";
      cover.src = article.cover;
      cover.addEventListener("error", () => cover.remove(), { once: true });
      link.append(cover);
    }

    const content = document.createElement("div");
    content.className = "weibo-grid-reader__article-content";
    const label = document.createElement("span");
    label.textContent = "微博文章";
    const title = document.createElement("strong");
    title.textContent = article.title;
    content.append(label, title);
    if (article.description) {
      const description = document.createElement("p");
      description.textContent = article.description;
      content.append(description);
    }

    link.append(content);
    return link;
  }

  function createExternalLinkMedia(status) {
    const externalLink = getExternalLinkMedia(status);
    if (!externalLink) {
      return null;
    }

    const link = document.createElement("a");
    link.className = "weibo-grid-reader__article-media";
    link.href = externalLink.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", (event) => event.stopPropagation());

    if (externalLink.cover) {
      const cover = document.createElement("img");
      cover.className = "weibo-grid-reader__article-cover";
      cover.alt = "";
      cover.loading = "lazy";
      cover.src = externalLink.cover;
      cover.addEventListener("error", () => cover.remove(), { once: true });
      link.append(cover);
    }

    const content = document.createElement("div");
    content.className = "weibo-grid-reader__article-content";
    const label = document.createElement("span");
    label.textContent = externalLink.label;
    const title = document.createElement("strong");
    title.textContent = externalLink.title;
    content.append(label, title);
    if (externalLink.description) {
      const description = document.createElement("p");
      description.textContent = externalLink.description;
      content.append(description);
    }

    link.append(content);
    return link;
  }

  function createStatusMedia(status) {
    const video = createVideoMedia(status);
    const pictures = createPictureMedia(status);
    const article = createArticleMedia(status);
    const externalLink = createExternalLinkMedia(status);
    const mediaItems = [video, pictures, article, externalLink].filter(Boolean);
    if (mediaItems.length < 2) {
      return mediaItems[0] || null;
    }

    const media = document.createElement("div");
    media.className = "weibo-grid-reader__status-media-stack";
    media.append(...mediaItems);
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
    const text = createTextBlock("weibo-grid-reader__text", status);
    const longTextToggle = createLongTextToggle(status, text);
    card.append(header, text);
    if (longTextToggle) {
      card.append(longTextToggle);
    }

    if (repostedStatus) {
      const repost = document.createElement("section");
      repost.className = "weibo-grid-reader__repost";

      const repostAuthor = document.createElement("strong");
      repostAuthor.className = "weibo-grid-reader__repost-author";
      repostAuthor.textContent = `@${repostedStatus.user?.screen_name || "原微博作者"}`;

      const repostText = createTextBlock("weibo-grid-reader__repost-text", repostedStatus);
      const repostLongTextToggle = createLongTextToggle(repostedStatus, repostText);
      repost.append(repostAuthor, repostText);
      if (repostLongTextToggle) {
        repost.append(repostLongTextToggle);
      }

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
    populateStatusText(text, status);
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
    let imageReady = false;
    let fitFrame = 0;

    const updateFitMode = () => {
      fitFrame = 0;
      if (!imageReady || !viewer.isConnected || !viewer.clientWidth || !viewer.clientHeight) {
        return;
      }

      viewer.classList.remove("weibo-grid-reader__detail-image-viewer--contained");
      const isLandscape = viewer.classList.contains("weibo-grid-reader__detail-image-viewer--landscape");
      const viewportSize = isLandscape ? viewer.clientWidth : viewer.clientHeight;
      const overflowSize = isLandscape
        ? Math.max(0, viewer.scrollWidth - viewer.clientWidth)
        : Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const fitsNearly = overflowSize <= viewportSize * DETAIL_IMAGE_NEAR_FIT_THRESHOLD;

      viewer.classList.toggle("weibo-grid-reader__detail-image-viewer--contained", fitsNearly);
      if (fitsNearly) {
        viewer.scrollLeft = 0;
        viewer.scrollTop = 0;
      }
      repositionActiveDetail();
    };

    const scheduleFitMode = () => {
      if (fitFrame) {
        window.cancelAnimationFrame(fitFrame);
      }
      fitFrame = window.requestAnimationFrame(updateFitMode);
    };

    image.addEventListener("load", () => {
      const isPortrait = image.naturalHeight > image.naturalWidth;
      viewer.classList.toggle("weibo-grid-reader__detail-image-viewer--portrait", isPortrait);
      viewer.classList.toggle("weibo-grid-reader__detail-image-viewer--landscape", !isPortrait);
      viewer.scrollLeft = 0;
      viewer.scrollTop = 0;
      imageReady = true;
      scheduleFitMode();
    });
    image.addEventListener("error", () => {
      imageReady = false;
      viewer.classList.remove("weibo-grid-reader__detail-image-viewer--contained");
      image.alt = "图片加载失败";
      image.removeAttribute("src");
    }, { once: true });
    viewer.addEventListener("wheel", (event) => {
      if (event.defaultPrevented) {
        return;
      }
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

    activeDetailImageFitObserver?.disconnect();
    activeDetailImageFitObserver = new ResizeObserver(scheduleFitMode);
    activeDetailImageFitObserver.observe(viewer);

    const setImage = (url, nextAlt = alt) => {
      viewer.classList.remove(
        "weibo-grid-reader__detail-image-viewer--portrait",
        "weibo-grid-reader__detail-image-viewer--landscape",
        "weibo-grid-reader__detail-image-viewer--contained"
      );
      viewer.scrollLeft = 0;
      viewer.scrollTop = 0;
      imageReady = false;
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
      if (rail.isConnected) {
        buttons[index]?.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
        });
      }
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
    const article = createArticleMedia(status);
    const externalLink = createExternalLinkMedia(status);
    const mediaItems = [video, pictures.media, article, externalLink].filter(Boolean);
    if (mediaItems.length < 2) {
      if (video) {
        return { media: video, rail: null, isImage: false };
      }
      if (pictures.media) {
        return pictures;
      }
      return { media: article, rail: null, isImage: false };
    }

    const media = document.createElement("div");
    media.className = "weibo-grid-reader__detail-media-stack";
    media.append(...mediaItems);
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

  async function hydrateDetailLongText(status, post) {
    if (!isLongTextStatus(status) && !status.__weiboGridLongTextLoaded) {
      return;
    }

    const loaded = await loadStatusLongText(status);
    if (!loaded || !post.isConnected) {
      return;
    }

    const text = post.querySelector(".weibo-grid-reader__detail-text");
    if (text) {
      populateStatusText(text, status);
      repositionActiveDetail();
    }
  }

  function getCommentId(comment) {
    return String(comment.idstr || comment.id || comment.mid || "");
  }

  function getCommentReplies(comment) {
    const replies = comment.comments || comment.replies || comment.children || [];
    return Array.isArray(replies) ? replies : [];
  }

  function indexComments(comments, commentsById = new Map()) {
    for (const comment of comments) {
      const commentId = getCommentId(comment);
      if (commentId) {
        commentsById.set(commentId, comment);
      }
      indexComments(getCommentReplies(comment), commentsById);
    }
    return commentsById;
  }

  function getCommentReply(comment, commentsById) {
    const nestedReply = comment.reply_comment
      || comment.replyComment
      || comment.reply_comment_info
      || comment.replyCommentInfo
      || comment.reply;
    const inlineReply = nestedReply && typeof nestedReply === "object" ? nestedReply : {};
    const replyId = inlineReply.idstr
      || inlineReply.id
      || comment.reply_comment_id
      || comment.replyCommentId
      || (typeof nestedReply === "string" || typeof nestedReply === "number" ? nestedReply : "");
    const indexedReply = replyId ? commentsById?.get(String(replyId)) : null;
    const reply = { ...(indexedReply || {}), ...inlineReply };
    const user = reply.user || comment.reply_user || comment.replyUser || null;
    const text = reply.text || reply.text_raw || comment.reply_original_text || comment.replyOriginalText || "";
    if (!user && !text) {
      return null;
    }

    return {
      ...reply,
      text,
      text_raw: reply.text_raw || comment.reply_original_text || comment.replyOriginalText || "",
      user
    };
  }

  function createCommentItem(comment, commentsById, renderedCommentIds, postAuthorId, depth = 0) {
    const commentId = getCommentId(comment);
    if (commentId && renderedCommentIds.has(commentId)) {
      return null;
    }
    if (commentId) {
      renderedCommentIds.add(commentId);
    }

    const item = document.createElement("article");
    item.className = "weibo-grid-reader__comment";
    if (depth) {
      item.classList.add("weibo-grid-reader__comment--reply");
    }

    const profileUrl = getProfileUrl(comment.user);
    const avatarLink = profileUrl ? document.createElement("a") : document.createElement("span");
    avatarLink.className = "weibo-grid-reader__comment-profile";
    if (profileUrl) {
      avatarLink.href = profileUrl;
      avatarLink.target = "_blank";
      avatarLink.rel = "noopener noreferrer";
      avatarLink.setAttribute("aria-label", `打开 ${comment.user?.screen_name || "微博用户"} 的主页`);
    }

    const avatar = document.createElement("img");
    avatar.className = "weibo-grid-reader__comment-avatar";
    avatar.alt = "";
    avatar.src = comment.user?.avatar_hd || comment.user?.profile_image_url || "";
    avatar.addEventListener("error", () => avatarLink.remove(), { once: true });
    avatarLink.append(avatar);

    const content = document.createElement("div");
    const name = profileUrl ? document.createElement("a") : document.createElement("strong");
    name.className = "weibo-grid-reader__comment-name";
    name.textContent = comment.user?.screen_name || "微博用户";
    if (profileUrl) {
      name.href = profileUrl;
      name.target = "_blank";
      name.rel = "noopener noreferrer";
    }
    const reply = getCommentReply(comment, commentsById);
    const commentAuthorId = String(comment.user?.idstr || comment.user?.id || "");
    const isPostAuthorReply = Boolean(
      postAuthorId
      && commentAuthorId === postAuthorId
      && (depth > 0 || reply)
    );
    if (isPostAuthorReply) {
      item.classList.add("weibo-grid-reader__comment--author-reply");
    }
    const text = document.createElement("p");
    if (hasRichStatusText(comment)) {
      appendRichCommentText(text, comment);
    } else {
      appendPlainTextWithLinks(text, comment.text_raw || plainText(comment.text), true, comment);
    }
    if (!isPostAuthorReply) {
      content.append(name);
    }
    content.append(text);

    const replies = getCommentReplies(comment);
    if (replies.length && depth < 2) {
      const replyList = document.createElement("div");
      replyList.className = "weibo-grid-reader__comment-replies";
      const replyItems = replies
        .map((reply) => createCommentItem(reply, commentsById, renderedCommentIds, postAuthorId, depth + 1))
        .filter(Boolean);
      if (replyItems.length) {
        replyList.append(...replyItems);
        content.append(replyList);
      }
    }

    item.append(avatarLink, content);
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

    const commentsById = indexComments(result.payload.comments);
    const renderedCommentIds = new Set();
    const postAuthorId = String(status.user?.idstr || status.user?.id || "");
    const commentItems = result.payload.comments
      .map((comment) => createCommentItem(comment, commentsById, renderedCommentIds, postAuthorId))
      .filter(Boolean);
    comments.append(...commentItems);
    repositionActiveDetail();
  }

  function closeDetail(restoreHistory = true) {
    const overlay = getDetailOverlay();
    if (!overlay) {
      return;
    }

    activeDetailImageFitObserver?.disconnect();
    activeDetailImageFitObserver = null;
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

  function isImageViewerReadyForScroll(viewer, detailMain) {
    if (!detailMain) {
      return true;
    }

    const viewerRect = viewer.getBoundingClientRect();
    const mainRect = detailMain.getBoundingClientRect();
    const fullyVisible = viewerRect.top >= mainRect.top && viewerRect.bottom <= mainRect.bottom;
    const viewerIsTallerThanMain = viewerRect.height > detailMain.clientHeight;
    const mainIsAtEnd = detailMain.scrollTop + detailMain.clientHeight >= detailMain.scrollHeight - 1;
    return fullyVisible || (viewerIsTallerThanMain && mainIsAtEnd);
  }

  function canScrollVertically(element, distance) {
    if (!element || !distance || element.scrollHeight <= element.clientHeight) {
      return false;
    }

    return distance > 0
      ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
      : element.scrollTop > 0;
  }

  function canScrollHorizontally(element, distance) {
    if (!element || !distance || element.scrollWidth <= element.clientWidth) {
      return false;
    }

    return distance > 0
      ? element.scrollLeft + element.clientWidth < element.scrollWidth - 1
      : element.scrollLeft > 0;
  }

  function handleDetailWheel(event, dialog) {
    if (event.defaultPrevented) {
      return;
    }

    const origin = event.target instanceof Element ? event.target : null;
    let scrollTarget = origin?.closest(
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

    if (scrollTarget.classList.contains("weibo-grid-reader__detail-image-viewer")) {
      const detailMain = scrollTarget.closest(".weibo-grid-reader__detail-main");
      if (!isImageViewerReadyForScroll(scrollTarget, detailMain)) {
        detailMain?.scrollBy({ top: event.deltaY, left: event.deltaX });
        return;
      }

      if (scrollTarget.classList.contains("weibo-grid-reader__detail-image-viewer--landscape")) {
        const horizontalDistance = event.deltaX || event.deltaY;
        if (canScrollHorizontally(scrollTarget, horizontalDistance)) {
          scrollTarget.scrollLeft += horizontalDistance;
          return;
        }
        detailMain?.scrollBy({ top: event.deltaY, left: event.deltaX });
        return;
      }

      if (canScrollVertically(scrollTarget, event.deltaY)) {
        scrollTarget.scrollTop += event.deltaY;
        return;
      }

      scrollTarget = detailMain || scrollTarget;
    }

    if (
      !scrollTarget.classList.contains("weibo-grid-reader__detail-image-viewer")
      && !scrollTarget.classList.contains("weibo-grid-reader__detail-side-content")
    ) {
      scrollTarget = scrollTarget.closest(".weibo-grid-reader__detail-main") || scrollTarget;
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
    const detailMedia = createDetailMedia(status.retweeted_status || status);
    const isTextOnlyDetail = !detailMedia.media && !status.retweeted_status;
    const main = document.createElement("main");
    main.className = "weibo-grid-reader__detail-main";
    if (detailMedia.isImage && !status.retweeted_status) {
      main.classList.add("weibo-grid-reader__detail-main--image-focus");
      dialog.classList.add("weibo-grid-reader__detail-dialog--image-focus");
    }
    if (isTextOnlyDetail) {
      dialog.classList.add("weibo-grid-reader__detail-dialog--text-only");
    }
    const primaryPost = createDetailPost(status, false, status.retweeted_status ? null : detailMedia.media);
    main.append(primaryPost);

    let repostPost = null;
    if (status.retweeted_status) {
      repostPost = createDetailPost(status.retweeted_status, true, detailMedia.media);
      main.append(repostPost);
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
    original.textContent = "原文";
    const sourceProfileUrl = getProfileUrl(status.user);
    const sourceProfile = sourceProfileUrl ? document.createElement("a") : document.createElement("span");
    sourceProfile.className = "weibo-grid-reader__detail-source-profile";
    if (sourceProfileUrl) {
      sourceProfile.href = sourceProfileUrl;
      sourceProfile.target = "_blank";
      sourceProfile.rel = "noopener noreferrer";
      sourceProfile.setAttribute("aria-label", `打开 ${status.user?.screen_name || "微博用户"} 的主页`);
    }
    const sourceAvatar = document.createElement("img");
    sourceAvatar.className = "weibo-grid-reader__detail-source-avatar";
    sourceAvatar.alt = "";
    sourceAvatar.src = status.user?.avatar_hd || status.user?.avatar_large || status.user?.profile_image_url || "";
    sourceAvatar.addEventListener("error", () => sourceProfile.remove(), { once: true });
    sourceProfile.append(sourceAvatar);
    const sourceName = sourceProfileUrl ? document.createElement("a") : document.createElement("span");
    sourceName.className = "weibo-grid-reader__detail-source-name";
    sourceName.textContent = status.user?.screen_name || "微博用户";
    sourceName.title = sourceName.textContent;
    if (sourceProfileUrl) {
      sourceName.href = sourceProfileUrl;
      sourceName.target = "_blank";
      sourceName.rel = "noopener noreferrer";
    }
    const sourceActions = document.createElement("div");
    sourceActions.className = "weibo-grid-reader__detail-source-actions";
    sourceActions.append(sourceProfile, original, sourceName);
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
    }, { capture: true, passive: false });
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

    void hydrateDetailLongText(status, primaryPost);
    if (repostPost) {
      void hydrateDetailLongText(status.retweeted_status, repostPost);
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
    observeReaderCards(cards);
    scheduleMasonryLayout();
    scheduleLoadMore();
    return cards.length;
  }

  function restoreNativeFeed() {
    readerFailedRouteKey = readerRouteKey;
    deactivateReaderSurface();
    scheduleReaderRetry();
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
    const routeKey = readerRouteKey;
    const requestedAt = readerSelectionRouteKey === routeKey
      ? readerSelectionStartedAt
      : Date.now();
    const result = await bridgeRequest("fetch-timeline", {
      query: getFeedQuery(),
      requestedAt
    });
    readerLoading = false;

    if (
      !hasValidExtensionContext()
      || generation !== readerGeneration
      || !settings.readerEnabled
      || !isFeedRoute()
      || routeKey !== readerRouteKey
      || routeKey !== getReaderRouteKey()
    ) {
      return;
    }

    if (!result.ok) {
      if (readerSeenIds.size === 0) {
        restoreNativeFeed();
        return;
      }
      return;
    }

    const added = renderStatuses(result.payload.statuses);
    if (!added && readerSeenIds.size === 0) {
      restoreNativeFeed();
      return;
    }
    if (!readerActive && !activateReaderSurface()) {
      restoreNativeFeed();
      return;
    }
    cancelReaderRetry();
    const nextMaxId = String(result.payload.maxId || "");
    readerMaxId = nextMaxId;
    readerExhausted = !nextMaxId || nextMaxId === "0" || result.payload.statuses.length === 0;

    if (!added && !readerExhausted) {
      readerExhausted = true;
    }
  }

  function resetReader(preserveRetryState = false) {
    readerGeneration += 1;
    if (!preserveRetryState) {
      cancelReaderRetry();
    }
    deactivateReaderSurface();
    readerLoading = false;
    readerExhausted = false;
    readerMaxId = "";
    readerFailedRouteKey = "";
    readerSeenIds.clear();
    getReaderGrid()?.replaceChildren();
    getReaderGrid()?.style.removeProperty("height");
    getReaderGrid()?.removeAttribute("data-masonry-height");
    readerCardResizeObserver?.disconnect();
    readerCardResizeObserver = null;
    masonryColumnCount = 0;
    masonryCardWidth = 0;
    masonryEpoch += 1;
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
      scheduleReaderRetry(routeKey);
      return;
    }

    if (!mountReaderSurface()) {
      scheduleReaderRetry(routeKey);
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
      <button class="weibo-grid-reader__button" type="button" data-reader-button aria-label="打开 rebo 阅读器" aria-expanded="false">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2.75 12s3.25-5.25 9.25-5.25S21.25 12 21.25 12 18 17.25 12 17.25 2.75 12 2.75 12Z"></path>
          <circle cx="12" cy="12" r="2.8"></circle>
        </svg>
      </button>
      <aside class="weibo-grid-reader__drawer" data-reader-panel aria-hidden="true" aria-label="微博阅读器设置">
        <header class="weibo-grid-reader__header">
          <div>
            <p class="weibo-grid-reader__eyebrow">rebo</p>
            <h2>阅读布局</h2>
          </div>
          <button class="weibo-grid-reader__close" type="button" data-reader-close aria-label="关闭抽屉">×</button>
        </header>
        <div class="weibo-grid-reader__settings">
          <label class="weibo-grid-reader__setting">
            <span class="weibo-grid-reader__setting-copy">
              <strong>使用新布局</strong>
            </span>
            <span class="weibo-grid-reader__switch">
              <input type="checkbox" data-reader-toggle>
              <span class="weibo-grid-reader__switch-track" aria-hidden="true"></span>
            </span>
          </label>
          <div class="weibo-grid-reader__setting weibo-grid-reader__column-setting">
            <span class="weibo-grid-reader__setting-copy">
              <strong>信息密度</strong>
            </span>
            <div class="weibo-grid-reader__density-control">
              <input class="weibo-grid-reader__density-slider" type="range" min="3" max="5" step="1" value="3" data-density-slider aria-label="选择信息密度">
              <div class="weibo-grid-reader__density-labels" aria-hidden="true">
                <span data-density-label="3">稀疏</span>
                <span data-density-label="4">适中</span>
                <span data-density-label="5">密集</span>
              </div>
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

    root.querySelector("[data-density-slider]")?.addEventListener("input", (event) => {
      const nextColumnCount = Number(event.currentTarget.value);
      if (![3, 4, 5].includes(nextColumnCount)) {
        return;
      }

      settings.columnCount = nextColumnCount;
      getReaderSurface()?.setAttribute("data-columns", String(nextColumnCount));
      saveSettings();
      updateControlState();
      scheduleMasonryLayout();
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
      scheduleLoadMore();
    }, 100);
  }

  function mutationNeedsRefresh(mutations) {
    const relevantSelector = ".vue-recycle-scroller, .woo-panel-left, .wbpro-side, div.scale";
    return mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
      if (!(node instanceof Element)) {
        return false;
      }
      return node.matches(relevantSelector) || Boolean(node.querySelector(relevantSelector));
    }));
  }

  function observePage() {
    const observer = new MutationObserver((mutations) => {
      if (mutationNeedsRefresh(mutations)) {
        refreshPage();
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", () => {
      refreshPage();
      repositionActiveDetail();
    }, { passive: true });
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
    window.addEventListener("pointerdown", (event) => {
      const root = getExtensionRoot();
      if (drawerOpen && root && event.target instanceof Node && !root.contains(event.target)) {
        setDrawerOpen(false);
      }
    }, { capture: true });
    document.addEventListener("click", (event) => {
      const origin = event.target instanceof Element ? event.target : null;
      const link = origin?.closest("a[href]");
      const targetRouteKey = link ? getReaderRouteKeyFromUrl(link.href) : "";
      if (!targetRouteKey) {
        return;
      }

      readerSelectionRouteKey = targetRouteKey;
      readerSelectionStartedAt = Date.now();
      if (targetRouteKey !== readerRouteKey) {
        return;
      }

      window.setTimeout(() => {
        if (
          hasValidExtensionContext()
          && settings.readerEnabled
          && bridgeReady
          && isFeedRoute()
          && getReaderRouteKey() === targetRouteKey
          && readerRouteKey === targetRouteKey
        ) {
          resetReader();
        }
      }, 180);
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
