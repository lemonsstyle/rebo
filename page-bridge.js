(() => {
  "use strict";

  const CHANNEL = "weibo-grid-reader-v2";
  const officialTimelineByGroup = new Map();
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
      "Client-Version": "3.0.0",
      "X-Requested-With": "XMLHttpRequest"
    };
    const xsrfToken = readCookie("XSRF-TOKEN");
    if (xsrfToken) {
      headers["X-XSRF-TOKEN"] = xsrfToken;
    }

    return headers;
  }

  function getTimelineGroupId(endpoint) {
    return endpoint.searchParams.get("list_id")
      || endpoint.searchParams.get("fid")
      || "";
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

  function storeOfficialTimeline(endpoint, payload) {
    const maxId = endpoint.searchParams.get("max_id");
    if (!Array.isArray(payload?.statuses) || (maxId && maxId !== "0")) {
      return;
    }

    officialTimelineByGroup.set(getTimelineGroupId(endpoint), {
      payload,
      receivedAt: Date.now()
    });
  }

  function observeFetchTimeline(input, response) {
    const endpoint = getRequestUrl(input);
    if (!isTimelineEndpoint(endpoint) || !response.ok) {
      return;
    }

    void response.clone().json().then((payload) => {
      storeOfficialTimeline(endpoint, payload);
    }).catch(() => {});
  }

  function installOfficialTimelineObserver() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function observedFetch(input, init) {
      const shouldObserve = readerTimelineRequestDepth === 0;
      const responsePromise = nativeFetch(input, init);
      if (shouldObserve) {
        void responsePromise.then((response) => observeFetchTimeline(input, response)).catch(() => {});
      }
      return responsePromise;
    };

    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    const requestUrls = new WeakMap();
    XMLHttpRequest.prototype.open = function observedOpen(method, url, ...rest) {
      requestUrls.set(this, getRequestUrl(url));
      return nativeOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function observedSend(...args) {
      const endpoint = requestUrls.get(this);
      if (readerTimelineRequestDepth === 0 && isTimelineEndpoint(endpoint)) {
        this.addEventListener("loadend", () => {
          if (this.status < 200 || this.status >= 300) {
            return;
          }
          try {
            const payload = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
            storeOfficialTimeline(endpoint, payload);
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
      if (requestedGroupId ? observedGroupId === requestedGroupId : !observedGroupId) {
        return endpoint;
      }
    }

    return null;
  }

  async function getTimelineEndpoint(query) {
    const initialEndpoint = findObservedTimelineEndpoint(query);
    if (initialEndpoint) {
      return initialEndpoint;
    }

    const deadline = performance.now() + 1200;
    while (performance.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      const observedEndpoint = findObservedTimelineEndpoint(query);
      if (observedEndpoint) {
        return observedEndpoint;
      }
    }

    return null;
  }

  async function waitForOfficialTimeline(query, requestedAt) {
    const groupId = String(query?.list_id || query?.fid || "");
    const deadline = performance.now() + 1200;

    while (performance.now() < deadline) {
      const timeline = officialTimelineByGroup.get(groupId);
      if (timeline && timeline.receivedAt >= requestedAt) {
        return timeline.payload;
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

  async function fetchTimeline(query, requestedAt = 0) {
    if (!query?.max_id) {
      const officialPayload = await waitForOfficialTimeline(query, Number(requestedAt) || 0);
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

    const endpoint = await getTimelineEndpoint(query);
    if (!endpoint) {
      return { ok: false, reason: "尚未捕获当前分组的微博官方信息流请求。" };
    }

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

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const message = event.data;
    if (message?.channel !== CHANNEL || message.sender !== "content" || !message.requestId) {
      return;
    }

    if (message.type === "fetch-timeline") {
      void fetchTimeline(message.query, message.requestedAt).then((result) => {
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

  });

  installOfficialTimelineObserver();
})();
