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

  function md5Buffer(buffer) {
    const bytes = new Uint8Array(buffer);
    const words = [];
    for (let index = 0; index < bytes.length; index += 1) {
      words[index >> 2] = (words[index >> 2] || 0) | (bytes[index] << ((index % 4) * 8));
    }
    const bitLength = bytes.length * 8;
    words[bytes.length >> 2] = (words[bytes.length >> 2] || 0) | (0x80 << ((bytes.length % 4) * 8));
    const lengthWord = ((bytes.length + 8) >> 6) + 1;
    while (words.length < lengthWord * 16) words.push(0);
    words[lengthWord * 16 - 2] = bitLength >>> 0;
    words[lengthWord * 16 - 1] = Math.floor(bitLength / 0x100000000);

    const rotate = (value, amount) => (value << amount) | (value >>> (32 - amount));
    const add = (first, second) => (first + second) | 0;
    const sine = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000));
    const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;
    for (let block = 0; block < words.length; block += 16) {
      let aa = a;
      let bb = b;
      let cc = c;
      let dd = d;
      for (let index = 0; index < 64; index += 1) {
        let functionValue;
        let wordIndex;
        if (index < 16) {
          functionValue = (bb & cc) | (~bb & dd);
          wordIndex = index;
        } else if (index < 32) {
          functionValue = (dd & bb) | (~dd & cc);
          wordIndex = (5 * index + 1) % 16;
        } else if (index < 48) {
          functionValue = bb ^ cc ^ dd;
          wordIndex = (3 * index + 5) % 16;
        } else {
          functionValue = cc ^ (bb | ~dd);
          wordIndex = (7 * index) % 16;
        }
        const round = Math.floor(index / 16);
        const shift = shifts[round * 4 + (index % 4)];
        const next = add(add(add(aa, functionValue), words[block + wordIndex] || 0), sine[index]);
        const rotated = add(bb, rotate(next, shift));
        aa = dd;
        dd = cc;
        cc = bb;
        bb = rotated;
      }
      a = add(a, aa);
      b = add(b, bb);
      c = add(c, cc);
      d = add(d, dd);
    }
    const digestWords = [a, b, c, d];
    return digestWords.map((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
  }

  function getCurrentUserId() {
    const directId = String(
      window.$CONFIG?.uid
      || window.$CONFIG?.user?.id
      || window.$CONFIG?.user?.idstr
      || window.$uid
      || window._CONFIG?.uid
      || window._CONFIG?.user?.id
      || window.__wbConfig?.uid
      || window.__wbConfig?.user?.id
      || ""
    );
    if (directId) {
      return directId;
    }

    const initialState = window.__INITIAL_STATE__;
    const candidates = [
      initialState?.loginUser,
      initialState?.login_user,
      initialState?.user,
      initialState?.account,
      window.$CONFIG?.loginUser,
      window.$CONFIG?.login_user
    ];
    for (const candidate of candidates) {
      const id = candidate?.idstr || candidate?.id || candidate?.uid;
      if (id) {
        return String(id);
      }
    }
    return "";
  }

  async function uploadCommentImage(file) {
    if (!(file instanceof File) || !file.size) {
      return { ok: false, reason: "请选择有效的图片文件。" };
    }

    try {
      const buffer = await file.arrayBuffer();
      const endpoint = new URL("https://picupload.weibo.com/interface/upload.php");
      endpoint.searchParams.set("file_source", "3");
      endpoint.searchParams.set("cs", String(Math.floor(Math.random() * 0x7fffffff)));
      endpoint.searchParams.set("ent", "miniblog");
      endpoint.searchParams.set("appid", "339644097");
      const uid = getCurrentUserId();
      if (uid) endpoint.searchParams.set("uid", uid);
      endpoint.searchParams.set("raw_md5", md5Buffer(buffer));
      endpoint.searchParams.set("ori", "1");
      endpoint.searchParams.set("mpos", "1");
      endpoint.searchParams.set("nick", "0");
      endpoint.searchParams.set("request_id", String(Date.now()));
      endpoint.searchParams.set("file_size", String(file.size));

      const response = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", endpoint.href);
        request.setRequestHeader("Content-Type", "application/octet-stream");
        request.addEventListener("load", () => resolve(request));
        request.addEventListener("error", () => reject(new Error("图片上传请求失败（可能被图床 CORS 策略拦截）。")));
        request.addEventListener("abort", () => reject(new Error("图片上传已取消。")));
        request.send(buffer);
      });
      let payload = null;
      try {
        payload = JSON.parse(response.responseText || "{}");
      } catch {
        return { ok: false, reason: "图片上传返回了无法识别的响应。" };
      }
      const pid = payload?.pic?.pid;
      if (response.status < 200 || response.status >= 300 || !payload?.ret || !pid) {
        return {
          ok: false,
          reason: payload?.msg || payload?.message
            || `图片上传失败（HTTP ${response.status || "未知"}，errno：${payload?.errno ?? "未知"}，uid：${uid || "缺失"}，响应字段：${Object.keys(payload || {}).join(",") || "无"}）。`
        };
      }
      return { ok: true, payload: { pid: String(pid) } };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "图片上传失败。" };
    }
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

  async function createComment(statusId, text, alsoRepost = false, picId = "") {
    const comment = String(text || "").trim();
    if (!statusId || (!comment && !picId)) {
      return { ok: false, reason: "评论内容不能为空。" };
    }

    return postWeiboForm(
      "/ajax/comments/create",
      {
        id: String(statusId),
        comment,
        pic_id: picId,
        is_repost: alsoRepost ? 1 : 0,
        comment_ori: 0,
        is_comment: 0
      },
      "weibo-comment"
    );
  }

  // 回复某一条已有评论：真实接口是独立的 /ajax/comments/reply（不是顶层评论
  // 用的 /ajax/comments/create），字段为 id、cid、comment、pic_id、is_repost=0、
  // comment_ori=0、is_comment=0；pic_id 为空时由 postWeiboForm 自动过滤。
  async function createCommentReply(statusId, parentCommentId, text, picId = "") {
    const comment = String(text || "").trim();
    if (!statusId || !parentCommentId || (!comment && !picId)) {
      return { ok: false, reason: "回复内容不能为空。" };
    }

    return postWeiboForm(
      "/ajax/comments/reply",
      {
        id: String(statusId),
        cid: String(parentCommentId),
        comment,
        pic_id: picId,
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

  async function createRepost(statusId, text, alsoComment = false) {
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
        is_comment: alsoComment ? 1 : 0,
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

    const bridgeSessionId = message.bridgeSessionId;
    if (!bridgeSessionId) {
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
      respond(message.requestId, bridgeSessionId, {
        ok: false,
        reason: "请在详情卡片中手动发起此操作。"
      });
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
      void createComment(message.statusId, message.text, message.alsoRepost, message.picId).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "create-repost") {
      void createRepost(message.statusId, message.text, message.alsoComment).then((result) => {
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
      void createCommentReply(message.statusId, message.parentCommentId, message.text, message.picId).then((result) => {
        respond(message.requestId, bridgeSessionId, result);
      });
    }

    if (message.type === "upload-comment-image") {
      void uploadCommentImage(message.file).then((result) => {
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
