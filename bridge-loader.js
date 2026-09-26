(() => {
  "use strict";

  if (!chrome?.runtime?.id) {
    return;
  }

  const bridge = document.createElement("script");
  try {
    bridge.src = chrome.runtime.getURL("page-bridge.js");
  } catch {
    return;
  }
  bridge.async = false;
  bridge.addEventListener("load", () => bridge.remove(), { once: true });
  bridge.addEventListener("error", () => bridge.remove(), { once: true });
  (document.head || document.documentElement).appendChild(bridge);
})();
