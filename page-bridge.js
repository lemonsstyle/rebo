(() => {
  "use strict";

  const CHANNEL = "weibo-grid-reader";

  function respond(requestId, payload) {
    window.postMessage({ channel: CHANNEL, sender: "page", requestId, ...payload }, window.location.origin);
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
        headers: {
          Accept: "application/json, text/plain, */*",
          "Client-Version": "3.0.0",
          "X-Requested-With": "XMLHttpRequest"
        }
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
  });
})();
