(() => {
  "use strict";

  const CHANNEL = "weibo-grid-reader-v4";
  const BRIDGE_SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ROOT_ID = "weibo-grid-reader-root";
  const SURFACE_ID = "weibo-grid-reader-surface";
  const DETAIL_ID = "weibo-grid-reader-detail";
  const DARK_THEME_CLASS = "weibo-grid-reader-theme-dark";
  const SETTINGS_KEY = "weiboGridReaderSettings";
  const BUTTON_ICON_PATH = "icon/128.png";
  const DEFAULT_SETTINGS = Object.freeze({
    readerEnabled: true,
    columnCount: 2,
    cardQuickActions: false
  });
  const DENSITY_OPTIONS = Object.freeze({
    2: { label: "稀疏" },
    3: { label: "适中" },
    4: { label: "紧凑" }
  });
  const VIDEO_QUALITY_LEVELS = Object.freeze({
    original: { key: "original", label: "原画", rank: 5 },
    ultra: { key: "ultra", label: "超清", rank: 4 },
    high: { key: "high", label: "高清", rank: 3 },
    standard: { key: "standard", label: "标清", rank: 2 },
    smooth: { key: "smooth", label: "流畅", rank: 1 },
    automatic: { key: "automatic", label: "自动", rank: 0 }
  });
  const DETAIL_IMAGE_PREVIEW_MAX_SCALE = 4;
  const DETAIL_IMAGE_PREVIEW_ZOOM_STEP = 0.25;
  const MAX_CONSECUTIVE_DUPLICATE_PAGES = 3;
  const MAX_AUTOMATIC_LOAD_RETRIES = 3;
  const LAYOUT_TRANSITION_OUT_DURATION_MS = 320;
  const LAYOUT_TRANSITION_IN_DURATION_MS = 440;
  const LAYOUT_STATE_SETTLE_TIMEOUT_MS = 8500;
  // 评论行的转发/评论/点赞图标簇固定挂在该评论自己的头部一行（与昵称同一行，
  // 靠右对齐），鼠标悬停这条评论行的任意位置后短暂延迟才提亮为完全可交互，
  // 延迟只用于防止鼠标划过列表时图标到处闪烁，因此取一个几乎无感知的短值，
  // 而不是像早期版本那样用 1 秒等待去"验证用户是否真的想操作"。
  const COMMENT_ACTIONS_REVEAL_DELAY_MS = 120;
  // 微博网页版的表情面板会把选中的表情作为 `[名称]` 文本插入评论输入框，
  // /ajax/comments/create 与 /ajax/comments/reply 仍沿用原来的 comment 字段。
  // 这里以内置的官方“PC 热门表情”作为基础目录，并在页面渲染过程中动态收集
  // 当前微博和评论里实际出现的官方表情；避免依赖需要登录态的额外配置接口。
  // 即使图片资源暂时不可用，按钮仍会回退为表情名称。
  const COMMENT_EMOJIS = Object.freeze([
    ["微笑", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/f4/201810_hehe_mobile.png"],
    ["可爱", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/78/201810_keai_mobile.png"],
    ["太开心", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/a6/201810_taikaixin_mobile.png"],
    ["鼓掌", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/32/201810_guzhang_mobile.png"],
    ["嘻嘻", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/8e/201810_xixi_mobile.png"],
    ["哈哈", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/c5/201810_haha_mobile.png"],
    ["笑cry", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/f1/201810_xiaoku_mobile.png"],
    ["挤眼", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/dd/201810_jiyan_mobile.png"],
    ["馋嘴", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/e9/201810_chanzui_mobile.png"],
    ["黑线", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/2e/201810_heixian_mobile.png"],
    ["汗", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/4b/201810_han_mobile.png"],
    ["挖鼻", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/4d/201810_wabishi_mobile.png"],
    ["哼", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/5b/201810_heng_mobile.png"],
    ["怒", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/90/201810_nu_mobile.png"],
    ["委屈", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/8b/201810_weiqu_mobile.png"],
    ["可怜", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/44/201810_kelian_mobile.png"],
    ["失望", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/3d/201810_shiwang_mobile.png"],
    ["悲伤", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/49/201810_beishang_mobile.png"],
    ["泪", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/87/201810_lei_mobile.png"],
    [
      "允悲",
      "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/2c/moren_yunbei_org.png",
      ["https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/65/201810_ybnew_mobile.png"]
    ],
    ["苦涩", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/5f/2021_bitter_mobile.png"],
    ["害羞", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/c1/201810_haixiu_mobile.png"],
    ["爱你", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/db/201810_aini_mobile.png"],
    ["亲亲", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/8f/201810_qinqin_mobile.png"],
    ["抱一抱", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/84/2020_hug_mobile.png"],
    ["色", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/23/201810_huaxin_mobile.png"],
    ["舔屏", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/da/201810_tian_mobile.png"],
    ["憧憬", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/77/201810_xingxingyan_mobile.png"],
    ["哇", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/79/2022_wow_mobile.png"],
    ["坏笑", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/63/201810_huaixiao_mobile.png"],
    ["阴险", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/a5/201810_yinxian_mobile.png"],
    ["笑而不语", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/24/201810_heiheihei_mobile.png"],
    ["偷笑", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/df/201810_touxiao_mobile.png"],
    ["666", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/b9/2022_666_mobile.png"],
    ["酷", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/af/201810_ku_mobile.png"],
    ["并不简单", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/ce/201810_bingbujiandan_mobile.png"],
    ["思考", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/9e/201810_sikao_mobile.png"],
    ["疑问", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/09/201810_yiwen_mobile.png"],
    ["费解", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/dd/201810_feijie_mobile.png"],
    ["晕", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/94/201810_yun_mobile.png"],
    ["衰", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/0a/201810_shuai_mobile.png"],
    ["骷髅", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/94/201810_kulou_mobile.png"],
    ["嘘", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/35/201810_xu_mobile.png"],
    ["闭嘴", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/05/201810_bizui_mobile.png"],
    ["傻眼", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/9a/201810_shayan_mobile.png"],
    ["感冒", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/5d/2022_cold_mobile.png"],
    ["吃惊", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/00/201810_chijing_mobile.png"],
    ["裂开", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/6d/202011_liekai_mobile.png"],
    ["生病", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/7c/201810_shengbing_mobile.png"],
    ["吐", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/4f/201810_tu_mobile.png"],
    ["拜拜", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/8d/201810_baibai_mobile.png"],
    ["鄙视", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/71/201810_bishi_mobile.png"],
    ["白眼", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/a0/201810_landelini_mobile.png"],
    ["抓狂", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/02/201810_zhuakuang_mobile.png"],
    ["怒骂", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/d4/201810_numa_mobile.png"],
    ["打脸", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/c6/201810_dalian_mobile.png"],
    ["努力", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/0d/2022_Keepgoing_mobile.png"],
    ["顶", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/80/201810_ding_mobile.png"],
    ["钱", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/91/201810_qian_mobile.png"],
    ["哈欠", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/1c/201810_dahaqi_mobile.png"],
    ["困", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/cb/201810_kun_mobile.png"],
    ["求饶", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/ec/moren_qiurao_mobile.png"],
    ["睡", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/aa/201810_shuijiao_mobile.png"],
    ["吃瓜", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/0b/201810_chigua_mobile.png"],
    ["打call", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/2a/moren_dacall_mobile.png"],
    ["彩虹屁", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/c0/2022_praise_mobile.png"],
    ["送花花", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/0b/2022_Flowers_mobile.png"],
    ["比耶", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/49/2023_yeahyeah_mobile.png"],
    ["打工人", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/0b/2023_earner_mobile.png"],
    ["干饭人", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/3c/2022_Foodie_mobile.png"],
    ["融化", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/03/2022_melt_mobile.png"],
    ["揣手", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/7f/2022_chuaishou_mobile.png"],
    ["举手", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/3f/2022_raisehand_mobile.png"],
    ["抱抱", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/8b/201810_baobao_mobile.png"],
    ["摊手", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/07/201810_tanshou_mobile.png"],
    ["跪了", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/2f/201810_guile_mobile.png"],
    ["收到", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/19/2022_get_mobile.png"],
    ["你好", "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/8e/2023_hello_mobile.png"]
  ].map(([name, src, fallbackSources = []]) => Object.freeze({
    name,
    src,
    fallbackSources: Object.freeze(fallbackSources)
  })));
  const COMMENT_EMOJI_BY_TOKEN = new Map(
    COMMENT_EMOJIS.map((emoji) => [`[${emoji.name}]`, emoji])
  );
  const DISCOVERED_COMMENT_EMOJIS = new Map();

  let settings = { ...DEFAULT_SETTINGS };
  let drawerOpen = false;
  let layoutTransitionInProgress = false;
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
  let readerWarmStartRouteKey = "";
  let readerActivationFailed = false;
  let routeSyncTimer = 0;
  let refreshTimer = null;
  let masonryFrame = 0;
  let loadMoreFrame = 0;
  let loadMoreRetryTimer = 0;
  let loadMoreRetryAttempt = 0;
  let themeObserver = null;
  let themeUpdateFrame = 0;
  let readerDuplicatePageCount = 0;
  let readerResizeObserver = null;
  let readerCardResizeObserver = null;
  let observedReaderWidth = 0;
  let masonryColumnCount = 0;
  let masonryCardWidth = 0;
  let masonryEpoch = 0;
  let activeDetailStatusId = "";
  let activeDetailSessionId = 0;
  let activeDetailAnchor = null;
  let activeDetailImagePreviewController = null;
  let detailHistoryPushed = false;
  let lastUrl = window.location.href;
  const readerSeenIds = new Set();
  const masonryCardState = new WeakMap();
  const detailCommentStates = new WeakMap();
  const longTextCache = new Map();
  const pendingLongTextRequests = new Map();
  const pendingBridgeRequests = new Map();
  let sentinelObserver = null;

  document.addEventListener("click", (event) => {
    for (const picker of document.querySelectorAll(".weibo-grid-reader__comment-emoji-picker[data-open='true']")) {
      const panel = getCommentEmojiPanel(picker);
      if (!picker.contains(event.target) && !panel?.contains(event.target)) {
        setCommentEmojiPickerOpen(picker, false);
      }
    }
  });

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
      const groupId = url.searchParams.get("gid")
        || url.searchParams.get("list_id")
        || url.searchParams.get("fid")
        || url.searchParams.get("group_id")
        || "";
      return groupId
        ? `gid=${encodeURIComponent(groupId)}`
        : `${url.pathname}?gid=`;
    } catch {
      return "";
    }
  }

  function getReaderRouteKey() {
    return getReaderRouteKeyFromUrl(window.location.href);
  }

  function getReaderGroupIdFromUrl(value = window.location.href) {
    try {
      const url = new URL(value, window.location.href);
      return url.searchParams.get("gid")
        || url.searchParams.get("list_id")
        || url.searchParams.get("fid")
        || url.searchParams.get("group_id")
        || "";
    } catch {
      return "";
    }
  }

  function getReaderRouteKeyFromElement(element) {
    const link = element?.closest?.("a[href]");
    const linkRouteKey = link ? getReaderRouteKeyFromUrl(link.href) : "";
    const groupElement = element?.closest?.(
      "[data-gid], [data-list-id], [data-list_id], [data-fid], [data-group-id], [data-group_id]"
    );
    if (!groupElement) {
      return linkRouteKey;
    }

    const groupId = groupElement.getAttribute("data-gid")
      || groupElement.getAttribute("data-list-id")
      || groupElement.getAttribute("data-list_id")
      || groupElement.getAttribute("data-fid")
      || groupElement.getAttribute("data-group-id")
      || groupElement.getAttribute("data-group_id")
      || "";
    return groupId ? `gid=${encodeURIComponent(groupId)}` : linkRouteKey;
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

  function getThemeMarker(element) {
    if (!element) {
      return "";
    }

    const classValue = typeof element.className === "string"
      ? element.className
      : element.getAttribute("class") || "";
    return [
      classValue.split(/\s+/).filter((className) => className !== DARK_THEME_CLASS).join(" "),
      element.getAttribute("data-theme") || "",
      element.getAttribute("data-color-mode") || "",
      element.getAttribute("data-skin") || "",
      element.getAttribute("data-appearance") || ""
    ].join(" ").toLowerCase();
  }

  function getBackgroundLuminance(element) {
    let current = element;
    while (current) {
      const background = window.getComputedStyle(current).backgroundColor;
      const match = background.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
      const alpha = match ? Number(match[4] ?? 1) : 0;
      if (match && alpha > 0.05) {
        const [red, green, blue] = match.slice(1, 4).map(Number);
        return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      }
      current = current.parentElement;
    }
    return null;
  }

  function isPageDarkTheme() {
    const rootMarker = getThemeMarker(document.documentElement);
    const bodyMarker = getThemeMarker(document.body);
    const markers = `${rootMarker} ${bodyMarker}`;
    if (/(^|[\s_-])(dark|night|black)(?=$|[\s_-])/.test(markers)) {
      return true;
    }
    if (/(^|[\s_-])(light|day|white)(?=$|[\s_-])/.test(markers)) {
      return false;
    }

    const colorScheme = [document.documentElement, document.body]
      .filter(Boolean)
      .map((element) => window.getComputedStyle(element).colorScheme || "")
      .join(" ")
      .toLowerCase();
    if (/\bdark\b/.test(colorScheme) && !/\blight\b/.test(colorScheme)) {
      return true;
    }

    const luminances = [
      getBackgroundLuminance(findNavigationPanel()),
      getBackgroundLuminance(findFeedShell()),
      getBackgroundLuminance(document.body),
      getBackgroundLuminance(document.documentElement)
    ].filter((value) => value !== null);
    return luminances.length > 0 && luminances[0] < 0.42;
  }

  function updateThemeState() {
    const dark = isPageDarkTheme();
    document.documentElement.classList.toggle(DARK_THEME_CLASS, dark);
    getExtensionRoot()?.classList.toggle(DARK_THEME_CLASS, dark);
    getReaderSurface()?.classList.toggle(DARK_THEME_CLASS, dark);
  }

  function scheduleThemeStateUpdate() {
    if (themeUpdateFrame) {
      return;
    }

    themeUpdateFrame = window.requestAnimationFrame(() => {
      themeUpdateFrame = 0;
      updateThemeState();
    });
  }

  function observeTheme() {
    updateThemeState();
    themeObserver?.disconnect();
    themeObserver = new MutationObserver(scheduleThemeStateUpdate);
    const options = {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-color-mode", "data-skin", "data-appearance", "style"]
    };
    themeObserver.observe(document.documentElement, options);
    if (document.body) {
      themeObserver.observe(document.body, options);
    }
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
      cardQuickActionsToggle: root.querySelector("[data-card-quick-actions-toggle]"),
      densitySlider: root.querySelector("[data-density-slider]"),
      densityLabels: [...root.querySelectorAll("[data-density-label]")]
    };
  }

  function getDensityOption(columnCount) {
    return DENSITY_OPTIONS[columnCount] || DENSITY_OPTIONS[DEFAULT_SETTINGS.columnCount];
  }

  function updateControlState() {
    const {
      root,
      button,
      panel,
      readerToggle,
      cardQuickActionsToggle,
      densitySlider,
      densityLabels
    } = getControls();
    const available = isFeedRoute();

    if (!root) {
      return;
    }

    root.hidden = !available;
    root.classList.toggle("weibo-grid-reader--open", drawerOpen);
    button?.setAttribute("aria-expanded", String(drawerOpen));
    panel?.setAttribute("aria-hidden", String(!drawerOpen));

    if (readerToggle) {
      if (!layoutTransitionInProgress) {
        readerToggle.checked = settings.readerEnabled;
      }
      readerToggle.disabled = layoutTransitionInProgress;
    }

    if (cardQuickActionsToggle) {
      cardQuickActionsToggle.checked = settings.cardQuickActions;
      cardQuickActionsToggle.disabled = !settings.readerEnabled || layoutTransitionInProgress;
    }

    const density = getDensityOption(settings.columnCount);
    if (densitySlider) {
      densitySlider.value = String(settings.columnCount);
      densitySlider.disabled = !settings.readerEnabled || layoutTransitionInProgress;
      densitySlider.setAttribute("aria-valuetext", density.label);
      densitySlider.style.setProperty(
        "--weibo-grid-reader-density-progress",
        `${((settings.columnCount - 2) / 2) * 100}%`
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
        {
          channel: CHANNEL,
          sender: "content",
          requestId,
          bridgeSessionId: BRIDGE_SESSION_ID,
          type,
          ...payload
        },
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
      <p class="weibo-grid-reader__load-status" data-reader-load-status role="status" aria-live="polite" hidden></p>
    `;
    return surface;
  }

  function getReaderGrid() {
    return getReaderSurface()?.querySelector("[data-reader-grid]") || null;
  }

  function setReaderLoadStatus(message = "", state = "") {
    const status = getReaderSurface()?.querySelector("[data-reader-load-status]");
    if (!status) {
      return;
    }

    status.hidden = !message;
    status.textContent = message;
    if (state) {
      status.dataset.state = state;
    } else {
      delete status.dataset.state;
    }
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

  function cancelLoadMoreRetry(resetAttempt = true) {
    if (loadMoreRetryTimer) {
      window.clearTimeout(loadMoreRetryTimer);
      loadMoreRetryTimer = 0;
    }
    if (resetAttempt) {
      loadMoreRetryAttempt = 0;
    }
  }

  function isReaderNearEnd() {
    const surface = getReaderSurface();
    return Boolean(
      surface
      && !surface.hidden
      && readerActive
      && surface.getBoundingClientRect().bottom <= window.innerHeight + 900
    );
  }

  function scheduleLoadMoreRetry() {
    if (loadMoreRetryTimer || readerExhausted || !readerActive || !isReaderNearEnd()) {
      return;
    }

    if (loadMoreRetryAttempt >= MAX_AUTOMATIC_LOAD_RETRIES) {
      setReaderLoadStatus("加载更多微博失败，请继续向下滚动后重试。", "error");
      return;
    }

    const delay = Math.min(4000, 500 * (2 ** Math.min(loadMoreRetryAttempt, 3)));
    loadMoreRetryAttempt += 1;
    loadMoreRetryTimer = window.setTimeout(() => {
      loadMoreRetryTimer = 0;
      if (
        hasValidExtensionContext()
        && settings.readerEnabled
        && isFeedRoute()
        && !readerExhausted
        && isReaderNearEnd()
      ) {
        void loadTimeline();
      }
    }, delay);
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
    readerActivationFailed = false;
    updatePageClasses();
    scheduleLoadMore();
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

  function cancelRouteSync() {
    if (routeSyncTimer) {
      window.clearTimeout(routeSyncTimer);
      routeSyncTimer = 0;
    }
  }

  function scheduleRouteSync(targetRouteKey) {
    cancelRouteSync();
    const deadline = Date.now() + 1200;
    const selectionStartedAt = readerSelectionStartedAt;

    const synchronizeWhenReady = () => {
      routeSyncTimer = 0;
      if (!hasValidExtensionContext() || !settings.readerEnabled) {
        return;
      }

      if (getReaderRouteKey() === targetRouteKey) {
        refreshPage(true);
        return;
      }

      if (Date.now() < deadline) {
        routeSyncTimer = window.setTimeout(synchronizeWhenReady, 40);
        return;
      }

      const currentRouteKey = getReaderRouteKey();
      if (!currentRouteKey || !isFeedRoute()) {
        return;
      }

      readerSelectionRouteKey = currentRouteKey;
      readerSelectionStartedAt = selectionStartedAt || Date.now();
      readerRouteKey = currentRouteKey;
      resetReader();
    };

    routeSyncTimer = window.setTimeout(synchronizeWhenReady, 0);
  }

  function scheduleReaderRetry(routeKey = readerRouteKey) {
    if (readerRetryTimer || !routeKey) {
      return;
    }

    const delay = readerRetryAttempt === 0
      ? 150
      : Math.min(4000, 400 * (2 ** Math.min(readerRetryAttempt - 1, 4)));
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
    cancelRouteSync();
    deactivateReaderSurface();
    mountedScroller = null;
    readerRouteKey = "";
    readerWarmStartRouteKey = "";
    readerActivationFailed = false;
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
    cancelLoadMoreRetry();
    readerDuplicatePageCount = 0;
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
      cleanupCommentTransientPickers(surface);
      getReaderGrid()?.replaceChildren();
      getReaderGrid()?.removeAttribute("data-masonry-height");
      setReaderLoadStatus();
    }
  }

  function getFeedQuery() {
    const url = new URL(window.location.href);
    const groupId = getReaderGroupIdFromUrl(url);
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

  function getOriginalStatus(status) {
    let current = status;
    const visitedIds = new Set();
    const visitedStatuses = new Set();

    for (let depth = 0; depth < 16; depth += 1) {
      if (!current || typeof current !== "object" || visitedStatuses.has(current)) {
        return status;
      }
      visitedStatuses.add(current);

      const currentId = getStatusId(current);
      if (currentId) {
        if (visitedIds.has(currentId)) {
          return status;
        }
        visitedIds.add(currentId);
      }

      const next = current.retweeted_status;
      if (!next) {
        return current;
      }
      if (typeof next !== "object" || next === current) {
        return status;
      }
      const nextId = getStatusId(next);
      if (nextId && visitedIds.has(nextId)) {
        return status;
      }
      current = next;
    }

    return status;
  }

  function getStatusPermalink(status) {
    const userId = status.user?.idstr || status.user?.id;
    const postId = status.mblogid || status.idstr || status.id;

    if (userId && postId) {
      return `https://weibo.com/${encodeURIComponent(userId)}/${encodeURIComponent(postId)}`;
    }

    return "";
  }

  function getStatusUrl(status) {
    return getStatusPermalink(status) || "https://weibo.com/";
  }

  function getProfileUrl(user) {
    const userId = user?.idstr || user?.id_str || user?.id || user?.uid;
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

  function getVideoQualityByResolution(resolution) {
    if (resolution >= 1440) {
      return VIDEO_QUALITY_LEVELS.original;
    }
    if (resolution >= 1080) {
      return VIDEO_QUALITY_LEVELS.ultra;
    }
    if (resolution >= 720) {
      return VIDEO_QUALITY_LEVELS.high;
    }
    if (resolution >= 480) {
      return VIDEO_QUALITY_LEVELS.standard;
    }
    if (resolution > 0) {
      return VIDEO_QUALITY_LEVELS.smooth;
    }
    return null;
  }

  function getPlaybackVideoQuality(item) {
    const playInfo = item?.play_info || {};
    const width = Number(playInfo.width || item?.width);
    const height = Number(playInfo.height || item?.height);
    if (width > 0 && height > 0) {
      return getVideoQualityByResolution(Math.min(width, height));
    }

    const explicitLabels = [
      item?.quality_desc,
      item?.quality_name,
      item?.quality_label,
      item?.definition,
      playInfo.quality_desc,
      playInfo.quality_name,
      playInfo.quality_label,
      playInfo.definition
    ].filter((value) => typeof value === "string" && value.trim());
    if (!explicitLabels.length) {
      return null;
    }

    const normalizedLabel = explicitLabels.join(" ").toLowerCase();
    if (/(?:原画|4k|2160|2k|1440)/i.test(normalizedLabel)) {
      return VIDEO_QUALITY_LEVELS.original;
    }
    if (/(?:超清|蓝光|1080|fhd)/i.test(normalizedLabel)) {
      return VIDEO_QUALITY_LEVELS.ultra;
    }
    if (/(?:高清|720|(?:^|[^a-z])hd(?:$|[^a-z]))/i.test(normalizedLabel)) {
      return VIDEO_QUALITY_LEVELS.high;
    }
    if (/(?:标清|480|540|(?:^|[^a-z])sd(?:$|[^a-z]))/i.test(normalizedLabel)) {
      return VIDEO_QUALITY_LEVELS.standard;
    }
    if (/(?:流畅|省流|极速|360|240|180|(?:^|[^a-z])ld(?:$|[^a-z]))/i.test(normalizedLabel)) {
      return VIDEO_QUALITY_LEVELS.smooth;
    }
    return null;
  }

  function getVideoSources(mediaInfo) {
    const sourcesByQuality = new Map();
    const seenUrls = new Set();
    const fallbackUrls = [];
    const addSource = (value, quality) => {
      const url = typeof value === "string" ? value.trim() : "";
      if (!url) {
        return;
      }

      if (!quality) {
        if (!fallbackUrls.includes(url)) {
          fallbackUrls.push(url);
        }
        return;
      }
      if (seenUrls.has(url)) {
        return;
      }
      seenUrls.add(url);
      const existingSource = sourcesByQuality.get(quality.key);
      if (existingSource) {
        existingSource.urls.push(url);
        return;
      }
      sourcesByQuality.set(quality.key, {
        urls: [url],
        label: quality.label,
        rank: quality.rank
      });
    };

    const playbackList = Array.isArray(mediaInfo.playback_list) ? mediaInfo.playback_list : [];
    playbackList.forEach((item) => {
      addSource(item?.play_info?.url, getPlaybackVideoQuality(item));
    });

    addSource(mediaInfo.stream_url_hd, VIDEO_QUALITY_LEVELS.high);
    addSource(mediaInfo.mp4_hd_url, VIDEO_QUALITY_LEVELS.high);
    addSource(mediaInfo.stream_url, VIDEO_QUALITY_LEVELS.standard);
    addSource(mediaInfo.mp4_sd_url, VIDEO_QUALITY_LEVELS.standard);
    fallbackUrls.forEach((url) => addSource(url, VIDEO_QUALITY_LEVELS.automatic));

    const sources = [...sourcesByQuality.values()]
      .sort((first, second) => second.rank - first.rank)
      .map(({ urls, label }) => ({
        url: urls[0],
        alternates: urls.slice(1),
        label
      }));
    return sources;
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
      const sources = getVideoSources(mediaInfo);
      const source = sources[0]?.url || "";
      if (source) {
        return {
          source,
          sources,
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
    const pageUrl = getSafeLinkHref(pageInfo.page_url || pageInfo.pageUrl || pageInfo.url || "");
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

  function createMetric(label, count, metricKey = label) {
    const metric = document.createElement("span");
    metric.dataset.weiboGridMetric = metricKey;
    metric.textContent = `${label} ${formatCount(count)}`;
    return metric;
  }

  function setMetricLabel(metric, label, count) {
    const text = `${label} ${formatCount(count)}`;
    const labelElement = metric.querySelector?.(".weibo-grid-reader__card-action-label");
    if (labelElement) {
      labelElement.textContent = text;
    } else {
      metric.textContent = text;
    }
  }

  function getNonNegativeCount(value) {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, count) : 0;
  }

  function isStatusLiked(status) {
    const liked = status?.attitudes_status ?? status?.attitude_status ?? status?.liked;
    return liked === true || String(liked) === "1";
  }

  // 评论点赞状态复用微博状态点赞常见的字段命名习惯（liked / attitude_status 系列）；
  // 真实评论响应里具体用哪个字段未核实过，缺失时按未点赞处理，不会误显示成已点赞。
  function isCommentLiked(comment) {
    const liked = comment?.liked ?? comment?.like_status ?? comment?.attitude_status ?? comment?.attitudes_status;
    return liked === true || String(liked) === "1";
  }

  function updateStatusMetric(status, metricKey, label, count) {
    const statusId = getStatusId(status);
    if (!statusId) {
      return;
    }

    document.querySelectorAll(".weibo-grid-reader__card").forEach((card) => {
      if (card.dataset.weiboGridStatusId !== statusId) {
        return;
      }
      const metric = card.querySelector(`[data-weibo-grid-metric="${metricKey}"]`);
      if (metric) {
        setMetricLabel(metric, label, count);
      }
    });
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

  function getFirstSafeLinkHref(values) {
    for (const value of values) {
      if (typeof value !== "string" || !value.trim()) {
        continue;
      }
      const href = getSafeLinkHref(value);
      if (href) {
        return href;
      }
    }
    return "";
  }

  function getStatusLinkMetadata(status) {
    const entries = [];
    const seen = new Set();
    const sources = [
      status?.url_struct,
      status?.urlStruct,
      status?.url_objects,
      status?.urlObjects
    ];

    const addEntry = (value, propertyName = "") => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return;
      }

      const pageInfo = value.page_info || value.pageInfo || {};
      const propertyHref = /^(?:https?:)?\/\//i.test(propertyName)
        ? getSafeLinkHref(propertyName)
        : "";
      const shortHref = getFirstSafeLinkHref([
        value.short_url,
        value.shortUrl,
        value.url_short,
        value.urlShort,
        propertyHref
      ]);
      const href = getFirstSafeLinkHref([
        value.long_url,
        value.longUrl,
        value.ori_url,
        value.oriUrl,
        value.page_url,
        value.pageUrl,
        pageInfo.page_url,
        pageInfo.pageUrl,
        pageInfo.object_url,
        pageInfo.objectUrl,
        value.url,
        shortHref
      ]);
      const label = String(
        value.url_title
        || value.urlTitle
        || value.display_name
        || value.displayName
        || value.title
        || ""
      ).trim();
      if (!href || (!shortHref && !label)) {
        return;
      }

      const tokens = new Set([
        value.short_url,
        value.shortUrl,
        value.url_short,
        value.urlShort,
        propertyHref,
        shortHref,
        href,
        label
      ].map((item) => String(item || "").trim()).filter(Boolean));
      const key = `${href}\n${shortHref}\n${label}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      entries.push({ href, shortHref, label, tokens });
    };

    const visit = (value, depth = 0, propertyName = "") => {
      if (!value || depth > 3) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (typeof value !== "object") {
        return;
      }

      addEntry(value, propertyName);
      Object.entries(value).forEach(([key, item]) => {
        if (item && typeof item === "object") {
          visit(item, depth + 1, key);
        }
      });
    };

    sources.forEach((source) => visit(source));
    return entries;
  }

  function createStatusLinkContext(status) {
    return {
      entries: getStatusLinkMetadata(status),
      rendered: new Set()
    };
  }

  function findStatusLinkMetadata(context, { href = "", label = "", tokens = [] } = {}) {
    if (!context?.entries?.length) {
      return null;
    }

    const normalizedHref = getSafeLinkHref(href);
    const normalizedLabel = String(label || "").trim();
    const normalizedTokens = new Set(
      tokens.map((token) => String(token || "").trim()).filter(Boolean)
    );
    if (href) {
      normalizedTokens.add(String(href).trim());
    }
    if (normalizedHref) {
      normalizedTokens.add(normalizedHref);
    }
    if (normalizedLabel) {
      normalizedTokens.add(normalizedLabel);
    }

    return context.entries.find((entry) => {
      if (context.rendered.has(entry)) {
        return false;
      }
      if (normalizedHref && (entry.href === normalizedHref || entry.shortHref === normalizedHref)) {
        return true;
      }
      if (normalizedLabel && entry.label === normalizedLabel) {
        return true;
      }
      return [...normalizedTokens].some((token) => entry.tokens.has(token));
    }) || null;
  }

  function markStatusLinkMetadataRendered(context, metadata) {
    if (context && metadata) {
      context.rendered.add(metadata);
    }
  }

  function isInlineWebLinkLabel(value) {
    return /^(?:网页链接|網頁鏈接|网页連結|web\s*link)$/i.test(String(value || "").replace(/\s+/g, " ").trim());
  }

  function appendUnrenderedStatusLinks(container, context) {
    if (!context?.entries?.length) {
      return;
    }

    for (const metadata of context.entries) {
      if (context.rendered.has(metadata) || !isInlineWebLinkLabel(metadata.label)) {
        continue;
      }
      if (container.childNodes.length && !/\s$/.test(container.textContent || "")) {
        container.append(" ");
      }
      container.append(createRichLink(metadata.href, metadata.label));
      markStatusLinkMetadataRendered(context, metadata);
    }
  }

  function getRichTextAnchorInfo(anchor, linkContext) {
    const linkTokens = [];
    let href = "";
    for (const attributeName of ["href", "data-url", "data-href"]) {
      const attributeValue = anchor.getAttribute(attributeName) || "";
      if (!attributeValue || attributeValue === "#") {
        continue;
      }
      linkTokens.push(attributeValue);
      const safeHref = getSafeLinkHref(attributeValue);
      if (!href && safeHref) {
        href = safeHref;
      }
    }

    const userCard = anchor.getAttribute("usercard") || anchor.getAttribute("data-usercard") || "";
    const queryStart = userCard.indexOf("?");
    const userCardParams = new URLSearchParams(queryStart >= 0 ? userCard.slice(queryStart + 1) : userCard);
    const userId = anchor.getAttribute("data-user-id")
      || anchor.getAttribute("data-uid")
      || userCardParams.get("id")
      || userCardParams.get("uid")
      || "";
    if (!href && /^\d+$/.test(userId)) {
      href = getProfileUrl({ idstr: userId });
    }

    const userName = userCardParams.get("name") || "";
    if (!href && userName) {
      href = `https://weibo.com/n/${encodeURIComponent(userName)}`;
    }

    const anchorText = anchor.textContent?.trim() || "";
    if (!href && userCard && anchorText.startsWith("@")) {
      const mentionName = anchorText.slice(1).replace(/[：:]$/, "").trim();
      if (mentionName) {
        href = `https://weibo.com/n/${encodeURIComponent(mentionName)}`;
      }
    }

    const metadata = findStatusLinkMetadata(linkContext, {
      href,
      label: anchorText,
      tokens: linkTokens
    });
    return {
      href: href || metadata?.href || "",
      label: metadata?.label
        || anchor.getAttribute("aria-label")
        || anchor.getAttribute("title")
        || "",
      metadata
    };
  }

  function createRichLink(href, textContent = "", preserveReferrer = false) {
    const link = document.createElement("a");
    const imageViewerLink = isNativeImageLink(href);
    link.className = "weibo-grid-reader__rich-link";
    link.href = href;
    link.target = "_blank";
    link.rel = imageViewerLink || preserveReferrer ? "noopener" : "noopener noreferrer";
    link.textContent = textContent;
    link.addEventListener("click", (event) => {
      event.stopPropagation();
      if (
        !imageViewerLink
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }
      event.preventDefault();
      openDetailImagePreview(getImageVariants(href), {
        label: "微博图片放大查看",
        alt: textContent || "微博图片",
        failureText: "图片暂时无法显示，请在新标签页查看",
        referrerPolicy: "unsafe-url",
        variant: "compact"
      });
    });
    return link;
  }

  function normalizeCommentEmojiToken(value) {
    return String(value || "")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/^［/, "[")
      .replace(/］$/, "]")
      .replace(/\s+/g, "")
      .trim();
  }

  function registerDiscoveredCommentEmoji(value, src) {
    const normalizedToken = normalizeCommentEmojiToken(value);
    const match = normalizedToken.match(/^\[([^\[\]]{1,24})\]$/);
    const safeSource = getSafeLinkHref(src);
    if (!match || !safeSource || COMMENT_EMOJI_BY_TOKEN.has(normalizedToken)) {
      return;
    }

    const emoji = Object.freeze({
      name: match[1],
      src: safeSource,
      fallbackSources: Object.freeze([])
    });
    DISCOVERED_COMMENT_EMOJIS.set(normalizedToken, emoji);
    COMMENT_EMOJI_BY_TOKEN.set(normalizedToken, emoji);
  }

  function discoverCommentEmojisFromPage() {
    const selector = [
      'img[src*="face.t.sinajs.cn"]',
      'img[data-src*="face.t.sinajs.cn"]',
      'img[data-original*="face.t.sinajs.cn"]',
      'img[data-lazy-src*="face.t.sinajs.cn"]'
    ].join(",");
    for (const image of document.querySelectorAll(selector)) {
      const token = getRichTextImageAlt(image)
        || image.closest("[title]")?.getAttribute("title")
        || image.closest("[aria-label]")?.getAttribute("aria-label")
        || "";
      registerDiscoveredCommentEmoji(token, getRichTextImageSource(image));
    }
  }

  function getAvailableCommentEmojis() {
    return [...COMMENT_EMOJIS, ...DISCOVERED_COMMENT_EMOJIS.values()];
  }

  function getCommentEmoji(value) {
    const normalizedToken = normalizeCommentEmojiToken(value);
    return COMMENT_EMOJI_BY_TOKEN.get(normalizedToken) || null;
  }

  function createRichEmoji(src, alt = "") {
    const emoji = document.createElement("img");
    emoji.className = "weibo-grid-reader__emoji";
    emoji.alt = alt;
    const fallbackEmoji = getCommentEmoji(alt);
    const sources = [...new Set([
      src,
      fallbackEmoji?.src,
      ...(fallbackEmoji?.fallbackSources || [])
    ].map((value) => getSafeLinkHref(value)).filter(Boolean))];
    let sourceIndex = 0;
    const loadSource = () => {
      emoji.src = sources[sourceIndex] || "";
    };
    emoji.addEventListener("error", () => {
      sourceIndex += 1;
      if (sourceIndex < sources.length) {
        loadSource();
        return;
      }
      emoji.replaceWith(document.createTextNode(emoji.alt));
      scheduleMasonryLayout();
    });
    emoji.addEventListener("load", scheduleMasonryLayout, { once: true });
    loadSource();
    return emoji;
  }

  function getRichTextImageSource(image) {
    return getFirstSafeLinkHref([
      image.getAttribute("src"),
      image.getAttribute("data-src"),
      image.getAttribute("data-original"),
      image.getAttribute("data-original-src"),
      image.getAttribute("data-lazy-src")
    ]);
  }

  function getRichTextImageAlt(image) {
    return image.getAttribute("alt")
      || image.getAttribute("title")
      || image.getAttribute("data-alt")
      || "";
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

  function normalizeImageUrl(value) {
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

  function getImageVariants(value) {
    const original = getSafeLinkHref(value);
    const normalized = normalizeImageUrl(original || value);
    if (!isNativeImageLink(normalized)) {
      return [...new Set([original, normalized].filter(Boolean))];
    }

    const url = new URL(normalized);
    const match = url.pathname.match(/^\/(?:original|large|mw\d+|orj\d+|bmiddle|thumbnail|thumb\d+|small|square|wap\d+)\/(.+)$/i);
    if (!match) {
      return [...new Set([original, url.href].filter(Boolean))];
    }

    const variants = original ? [original] : [];
    for (const size of ["large", "mw2048", "original", "mw1024", "mw690", "bmiddle", "orj360", "thumbnail"]) {
      const candidate = new URL(url.href);
      candidate.pathname = `/${size}/${match[1]}`;
      if (!variants.includes(candidate.href)) {
        variants.push(candidate.href);
      }
    }
    return variants;
  }

  function getCommentImageQualityRank(value) {
    try {
      const pathname = new URL(value, window.location.href).pathname.toLowerCase();
      if (/(?:^|\/)large\//.test(pathname)) {
        return 100;
      }
      if (/(?:^|\/)mw2048\//.test(pathname)) {
        return 95;
      }
      if (/(?:^|\/)original\//.test(pathname)) {
        return 92;
      }
      if (/(?:^|\/)mw1024\//.test(pathname)) {
        return 80;
      }
      if (/(?:^|\/)mw690\//.test(pathname)) {
        return 70;
      }
      if (/(?:^|\/)bmiddle\//.test(pathname)) {
        return 60;
      }
      if (/(?:^|\/)orj\d+\//.test(pathname)) {
        return 50;
      }
      if (/(?:^|\/)(?:thumbnail|thumb\d+|small|square|wap\d+)\//.test(pathname)) {
        return 10;
      }
    } catch {
      return 0;
    }
    return 40;
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
      getImageVariants(directUrl).forEach((variant) => addCommentImageUrl(sources, variant));
    }
    getImageVariants(value).forEach((variant) => addCommentImageUrl(sources, variant));
    return sources
      .map((url, index) => ({ url, index, rank: getCommentImageQualityRank(url) }))
      .sort((first, second) => second.rank - first.rank || first.index - second.index)
      .map(({ url }) => url);
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

  function closeDetailImagePreview(restoreFocus = true) {
    const controller = activeDetailImagePreviewController;
    const layer = controller?.layer
      || document.querySelector(".weibo-grid-reader__comment-image-preview-layer");
    if (!layer) {
      return;
    }

    activeDetailImagePreviewController = null;
    controller?.destroy?.();
    layer.remove();
    document.documentElement.classList.remove("weibo-grid-reader-image-preview-open");
    if (restoreFocus && controller?.returnFocus instanceof HTMLElement && controller.returnFocus.isConnected) {
      controller.returnFocus.focus({ preventScroll: true });
    }
  }

  function openDetailImagePreview(
    imageSources,
    {
      label = "图片放大查看",
      alt = "图片",
      failureText = "图片暂时无法显示",
      referrerPolicy = "",
      variant = "full",
      initialIndex = 0,
      navigable = false
    } = {}
  ) {
    const detailOverlay = getDetailOverlay();
    const previewHost = detailOverlay?.querySelector(".weibo-grid-reader__detail-dialog")
      ? detailOverlay
      : document.body;
    const isStandalone = previewHost === document.body;
    const isCompact = variant === "compact";
    const useCardLayout = isStandalone || isCompact;
    const previewSources = [...new Set(
      (Array.isArray(imageSources) ? imageSources : [])
        .map((source) => getSafeLinkHref(source))
        .filter(Boolean)
    )];

    const returnFocus = document.activeElement;
    closeDetailImagePreview(false);
    const layer = document.createElement("section");
    layer.className = "weibo-grid-reader__comment-image-preview-layer";
    layer.classList.toggle("weibo-grid-reader__comment-image-preview-layer--standalone", isStandalone);
    layer.classList.toggle("weibo-grid-reader__comment-image-preview-layer--compact", isCompact);
    layer.classList.toggle("weibo-grid-reader__comment-image-preview-layer--gallery", navigable && previewSources.length > 1);
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", label);
    layer.tabIndex = -1;
    const viewport = document.createElement("div");
    viewport.className = "weibo-grid-reader__image-preview-viewport";
    const stage = document.createElement("div");
    stage.className = "weibo-grid-reader__image-preview-stage";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "weibo-grid-reader__comment-image-preview-close";
    close.setAttribute("aria-label", "关闭图片预览");
    close.textContent = "×";
    close.addEventListener("click", () => closeDetailImagePreview());

    const toolbar = document.createElement("div");
    toolbar.className = "weibo-grid-reader__image-preview-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "图片缩放工具");
    const createToolbarButton = (text, ariaLabel, title = ariaLabel) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "weibo-grid-reader__image-preview-control";
      button.textContent = text;
      button.setAttribute("aria-label", ariaLabel);
      button.title = title;
      return button;
    };
    const zoomOut = createToolbarButton("−", "缩小图片");
    const fit = createToolbarButton("适应", "完整显示图片", "恢复为适应窗口");
    const zoomIn = createToolbarButton("+", "放大图片");
    toolbar.append(zoomOut, fit, zoomIn);
    zoomOut.disabled = true;
    zoomIn.disabled = true;
    fit.disabled = true;

    const loading = document.createElement("p");
    loading.className = "weibo-grid-reader__image-preview-loading";
    loading.textContent = "正在加载图片…";

    const image = document.createElement("img");
    image.className = "weibo-grid-reader__comment-image-preview-full";
    image.alt = alt;
    image.draggable = false;
    if (referrerPolicy) {
      image.referrerPolicy = referrerPolicy;
    }
    let sourceIndex = Math.min(Math.max(0, initialIndex), Math.max(0, previewSources.length - 1));
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let activePointerId = null;
    let pointerX = 0;
    let pointerY = 0;
    let dragDistance = 0;
    let didDrag = false;
    let suppressImageClickUntil = 0;
    let resizeObserver = null;
    let lastPointerEvent = null;
    const thumbnailButtons = [];

    const thumbnailRail = document.createElement("nav");
    thumbnailRail.className = "weibo-grid-reader__image-preview-thumbnails";
    thumbnailRail.setAttribute("aria-label", "大图预览缩略图");
    thumbnailRail.hidden = !navigable || previewSources.length < 2;
    const imageCounter = document.createElement("span");
    imageCounter.className = "weibo-grid-reader__image-preview-counter";
    imageCounter.setAttribute("aria-live", "polite");
    const thumbnailList = document.createElement("div");
    thumbnailList.className = "weibo-grid-reader__image-preview-thumbnail-list";
    thumbnailRail.append(imageCounter, thumbnailList);

    const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
    const getImageZone = (event) => {
      if (!navigable || scale > 1.001) {
        return "zoom";
      }

      const rect = image.getBoundingClientRect();
      if (!rect.width) {
        return "zoom";
      }

      const relativeX = (event.clientX - rect.left) / rect.width;
      if (relativeX <= 0.2 && sourceIndex > 0) {
        return "previous";
      }
      if (relativeX >= 0.8 && sourceIndex < previewSources.length - 1) {
        return "next";
      }
      return "zoom";
    };
    const updateImageZone = (event) => {
      lastPointerEvent = event;
      const zone = getImageZone(event);
      layer.dataset.imageZone = zone;
      viewport.title = zone === "previous"
        ? "点击查看上一张图片"
        : zone === "next"
          ? "点击查看下一张图片"
          : "点击放大查看";
    };
    const getPanBounds = () => ({
      x: Math.max(0, ((image.clientWidth * scale) - stage.clientWidth) / 2),
      y: Math.max(0, ((image.clientHeight * scale) - stage.clientHeight) / 2)
    });
    const updatePreview = () => {
      const bounds = getPanBounds();
      panX = clamp(panX, -bounds.x, bounds.x);
      panY = clamp(panY, -bounds.y, bounds.y);
      image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
      const isZoomed = scale > 1.001;
      layer.classList.toggle("weibo-grid-reader__comment-image-preview-layer--zoomed", isZoomed);
      zoomOut.disabled = !isZoomed;
      fit.disabled = !isZoomed;
      zoomIn.disabled = scale >= DETAIL_IMAGE_PREVIEW_MAX_SCALE - 0.001;
      if (lastPointerEvent) {
        updateImageZone(lastPointerEvent);
      }
    };
    const layoutFittedImage = () => {
      if (!image.naturalWidth || !image.naturalHeight || !stage.clientWidth || !stage.clientHeight) {
        return;
      }
      const fitRatio = Math.min(
        stage.clientWidth / image.naturalWidth,
        stage.clientHeight / image.naturalHeight
      );
      image.style.width = `${Math.max(1, image.naturalWidth * fitRatio)}px`;
      image.style.height = `${Math.max(1, image.naturalHeight * fitRatio)}px`;
      updatePreview();
    };
    const setScale = (nextScale, clientX = null, clientY = null) => {
      const previousScale = scale;
      scale = clamp(nextScale, 1, DETAIL_IMAGE_PREVIEW_MAX_SCALE);
      if (scale <= 1.001) {
        scale = 1;
        panX = 0;
        panY = 0;
      } else if (previousScale > 0) {
        const stageRect = stage.getBoundingClientRect();
        const centerX = stageRect.left + stageRect.width / 2;
        const centerY = stageRect.top + stageRect.height / 2;
        const offsetX = (clientX ?? centerX) - centerX;
        const offsetY = (clientY ?? centerY) - centerY;
        const scaleChange = scale / previousScale;
        panX = offsetX - ((offsetX - panX) * scaleChange);
        panY = offsetY - ((offsetY - panY) * scaleChange);
      }
      updatePreview();
    };
    const endDrag = (event = null) => {
      if (activePointerId === null) {
        return;
      }
      if (event && image.hasPointerCapture?.(activePointerId)) {
        image.releasePointerCapture(activePointerId);
      }
      if (didDrag) {
        suppressImageClickUntil = performance.now() + 300;
      }
      activePointerId = null;
      didDrag = false;
      layer.classList.remove("weibo-grid-reader__comment-image-preview-layer--dragging");
    };
    const updateThumbnailSelection = () => {
      imageCounter.textContent = `${sourceIndex + 1} / ${previewSources.length}`;
      thumbnailButtons.forEach((button, index) => {
        const isSelected = index === sourceIndex;
        button.classList.toggle("weibo-grid-reader__image-preview-thumbnail--active", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      });
      thumbnailButtons[sourceIndex]?.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
    };
    const showFailure = () => {
      const failure = document.createElement("p");
      failure.className = "weibo-grid-reader__image-preview-error";
      failure.setAttribute("role", "alert");
      failure.append(failureText);
      if (previewSources[0]) {
        const originalLink = document.createElement("a");
        originalLink.href = previewSources[0];
        originalLink.target = "_blank";
        originalLink.rel = "noopener";
        originalLink.textContent = "在新标签页打开原图";
        originalLink.setAttribute("aria-label", "在新标签页打开原图");
        failure.append(document.createElement("br"), originalLink);
      }
      loading.remove();
      image.replaceWith(failure);
      toolbar.hidden = true;
    };
    const loadSource = () => {
      const source = previewSources[sourceIndex];
      if (!source) {
        showFailure();
        return;
      }
      layer.classList.remove("weibo-grid-reader__comment-image-preview-layer--loaded");
      loading.textContent = "正在加载图片…";
      if (!loading.isConnected) {
        stage.prepend(loading);
      }
      updateThumbnailSelection();
      image.src = source;
    };
    const selectSource = (index, focusThumbnail = false) => {
      if (index < 0 || index >= previewSources.length || index === sourceIndex) {
        return;
      }
      endDrag();
      sourceIndex = index;
      scale = 1;
      panX = 0;
      panY = 0;
      layer.dataset.imageZone = "zoom";
      loadSource();
      if (focusThumbnail) {
        thumbnailButtons[index]?.focus({ preventScroll: true });
      }
    };
    if (!thumbnailRail.hidden) {
      previewSources.forEach((source, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "weibo-grid-reader__image-preview-thumbnail";
        button.setAttribute("aria-label", `查看第 ${index + 1} 张图片，共 ${previewSources.length} 张`);
        button.addEventListener("click", () => selectSource(index, true));
        const thumbnail = document.createElement("img");
        thumbnail.src = source;
        thumbnail.alt = "";
        thumbnail.loading = "lazy";
        button.append(thumbnail);
        thumbnailList.append(button);
        thumbnailButtons.push(button);
      });
    }
    image.addEventListener("load", () => {
      loading.remove();
      scale = 1;
      panX = 0;
      panY = 0;
      layer.dataset.imageZone = "zoom";
      layer.classList.add("weibo-grid-reader__comment-image-preview-layer--loaded");
      layoutFittedImage();
      if (lastPointerEvent) {
        updateImageZone(lastPointerEvent);
      }
    });
    image.addEventListener("error", () => {
      if (navigable) {
        loading.textContent = `${failureText}，请选择其他图片`;
        zoomOut.disabled = true;
        fit.disabled = true;
        zoomIn.disabled = true;
        return;
      }
      sourceIndex += 1;
      if (sourceIndex < previewSources.length) {
        loading.textContent = "正在尝试备用图片…";
        loadSource();
        return;
      }
      showFailure();
    });

    zoomOut.addEventListener("click", () => setScale(scale - DETAIL_IMAGE_PREVIEW_ZOOM_STEP));
    zoomIn.addEventListener("click", () => setScale(scale + DETAIL_IMAGE_PREVIEW_ZOOM_STEP));
    fit.addEventListener("click", () => setScale(1));
    image.addEventListener("pointerdown", (event) => {
      if (scale <= 1.001 || event.button !== 0) {
        return;
      }
      event.preventDefault();
      dragDistance = 0;
      didDrag = false;
      activePointerId = event.pointerId;
      pointerX = event.clientX;
      pointerY = event.clientY;
      image.setPointerCapture(event.pointerId);
      layer.classList.add("weibo-grid-reader__comment-image-preview-layer--dragging");
    });
    image.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointerId) {
        return;
      }
      const deltaX = event.clientX - pointerX;
      const deltaY = event.clientY - pointerY;
      dragDistance += Math.hypot(deltaX, deltaY);
      didDrag = dragDistance > 3;
      panX += deltaX;
      panY += deltaY;
      pointerX = event.clientX;
      pointerY = event.clientY;
      updatePreview();
    });
    image.addEventListener("pointerup", endDrag);
    image.addEventListener("pointercancel", endDrag);
    image.addEventListener("lostpointercapture", endDrag);
    layer.addEventListener("wheel", (event) => {
      const origin = event.target instanceof Element ? event.target : null;
      if (!origin?.closest(".weibo-grid-reader__image-preview-viewport")) {
        return;
      }
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      setScale(scale * zoomFactor, event.clientX, event.clientY);
    }, { passive: false });
    viewport.addEventListener("mousemove", updateImageZone);
    viewport.addEventListener("mouseleave", () => {
      lastPointerEvent = null;
      layer.dataset.imageZone = "zoom";
      viewport.title = "点击放大查看";
    });
    layer.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setScale(scale + DETAIL_IMAGE_PREVIEW_ZOOM_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        setScale(scale - DETAIL_IMAGE_PREVIEW_ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        setScale(1);
      } else if (event.key === "ArrowLeft" && sourceIndex > 0) {
        event.preventDefault();
        selectSource(sourceIndex - 1);
      } else if (event.key === "ArrowRight" && sourceIndex < previewSources.length - 1) {
        event.preventDefault();
        selectSource(sourceIndex + 1);
      } else if (event.key === "Tab") {
        const controls = [
          ...thumbnailButtons.filter((button) => !button.hidden),
          zoomOut,
          fit,
          zoomIn,
          close
        ].filter((control) => !control.disabled && !control.hidden);
        const currentIndex = controls.indexOf(document.activeElement);
        if (event.shiftKey && currentIndex <= 0) {
          event.preventDefault();
          controls.at(-1)?.focus();
        } else if (!event.shiftKey && currentIndex === controls.length - 1) {
          event.preventDefault();
          controls[0]?.focus();
        }
      }
    });

    stage.append(loading, image);
    viewport.append(stage);
    if (useCardLayout) {
      viewport.append(thumbnailRail, toolbar, close);
      layer.append(viewport);
    } else {
      layer.append(viewport, thumbnailRail, toolbar, close);
    }
    layer.addEventListener("click", (event) => {
      if (event.target === image) {
        if (performance.now() < suppressImageClickUntil) {
          return;
        }
        lastPointerEvent = event;
        const zone = getImageZone(event);
        if (zone === "previous" || zone === "next") {
          selectSource(sourceIndex + (zone === "previous" ? -1 : 1));
          return;
        }
        setScale(
          scale <= 1.001
            ? 2
            : scale + DETAIL_IMAGE_PREVIEW_ZOOM_STEP * 2,
          event.clientX,
          event.clientY
        );
        return;
      }
      if (event.target === layer || event.target === viewport || event.target === stage) {
        closeDetailImagePreview();
      }
    });
    previewHost.append(layer);
    if (isStandalone) {
      document.documentElement.classList.add("weibo-grid-reader-image-preview-open");
    }
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(layoutFittedImage);
      resizeObserver.observe(viewport);
    }
    activeDetailImagePreviewController = {
      layer,
      returnFocus,
      isStandalone,
      destroy: () => {
        resizeObserver?.disconnect();
        endDrag();
      }
    };
    loadSource();
    close.focus({ preventScroll: true });
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
    button.addEventListener("click", () => openDetailImagePreview(imageSources.slice(sourceIndex), {
      label: "评论图片放大查看",
      alt: "评论图片",
      failureText: "评论图片暂时无法显示",
      referrerPolicy: "unsafe-url",
      variant: "compact"
    }));
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

  function getMentionProfiles(source) {
    const mentions = source?.user_mentions || source?.userMentions || [];
    if (!Array.isArray(mentions)) {
      return new Map();
    }

    const profiles = new Map();
    for (const mention of mentions) {
      const screenName = String(mention?.screen_name || mention?.name || "").trim();
      if (!screenName) {
        continue;
      }

      const profileUrl = getProfileUrl(mention) || `https://weibo.com/n/${encodeURIComponent(screenName)}`;
      profiles.set(screenName.toLocaleLowerCase(), profileUrl);
    }
    return profiles;
  }

  function getMentionHref(name, mentionProfiles) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) {
      return "";
    }

    return mentionProfiles.get(normalizedName.toLocaleLowerCase())
      || `https://weibo.com/n/${encodeURIComponent(normalizedName)}`;
  }

  function getTopicHref(topic) {
    const normalizedTopic = String(topic || "").trim();
    if (!/^#[^#\r\n]+#$/.test(normalizedTopic)) {
      return "";
    }

    return `https://s.weibo.com/weibo?q=${encodeURIComponent(normalizedTopic)}`;
  }

  function appendPlainTextWithLinks(
    container,
    value,
    renderCommentImages = false,
    comment = null,
    mentionSource = null,
    statusLinkContext = null
  ) {
    const source = String(value || "");
    const mentionProfiles = getMentionProfiles(mentionSource);
    const linkContext = statusLinkContext || createStatusLinkContext(mentionSource);
    const inlineLinkLabels = [...new Set(
      linkContext.entries
        .map((entry) => entry.label)
        .filter(isInlineWebLinkLabel)
    )].sort((first, second) => second.length - first.length);
    const escapedInlineLinkLabels = inlineLinkLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const tokenPattern = new RegExp([
      "https?:\\/\\/[^\\s<]+",
      "#[^#\\r\\n]+?#",
      "@[^\\s@：:，,。.!！？!?、；;（）()[\\]{}\"'<>]+",
      "[\\[［][^\\[\\]［］\\r\\n]{1,24}[\\]］]",
      ...escapedInlineLinkLabels
    ].join("|"), "g");
    let previousEnd = 0;

    for (const match of source.matchAll(tokenPattern)) {
      const matchIndex = match.index || 0;
      container.append(source.slice(previousEnd, matchIndex));
      const token = match[0];
      const url = token.startsWith("http") ? getSafeLinkHref(token) : "";
      const topicHref = token.startsWith("#") ? getTopicHref(token) : "";
      const linkMetadata = findStatusLinkMetadata(linkContext, {
        href: url,
        label: isInlineWebLinkLabel(token) ? token : "",
        tokens: [token]
      });
      const emoji = getCommentEmoji(token);
      if (url && renderCommentImages && isWeiboImageLink(url)) {
        container.append(createCommentImagePreview(url, comment));
      } else if (linkMetadata) {
        container.append(createRichLink(
          linkMetadata.href,
          linkMetadata.label || token
        ));
        markStatusLinkMetadataRendered(linkContext, linkMetadata);
      } else if (url) {
        container.append(createRichLink(url, token));
      } else if (topicHref) {
        container.append(createRichLink(topicHref, token));
      } else if (token.startsWith("@")) {
        const mentionName = token.slice(1);
        container.append(createRichLink(getMentionHref(mentionName, mentionProfiles), token));
      } else if (emoji) {
        container.append(createRichEmoji(emoji.src, token));
      } else {
        container.append(token);
      }
      previousEnd = matchIndex + token.length;
    }

    container.append(source.slice(previousEnd));
  }

  function appendRichStatusText(
    container,
    status,
    linkifyText = false,
    renderCommentImages = false,
    comment = null,
    mentionSource = status
  ) {
    const template = document.createElement("template");
    const source = status.text || status.text_raw || "";
    const hideVideoLink = Boolean(getVideoMedia(status));
    const linkContext = createStatusLinkContext(status);
    template.innerHTML = source;

    const appendNodes = (nodes, target, shouldLinkify = linkifyText) => {
      for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = hideVideoLink ? node.textContent.replace(/https?:\/\/\S+/g, "") : node.textContent;
          if (shouldLinkify) {
            appendPlainTextWithLinks(
              target,
              text,
              renderCommentImages,
              comment,
              mentionSource,
              linkContext
            );
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

        if (node.tagName === "IMG") {
          const emojiSource = getRichTextImageSource(node);
          const emojiAlt = getRichTextImageAlt(node);
          registerDiscoveredCommentEmoji(emojiAlt, emojiSource);
          target.append(emojiSource ? createRichEmoji(emojiSource, emojiAlt) : emojiAlt);
          continue;
        }

        if (node.tagName === "A") {
          const anchorInfo = getRichTextAnchorInfo(node, linkContext);
          const href = anchorInfo.href;
          if (href) {
            if (renderCommentImages && isWeiboImageLink(href)) {
              target.append(createCommentImagePreview(href, comment));
              markStatusLinkMetadataRendered(linkContext, anchorInfo.metadata);
              continue;
            }
            const link = createRichLink(href);
            target.append(link);
            appendNodes(node.childNodes, link, false);
            if (!link.textContent?.trim() && anchorInfo.label) {
              link.append(anchorInfo.label);
            }
            markStatusLinkMetadataRendered(linkContext, anchorInfo.metadata);
            continue;
          }
        }

        appendNodes(node.childNodes, target);
      }
    };

    appendNodes(template.content.childNodes, container);
    appendUnrenderedStatusLinks(container, linkContext);
  }

  function appendRichCommentText(container, comment) {
    appendRichStatusText(container, {
      text: comment.text || comment.text_raw || "",
      page_info: null
    }, true, true, comment, comment);
  }

  function populateStatusText(container, status, preserveLayout = false) {
    container.replaceChildren();
    const displayText = getDisplayText(status);
    if ((preserveLayout && status.text) || hasRichStatusText(status)) {
      appendRichStatusText(container, status, true);
    } else {
      const linkContext = createStatusLinkContext(status);
      appendPlainTextWithLinks(container, displayText || "转发微博", false, null, status, linkContext);
      appendUnrenderedStatusLinks(container, linkContext);
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

    const sources = videoMedia.sources?.length
      ? videoMedia.sources
      : [{ url: videoMedia.source, alternates: [], label: "默认" }];
    let activeSourceIndex = Math.max(0, sources.findIndex((source) => (
      source.url === videoMedia.source || source.alternates?.includes(videoMedia.source)
    )));
    let activeSourceUrl = videoMedia.source;
    let sourceChangeVersion = 0;
    let pendingPlaybackState = null;
    let qualitySelect = null;
    let fallbackShown = false;
    const failedSourceIndexes = new Set();
    const failedSourceUrls = new Set();

    const getSourceUrls = (sourceIndex) => {
      const source = sources[sourceIndex];
      return source ? [source.url, ...(source.alternates || [])] : [];
    };

    const getAvailableSourceUrl = (sourceIndex) => (
      getSourceUrls(sourceIndex).find((url) => !failedSourceUrls.has(url)) || ""
    );

    const getPlaybackState = () => ({
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      muted: video.muted,
      playbackRate: video.playbackRate,
      volume: video.volume,
      wasPlaying: !video.paused && !video.ended
    });

    const restorePlaybackState = (playbackState) => {
      video.muted = playbackState.muted;
      video.playbackRate = playbackState.playbackRate;
      video.volume = playbackState.volume;
      if (playbackState.currentTime > 0) {
        const maximumTime = Number.isFinite(video.duration) && video.duration > 0
          ? Math.max(0, video.duration - 0.05)
          : playbackState.currentTime;
        video.currentTime = Math.min(playbackState.currentTime, maximumTime);
      }
      if (playbackState.wasPlaying) {
        video.play().catch(() => {});
      }
    };

    const switchSource = (sourceIndex, playbackState, sourceUrl = getAvailableSourceUrl(sourceIndex)) => {
      const nextSource = sources[sourceIndex];
      if (!nextSource || !sourceUrl) {
        return;
      }

      activeSourceIndex = sourceIndex;
      activeSourceUrl = sourceUrl;
      pendingPlaybackState = pendingPlaybackState || playbackState;
      sourceChangeVersion += 1;
      const currentVersion = sourceChangeVersion;
      if (qualitySelect) {
        qualitySelect.value = String(sourceIndex);
      }
      video.addEventListener("loadedmetadata", () => {
        if (currentVersion !== sourceChangeVersion || !pendingPlaybackState) {
          return;
        }
        const stateToRestore = pendingPlaybackState;
        pendingPlaybackState = null;
        restorePlaybackState(stateToRestore);
      }, { once: true });
      video.src = sourceUrl;
      video.load();
    };

    const showVideoFallback = () => {
      if (fallbackShown) {
        return;
      }
      fallbackShown = true;
      qualitySelect?.remove();
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
    };

    video.addEventListener("loadedmetadata", scheduleMasonryLayout);
    video.addEventListener("error", () => {
      let expectedSourceUrl = activeSourceUrl;
      try {
        expectedSourceUrl = new URL(activeSourceUrl, window.location.href).href;
      } catch {
        expectedSourceUrl = activeSourceUrl;
      }
      const currentSourceUrl = video.currentSrc || video.src;
      if (currentSourceUrl && expectedSourceUrl && currentSourceUrl !== expectedSourceUrl) {
        return;
      }

      failedSourceUrls.add(activeSourceUrl);
      const alternateSourceUrl = getAvailableSourceUrl(activeSourceIndex);
      if (alternateSourceUrl) {
        switchSource(
          activeSourceIndex,
          pendingPlaybackState || getPlaybackState(),
          alternateSourceUrl
        );
        return;
      }

      failedSourceIndexes.add(activeSourceIndex);
      if (qualitySelect?.options[activeSourceIndex]) {
        qualitySelect.options[activeSourceIndex].disabled = true;
      }
      const fallbackSourceIndex = sources.findIndex((source, index) => !failedSourceIndexes.has(index));
      if (fallbackSourceIndex >= 0) {
        switchSource(
          fallbackSourceIndex,
          pendingPlaybackState || getPlaybackState(),
          getAvailableSourceUrl(fallbackSourceIndex)
        );
        return;
      }

      showVideoFallback();
    });

    if (sources.length > 1) {
      qualitySelect = document.createElement("select");
      qualitySelect.className = "weibo-grid-reader__video-quality";
      qualitySelect.setAttribute("aria-label", "选择视频清晰度");
      sources.forEach((source, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = source.label;
        qualitySelect.append(option);
      });
      qualitySelect.value = String(activeSourceIndex);
      qualitySelect.addEventListener("click", (event) => event.stopPropagation());
      qualitySelect.addEventListener("change", () => {
        const sourceIndex = Number(qualitySelect.value);
        if (!Number.isInteger(sourceIndex) || sourceIndex === activeSourceIndex) {
          return;
        }
        switchSource(sourceIndex, pendingPlaybackState || getPlaybackState());
      });
    }

    videoWrap.append(video);
    if (qualitySelect) {
      videoWrap.append(qualitySelect);
    }
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

  function createLinkedActionOption() {
    const label = document.createElement("label");
    label.className = "weibo-grid-reader__linked-action-option";
    label.hidden = true;
    const input = document.createElement("input");
    input.type = "checkbox";
    const text = document.createElement("span");
    label.append(input, text);
    return { label, input, text };
  }

  function createCardInteractions(status) {
    const statusId = getStatusId(status);
    const footer = document.createElement("div");
    footer.className = "weibo-grid-reader__metrics weibo-grid-reader__card-actions";
    footer.setAttribute("aria-label", "微博快捷操作");

    const composer = document.createElement("form");
    composer.className = "weibo-grid-reader__card-composer";
    composer.id = `weibo-grid-reader-card-composer-${statusId}`;
    composer.hidden = true;

    const textarea = document.createElement("textarea");
    textarea.className = "weibo-grid-reader__card-composer-input";
    textarea.name = "comment";
    textarea.rows = 2;
    textarea.maxLength = 140;
    const emojiPicker = createCommentEmojiPicker(textarea, { portal: true });
    const imagePicker = createCommentImagePicker();
    const linkedAction = createLinkedActionOption();

    const formFooter = document.createElement("div");
    formFooter.className = "weibo-grid-reader__card-composer-footer";
    const count = document.createElement("span");
    count.className = "weibo-grid-reader__card-composer-count";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "weibo-grid-reader__card-composer-cancel";
    cancel.textContent = "取消";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "weibo-grid-reader__card-composer-submit";
    formFooter.append(linkedAction.label, count, cancel, submit);
    composer.append(textarea, emojiPicker, imagePicker, formFooter);

    const feedback = document.createElement("p");
    feedback.className = "weibo-grid-reader__card-action-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");

    const createAction = (type, label, metricKey, countValue) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `weibo-grid-reader__card-action weibo-grid-reader__card-action--${type}`;
      button.dataset.weiboGridMetric = metricKey;
      button.append(
        createActionIcon(type, "weibo-grid-reader__card-action-icon"),
        Object.assign(document.createElement("span"), {
          className: "weibo-grid-reader__card-action-label",
          textContent: `${label} ${formatCount(countValue)}`
        })
      );
      return button;
    };

    const repostButton = createAction("repost", "转发", "reposts", status.reposts_count);
    const commentButton = createAction("comment", "评论", "comments", status.comments_count);
    const likeButton = createAction("like", "赞", "attitudes", status.attitudes_count);
    repostButton.setAttribute("aria-controls", composer.id);
    commentButton.setAttribute("aria-controls", composer.id);
    footer.append(repostButton, commentButton, likeButton);

    let activeComposer = "";
    let composerPending = false;
    let attitudePending = false;
    const drafts = { comment: "", repost: "" };
    const linkedActions = { comment: false, repost: false };
    const updateActionLabels = () => {
      const liked = isStatusLiked(status);
      setMetricLabel(repostButton, "转发", status.reposts_count);
      setMetricLabel(commentButton, "评论", status.comments_count);
      setMetricLabel(likeButton, "赞", status.attitudes_count);
      repostButton.setAttribute("aria-label", `转发 ${formatCount(status.reposts_count)}`);
      commentButton.setAttribute("aria-label", `评论 ${formatCount(status.comments_count)}`);
      likeButton.setAttribute("aria-label", `${liked ? "取消点赞" : "点赞"} ${formatCount(status.attitudes_count)}`);
      likeButton.setAttribute("aria-pressed", String(liked));
      likeButton.classList.toggle("weibo-grid-reader__card-action--liked", liked);
      likeButton.classList.toggle("weibo-grid-reader__card-action--pending", attitudePending);
      likeButton.disabled = attitudePending;
    };
    const updateComposer = () => {
      const isOpen = Boolean(activeComposer);
      const text = textarea.value.trim();
      composer.hidden = !isOpen;
      repostButton.classList.toggle("weibo-grid-reader__card-action--active", activeComposer === "repost");
      commentButton.classList.toggle("weibo-grid-reader__card-action--active", activeComposer === "comment");
      repostButton.setAttribute("aria-expanded", String(activeComposer === "repost"));
      commentButton.setAttribute("aria-expanded", String(activeComposer === "comment"));
      repostButton.disabled = composerPending;
      commentButton.disabled = composerPending;
      textarea.disabled = composerPending;
      emojiPicker.querySelector(".weibo-grid-reader__comment-emoji-trigger").disabled = composerPending;
      imagePicker.__weiboGridImagePicker.setDisabled(composerPending || activeComposer === "repost");
      linkedAction.input.disabled = composerPending;
      cancel.disabled = composerPending;
      count.textContent = `${textarea.value.length}/140`;
      if (!isOpen || composerPending) {
        setCommentEmojiPickerOpen(emojiPicker, false);
      }
      if (!isOpen) {
        linkedAction.label.hidden = true;
        return;
      }
      const isRepost = activeComposer === "repost";
      linkedAction.label.hidden = false;
      linkedAction.text.textContent = isRepost ? "同时评论" : "同时转发";
      linkedAction.input.checked = linkedActions[activeComposer];
      const isLinkedAction = linkedActions[activeComposer];
      textarea.placeholder = isRepost ? "说点什么再转发…" : "发布你的评论";
      textarea.setAttribute("aria-label", textarea.placeholder);
      submit.disabled = composerPending
        || imagePicker.__weiboGridImagePicker.isPending()
        || (!text && !imagePicker.__weiboGridImagePicker.getPicId() && (!isRepost || isLinkedAction));
      submit.textContent = composerPending
        ? (isRepost ? "转发中…" : "发布中…")
        : isRepost
          ? (isLinkedAction ? "转发并评论" : (text ? "转发" : "直接转发"))
          : (isLinkedAction ? "评论并转发" : "评论");
    };
    const toggleComposer = (type) => {
      if (activeComposer === type) {
        drafts[type] = textarea.value;
        activeComposer = "";
      } else {
        if (activeComposer) {
          drafts[activeComposer] = textarea.value;
        }
        activeComposer = type;
        textarea.value = drafts[type];
        if (type === "repost") {
          imagePicker.__weiboGridImagePicker.clear();
        }
      }
      updateComposer();
      if (activeComposer) {
        window.requestAnimationFrame(() => textarea.focus());
      }
    };

    likeButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (attitudePending) {
        return;
      }
      const wasLiked = isStatusLiked(status);
      const originalCount = getNonNegativeCount(status.attitudes_count);
      attitudePending = true;
      status.attitudes_status = wasLiked ? 0 : 1;
      status.attitudes_count = Math.max(0, originalCount + (wasLiked ? -1 : 1));
      updateActionLabels();
      updateStatusMetric(status, "attitudes", "赞", status.attitudes_count);
      feedback.textContent = wasLiked ? "正在取消点赞…" : "正在点赞…";
      const result = await bridgeRequest(wasLiked ? "cancel-attitude" : "set-attitude", { statusId });
      attitudePending = false;
      if (!result.ok) {
        status.attitudes_status = wasLiked ? 1 : 0;
        status.attitudes_count = originalCount;
        feedback.textContent = `操作失败：${result.reason || "请稍后重试"}`;
      } else {
        feedback.textContent = wasLiked ? "已取消点赞" : "已点赞";
      }
      updateActionLabels();
      updateStatusMetric(status, "attitudes", "赞", status.attitudes_count);
    });
    repostButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleComposer("repost");
    });
    commentButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleComposer("comment");
    });
    cancel.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!activeComposer || composerPending) {
        return;
      }
      drafts[activeComposer] = "";
      linkedActions[activeComposer] = false;
      textarea.value = "";
      imagePicker.__weiboGridImagePicker.clear();
      activeComposer = "";
      updateComposer();
    });
    composer.addEventListener("click", (event) => event.stopPropagation());
    composer.addEventListener("input", () => {
      if (activeComposer) {
        drafts[activeComposer] = textarea.value;
      }
      updateComposer();
    });
    imagePicker.addEventListener("weibo-image-state", updateComposer);
    linkedAction.input.addEventListener("change", () => {
      if (activeComposer) {
        linkedActions[activeComposer] = linkedAction.input.checked;
      }
      updateComposer();
    });
    composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = textarea.value.trim();
      const action = activeComposer;
      const alsoComment = action === "repost" && linkedActions.repost;
      const alsoRepost = action === "comment" && linkedActions.comment;
      const picId = imagePicker.__weiboGridImagePicker.getPicId();
      if (composerPending || !action || imagePicker.__weiboGridImagePicker.isPending()
        || (action === "comment" && !text && !picId) || (alsoComment && !text)) {
        return;
      }
      composerPending = true;
      updateComposer();
      feedback.textContent = action === "repost" ? "正在转发…" : "正在发布评论…";
      const result = await bridgeRequest(
        action === "repost" ? "create-repost" : "create-comment",
        { statusId, text, picId, alsoComment, alsoRepost }
      );
      composerPending = false;
      if (!result.ok) {
        feedback.textContent = `${action === "repost" ? "转发失败" : "评论发布失败"}：${result.reason || "请稍后重试"}`;
        updateComposer();
        return;
      }
      drafts[action] = "";
      linkedActions[action] = false;
      textarea.value = "";
      imagePicker.__weiboGridImagePicker.clear();
      activeComposer = "";
      if (action === "repost") {
        status.reposts_count = getNonNegativeCount(status.reposts_count) + 1;
        updateStatusMetric(status, "reposts", "转发", status.reposts_count);
        if (alsoComment) {
          status.comments_count = getNonNegativeCount(status.comments_count) + 1;
          updateStatusMetric(status, "comments", "评论", status.comments_count);
        }
        feedback.textContent = alsoComment ? "转发并评论成功" : "转发成功";
      } else {
        status.comments_count = getNonNegativeCount(status.comments_count) + 1;
        updateStatusMetric(status, "comments", "评论", status.comments_count);
        if (alsoRepost) {
          status.reposts_count = getNonNegativeCount(status.reposts_count) + 1;
          updateStatusMetric(status, "reposts", "转发", status.reposts_count);
        }
        feedback.textContent = alsoRepost ? "评论并转发成功" : "评论已发布";
      }
      updateActionLabels();
      updateComposer();
    });
    updateActionLabels();
    updateComposer();
    return { footer, composer, feedback };
  }

  function createStatusCard(status) {
    const card = document.createElement("article");
    card.className = "weibo-grid-reader__card";
    card.dataset.weiboGridStatusId = getStatusId(status);
    card.tabIndex = 0;
    card.setAttribute("role", "article");
    card.setAttribute("aria-label", `${status.user?.screen_name || "微博用户"} 的微博，按 Enter 查看详情`);
    card.addEventListener("click", (event) => {
      if (
        event.defaultPrevented
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
        || event.target.closest("a, button, input, textarea, video, .weibo-grid-reader__video-wrap")
      ) {
        return;
      }

      openDetail(status, card);
    });
    card.addEventListener("keydown", (event) => {
      if (
        (event.key !== "Enter" && event.key !== " ")
        || event.target.closest("a, button, input, textarea, video, .weibo-grid-reader__video-wrap")
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

    if (settings.cardQuickActions) {
      const interactions = createCardInteractions(status);
      card.append(interactions.footer, interactions.composer, interactions.feedback);
    } else {
      const footer = document.createElement("div");
      footer.className = "weibo-grid-reader__metrics";
      footer.append(
        createMetric("转发", status.reposts_count, "reposts"),
        createMetric("评论", status.comments_count, "comments"),
        createMetric("赞", status.attitudes_count, "attitudes")
      );
      card.append(footer);
    }

    return card;
  }

  function createDetailText(status, className = "weibo-grid-reader__detail-text") {
    const text = document.createElement("div");
    text.className = className;
    populateStatusText(text, status, true);
    return text;
  }

  function createDetailImageViewer(initialUrl, alt = "微博图片", navigation = {}) {
    const viewer = document.createElement("div");
    viewer.className = "weibo-grid-reader__detail-image-viewer";
    viewer.tabIndex = 0;
    viewer.setAttribute("role", "button");
    viewer.setAttribute("aria-label", "图片浏览区域，点击放大查看");
    viewer.title = "点击放大查看";
    let lastPointerEvent = null;

    const getImageZone = (event) => {
      if (typeof navigation.onNavigate !== "function") {
        return "zoom";
      }

      const rect = viewer.getBoundingClientRect();
      if (!rect.width) {
        return "zoom";
      }

      const relativeX = (event.clientX - rect.left) / rect.width;
      if (relativeX <= 0.2 && navigation.canNavigate?.("previous") !== false) {
        return "previous";
      }
      if (relativeX >= 0.8 && navigation.canNavigate?.("next") !== false) {
        return "next";
      }
      return "zoom";
    };

    const updateImageZone = (event) => {
      lastPointerEvent = event;
      const zone = getImageZone(event);
      viewer.dataset.imageZone = zone;
      viewer.title = zone === "previous"
        ? "点击查看上一张图片"
        : zone === "next"
          ? "点击查看下一张图片"
          : "点击放大查看";
    };

    const image = document.createElement("img");
    image.className = "weibo-grid-reader__detail-full-image";
    image.alt = alt;

    image.addEventListener("load", () => {
      repositionActiveDetail();
    });
    image.addEventListener("error", () => {
      image.alt = "图片加载失败";
      image.removeAttribute("src");
    }, { once: true });
    const openPreview = () => {
      const source = image.currentSrc || image.src;
      if (!source) {
        return;
      }
      const previewSources = navigation.getPreviewSources?.() || [source];
      openDetailImagePreview(previewSources, {
        label: "微博图片放大查看",
        alt: image.alt || alt,
        failureText: "图片暂时无法显示",
        initialIndex: navigation.getPreviewIndex?.() || 0,
        navigable: previewSources.length > 1
      });
    };
    viewer.addEventListener("click", (event) => {
      if (event.target === image) {
        viewer.focus({ preventScroll: true });
        const zone = viewer.dataset.imageZone;
        if ((zone === "previous" || zone === "next") && typeof navigation.onNavigate === "function") {
          event.preventDefault();
          navigation.onNavigate(zone);
          return;
        }
        openPreview();
      }
    });
    viewer.addEventListener("mousemove", updateImageZone);
    viewer.addEventListener("mouseleave", () => {
      lastPointerEvent = null;
      viewer.dataset.imageZone = "zoom";
      viewer.title = "点击放大查看";
    });
    viewer.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPreview();
      }
    });
    viewer.append(image);

    const setImage = (url, nextAlt = alt) => {
      image.alt = nextAlt;
      image.src = url;
      if (lastPointerEvent) {
        updateImageZone(lastPointerEvent);
      }
    };

    setImage(initialUrl, alt);
    return { element: viewer, setImage };
  }

  function createDetailGallery(pictureUrls) {
    let selectedIndex = 0;
    const viewer = createDetailImageViewer(pictureUrls[0], "微博图片 1", {
      getPreviewSources: () => pictureUrls,
      getPreviewIndex: () => selectedIndex,
      canNavigate: (direction) => direction === "previous"
        ? selectedIndex > 0
        : selectedIndex < pictureUrls.length - 1,
      onNavigate: (direction) => {
        const offset = direction === "previous" ? -1 : 1;
        const nextIndex = selectedIndex + offset;
        if (nextIndex >= 0 && nextIndex < pictureUrls.length) {
          selectImage(nextIndex);
        }
      }
    });
    const rail = document.createElement("nav");
    rail.className = "weibo-grid-reader__detail-thumbnail-rail";
    rail.setAttribute("aria-label", "微博图片缩略图");
    const buttons = [];

    const selectImage = (index) => {
      selectedIndex = index;
      viewer.setImage(pictureUrls[index], `微博图片 ${index + 1}`);
      buttons.forEach((button, buttonIndex) => {
        button.classList.toggle("weibo-grid-reader__detail-thumbnail--active", buttonIndex === index);
        button.setAttribute("aria-pressed", String(buttonIndex === index));
      });
      if (rail.isConnected) {
        buttons[index]?.scrollIntoView({
          block: "nearest",
          inline: "center",
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

  // 详情正文顶部的博主头像 + 昵称头部：让左侧不再一上来就是正文，与卡片头部风格
  // 一致；头像和昵称在有用户 ID 时链接到该博主主页。这块信息此前放在右下角的
  // “资料操作栏”里（连同已删除的“原文”按钮），现统一上移到正文头部。
  function createDetailAuthorHeader(status) {
    const profileUrl = getProfileUrl(status.user);
    const screenName = status.user?.screen_name || "微博用户";

    const header = document.createElement("div");
    header.className = "weibo-grid-reader__detail-author";

    const avatarLink = profileUrl ? document.createElement("a") : document.createElement("span");
    avatarLink.className = "weibo-grid-reader__detail-author-avatar-link";
    if (profileUrl) {
      avatarLink.href = profileUrl;
      avatarLink.target = "_blank";
      avatarLink.rel = "noopener noreferrer";
      avatarLink.setAttribute("aria-label", `打开 ${screenName} 的主页`);
    }

    const avatar = document.createElement("img");
    avatar.className = "weibo-grid-reader__detail-author-avatar";
    avatar.alt = "";
    avatar.src = status.user?.avatar_hd || status.user?.avatar_large || status.user?.profile_image_url || "";
    avatar.addEventListener("error", () => avatarLink.remove(), { once: true });
    avatarLink.append(avatar);

    const name = profileUrl ? document.createElement("a") : document.createElement("strong");
    name.className = "weibo-grid-reader__detail-author-name";
    name.textContent = screenName;
    name.title = screenName;
    if (profileUrl) {
      name.href = profileUrl;
      name.target = "_blank";
      name.rel = "noopener noreferrer";
    }

    header.append(avatarLink, name);
    return header;
  }

  function createDetailPost(status, isRepost = false, media = undefined) {
    const post = document.createElement("article");
    post.className = isRepost
      ? "weibo-grid-reader__detail-repost"
      : "weibo-grid-reader__detail-post";

    if (isRepost) {
      const repostAuthorProfileUrl = getProfileUrl(status.user);
      const repostAuthor = repostAuthorProfileUrl ? document.createElement("a") : document.createElement("strong");
      repostAuthor.className = "weibo-grid-reader__detail-repost-author";
      repostAuthor.textContent = `@${status.user?.screen_name || "原微博作者"}`;
      if (repostAuthorProfileUrl) {
        repostAuthor.href = repostAuthorProfileUrl;
        repostAuthor.target = "_blank";
        repostAuthor.rel = "noopener noreferrer";
      }
      post.append(repostAuthor);
    } else {
      post.append(createDetailAuthorHeader(status));
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
      populateStatusText(text, status, true);
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

  // 官方网页版对评论的“转发”本质仍是转发原微博，只是预填/引用了这条评论内容；
  // 引用格式借鉴微博常见的 //@用户: 内容 转发链写法，未在真实网络面板核实过
  // 官方网页版这里具体拼的什么格式，如果和官方实际预填内容不一致，应据此调整。
  function buildCommentQuoteText(comment) {
    const author = comment.user?.screen_name || "";
    const text = plainText(comment.text_raw || comment.text || "");
    return author ? `//@${author}: ${text}` : text;
  }

  function insertCommentEmoji(textarea, emojiName) {
    const token = `[${emojiName}]`;
    const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
    const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
    const maxLength = textarea.maxLength > 0 ? textarea.maxLength : Number.POSITIVE_INFINITY;
    const availableLength = maxLength - (textarea.value.length - (end - start));
    if (token.length > availableLength) {
      return false;
    }

    textarea.setRangeText(token, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    return true;
  }

  function positionCommentEmojiPanel(panel, trigger) {
    const viewportPadding = 12;
    const panelGap = 6;
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const maxLeft = Math.max(viewportPadding, window.innerWidth - panelRect.width - viewportPadding);
    const left = Math.min(Math.max(viewportPadding, triggerRect.left), maxLeft);
    const preferredTop = triggerRect.bottom + panelGap;
    const top = preferredTop + panelRect.height <= window.innerHeight - viewportPadding
      ? preferredTop
      : Math.max(viewportPadding, triggerRect.top - panelRect.height - panelGap);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function getCommentEmojiPanel(picker) {
    return picker.__weiboGridEmojiPanel
      || picker.querySelector(":scope > .weibo-grid-reader__comment-emoji-panel");
  }

  // 表情面板为固定定位浮层。若把它留在带 transform 的祖先（如详情对话框，其开场
  // 动画 fill-mode 为 both，结束后仍保留 scale(1)）内部，fixed 会以该祖先而非视口作为
  // 包含块，导致按视口坐标计算的 left/top 被整体偏移。这里在展开前把 portal 面板重新
  // 挂到解析出的顶层宿主（详情内为详情遮罩，否则为扩展根节点），使其始终相对视口定位。
  function ensureCommentEmojiPanelHost(panel) {
    if (!panel || panel.dataset.weiboGridEmojiPortal !== "true") {
      return;
    }
    const resolver = panel.__weiboGridResolvePortalHost;
    const host = (typeof resolver === "function" && resolver())
      || getExtensionRoot()
      || document.body;
    if (host && panel.parentNode !== host) {
      host.append(panel);
    }
  }

  function setCommentEmojiPickerOpen(picker, open) {
    const panel = getCommentEmojiPanel(picker);
    const trigger = picker.querySelector(":scope > .weibo-grid-reader__comment-emoji-trigger");
    if (!panel || !trigger) {
      return;
    }
    picker.dataset.open = String(open);
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      ensureCommentEmojiPanelHost(panel);
      positionCommentEmojiPanel(panel, trigger);
    }
  }

  function repositionOpenCommentEmojiPickers() {
    for (const picker of document.querySelectorAll(".weibo-grid-reader__comment-emoji-picker[data-open='true']")) {
      const panel = getCommentEmojiPanel(picker);
      const trigger = picker.querySelector(":scope > .weibo-grid-reader__comment-emoji-trigger");
      if (panel && trigger) {
        positionCommentEmojiPanel(panel, trigger);
      }
    }
  }

  function createCommentEmojiPicker(textarea, { portal = false, resolvePortalHost = null } = {}) {
    const picker = document.createElement("div");
    picker.className = "weibo-grid-reader__comment-emoji-picker";
    picker.dataset.open = "false";

    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "weibo-grid-reader__comment-emoji-trigger";
    summary.setAttribute("aria-label", "添加表情");
    summary.setAttribute("aria-expanded", "false");
    summary.title = "添加表情";
    const summaryIcon = document.createElement("span");
    summaryIcon.setAttribute("aria-hidden", "true");
    summaryIcon.textContent = "☺";
    const summaryLabel = document.createElement("span");
    summaryLabel.textContent = "表情";
    summary.append(summaryIcon, summaryLabel);

    const panel = document.createElement("div");
    panel.className = "weibo-grid-reader__comment-emoji-panel";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "微博表情");
    const panelHeading = document.createElement("strong");
    panelHeading.className = "weibo-grid-reader__comment-emoji-heading";
    panelHeading.textContent = "热门及当前页面表情";
    const grid = document.createElement("div");
    grid.className = "weibo-grid-reader__comment-emoji-grid";
    const status = document.createElement("span");
    status.className = "weibo-grid-reader__comment-emoji-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const renderEmojiOptions = () => {
      discoverCommentEmojisFromPage();
      grid.replaceChildren();
      const emojis = getAvailableCommentEmojis();
      for (const emoji of emojis) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "weibo-grid-reader__comment-emoji-option";
        button.setAttribute("aria-label", `[${emoji.name}]`);
        button.title = `[${emoji.name}]`;
        const image = document.createElement("img");
        image.alt = "";
        image.decoding = "async";
        image.loading = "lazy";
        image.referrerPolicy = "origin";
        const sources = [emoji.src, ...(emoji.fallbackSources || [])];
        let sourceIndex = 0;
        const loadSource = () => {
          image.src = sources[sourceIndex] || "";
        };
        image.addEventListener("error", () => {
          sourceIndex += 1;
          if (sourceIndex < sources.length) {
            loadSource();
            return;
          }
          button.classList.add("weibo-grid-reader__comment-emoji-option--fallback");
          button.textContent = emoji.name;
        });
        loadSource();
        button.append(image);
        button.addEventListener("click", () => {
          if (insertCommentEmoji(textarea, emoji.name)) {
            status.textContent = `已添加[${emoji.name}]`;
          } else {
            status.textContent = `字数已满，无法添加[${emoji.name}]`;
          }
        });
        grid.append(button);
      }
      status.textContent = `已收录 ${emojis.length} 个表情，页面出现的新表情会自动加入`;
    };

    panel.append(panelHeading, grid, status);
    picker.__weiboGridEmojiPanel = panel;
    if (portal) {
      // 卡片为了瀑布流定位带有 transform 且裁切溢出内容；将其表情面板挂到
      // 扩展根节点，固定定位才会相对视口计算，也不会被卡片裁掉。详情对话框同样
      // 带 transform，需通过 resolvePortalHost 指向详情遮罩，避免面板被对话框的
      // 包含块整体偏移。宿主延迟到展开时由 ensureCommentEmojiPanelHost 解析并挂载：
      // 既兼容面板先于遮罩创建的情况，也让从未展开的面板保持游离、随所属 picker
      // 一起被回收，不会在持久的宿主节点里堆积隐藏残留。
      panel.dataset.weiboGridEmojiPortal = "true";
      panel.__weiboGridEmojiPicker = picker;
      panel.__weiboGridResolvePortalHost = typeof resolvePortalHost === "function"
        ? resolvePortalHost
        : () => getExtensionRoot() || document.body;
      picker.append(summary);
    } else {
      picker.append(summary, panel);
    }
    summary.addEventListener("click", () => {
      const open = picker.dataset.open !== "true";
      for (const otherPicker of document.querySelectorAll(".weibo-grid-reader__comment-emoji-picker[data-open='true']")) {
        if (otherPicker !== picker) {
          setCommentEmojiPickerOpen(otherPicker, false);
        }
      }
      if (open) {
        renderEmojiOptions();
      }
      setCommentEmojiPickerOpen(picker, open);
    });
    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setCommentEmojiPickerOpen(picker, false);
        summary.focus();
      }
    });
    return picker;
  }

  function createCommentImagePicker() {
    const picker = document.createElement("div");
    picker.className = "weibo-grid-reader__comment-image-picker";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".jpg, .jpeg, .bmp, .gif, .png, .heif, .heic";
    input.hidden = true;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "weibo-grid-reader__comment-image-trigger";
    button.setAttribute("aria-label", "添加图片");
    button.title = "添加图片";
    button.append(Object.assign(document.createElement("span"), {
      className: "weibo-grid-reader__comment-image-trigger-icon",
      textContent: "▧"
    }), Object.assign(document.createElement("span"), {
      textContent: "图片"
    }));
    const preview = document.createElement("div");
    preview.className = "weibo-grid-reader__comment-image-preview-box";
    preview.hidden = true;
    const image = document.createElement("img");
    image.className = "weibo-grid-reader__comment-image-preview-thumb";
    image.alt = "待发送的评论图片";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "weibo-grid-reader__comment-image-remove";
    remove.setAttribute("aria-label", "移除图片");
    remove.title = "移除图片";
    remove.textContent = "×";
    const status = document.createElement("span");
    status.className = "weibo-grid-reader__comment-image-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    preview.append(image, remove, status);
    picker.append(input, button, preview);

    let objectUrl = "";
    let pid = "";
    let pending = false;
    let requestVersion = 0;
    const updatePreview = () => {
      preview.hidden = !objectUrl;
      image.src = objectUrl || "";
      picker.classList.toggle("weibo-grid-reader__comment-image-picker--ready", Boolean(pid));
      picker.classList.toggle("weibo-grid-reader__comment-image-picker--pending", pending);
    };
    const clear = () => {
      requestVersion += 1;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = "";
      pid = "";
      pending = false;
      input.value = "";
      status.textContent = "";
      updatePreview();
      picker.dispatchEvent(new Event("weibo-image-state"));
    };
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!button.disabled && !pending) input.click();
    });
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      clear();
    });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      pid = "";
      pending = true;
      const version = ++requestVersion;
      status.textContent = "正在上传图片…";
      updatePreview();
      const result = await bridgeRequest("upload-comment-image", { file });
      if (version !== requestVersion) return;
      pending = false;
      if (!result.ok || !result.payload?.pid) {
        pid = "";
        status.textContent = `图片上传失败：${result.reason || "请稍后重试"}`;
      } else {
        pid = String(result.payload.pid);
        status.textContent = "图片已就绪";
      }
      updatePreview();
      picker.dispatchEvent(new Event("weibo-image-state"));
    });
    picker.__weiboGridImagePicker = {
      getPicId: () => pid,
      isPending: () => pending,
      clear,
      setDisabled: (disabled) => {
        button.disabled = disabled;
        remove.disabled = disabled;
      }
    };
    updatePreview();
    return picker;
  }

  function clearCommentImagePickers(root) {
    if (!root?.querySelectorAll) {
      return;
    }
    root.querySelectorAll(".weibo-grid-reader__comment-image-picker").forEach((picker) => {
      picker.__weiboGridImagePicker?.clear?.();
    });
  }

  function cleanupCommentTransientPickers(root) {
    if (!root?.querySelectorAll) {
      return;
    }
    root.querySelectorAll(".weibo-grid-reader__comment-emoji-picker").forEach((picker) => {
      const panel = getCommentEmojiPanel(picker);
      setCommentEmojiPickerOpen(picker, false);
      if (panel && panel.parentNode !== picker) {
        panel.remove();
      }
    });
    clearCommentImagePickers(root);
  }

  // 评论下的内联回复框：紧跟在该评论行后面展开，提交后追加一条新回复评论。
  // 提交成功后整体刷新评论列表，保证嵌套结构、
  // 楼中楼作者高亮等渲染逻辑与首次加载一致，不必单独维护局部 DOM 插入逻辑。
  function createInlineReplyForm(status, comment, comments, detailInteractions, onDone) {
    const statusId = getStatusId(status);
    const commentId = getCommentId(comment);
    const form = document.createElement("form");
    form.className = "weibo-grid-reader__comment-inline-reply-form";

    const textarea = document.createElement("textarea");
    textarea.className = "weibo-grid-reader__comment-inline-reply-input";
    textarea.rows = 2;
    textarea.maxLength = 140;
    textarea.placeholder = `回复 @${comment.user?.screen_name || "微博用户"}`;

    const emojiPicker = createCommentEmojiPicker(textarea, {
      portal: true,
      resolvePortalHost: () => getDetailOverlay() || getExtensionRoot() || document.body
    });
    const imagePicker = createCommentImagePicker();

    const footer = document.createElement("div");
    footer.className = "weibo-grid-reader__comment-inline-reply-footer";
    const feedback = document.createElement("span");
    feedback.className = "weibo-grid-reader__comment-inline-reply-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    const count = document.createElement("span");
    count.className = "weibo-grid-reader__comment-inline-reply-count";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "回复";
    footer.append(feedback, count, cancel, submit);
    form.append(textarea, emojiPicker, imagePicker, footer);

    let pending = false;
    const updateReplyComposer = () => {
      count.textContent = `${textarea.value.length}/140`;
      imagePicker.__weiboGridImagePicker.setDisabled(pending);
      submit.disabled = pending
        || imagePicker.__weiboGridImagePicker.isPending()
        || (!textarea.value.trim() && !imagePicker.__weiboGridImagePicker.getPicId());
      if (pending) {
        setCommentEmojiPickerOpen(emojiPicker, false);
      }
    };
    cancel.addEventListener("click", () => {
      if (pending) {
        return;
      }
      imagePicker.__weiboGridImagePicker.clear();
      onDone();
    });
    form.addEventListener("click", (event) => event.stopPropagation());
    textarea.addEventListener("input", updateReplyComposer);
    imagePicker.addEventListener("weibo-image-state", updateReplyComposer);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = textarea.value.trim();
      const picId = imagePicker.__weiboGridImagePicker.getPicId();
      if (pending || (!text && !picId) || imagePicker.__weiboGridImagePicker.isPending()) {
        return;
      }

      pending = true;
      textarea.disabled = true;
      cancel.disabled = true;
      feedback.textContent = "正在回复…";
      updateReplyComposer();

      const result = await bridgeRequest("create-comment-reply", {
        statusId,
        parentCommentId: commentId,
        text,
        picId
      });
      pending = false;

      if (!result.ok) {
        textarea.disabled = false;
        cancel.disabled = false;
        feedback.textContent = `回复失败：${result.reason || "请稍后重试"}`;
        updateReplyComposer();
        return;
      }

      status.comments_count = getNonNegativeCount(status.comments_count) + 1;
      updateStatusMetric(status, "comments", "评论", status.comments_count);
      imagePicker.__weiboGridImagePicker.clear();
      void loadDetailComments(status, comments, detailInteractions);
      onDone();
    });

    updateReplyComposer();
    window.requestAnimationFrame(() => textarea.focus());
    return form;
  }

  // 每条评论都有独立的头部行：左侧是用户名或“博主”标签，右侧是转发/评论/点赞
  // 图标簇。按钮处于正常文档流，不覆盖正文或嵌套回复；悬停评论行任意位置满
  // COMMENT_ACTIONS_REVEAL_DELAY_MS 后三个按钮一起淡入。
  function attachCommentZones(commentRow, status, comment, comments, detailInteractions) {
    const rowContent = commentRow.querySelector(":scope > .weibo-grid-reader__comment-content");
    const rowHeader = rowContent?.querySelector(":scope > .weibo-grid-reader__comment-header");
    if (!rowHeader) {
      return;
    }
    const zoneBar = document.createElement("div");
    zoneBar.className = "weibo-grid-reader__comment-zone-bar";

    let attitudePending = false;
    let replyFormOpen = false;

    const likeZone = createCommentZone("like", () => {
      if (attitudePending) {
        return;
      }
      const wasLiked = isCommentLiked(comment);
      attitudePending = true;
      likeZone.classList.toggle("weibo-grid-reader__comment-zone--liked", !wasLiked);

      const commentId = getCommentId(comment);
      void bridgeRequest(wasLiked ? "cancel-comment-like" : "set-comment-like", { commentId }).then((result) => {
        attitudePending = false;
        if (!result.ok) {
          likeZone.classList.toggle("weibo-grid-reader__comment-zone--liked", wasLiked);
          likeZone.title = `操作失败：${result.reason || "请稍后重试"}`;
          return;
        }
        comment.liked = !wasLiked;
        likeZone.title = !wasLiked ? "取消点赞" : "点赞";
      });
    });
    likeZone.classList.toggle("weibo-grid-reader__comment-zone--liked", isCommentLiked(comment));
    likeZone.title = isCommentLiked(comment) ? "取消点赞" : "点赞";

    const commentZone = createCommentZone("comment", () => {
      if (replyFormOpen) {
        return;
      }
      replyFormOpen = true;
      const form = createInlineReplyForm(status, comment, comments, detailInteractions, () => {
        cleanupCommentTransientPickers(form);
        form.remove();
        replyFormOpen = false;
      });
      const content = commentRow.querySelector(":scope > .weibo-grid-reader__comment-content");
      const replies = content?.querySelector(":scope > .weibo-grid-reader__comment-replies");
      if (replies) {
        replies.before(form);
      } else {
        content?.append(form);
      }
    });

    const repostZone = createCommentZone("repost", () => {
      detailInteractions.openRepostWithQuote(buildCommentQuoteText(comment));
    });

    const zones = [repostZone, commentZone, likeZone];
    zones.forEach((zone) => zoneBar.append(zone));

    // mouseover/mouseout 会冒泡，因此用离事件目标最近的评论行判断事件归属：鼠标
    // 落在嵌套回复时只显现该回复自己的按钮，不会同时激活包含它的父评论。
    let revealTimer = 0;
    const getClosestCommentRow = (target) => {
      if (!(target instanceof Element) || target.closest(".weibo-grid-reader__comment-inline-reply-form")) {
        return null;
      }
      return target.closest(".weibo-grid-reader__comment");
    };

    commentRow.addEventListener("mouseover", (event) => {
      if (
        getClosestCommentRow(event.target) !== commentRow
        || getClosestCommentRow(event.relatedTarget) === commentRow
      ) {
        return;
      }
      if (revealTimer) {
        window.clearTimeout(revealTimer);
      }
      revealTimer = window.setTimeout(() => {
        revealTimer = 0;
        zoneBar.classList.add("weibo-grid-reader__comment-zone-bar--revealed");
      }, COMMENT_ACTIONS_REVEAL_DELAY_MS);
    });

    commentRow.addEventListener("mouseout", (event) => {
      if (
        getClosestCommentRow(event.target) !== commentRow
        || getClosestCommentRow(event.relatedTarget) === commentRow
      ) {
        return;
      }
      if (revealTimer) {
        window.clearTimeout(revealTimer);
        revealTimer = 0;
      }
      zoneBar.classList.remove("weibo-grid-reader__comment-zone-bar--revealed");
    });

    rowHeader.append(zoneBar);
  }

  function createCommentZone(type, onClick) {
    const zone = document.createElement("button");
    zone.type = "button";
    zone.className = `weibo-grid-reader__comment-zone weibo-grid-reader__comment-zone--${type}`;
    zone.append(createCommentZoneIcon(type));
    zone.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return zone;
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
    content.className = "weibo-grid-reader__comment-content";
    const header = document.createElement("div");
    header.className = "weibo-grid-reader__comment-header";
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
      appendPlainTextWithLinks(text, comment.text_raw || plainText(comment.text), true, comment, comment);
    }
    if (isPostAuthorReply) {
      const authorBadge = document.createElement("span");
      authorBadge.className = "weibo-grid-reader__comment-author-badge";
      authorBadge.textContent = "博主";
      authorBadge.title = comment.user?.screen_name || "微博博主";
      header.append(authorBadge);
    } else {
      header.append(name);
    }
    content.append(header, text);

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
    // 把原始评论数据挂在 DOM 上，供悬停区的转发/评论/点赞回调使用
    item.__weiboGridComment = comment;
    return item;
  }

  // className 前缀由调用方决定，同一套图标几何形状同时供详情顶部的转发/评论/点赞
  // 按钮和评论行悬停区域的图标复用，避免维护两份重复的 SVG 路径。
  function createActionIcon(type, iconClassName) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add(iconClassName, `${iconClassName}--${type}`);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("stroke-width", "1.8");

    const addPath = (d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
    };

    if (type === "repost") {
      addPath("M7 7h9.5l-2.8-2.8");
      addPath("M17 7l-3.3 3.3");
      addPath("M17 17H7.5l2.8 2.8");
      addPath("M7 17l3.3-3.3");
      addPath("M17 7c2.2 0 3 1.8 3 4v.5");
      addPath("M7 17c-2.2 0-3-1.8-3-4v-.5");
      return svg;
    }

    if (type === "comment") {
      addPath("M5 5.5h14v10H10l-5 3.5v-13.5Z");
      addPath("M8.5 10.5h7");
      return svg;
    }

    addPath("M12 20s-7-4.4-7-9.2C5 8 6.8 6.5 8.9 6.5c1.3 0 2.5.7 3.1 1.8.6-1.1 1.8-1.8 3.1-1.8 2.1 0 3.9 1.5 3.9 4.3C19 15.6 12 20 12 20Z");
    return svg;
  }

  function createDetailActionIcon(type) {
    return createActionIcon(type, "weibo-grid-reader__detail-action-icon");
  }

  function createCommentZoneIcon(type) {
    return createActionIcon(type, "weibo-grid-reader__comment-zone-icon");
  }

  function createDetailInteractions(status, heading, comments, contextKey = getStatusId(status)) {
    const statusId = getStatusId(status);
    const composerId = `weibo-grid-reader-detail-composer-${contextKey || statusId || "current"}`;
    const interactions = document.createElement("div");
    interactions.className = "weibo-grid-reader__detail-interactions";

    const actionBar = document.createElement("div");
    actionBar.className = "weibo-grid-reader__detail-actions";

    const repostButton = document.createElement("button");
    repostButton.type = "button";
    repostButton.className = "weibo-grid-reader__detail-action weibo-grid-reader__detail-repost";
    repostButton.setAttribute("aria-controls", composerId);
    repostButton.append(createDetailActionIcon("repost"));

    const commentButton = document.createElement("button");
    commentButton.type = "button";
    commentButton.className = "weibo-grid-reader__detail-action weibo-grid-reader__detail-comment";
    commentButton.setAttribute("aria-controls", composerId);
    commentButton.append(createDetailActionIcon("comment"));

    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "weibo-grid-reader__detail-action weibo-grid-reader__detail-like";
    likeButton.append(createDetailActionIcon("like"));

    const feedback = document.createElement("p");
    feedback.className = "weibo-grid-reader__detail-action-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");

    const commentForm = document.createElement("form");
    commentForm.id = composerId;
    commentForm.className = "weibo-grid-reader__comment-form";
    commentForm.hidden = true;
    const textarea = document.createElement("textarea");
    textarea.className = "weibo-grid-reader__comment-input";
    textarea.name = "comment";
    textarea.rows = 3;
    textarea.maxLength = 140;
    const emojiPicker = createCommentEmojiPicker(textarea, {
      portal: true,
      resolvePortalHost: () => getDetailOverlay() || getExtensionRoot() || document.body
    });
    const imagePicker = createCommentImagePicker();
    const linkedAction = createLinkedActionOption();
    const formMeta = document.createElement("div");
    formMeta.className = "weibo-grid-reader__comment-form-meta";
    const formFooter = document.createElement("div");
    formFooter.className = "weibo-grid-reader__comment-form-footer";
    const count = document.createElement("span");
    count.className = "weibo-grid-reader__comment-form-count";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "weibo-grid-reader__detail-composer-cancel";
    cancel.textContent = "取消";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "weibo-grid-reader__comment-submit";
    formMeta.append(emojiPicker, imagePicker, linkedAction.label, count);
    formFooter.append(cancel, submit);
    commentForm.append(textarea, formMeta, formFooter);

    let attitudePending = false;
    let composerPending = false;
    let activeComposer = "";
    const drafts = { comment: "", repost: "" };
    const linkedActions = { comment: false, repost: false };
    const updateCommentHeading = () => {
      heading.textContent = `评论 ${formatCount(status.comments_count)}`;
    };
    const updateActionLabels = () => {
      const liked = isStatusLiked(status);
      repostButton.setAttribute("aria-label", `转发 ${formatCount(status.reposts_count)}`);
      repostButton.title = `转发 ${formatCount(status.reposts_count)}`;
      commentButton.setAttribute("aria-label", `评论 ${formatCount(status.comments_count)}`);
      commentButton.title = `评论 ${formatCount(status.comments_count)}`;
      likeButton.classList.toggle("weibo-grid-reader__detail-like--active", liked);
      likeButton.classList.toggle("weibo-grid-reader__detail-like--pending", attitudePending);
      likeButton.disabled = attitudePending;
      likeButton.setAttribute("aria-pressed", String(liked));
      likeButton.setAttribute("aria-label", `${liked ? "已赞" : "赞"} ${formatCount(status.attitudes_count)}`);
      likeButton.title = `${liked ? "已赞" : "赞"} ${formatCount(status.attitudes_count)}`;
    };
    const updateComposer = () => {
      const hasActiveComposer = Boolean(activeComposer);
      const text = textarea.value.trim();
      commentForm.hidden = !hasActiveComposer;
      repostButton.classList.toggle("weibo-grid-reader__detail-action--active", activeComposer === "repost");
      commentButton.classList.toggle("weibo-grid-reader__detail-action--active", activeComposer === "comment");
      repostButton.setAttribute("aria-expanded", String(activeComposer === "repost"));
      commentButton.setAttribute("aria-expanded", String(activeComposer === "comment"));
      repostButton.disabled = composerPending;
      commentButton.disabled = composerPending;
      textarea.disabled = composerPending;
      emojiPicker.querySelector(".weibo-grid-reader__comment-emoji-trigger").disabled = composerPending;
      imagePicker.__weiboGridImagePicker.setDisabled(composerPending || activeComposer === "repost");
      linkedAction.input.disabled = composerPending;
      cancel.disabled = composerPending;
      count.textContent = `${textarea.value.length}/140`;
      if (!hasActiveComposer || composerPending) {
        setCommentEmojiPickerOpen(emojiPicker, false);
      }

      if (!hasActiveComposer) {
        linkedAction.label.hidden = true;
        return;
      }

      const isRepost = activeComposer === "repost";
      linkedAction.label.hidden = false;
      linkedAction.text.textContent = isRepost ? "同时评论" : "同时转发";
      linkedAction.input.checked = linkedActions[activeComposer];
      const isLinkedAction = linkedActions[activeComposer];
      textarea.placeholder = isRepost ? "说点什么再转发…" : "发布你的评论";
      textarea.setAttribute("aria-label", textarea.placeholder);
      submit.disabled = composerPending
        || imagePicker.__weiboGridImagePicker.isPending()
        || (!text && !imagePicker.__weiboGridImagePicker.getPicId() && (!isRepost || isLinkedAction));
      submit.textContent = composerPending
        ? (isRepost ? "转发中…" : "发布中…")
        : isRepost
          ? (isLinkedAction ? "转发并评论" : (text ? "转发" : "直接转发"))
          : (isLinkedAction ? "评论并转发" : "评论");
    };
    const toggleComposer = (type) => {
      if (activeComposer === type) {
        drafts[type] = textarea.value;
        activeComposer = "";
      } else {
        if (activeComposer) {
          drafts[activeComposer] = textarea.value;
        }
        activeComposer = type;
        textarea.value = drafts[type];
        if (type === "repost") {
          imagePicker.__weiboGridImagePicker.clear();
        }
      }
      updateComposer();
      if (activeComposer) {
        window.requestAnimationFrame(() => textarea.focus());
      }
    };

    likeButton.addEventListener("click", async () => {
      if (attitudePending) {
        return;
      }

      const wasLiked = isStatusLiked(status);
      const originalCount = getNonNegativeCount(status.attitudes_count);
      attitudePending = true;
      status.attitudes_status = wasLiked ? 0 : 1;
      status.attitudes_count = Math.max(0, originalCount + (wasLiked ? -1 : 1));
      updateActionLabels();
      updateStatusMetric(status, "attitudes", "赞", status.attitudes_count);
      feedback.textContent = wasLiked ? "正在取消点赞…" : "正在点赞…";

      const result = await bridgeRequest(
        wasLiked ? "cancel-attitude" : "set-attitude",
        { statusId }
      );

      attitudePending = false;
      if (!result.ok) {
        status.attitudes_status = wasLiked ? 1 : 0;
        status.attitudes_count = originalCount;
        feedback.textContent = `操作失败：${result.reason || "请稍后重试"}`;
      } else {
        feedback.textContent = wasLiked ? "已取消点赞" : "已点赞";
      }
      updateActionLabels();
      updateStatusMetric(status, "attitudes", "赞", status.attitudes_count);
    });

    repostButton.addEventListener("click", () => toggleComposer("repost"));
    commentButton.addEventListener("click", () => toggleComposer("comment"));
    cancel.addEventListener("click", () => {
      if (!activeComposer || composerPending) {
        return;
      }
      drafts[activeComposer] = "";
      linkedActions[activeComposer] = false;
      textarea.value = "";
      imagePicker.__weiboGridImagePicker.clear();
      activeComposer = "";
      updateComposer();
    });
    textarea.addEventListener("input", () => {
      if (activeComposer) {
        drafts[activeComposer] = textarea.value;
      }
      updateComposer();
    });
    imagePicker.addEventListener("weibo-image-state", updateComposer);
    linkedAction.input.addEventListener("change", () => {
      if (activeComposer) {
        linkedActions[activeComposer] = linkedAction.input.checked;
      }
      updateComposer();
    });
    commentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = textarea.value.trim();
      const action = activeComposer;
      const alsoComment = action === "repost" && linkedActions.repost;
      const alsoRepost = action === "comment" && linkedActions.comment;
      const picId = imagePicker.__weiboGridImagePicker.getPicId();
      if (composerPending || !action || imagePicker.__weiboGridImagePicker.isPending()
        || (action === "comment" && !text && !picId) || (alsoComment && !text)) {
        return;
      }

      composerPending = true;
      updateComposer();
      feedback.textContent = action === "repost" ? "正在转发…" : "正在发布评论…";
      const result = await bridgeRequest(
        action === "repost" ? "create-repost" : "create-comment",
        { statusId, text, picId, alsoComment, alsoRepost }
      );
      composerPending = false;

      if (!result.ok) {
        feedback.textContent = `${action === "repost" ? "转发失败" : "评论发布失败"}：${result.reason || "请稍后重试"}`;
        updateComposer();
        return;
      }

      drafts[action] = "";
      linkedActions[action] = false;
      textarea.value = "";
      imagePicker.__weiboGridImagePicker.clear();
      activeComposer = "";
      if (action === "repost") {
        status.reposts_count = getNonNegativeCount(status.reposts_count) + 1;
        updateStatusMetric(status, "reposts", "转发", status.reposts_count);
        if (alsoComment) {
          status.comments_count = getNonNegativeCount(status.comments_count) + 1;
          updateCommentHeading();
          updateStatusMetric(status, "comments", "评论", status.comments_count);
          void loadDetailComments(status, comments, api);
        }
        feedback.textContent = alsoComment ? "转发并评论成功" : "转发成功";
      } else {
        status.comments_count = getNonNegativeCount(status.comments_count) + 1;
        updateCommentHeading();
        updateStatusMetric(status, "comments", "评论", status.comments_count);
        if (alsoRepost) {
          status.reposts_count = getNonNegativeCount(status.reposts_count) + 1;
          updateStatusMetric(status, "reposts", "转发", status.reposts_count);
        }
        feedback.textContent = alsoRepost ? "评论并转发成功" : "评论已发布";
        void loadDetailComments(status, comments, api);
      }
      updateActionLabels();
      updateComposer();
    });

    updateActionLabels();
    updateComposer();
    actionBar.append(repostButton, commentButton, likeButton);
    interactions.append(actionBar, commentForm, feedback);

    // 供评论行左侧“转发”悬停区调用：复用同一个转发框，预填引用文本，
    // 而不是另外实现一套转发逻辑（官方网页版对评论的“转发”本质仍是转发原微博）。
    // 引用文本用 textarea.value = ... 程序化赋值，浏览器不会像用户输入那样自动
    // 截断到 maxLength；若原评论较长，拼出的引用可能超过 140 字，原生表单校验会
    // 因为“值超出 maxlength”静默拒绝提交（点击“转发”按钮没有任何反应），因此
    // 这里主动裁剪到 maxLength，保证一定能提交成功。
    const openRepostWithQuote = (quoteText) => {
      const clippedQuoteText = quoteText.length > textarea.maxLength
        ? `${quoteText.slice(0, textarea.maxLength - 1)}…`
        : quoteText;
      if (activeComposer !== "repost") {
        drafts.repost = clippedQuoteText;
        activeComposer = "repost";
      } else {
        drafts.repost = clippedQuoteText;
      }
      textarea.value = clippedQuoteText;
      updateComposer();
      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(0, 0);
      });
    };

    // api 需要在 submit 回调触发前就存在（回调是异步的，实际执行时早已定义完毕，
    // 这里只是让声明顺序更直观），供评论区悬停操作和自身刷新评论列表复用同一份接口。
    const api = { interactions, openRepostWithQuote };
    return api;
  }

  function renderDetailComments(status, comments, detailInteractions, state) {
    comments.replaceChildren();
    state.commentsAvailable = state.error ? true : state.comments.length > 0;
    state.onVisibilityChange?.();
    state.loadMoreSentinel.hidden = !state.hasMore || state.loading || Boolean(state.error);
    if (!state.comments.length) {
      const empty = document.createElement("p");
      empty.className = "weibo-grid-reader__comment-empty";
      empty.textContent = state.error || "暂时没有可展示的评论";
      comments.append(empty);
      repositionActiveDetail();
      return;
    }

    const commentsById = indexComments(state.comments);
    const renderedCommentIds = new Set();
    const postAuthorId = String(status.user?.idstr || status.user?.id || "");
    const commentItems = state.comments
      .map((comment) => createCommentItem(comment, commentsById, renderedCommentIds, postAuthorId))
      .filter(Boolean);
    comments.append(...commentItems);

    const attachZonesRecursively = (row) => {
      const commentData = row.__weiboGridComment;
      if (commentData) {
        attachCommentZones(row, status, commentData, comments, detailInteractions);
      }
      const nestedRows = row.querySelectorAll(":scope > .weibo-grid-reader__comment-content > .weibo-grid-reader__comment-replies > .weibo-grid-reader__comment");
      nestedRows.forEach(attachZonesRecursively);
    };
    commentItems.forEach(attachZonesRecursively);
    repositionActiveDetail();
  }

  async function loadDetailComments(status, comments, detailInteractions, append = false) {
    const statusId = getStatusId(status);
    const state = detailCommentStates.get(comments);
    if (!state || state.loading || (append && !state.hasMore)) {
      return;
    }

    const requestVersion = state.requestVersion + 1;
    const requestedMaxId = append ? state.maxId : "";
    state.requestVersion = requestVersion;
    state.loading = true;
    state.error = "";
    comments.dataset.weiboGridLoadVersion = String(requestVersion);
    state.loadMoreSentinel.hidden = true;
    const result = await bridgeRequest("fetch-comments", {
      statusId,
      maxId: requestedMaxId
    });
    if (
      !hasValidExtensionContext()
      || state.detailSessionId !== activeDetailSessionId
      || !comments.isConnected
      || state.requestVersion !== requestVersion
    ) {
      return;
    }

    state.loading = false;
    if (!result.ok) {
      state.error = result.reason || "请在微博原页查看";
      if (!append) {
        state.comments = [];
        state.commentIds.clear();
        state.maxId = "";
        state.hasMore = false;
        renderDetailComments(status, comments, detailInteractions, state);
      }
      state.loadMoreSentinel.hidden = true;
      return;
    }

    const incomingComments = Array.isArray(result.payload?.comments)
      ? result.payload.comments
      : [];
    const previousMaxId = append ? state.maxId : "";
    if (!append) {
      state.comments = [];
      state.commentIds.clear();
      state.maxId = "";
      state.noProgressCount = 0;
    }

    let addedCount = 0;
    for (const comment of incomingComments) {
      const commentId = getCommentId(comment);
      if (commentId && state.commentIds.has(commentId)) {
        continue;
      }
      if (commentId) {
        state.commentIds.add(commentId);
      }
      state.comments.push(comment);
      addedCount += 1;
    }

    const nextMaxId = String(result.payload?.maxId || "");
    const cursorAdvanced = Boolean(nextMaxId && nextMaxId !== "0" && nextMaxId !== previousMaxId);
    state.maxId = nextMaxId;
    const totalNumber = Number(result.payload?.totalNumber || 0);
    if (Number.isFinite(totalNumber) && totalNumber > 0) {
      state.totalNumber = totalNumber;
    }
    state.noProgressCount = addedCount ? 0 : state.noProgressCount + 1;
    const totalReached = state.totalNumber > 0 && state.comments.length >= state.totalNumber;
    state.hasMore = Boolean(
      incomingComments.length
      && cursorAdvanced
      && state.noProgressCount < 3
      && !totalReached
    );
    state.error = "";
    renderDetailComments(status, comments, detailInteractions, state);
  }

  function closeDetail(restoreHistory = true) {
    const overlay = getDetailOverlay();
    if (!overlay) {
      return;
    }

    closeDetailImagePreview(false);
    overlay.querySelectorAll(".weibo-grid-reader__comment-list").forEach((commentList) => {
      detailCommentStates.get(commentList)?.loadMoreObserver?.disconnect();
    });
    cleanupCommentTransientPickers(overlay);
    overlay.remove();
    document.documentElement.classList.remove("weibo-grid-reader-detail-open");
    activeDetailSessionId += 1;
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
      repositionOpenCommentEmojiPickers();
    }
  }

  function canScrollVertically(element, distance) {
    if (!element || !distance || element.scrollHeight <= element.clientHeight) {
      return false;
    }

    return distance > 0
      ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
      : element.scrollTop > 0;
  }

  function handleDetailWheel(event, dialog) {
    if (event.defaultPrevented) {
      return;
    }

    const origin = event.target instanceof Element ? event.target : null;
    if (origin?.closest(".weibo-grid-reader__comment-image-preview-layer")) {
      event.preventDefault();
      return;
    }

    // 表情面板作为固定定位浮层被移出对话框、挂在详情遮罩下（见
    // ensureCommentEmojiPanelHost）；遮罩上的捕获式 wheel 仍会命中它，但它不再是
    // dialog 的后代，因此只按面板本身判定，滚轮优先滚动表情网格并消费该事件。
    const emojiPanel = origin?.closest(".weibo-grid-reader__comment-emoji-panel");
    if (emojiPanel) {
      const emojiGrid = emojiPanel.querySelector(".weibo-grid-reader__comment-emoji-grid");
      event.preventDefault();
      if (canScrollVertically(emojiGrid, event.deltaY)) {
        emojiGrid.scrollTop += event.deltaY;
      }
      return;
    }

    for (const picker of dialog.querySelectorAll(".weibo-grid-reader__comment-emoji-picker[data-open='true']")) {
      setCommentEmojiPickerOpen(picker, false);
    }

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

  function createDetailCommentContext(status, detailSessionId, contextKey, label) {
    const panel = document.createElement("section");
    panel.className = "weibo-grid-reader__comments weibo-grid-reader__detail-comment-context";
    panel.id = `${DETAIL_ID}-comments-${contextKey}`;
    panel.dataset.weiboGridCommentContext = contextKey;
    panel.setAttribute("role", "tabpanel");

    const heading = document.createElement("h2");
    heading.id = `${panel.id}-heading`;
    heading.textContent = `评论 ${formatCount(status.comments_count)}`;
    panel.setAttribute("aria-labelledby", heading.id);

    const comments = document.createElement("div");
    comments.className = "weibo-grid-reader__comment-list";
    const loading = document.createElement("p");
    loading.className = "weibo-grid-reader__comment-empty";
    loading.textContent = "正在加载评论…";
    comments.append(loading);

    const detailInteractions = createDetailInteractions(status, heading, comments, contextKey);
    const loadMoreSentinel = document.createElement("div");
    loadMoreSentinel.className = "weibo-grid-reader__comment-load-sentinel";
    loadMoreSentinel.setAttribute("aria-hidden", "true");
    loadMoreSentinel.hidden = true;

    const state = {
      comments: [],
      commentIds: new Set(),
      maxId: "",
      totalNumber: getNonNegativeCount(status.comments_count),
      noProgressCount: 0,
      hasMore: false,
      loading: false,
      error: "",
      requestVersion: 0,
      detailSessionId,
      contextKey,
      initialized: false,
      commentsAvailable: getNonNegativeCount(status.comments_count) > 0,
      onVisibilityChange: null,
      loadMoreSentinel
    };
    detailCommentStates.set(comments, state);
    panel.append(detailInteractions.interactions, heading, comments, loadMoreSentinel);

    return { key: contextKey, label, status, panel, comments, detailInteractions, state };
  }

  function createDetailCommentContextSwitcher(contexts, onSelect) {
    if (contexts.length < 2) {
      return null;
    }

    const switcher = document.createElement("div");
    switcher.className = "weibo-grid-reader__detail-comment-switcher";
    switcher.setAttribute("role", "tablist");
    switcher.setAttribute("aria-label", "选择评论来源");
    const buttons = new Map();

    const setSelected = (activeKey, focus = false) => {
      for (const context of contexts) {
        const button = buttons.get(context.key);
        const selected = context.key === activeKey;
        button?.setAttribute("aria-selected", String(selected));
        button?.setAttribute("tabindex", selected ? "0" : "-1");
        if (selected && focus) {
          button.focus();
        }
      }
    };

    contexts.forEach((context, contextIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "weibo-grid-reader__detail-comment-tab";
      button.id = `${DETAIL_ID}-comments-tab-${context.key}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", context.panel.id);
      button.setAttribute("aria-label", context.label);
      button.textContent = context.label;
      context.panel.setAttribute("aria-labelledby", button.id);
      button.addEventListener("click", () => onSelect(context.key));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        const offset = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? contexts.length - 1
            : (contextIndex + offset + contexts.length) % contexts.length;
        onSelect(contexts[nextIndex].key, { focus: true });
      });
      buttons.set(context.key, button);
      switcher.append(button);
    });

    setSelected(contexts[0].key);
    return { element: switcher, setSelected };
  }

  function openDetail(status, anchor = null) {
    const statusId = getStatusId(status);
    if (!statusId) {
      window.location.assign(getStatusUrl(status));
      return;
    }

    closeDetail(false);
    activeDetailStatusId = statusId;
    const detailSessionId = ++activeDetailSessionId;
    activeDetailAnchor = anchor;
    const originalStatus = getOriginalStatus(status);
    const repostStatus = status.retweeted_status && typeof status.retweeted_status === "object"
      ? (originalStatus === status ? status.retweeted_status : originalStatus)
      : null;
    const hasRepost = Boolean(repostStatus);
    const originalStatusId = getStatusId(originalStatus);
    const hasOriginalCommentContext = Boolean(
      hasRepost
      && originalStatus !== status
      && originalStatusId
      && originalStatusId !== statusId
    );
    const scrollPosition = { left: window.scrollX, top: window.scrollY };

    const overlay = document.createElement("section");
    overlay.id = DETAIL_ID;
    overlay.className = "weibo-grid-reader__detail-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "微博详情");

    const dialog = document.createElement("div");
    dialog.className = "weibo-grid-reader__detail-dialog";
    dialog.dataset.weiboGridDensityColumns = String(settings.columnCount);
    const detailMedia = createDetailMedia(hasRepost ? repostStatus : status);
    const main = document.createElement("main");
    main.className = "weibo-grid-reader__detail-main";
    if (detailMedia.isImage && !hasRepost) {
      main.classList.add("weibo-grid-reader__detail-main--image-focus");
      dialog.classList.add("weibo-grid-reader__detail-dialog--image-focus");
    }
    const primaryPost = createDetailPost(status, false, hasRepost ? null : detailMedia.media);
    main.append(primaryPost);

    let repostPost = null;
    if (hasRepost) {
      repostPost = createDetailPost(repostStatus, true, detailMedia.media);
      main.append(repostPost);
    }
    if (detailMedia.rail) {
      (repostPost || primaryPost).append(detailMedia.rail);
    }

    const commentContexts = [
      createDetailCommentContext(status, detailSessionId, "current", "当前微博")
    ];
    if (hasOriginalCommentContext) {
      commentContexts.push(
        createDetailCommentContext(originalStatus, detailSessionId, "original", "原博评论区")
      );
    }
    const commentContextsByKey = new Map(commentContexts.map((context) => [context.key, context]));
    commentContexts.forEach((context, contextIndex) => {
      context.panel.hidden = contextIndex !== 0;
    });

    const side = document.createElement("aside");
    side.className = "weibo-grid-reader__detail-side";
    const sideContent = document.createElement("div");
    sideContent.className = "weibo-grid-reader__detail-side-content";
    sideContent.append(...commentContexts.map((context) => context.panel));
    const syncCommentSideVisibility = () => {
      side.hidden = false;
      dialog.classList.remove("weibo-grid-reader__detail-dialog--no-comments");
      repositionActiveDetail();
    };
    commentContexts.forEach((context) => {
      context.state.onVisibilityChange = syncCommentSideVisibility;
    });
    syncCommentSideVisibility();
    const commentScrollPositions = new Map();
    let activeCommentContextKey = "current";
    let selectCommentContext = () => {};
    const contextSwitcher = createDetailCommentContextSwitcher(commentContexts, (key, options) => {
      selectCommentContext(key, options);
    });

    const initializeCommentContext = (context) => {
      if (context.state.initialized) {
        return;
      }
      context.state.initialized = true;
      void loadDetailComments(context.status, context.comments, context.detailInteractions);
    };

    selectCommentContext = (key, { focus = false } = {}) => {
      const nextContext = commentContextsByKey.get(key);
      if (!nextContext) {
        return;
      }
      if (nextContext.key === activeCommentContextKey) {
        contextSwitcher?.setSelected(nextContext.key, focus);
        return;
      }

      const activeContext = commentContextsByKey.get(activeCommentContextKey);
      if (activeContext) {
        commentScrollPositions.set(activeContext.key, sideContent.scrollTop);
      }
      activeCommentContextKey = nextContext.key;
      commentContexts.forEach((context) => {
        context.panel.hidden = context.key !== nextContext.key;
      });
      contextSwitcher?.setSelected(nextContext.key, focus);
      initializeCommentContext(nextContext);
      window.requestAnimationFrame(() => {
        sideContent.scrollTop = commentScrollPositions.get(nextContext.key) || 0;
        repositionActiveDetail();
      });
    };

    if (contextSwitcher) {
      side.append(contextSwitcher.element);
    }
    side.append(sideContent);

    dialog.append(main, side);
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
    commentContexts.forEach((context) => {
      const { state } = context;
      if (typeof IntersectionObserver !== "function") {
        return;
      }
      state.loadMoreObserver = new IntersectionObserver((entries) => {
        if (
          !context.panel.hidden
          && entries.some((entry) => entry.isIntersecting)
          && state.hasMore
          && !state.error
        ) {
          void loadDetailComments(context.status, context.comments, context.detailInteractions, true);
        }
      }, { root: sideContent, rootMargin: "180px 0px" });
      state.loadMoreObserver.observe(state.loadMoreSentinel);
    });
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
      void hydrateDetailLongText(repostStatus, repostPost);
    }
    initializeCommentContext(commentContexts[0]);
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
    readerActivationFailed = true;
    readerFailedRouteKey = readerRouteKey;
    deactivateReaderSurface();
    scheduleReaderRetry();
  }

  async function loadTimeline() {
    if (!hasValidExtensionContext() || readerLoading || readerExhausted || !settings.readerEnabled || !isFeedRoute()) {
      return;
    }

    if (!bridgeReady) {
      readerActivationFailed = true;
      return;
    }

    readerLoading = true;
    if (readerActive && readerSeenIds.size) {
      setReaderLoadStatus("正在加载更多微博…", "loading");
    }
    const generation = readerGeneration;
    const routeKey = readerRouteKey;
    const canUseWarmStartTimeline = !readerMaxId && readerWarmStartRouteKey === routeKey;
    if (canUseWarmStartTimeline) {
      readerWarmStartRouteKey = "";
    }
    const requestedAt = canUseWarmStartTimeline
      ? 0
      : readerSelectionRouteKey === routeKey
        ? readerSelectionStartedAt
        : Date.now();
    const result = await bridgeRequest("fetch-timeline", {
      query: getFeedQuery(),
      routeKey,
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
      setReaderLoadStatus("加载更多微博失败，正在重试…", "retrying");
      scheduleLoadMoreRetry();
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
    const previousMaxId = readerMaxId;
    const nextMaxId = String(result.payload.maxId || "");
    readerMaxId = nextMaxId;
    const hasAdvancedCursor = Boolean(nextMaxId && nextMaxId !== "0" && nextMaxId !== previousMaxId);
    readerExhausted = !hasAdvancedCursor || result.payload.statuses.length === 0;

    if (added) {
      readerDuplicatePageCount = 0;
      cancelLoadMoreRetry();
      setReaderLoadStatus();
      return;
    }

    if (!readerExhausted) {
      readerDuplicatePageCount += 1;
      if (readerDuplicatePageCount < MAX_CONSECUTIVE_DUPLICATE_PAGES) {
        setReaderLoadStatus("正在跳过重复微博…", "loading");
        scheduleLoadMoreRetry();
        return;
      }
      readerExhausted = true;
    }

    cancelLoadMoreRetry();
    setReaderLoadStatus("已加载当前分组的全部微博。", "complete");
  }

  function resetReader(preserveRetryState = false) {
    readerGeneration += 1;
    if (!preserveRetryState) {
      cancelReaderRetry();
    }
    const wasReaderActive = readerActive;
    if (!wasReaderActive || !mountReaderSurface()) {
      deactivateReaderSurface();
    } else {
      activateReaderSurface();
    }
    readerLoading = false;
    readerActivationFailed = false;
    readerExhausted = false;
    readerMaxId = "";
    readerDuplicatePageCount = 0;
    cancelLoadMoreRetry();
    setReaderLoadStatus(wasReaderActive ? "正在加载当前分组微博…" : "", wasReaderActive ? "loading" : "");
    readerFailedRouteKey = "";
    readerSeenIds.clear();
    cleanupCommentTransientPickers(getReaderGrid());
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

    if (isReaderNearEnd()) {
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

  function isReaderLayoutStateApplied(enabled) {
    const surface = getReaderSurface();
    const scroller = findScroller();
    const activeClassApplied = document.documentElement.classList.contains("weibo-grid-reader-active");

    if (enabled) {
      return settings.readerEnabled
        && readerActive
        && Boolean(surface && !surface.hidden)
        && Boolean(scroller?.classList.contains("weibo-grid-reader-source-hidden"))
        && activeClassApplied;
    }

    return !settings.readerEnabled
      && !readerActive
      && (!surface || surface.hidden)
      && !scroller?.classList.contains("weibo-grid-reader-source-hidden")
      && !activeClassApplied;
  }

  function waitForReaderLayoutState(enabled) {
    if (isReaderLayoutStateApplied(enabled)) {
      return Promise.resolve(true);
    }
    if (enabled && readerActivationFailed) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const checkState = () => {
        if (isReaderLayoutStateApplied(enabled)) {
          resolve(true);
          return;
        }
        if (enabled && readerActivationFailed) {
          resolve(false);
          return;
        }
        if (performance.now() - startedAt >= LAYOUT_STATE_SETTLE_TIMEOUT_MS) {
          resolve(false);
          return;
        }
        window.setTimeout(checkState, 40);
      };

      window.setTimeout(checkState, 0);
    });
  }

  async function applyReaderEnabledState(nextEnabled, previousEnabled, shouldSettle = true) {
    if (nextEnabled && shouldSettle) {
      readerWarmStartRouteKey = getReaderRouteKey();
    }
    settings.readerEnabled = nextEnabled;
    saveSettings();

    if (!nextEnabled) {
      unmountReaderSurface();
      return true;
    }

    try {
      refreshPage(true);
      if (!shouldSettle || await waitForReaderLayoutState(nextEnabled)) {
        return true;
      }
    } catch {
    }

    settings.readerEnabled = previousEnabled;
    saveSettings();
    try {
      refreshPage(true);
      await waitForReaderLayoutState(previousEnabled);
    } catch {
      updatePageClasses();
    }
    return false;
  }

  async function runLayoutTransition(applyLayout) {
    const root = document.documentElement;
    const tryApplyLayout = async () => {
      try {
        return await applyLayout() !== false;
      } catch {
        return false;
      }
    };

    root.classList.add("weibo-grid-reader-layout-transitioning", "weibo-grid-reader-layout-transition-out");
    await new Promise((resolve) => window.setTimeout(resolve, LAYOUT_TRANSITION_OUT_DURATION_MS));
    const layoutApplied = await tryApplyLayout();
    root.classList.remove("weibo-grid-reader-layout-transition-out");
    root.classList.add("weibo-grid-reader-layout-transition-in");
    await new Promise((resolve) => window.setTimeout(resolve, LAYOUT_TRANSITION_IN_DURATION_MS));
    root.classList.remove(
      "weibo-grid-reader-layout-transitioning",
      "weibo-grid-reader-layout-transition-in"
    );
    return layoutApplied;
  }

  async function setReaderEnabledWithTransition(nextEnabled, readerToggle) {
    if (layoutTransitionInProgress || nextEnabled === settings.readerEnabled) {
      readerToggle.checked = settings.readerEnabled;
      return;
    }

    const previousEnabled = settings.readerEnabled;
    const applyLayout = () => applyReaderEnabledState(nextEnabled, previousEnabled, isFeedRoute());
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    layoutTransitionInProgress = true;
    readerToggle.disabled = true;
    const root = getExtensionRoot();
    root?.classList.add("weibo-grid-reader--transitioning");
    currentPageLayout?.setAttribute("aria-busy", "true");
    setDrawerOpen(false);

    try {
      if (reduceMotion || !isFeedRoute()) {
        await applyLayout();
      } else {
        await runLayoutTransition(applyLayout);
      }
    } finally {
      layoutTransitionInProgress = false;
      root?.classList.remove("weibo-grid-reader--transitioning");
      currentPageLayout?.removeAttribute("aria-busy");
      updateControlState();
    }
  }

  async function setColumnCountWithTransition(nextColumnCount, densitySlider) {
    if (
      layoutTransitionInProgress
      || nextColumnCount === settings.columnCount
      || !settings.readerEnabled
      || !isFeedRoute()
    ) {
      updateControlState();
      return;
    }

    const previousColumnCount = settings.columnCount;
    const applyLayout = async () => {
      settings.columnCount = nextColumnCount;
      getReaderSurface()?.setAttribute("data-columns", String(nextColumnCount));
      saveSettings();
      updateControlState();
      scheduleMasonryLayout();
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      return true;
    };

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) {
      await applyLayout();
      return;
    }

    layoutTransitionInProgress = true;
    densitySlider.disabled = true;
    const root = getExtensionRoot();
    root?.classList.add("weibo-grid-reader--transitioning");
    currentPageLayout?.setAttribute("aria-busy", "true");
    setDrawerOpen(false);

    try {
      await runLayoutTransition(applyLayout);
    } catch {
      settings.columnCount = previousColumnCount;
      getReaderSurface()?.setAttribute("data-columns", String(previousColumnCount));
      saveSettings();
    } finally {
      layoutTransitionInProgress = false;
      root?.classList.remove("weibo-grid-reader--transitioning");
      currentPageLayout?.removeAttribute("aria-busy");
      updateControlState();
    }
  }

  function setCardQuickActions(nextEnabled, toggle) {
    const enabled = Boolean(nextEnabled);
    if (layoutTransitionInProgress || enabled === settings.cardQuickActions) {
      toggle.checked = settings.cardQuickActions;
      return;
    }

    settings.cardQuickActions = enabled;
    saveSettings();
    updateControlState();

    // 快捷操作改变卡片底部的 DOM 结构，重新加载当前信息流以立刻应用设置。
    if (readerActive && isFeedRoute()) {
      resetReader();
    }
  }

  function setDrawerOpen(nextDrawerOpen) {
    drawerOpen = nextDrawerOpen;
    updatePageClasses();
    updateControlState();
  }

  function listenForExtensionMessages() {
    if (!hasValidExtensionContext() || !chrome.runtime?.onMessage) {
      return;
    }
    const getSettingsSnapshot = () => ({
      readerEnabled: settings.readerEnabled,
      columnCount: settings.columnCount,
      cardQuickActions: settings.cardQuickActions,
      darkTheme: document.documentElement.classList.contains(DARK_THEME_CLASS)
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "toggle-reader-drawer" && isFeedRoute()) {
        setDrawerOpen(!drawerOpen);
        sendResponse({ ok: true, settings: getSettingsSnapshot() });
        return false;
      }

      if (message?.type === "get-reader-state") {
        sendResponse({
          ok: true,
          available: isFeedRoute(),
          settings: getSettingsSnapshot()
        });
        return false;
      }

      if (message?.type !== "update-reader-setting") {
        return false;
      }

      if (!isFeedRoute()) {
        sendResponse({ ok: false, reason: "当前页面不是微博信息流。" });
        return false;
      }

      void (async () => {
        const controls = getControls();
        if (message.key === "readerEnabled") {
          await setReaderEnabledWithTransition(Boolean(message.value), controls.readerToggle);
        } else if (message.key === "columnCount") {
          const columnCount = Number(message.value);
          if (![2, 3, 4].includes(columnCount)) {
            throw new Error("不支持的信息流列数。");
          }
          await setColumnCountWithTransition(columnCount, controls.densitySlider);
        } else if (message.key === "cardQuickActions") {
          setCardQuickActions(Boolean(message.value), controls.cardQuickActionsToggle);
        } else {
          throw new Error("无法识别这项设置。");
        }

        const nextSettings = getSettingsSnapshot();
        const expectedValue = message.key === "columnCount"
          ? Number(message.value)
          : Boolean(message.value);
        if (nextSettings[message.key] !== expectedValue) {
          sendResponse({ ok: false, reason: "设置未能应用，已恢复原状态。", settings: nextSettings });
          return;
        }
        sendResponse({ ok: true, settings: nextSettings });
      })().catch((error) => {
        sendResponse({
          ok: false,
          reason: error instanceof Error ? error.message : "设置失败。",
          settings: getSettingsSnapshot()
        });
      });
      return true;
    });
  }

  function createControls() {
    if (getExtensionRoot()) {
      return;
    }

    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button class="weibo-grid-reader__button" type="button" data-reader-button aria-label="打开 rebo 阅读器" aria-expanded="false">
        <img class="weibo-grid-reader__button-icon" data-reader-icon alt="">
      </button>
      <aside class="weibo-grid-reader__drawer" data-reader-panel aria-hidden="true" aria-label="微博阅读器设置">
        <header class="weibo-grid-reader__header">
          <div>
            <h2><span class="weibo-grid-reader__title-brand">rebo</span></h2>
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
              <strong>信息流列数</strong>
            </span>
            <div class="weibo-grid-reader__density-control">
              <input class="weibo-grid-reader__density-slider" type="range" min="2" max="4" step="1" value="2" data-density-slider aria-label="选择信息流列数">
              <div class="weibo-grid-reader__density-labels" aria-hidden="true">
                <span data-density-label="2">稀疏</span>
                <span data-density-label="3">适中</span>
                <span data-density-label="4">紧凑</span>
              </div>
            </div>
          </div>
          <label class="weibo-grid-reader__setting">
            <span class="weibo-grid-reader__setting-copy">
              <strong>卡片快捷操作</strong>
              <small>开启后，可直接在卡片底部转发、评论和点赞</small>
            </span>
            <span class="weibo-grid-reader__switch">
              <input type="checkbox" data-card-quick-actions-toggle>
              <span class="weibo-grid-reader__switch-track" aria-hidden="true"></span>
            </span>
          </label>
        </div>
      </aside>
    `;

    document.documentElement.appendChild(root);

    const buttonIcon = root.querySelector("[data-reader-icon]");
    if (buttonIcon) {
      try {
        buttonIcon.src = chrome.runtime.getURL(BUTTON_ICON_PATH);
      } catch {
        buttonIcon.remove();
      }
    }

    root.querySelector("[data-reader-button]")?.addEventListener("click", () => {
      setDrawerOpen(!drawerOpen);
    });

    root.querySelector("[data-reader-close]")?.addEventListener("click", () => {
      setDrawerOpen(false);
    });

    root.querySelector("[data-reader-toggle]")?.addEventListener("change", (event) => {
      void setReaderEnabledWithTransition(event.currentTarget.checked, event.currentTarget);
    });

    root.querySelector("[data-card-quick-actions-toggle]")?.addEventListener("change", (event) => {
      setCardQuickActions(event.currentTarget.checked, event.currentTarget);
    });

    root.querySelector("[data-density-slider]")?.addEventListener("change", (event) => {
      const nextColumnCount = Number(event.currentTarget.value);
      if (![2, 3, 4].includes(nextColumnCount)) {
        return;
      }

      void setColumnCountWithTransition(nextColumnCount, event.currentTarget);
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
          const storedColumnCount = Number(storedSettings.columnCount);
          settings = {
            ...storedSettings,
            cardQuickActions: Boolean(storedSettings.cardQuickActions),
            columnCount: storedColumnCount === 5
              ? 4
              : [2, 3, 4].includes(storedColumnCount)
                ? storedColumnCount
                : DEFAULT_SETTINGS.columnCount
          };
          if (storedColumnCount === 5) {
            saveSettings();
          }
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
      if (
        response?.channel !== CHANNEL
        || response.sender !== "page"
        || response.bridgeSessionId !== BRIDGE_SESSION_ID
        || !response.requestId
      ) {
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

  function refreshPage(immediate = false) {
    if (!hasValidExtensionContext()) {
      return;
    }

    window.clearTimeout(refreshTimer);
    const synchronize = () => {
      refreshTimer = null;
      if (!hasValidExtensionContext()) {
        return;
      }

      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
      }

      updatePageAnchors();
      scheduleThemeStateUpdate();
      hideUtilityFooter();
      updateControlState();
      synchronizeReader();
      updatePageClasses();
      scheduleMasonryLayout();
      scheduleLoadMore();
    };

    if (immediate) {
      synchronize();
      return;
    }

    refreshTimer = window.setTimeout(synchronize, 100);
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
      const readerScrollerAdded = mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
        return node instanceof Element
          && (node.matches(".vue-recycle-scroller") || node.querySelector(".vue-recycle-scroller"));
      }));
      if (readerActive && readerScrollerAdded) {
        mountReaderSurface();
      }
      const currentAnchorsDisconnected = [
        currentFeedShell,
        currentNavigationPanel,
        currentPageLayout,
        currentComposerPanel
      ].some((element) => element && !element.isConnected);
      if (mutationNeedsRefresh(mutations) || currentAnchorsDisconnected) {
        refreshPage();
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", () => {
      refreshPage();
      repositionActiveDetail();
    }, { passive: true });
    window.addEventListener("scroll", scheduleLoadMore, { passive: true });
    window.addEventListener("popstate", () => {
      if (activeDetailStatusId) {
        closeDetail(false);
      }
      refreshPage();
    });
    window.addEventListener("hashchange", refreshPage);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && activeDetailImagePreviewController?.layer.isConnected) {
        closeDetailImagePreview();
        return;
      }

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
      if (!origin || !currentNavigationPanel?.contains(origin)) {
        return;
      }

      const targetRouteKey = getReaderRouteKeyFromElement(origin);
      if (!targetRouteKey) {
        return;
      }

      readerSelectionRouteKey = targetRouteKey;
      readerSelectionStartedAt = Date.now();
      if (targetRouteKey !== readerRouteKey) {
        scheduleRouteSync(targetRouteKey);
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
      scheduleThemeStateUpdate();
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
    listenForExtensionMessages();
    createControls();
    observeTheme();
    observePage();
    await loadSettings();
    await injectBridge();
    refreshPage();
  }

  void start();
})();
