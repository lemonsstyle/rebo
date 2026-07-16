(() => {
  "use strict";

  const CHANNEL = "weibo-grid-reader";

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

  function findObservedTimelineEndpoint() {
    const entries = performance.getEntriesByType("resource").slice().reverse();

    for (const entry of entries) {
      const endpoint = new URL(entry.name);
      if (endpoint.origin === window.location.origin && endpoint.pathname === "/ajax/feed/friendstimeline") {
        return endpoint;
      }
    }

    return null;
  }

  async function requestTimeline(endpoint) {
    let lastResponse = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await window.fetch(endpoint, {
        credentials: "same-origin",
        headers: createWeiboRequestHeaders()
      });

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

  async function fetchTimeline(query) {
    const endpoint = findObservedTimelineEndpoint()
      || new URL("/ajax/feed/friendstimeline", window.location.origin);

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

  function getArrayFromPayload(payload) {
    const candidates = [
      payload?.data,
      payload?.users,
      payload?.statuses,
      payload?.reposts,
      payload?.data?.data,
      payload?.data?.users,
      payload?.data?.statuses
    ];
    return candidates.find(Array.isArray) || [];
  }

  async function fetchStatusList(statusId, type) {
    const isRepost = type === "reposts";
    const endpoint = new URL(
      isRepost ? "/ajax/statuses/repostTimeline" : "/ajax/statuses/attitudes",
      window.location.origin
    );
    endpoint.searchParams.set("id", String(statusId));
    endpoint.searchParams.set("count", "20");
    endpoint.searchParams.set("page", "1");
    if (isRepost) {
      endpoint.searchParams.set("moduleID", "feed");
    }

    try {
      const response = await window.fetch(endpoint, {
        credentials: "same-origin",
        headers: createWeiboRequestHeaders()
      });
      if (!response.ok) {
        return { ok: false, reason: `${isRepost ? "转发" : "点赞"}请求失败（HTTP ${response.status}）。` };
      }

      const payload = await response.json();
      return { ok: true, payload: { items: getArrayFromPayload(payload) } };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : `${isRepost ? "转发" : "点赞"}请求失败。`
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
      void fetchTimeline(message.query).then((result) => {
        respond(message.requestId, result);
      });
    }

    if (message.type === "fetch-comments") {
      void fetchComments(message.statusId).then((result) => {
        respond(message.requestId, result);
      });
    }

    if (message.type === "fetch-reposts" || message.type === "fetch-likes") {
      const type = message.type === "fetch-reposts" ? "reposts" : "likes";
      void fetchStatusList(message.statusId, type).then((result) => {
        respond(message.requestId, result);
      });
    }
  });
})();
