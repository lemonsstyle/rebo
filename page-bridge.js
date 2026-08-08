(() => {
  "use strict";

  if (window.__weiboGridReaderBridgeInstalled) {
    return;
  }
  window.__weiboGridReaderBridgeInstalled = true;

  const CHANNEL = "weibo-grid-reader-v4";
  const OBSERVED_TIMELINE_WAIT_MS = 320;
  const TIMELINE_ENDPOINT_WAIT_MS = 600;
  const officialTimelineByRoute = new Map();
  const officialTimelineByGroup = new Map();
  const observedTimelineEndpointByRoute = new Map();
  const observedTimelineEndpointByGroup = new Map();
  let latestObservedOfficialTimeline = null;
  let readerTimelineRequestDepth = 0;

  function respond(requestId, bridgeSessionId, payload) {
    window.postMessage(
      { channel: CHANNEL, sender: "page", requestId, bridgeSessionId, ...payload },
      window.location.origin
    );
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
    return endpoint.searchParams.get("gid")
      || endpoint.searchParams.get("list_id")
      || endpoint.searchParams.get("fid")
      || endpoint.searchParams.get("group_id")
      || "";
  }

  function getFeedRouteKey(value = window.location.href) {
    if (typeof value === "string" && value.startsWith("gid=")) {
      const groupId = new URLSearchParams(value).get("gid") || "";
      return groupId ? `gid=${encodeURIComponent(groupId)}` : "";
    }

    try {
      const url = new URL(value, window.location.href);
      if (
        url.origin !== window.location.origin
        || (url.pathname !== "/" && url.pathname !== "/mygroups")
      ) {
        return "";
      }
      const groupId = getFeedGroupId(url);
      return groupId
        ? `gid=${encodeURIComponent(groupId)}`
        : `${url.pathname}?gid=`;
    } catch {
      return "";
    }
  }

  function resolveFeedRouteKey(routeKey) {
    const currentRouteKey = getFeedRouteKey();
    return routeKey && routeKey === currentRouteKey ? routeKey : currentRouteKey;
  }

  function getFeedGroupId(value = window.location.href) {
    if (typeof value === "string" && value.startsWith("gid=")) {
      return new URLSearchParams(value).get("gid") || "";
    }

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

    const groupId = getTimelineGroupId(endpoint);
    const routeGroupId = getFeedGroupId(routeKey);
    if (!groupId || (routeGroupId && routeGroupId === groupId)) {
      observedTimelineEndpointByRoute.set(resolvedRouteKey, endpoint.href);
    }
    if (groupId) {
      observedTimelineEndpointByGroup.set(groupId, endpoint.href);
    }
    return resolvedRouteKey;
  }

  function forgetTimelineEndpoint(routeKey, endpointHref) {
    const resolvedRouteKey = resolveFeedRouteKey(routeKey);
    if (observedTimelineEndpointByRoute.get(resolvedRouteKey) === endpointHref) {
      observedTimelineEndpointByRoute.delete(resolvedRouteKey);
    }
    for (const [groupId, rememberedEndpoint] of observedTimelineEndpointByGroup) {
      if (rememberedEndpoint === endpointHref) {
        observedTimelineEndpointByGroup.delete(groupId);
      }
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

    const groupId = getTimelineGroupId(endpoint);
    const routeGroupId = getFeedGroupId(routeKey);
    const receivedAt = Date.now();
    latestObservedOfficialTimeline = {
      payload,
      receivedAt,
      endpointHref: endpoint.href,
      groupId,
      routeKey: resolvedRouteKey
    };
    if (!groupId || (routeGroupId && routeGroupId === groupId)) {
      officialTimelineByRoute.set(resolvedRouteKey, {
        payload,
        receivedAt
      });
    }
    if (groupId) {
      officialTimelineByGroup.set(groupId, {
        payload,
        receivedAt
      });
    }
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
    const requestedGroupId = String(query?.list_id || query?.fid || query?.group_id || query?.gid || "");
    const groupedEndpoint = observedTimelineEndpointByGroup.get(requestedGroupId);
    if (groupedEndpoint) {
      const endpoint = new URL(groupedEndpoint, window.location.href);
      if (isTimelineEndpointTemplateForGroup(endpoint, requestedGroupId)) {
        return endpoint;
      }
    }
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

  function isTimelineEndpointTemplateForGroup(endpoint, requestedGroupId) {
    if (!requestedGroupId) {
      return true;
    }

    const observedGroupId = getTimelineGroupId(endpoint);
    return observedGroupId === requestedGroupId
      || (!observedGroupId && endpoint.pathname === "/ajax/feed/groupstimeline");
  }

  async function getTimelineEndpoint(query, routeKey) {
    const resolvedRouteKey = resolveFeedRouteKey(routeKey);
    const requestedGroupId = String(query?.list_id || query?.fid || query?.group_id || query?.gid || "");
    const rememberedEndpoint = observedTimelineEndpointByGroup.get(requestedGroupId)
      || observedTimelineEndpointByRoute.get(resolvedRouteKey);
    if (rememberedEndpoint) {
      const endpoint = new URL(rememberedEndpoint, window.location.href);
      if (isTimelineEndpointTemplateForGroup(endpoint, requestedGroupId)) {
        return endpoint;
      }
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

  function getFreshOfficialTimelineForGroup(groupId, requestedAt) {
    if (!groupId) {
      return null;
    }
    const timeline = officialTimelineByGroup.get(String(groupId));
    return timeline && timeline.receivedAt >= requestedAt ? timeline.payload : null;
  }

  function getFreshLatestObservedOfficialTimeline(requestedAt) {
    if (!requestedAt || !latestObservedOfficialTimeline || latestObservedOfficialTimeline.receivedAt < requestedAt) {
      return null;
    }
    return latestObservedOfficialTimeline.payload;
  }

  function getFreshOfficialTimelineForRequest(routeKey, groupId, requestedAt) {
    const normalizedGroupId = String(groupId || "");
    const groupedPayload = getFreshOfficialTimelineForGroup(normalizedGroupId, requestedAt);
    if (groupedPayload) {
      return groupedPayload;
    }
    if (!normalizedGroupId || getFeedGroupId(routeKey) === normalizedGroupId) {
      const routePayload = getFreshOfficialTimeline(routeKey, requestedAt);
      if (routePayload) {
        return routePayload;
      }
    }
    return getFreshLatestObservedOfficialTimeline(requestedAt);
  }

  async function waitForOfficialTimeline(routeKey, requestedAt, groupId = "") {
    const deadline = performance.now() + OBSERVED_TIMELINE_WAIT_MS;

    while (performance.now() < deadline) {
      const payload = getFreshOfficialTimelineForRequest(routeKey, groupId, requestedAt);
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
      const requestedGroupId = query?.list_id || query?.fid || query?.group_id || "";
      const immediateOfficialPayload = getFreshOfficialTimelineForRequest(
        routeKey,
        requestedGroupId,
        freshRequestedAt
      );
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
      const hasEndpointTemplate = observedTimelineEndpointByGroup.has(String(requestedGroupId))
        || observedTimelineEndpointByRoute.has(resolvedRouteKey);
      const officialPayload = hasEndpointTemplate
        ? null
        : await waitForOfficialTimeline(routeKey, freshRequestedAt, requestedGroupId);
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

  async function fetchComments(statusId, maxId = "") {
    const endpoint = new URL("/ajax/statuses/buildComments", window.location.origin);
    endpoint.searchParams.set("id", String(statusId));
    endpoint.searchParams.set("flow", "0");
    if (!maxId) {
      endpoint.searchParams.set("is_reload", "1");
    }
    endpoint.searchParams.set("is_mix", "0");
    endpoint.searchParams.set("count", "20");
    endpoint.searchParams.set("max_id", String(maxId || "0"));
    endpoint.searchParams.set("max_id_type", "0");
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
      const data = payload.data;
      const comments = Array.isArray(data)
        ? data
        : data?.data || data?.comments || payload.comments || [];
      const lastComment = Array.isArray(comments) ? comments[comments.length - 1] : null;
      const explicitMaxId = payload.max_id
        ?? payload.max_id_str
        ?? data?.max_id
        ?? data?.max_id_str
        ?? payload.next_cursor
        ?? data?.next_cursor;
      const nextMaxId = explicitMaxId ?? (
        comments.length >= 20
          ? lastComment?.idstr || lastComment?.id || ""
          : ""
      );
      const totalNumber = payload.total_number
        ?? payload.total
        ?? data?.total_number
        ?? data?.total
        ?? 0;
      return {
        ok: true,
        payload: {
          comments: Array.isArray(comments) ? comments : [],
          maxId: nextMaxId,
          totalNumber
        }
      };
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

  // 回复某一条已有评论：真实接口是独立的 /ajax/comments/reply（不是顶层评论
  // 用的 /ajax/comments/create），已在浏览器网络面板抓包核实。字段为 id（当前
  // 微博 id）、cid（被回复评论的 id）、comment、pic_id（图片评论用，本扩展
  // 不支持图片评论，故不传）、is_repost=0、comment_ori=0、is_comment=0。
  // pic_id 在抓包里是空值，postWeiboForm 本就会自动过滤掉空字符串字段，
  // 因此这里不需要显式传 pic_id: ""，效果与真实请求一致。
  async function createCommentReply(statusId, parentCommentId, text) {
    const comment = String(text || "").trim();
    if (!statusId || !parentCommentId || !comment) {
      return { ok: false, reason: "回复内容不能为空。" };
    }

    return postWeiboForm(
      "/ajax/comments/reply",
      {
        id: String(statusId),
        cid: String(parentCommentId),
        comment,
        is_repost: 0,
        comment_ori: 0,
        is_comment: 0
      },
      "weibo-comment"
    );
  }

  // 评论点赞/取消点赞：真实接口是两个独立的路径 /ajax/statuses/updateLike
  // （点赞）与 /ajax/statuses/destroyLike（取消点赞），字段均为 object_id
  // （评论 id）、object_type=comment，已在浏览器网络面板分别抓包核实。
  async function setCommentLike(commentId) {
    if (!commentId) {
      return { ok: false, reason: "缺少评论 ID，无法点赞。" };
    }

    return postWeiboForm(
      "/ajax/statuses/updateLike",
      { object_id: String(commentId), object_type: "comment" },
      "weibo-comment-like"
    );
  }

  async function cancelCommentLike(commentId) {
    if (!commentId) {
      return { ok: false, reason: "缺少评论 ID，无法取消点赞。" };
    }

    return postWeiboForm(
      "/ajax/statuses/destroyLike",
      { object_id: String(commentId), object_type: "comment" },
      "weibo-comment-like"
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
      "create-comment-reply",
      "create-repost",
      "set-attitude",
      "cancel-attitude",
      "set-comment-like",
      "cancel-comment-like"
    ].includes(message.type);
    if (requiresUserActivation && navigator.userActivation && !navigator.userActivation.isActive) {
      respond(message.requestId, { ok: false, reason: "请在详情卡片中手动发起此操作。" });
      return;
    }

    const bridgeSessionId = message.bridgeSessionId;
    if (!bridgeSessionId) {
      return;
    }

    if (message.type === "fetch-timeline") {
      void fetchTimeline(message.query, message.routeKey, message.requestedAt).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "fetch-comments") {
      void fetchComments(message.statusId, message.maxId).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "fetch-long-text") {
      void fetchLongText(message.statusId).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "create-comment") {
      void createComment(message.statusId, message.text).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "create-repost") {
      void createRepost(message.statusId, message.text).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "set-attitude") {
      void setAttitude(message.statusId).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "cancel-attitude") {
      void cancelAttitude(message.statusId).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "create-comment-reply") {
      void createCommentReply(message.statusId, message.parentCommentId, message.text).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "set-comment-like") {
      void setCommentLike(message.commentId).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "cancel-comment-like") {
      void cancelCommentLike(message.commentId).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

  });

  installOfficialTimelineObserver();
})();
