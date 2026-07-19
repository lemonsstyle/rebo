(() => {
  "use strict";

  const CHANNEL = "weibo-grid-reader-v4";
  const OBSERVED_TIMELINE_WAIT_MS = 320;
  const TIMELINE_ENDPOINT_WAIT_MS = 600;
  const officialTimelineByRoute = new Map();
  const observedTimelineEndpointByRoute = new Map();
  let readerTimelineRequestDepth = 0;

  function respond(requestId, payload) {
    window.postMessage({ channel: CHANNEL, sender: "page", requestId, ...payload }, window.location.origin);
  }

  function readCookie(name) {
    const prefix = `${name}=`;
    const cookie = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
    if (!cookie) {
      return "";
    }

    try {
      return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
      return cookie.slice(prefix.length);
    }
  }

  function createWeiboRequestHeaders() {
    const headers = {
      Accept: "application/json, text/plain, */*",
      "Client-Version": window.$VERSION?.CLIENT || "3.0.0",
      "X-Requested-With": "XMLHttpRequest"
    };
    if (window.$VERSION?.SERVER) {
      headers["Server-Version"] = window.$VERSION.SERVER;
    }
    const xsrfToken = readCookie("XSRF-TOKEN");
    if (xsrfToken) {
      headers["X-XSRF-TOKEN"] = xsrfToken;
    }

    return headers;
  }

  function createWeiboFormRequestHeaders() {
    return {
      ...createWeiboRequestHeaders(),
      "Content-Type": "application/x-www-form-urlencoded"
    };
  }

  async function getBotFingerprint(source) {
    try {
      const result = await window.wbBotDetector?.get?.({ useCache: false, from: source });
      return result?.rid ? { fp: result.rid } : {};
    } catch {
      return {};
    }
  }

  async function postWeiboForm(path, fields, botDetectorSource) {
    const endpoint = new URL(path, window.location.origin);
    const form = new URLSearchParams();
    const fingerprint = await getBotFingerprint(botDetectorSource);

    for (const [name, value] of Object.entries({ ...fields, ...fingerprint })) {
      if (value !== undefined && value !== null && value !== "") {
        form.set(name, String(value));
      }
    }

    try {
      const response = await window.fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: createWeiboFormRequestHeaders(),
        body: form.toString()
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        // 保留 HTTP 状态信息，供调用方显示更明确的失败提示。
      }

      if (!response.ok) {
        return {
          ok: false,
          reason: payload?.msg || payload?.message || `微博操作失败（HTTP ${response.status}）。`
        };
      }
      if (!payload || Number(payload.ok) <= 0) {
        return { ok: false, reason: payload?.msg || payload?.message || "微博没有确认此次操作。" };
      }

      return { ok: true, payload: { data: payload.data || null } };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "微博操作请求失败。"
      };
    }
  }

  function getTimelineGroupId(endpoint) {
    return endpoint.searchParams.get("list_id")
      || endpoint.searchParams.get("fid")
      || endpoint.searchParams.get("group_id")
      || "";
  }

  function getFeedRouteKey(value = window.location.href) {
    try {
      const url = new URL(value, window.location.href);
      if (
        url.origin !== window.location.origin
        || (url.pathname !== "/" && url.pathname !== "/mygroups")
      ) {
        return "";
      }
      return `${url.pathname}?gid=${url.searchParams.get("gid") || ""}`;
    } catch {
      return "";
    }
  }

  function resolveFeedRouteKey(routeKey) {
    const currentRouteKey = getFeedRouteKey();
    return routeKey && routeKey === currentRouteKey ? routeKey : currentRouteKey;
  }

  function getRequestUrl(input) {
    try {
      const value = typeof input === "string" || input instanceof URL ? input : input?.url;
      return new URL(value, window.location.href);
    } catch {
      return null;
    }
  }

  function isTimelineEndpoint(endpoint) {
    return endpoint?.origin === window.location.origin
      && (
        endpoint.pathname === "/ajax/feed/friendstimeline"
        || endpoint.pathname === "/ajax/feed/groupstimeline"
      );
  }

  function rememberTimelineEndpoint(endpoint, routeKey) {
    const resolvedRouteKey = getFeedRouteKey(routeKey);
    if (!resolvedRouteKey || !isTimelineEndpoint(endpoint)) {
      return "";
    }

    observedTimelineEndpointByRoute.set(resolvedRouteKey, endpoint.href);
    return resolvedRouteKey;
  }

  function forgetTimelineEndpoint(routeKey, endpointHref) {
    const resolvedRouteKey = resolveFeedRouteKey(routeKey);
    if (observedTimelineEndpointByRoute.get(resolvedRouteKey) === endpointHref) {
      observedTimelineEndpointByRoute.delete(resolvedRouteKey);
    }
  }

  function storeOfficialTimeline(endpoint, payload, routeKey) {
    const resolvedRouteKey = rememberTimelineEndpoint(endpoint, routeKey);
    if (!resolvedRouteKey) {
      return;
    }

    const maxId = endpoint.searchParams.get("max_id");
    if (!Array.isArray(payload?.statuses) || (maxId && maxId !== "0")) {
      return;
    }

    officialTimelineByRoute.set(resolvedRouteKey, {
      payload,
      receivedAt: Date.now()
    });
  }

  function observeFetchTimeline(input, response, routeKey) {
    const endpoint = getRequestUrl(input);
    if (!isTimelineEndpoint(endpoint) || !response.ok) {
      return;
    }

    rememberTimelineEndpoint(endpoint, routeKey);
    void response.clone().json().then((payload) => {
      storeOfficialTimeline(endpoint, payload, routeKey);
    }).catch(() => {});
  }

  function installOfficialTimelineObserver() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function observedFetch(input, init) {
      const shouldObserve = readerTimelineRequestDepth === 0;
      const routeKey = getFeedRouteKey();
      const endpoint = getRequestUrl(input);
      if (shouldObserve) {
        rememberTimelineEndpoint(endpoint, routeKey);
      }
      const responsePromise = nativeFetch(input, init);
      if (shouldObserve) {
        void responsePromise.then((response) => observeFetchTimeline(input, response, routeKey)).catch(() => {});
      }
      return responsePromise;
    };

    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    const requestUrls = new WeakMap();
    XMLHttpRequest.prototype.open = function observedOpen(method, url, ...rest) {
      requestUrls.set(this, { endpoint: getRequestUrl(url), routeKey: getFeedRouteKey() });
      return nativeOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function observedSend(...args) {
      const request = requestUrls.get(this);
      const endpoint = request?.endpoint;
      if (readerTimelineRequestDepth === 0 && isTimelineEndpoint(endpoint)) {
        rememberTimelineEndpoint(endpoint, request.routeKey);
        this.addEventListener("loadend", () => {
          if (this.status < 200 || this.status >= 300) {
            return;
          }
          try {
            const payload = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
            storeOfficialTimeline(endpoint, payload, request.routeKey);
          } catch {
            return;
          }
        }, { once: true });
      }
      return nativeSend.apply(this, args);
    };
  }

  function findObservedTimelineEndpoint(query) {
    const requestedGroupId = String(query?.list_id || query?.fid || "");
    const entries = performance.getEntriesByType("resource").slice().reverse();

    for (const entry of entries) {
      const endpoint = new URL(entry.name);
      if (!isTimelineEndpoint(endpoint)) {
        continue;
      }

      const observedGroupId = getTimelineGroupId(endpoint);
      if (requestedGroupId ? observedGroupId === requestedGroupId : endpoint.pathname === "/ajax/feed/friendstimeline") {
        return endpoint;
      }
    }

    return null;
  }

  async function getTimelineEndpoint(query, routeKey) {
    const resolvedRouteKey = resolveFeedRouteKey(routeKey);
    const rememberedEndpoint = observedTimelineEndpointByRoute.get(resolvedRouteKey);
    if (rememberedEndpoint) {
      return new URL(rememberedEndpoint, window.location.href);
    }

    const initialEndpoint = findObservedTimelineEndpoint(query);
    if (initialEndpoint) {
      return initialEndpoint;
    }

    const deadline = performance.now() + TIMELINE_ENDPOINT_WAIT_MS;
    while (performance.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      const observedEndpoint = findObservedTimelineEndpoint(query);
      if (observedEndpoint) {
        return observedEndpoint;
      }
    }

    return null;
  }

  function getFreshOfficialTimeline(routeKey, requestedAt) {
    const resolvedRouteKey = resolveFeedRouteKey(routeKey);
    const timeline = officialTimelineByRoute.get(resolvedRouteKey);
    if (timeline && timeline.receivedAt >= requestedAt) {
      return timeline.payload;
    }
    return null;
  }

  async function waitForOfficialTimeline(routeKey, requestedAt) {
    const deadline = performance.now() + OBSERVED_TIMELINE_WAIT_MS;

    while (performance.now() < deadline) {
      const payload = getFreshOfficialTimeline(routeKey, requestedAt);
      if (payload) {
        return payload;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }

    return null;
  }

  async function requestTimeline(endpoint) {
    let lastResponse = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      readerTimelineRequestDepth += 1;
      let response;
      try {
        response = await window.fetch(endpoint, {
          credentials: "same-origin",
          headers: createWeiboRequestHeaders()
        });
      } finally {
        readerTimelineRequestDepth -= 1;
      }

      lastResponse = response;
      if (response.ok) {
        return response.json();
      }

      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }

    throw new Error(`微博信息流请求失败（HTTP ${lastResponse?.status || "未知"}）。`);
  }

  async function fetchTimeline(query, routeKey, requestedAt = 0) {
    if (!query?.max_id) {
      const freshRequestedAt = Number(requestedAt) || 0;
      const immediateOfficialPayload = getFreshOfficialTimeline(routeKey, freshRequestedAt);
      if (immediateOfficialPayload) {
        return {
          ok: true,
          payload: {
            statuses: immediateOfficialPayload.statuses,
            maxId: immediateOfficialPayload.max_id ?? immediateOfficialPayload.max_id_str ?? "",
            sinceId: immediateOfficialPayload.since_id ?? immediateOfficialPayload.since_id_str ?? ""
          }
        };
      }

      const resolvedRouteKey = resolveFeedRouteKey(routeKey);
      const hasEndpointTemplate = observedTimelineEndpointByRoute.has(resolvedRouteKey);
      const officialPayload = hasEndpointTemplate
        ? null
        : await waitForOfficialTimeline(routeKey, freshRequestedAt);
      if (officialPayload) {
        return {
          ok: true,
          payload: {
            statuses: officialPayload.statuses,
            maxId: officialPayload.max_id ?? officialPayload.max_id_str ?? "",
            sinceId: officialPayload.since_id ?? officialPayload.since_id_str ?? ""
          }
        };
      }
    }

    const endpoint = await getTimelineEndpoint(query, routeKey);
    if (!endpoint) {
      return { ok: false, reason: "尚未捕获当前分组的微博官方信息流请求。" };
    }

    const endpointHref = endpoint.href;

    endpoint.searchParams.delete("since_id");
    endpoint.searchParams.delete("max_id");

    for (const [name, value] of Object.entries(query || {})) {
      if (value !== null && value !== undefined && value !== "") {
        endpoint.searchParams.set(name, String(value));
      }
    }

    try {
      const payload = await requestTimeline(endpoint);
      if (!Array.isArray(payload.statuses)) {
        forgetTimelineEndpoint(routeKey, endpointHref);
        return { ok: false, reason: "微博信息流响应中没有 statuses 数组。" };
      }

      return {
        ok: true,
        payload: {
          statuses: payload.statuses,
          maxId: payload.max_id ?? payload.max_id_str ?? "",
          sinceId: payload.since_id ?? payload.since_id_str ?? ""
        }
      };
    } catch (error) {
      forgetTimelineEndpoint(routeKey, endpointHref);
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "微博信息流请求失败。"
      };
    }
  }

  async function fetchComments(statusId) {
    const endpoint = new URL("/ajax/statuses/buildComments", window.location.origin);
    endpoint.searchParams.set("id", String(statusId));
    endpoint.searchParams.set("is_reload", "1");
    endpoint.searchParams.set("count", "20");
    endpoint.searchParams.set("is_show_bulletin", "2");
    endpoint.searchParams.set("fetch_level", "0");
    endpoint.searchParams.set("locale", "zh-CN");

    try {
      const response = await window.fetch(endpoint, {
        credentials: "same-origin",
        headers: createWeiboRequestHeaders()
      });
      if (!response.ok) {
        return { ok: false, reason: `评论请求失败（HTTP ${response.status}）。` };
      }

      const payload = await response.json();
      const comments = payload.data || payload.comments || [];
      return { ok: true, payload: { comments: Array.isArray(comments) ? comments : [] } };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "评论请求失败。"
      };
    }
  }

  async function fetchLongText(statusId) {
    const endpoint = new URL("/ajax/statuses/longtext", window.location.origin);
    endpoint.searchParams.set("id", String(statusId));

    try {
      const response = await window.fetch(endpoint, {
        credentials: "same-origin",
        headers: createWeiboRequestHeaders()
      });
      if (!response.ok) {
        return { ok: false, reason: `长文请求失败（HTTP ${response.status}）。` };
      }

      const payload = await response.json();
      const data = payload.data || payload;
      const text = data.longTextContent
        || data.long_text_content
        || data.text
        || data.text_raw
        || "";
      if (!text) {
        return { ok: false, reason: "长文响应中没有正文。" };
      }
      return { ok: true, payload: { text: String(text) } };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "长文请求失败。"
      };
    }
  }

  async function createComment(statusId, text) {
    const comment = String(text || "").trim();
    if (!statusId || !comment) {
      return { ok: false, reason: "评论内容不能为空。" };
    }

    return postWeiboForm(
      "/ajax/comments/create",
      {
        id: String(statusId),
        comment,
        is_repost: 0,
        comment_ori: 0,
        is_comment: 0
      },
      "weibo-comment"
    );
  }

  async function createRepost(statusId, text) {
    if (!statusId) {
      return { ok: false, reason: "缺少微博 ID，无法转发。" };
    }

    return postWeiboForm(
      "/ajax/statuses/normal_repost",
      {
        id: String(statusId),
        comment: String(text || "").trim(),
        is_repost: 0,
        comment_ori: 0,
        is_comment: 0,
        visible: 0
      },
      "weibo-comment-repost"
    );
  }

  async function setAttitude(statusId) {
    if (!statusId) {
      return { ok: false, reason: "缺少微博 ID，无法点赞。" };
    }

    return postWeiboForm("/ajax/statuses/setLike", { id: String(statusId) }, "weibo-like");
  }

  async function cancelAttitude(statusId) {
    if (!statusId) {
      return { ok: false, reason: "缺少微博 ID，无法取消点赞。" };
    }

    return postWeiboForm("/ajax/statuses/cancelLike", { id: String(statusId) }, "weibo-like");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const message = event.data;
    if (message?.channel !== CHANNEL || message.sender !== "content" || !message.requestId) {
      return;
    }

    const requiresUserActivation = [
      "create-comment",
      "create-repost",
      "set-attitude",
      "cancel-attitude"
    ].includes(message.type);
    if (requiresUserActivation && navigator.userActivation && !navigator.userActivation.isActive) {
      respond(message.requestId, { ok: false, reason: "请在详情卡片中手动发起此操作。" });
      return;
    }

    if (message.type === "fetch-timeline") {
      void fetchTimeline(message.query, message.routeKey, message.requestedAt).then((result) => {
        respond(message.requestId, result);
      });
    }

    if (message.type === "fetch-comments") {
      void fetchComments(message.statusId).then((result) => {
        respond(message.requestId, result);
      });
    }

    if (message.type === "fetch-long-text") {
      void fetchLongText(message.statusId).then((result) => {
        respond(message.requestId, result);
      });
    }

    if (message.type === "create-comment") {
      void createComment(message.statusId, message.text).then((result) => {
        respond(message.requestId, result);
      });
    }

    if (message.type === "create-repost") {
      void createRepost(message.statusId, message.text).then((result) => {
        respond(message.requestId, result);
      });
    }

    if (message.type === "set-attitude") {
      void setAttitude(message.statusId).then((result) => {
        respond(message.requestId, result);
      });
    }

    if (message.type === "cancel-attitude") {
      void cancelAttitude(message.statusId).then((result) => {
        respond(message.requestId, result);
      });
    }

  });

  installOfficialTimelineObserver();
})();
