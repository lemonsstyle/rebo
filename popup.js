(() => {
  "use strict";

  const COLUMN_LABELS = {
    2: "稀疏，2 列",
    3: "适中，3 列",
    4: "紧凑，4 列"
  };

  const status = document.querySelector("[data-status]");
  const settingsPanel = document.querySelector("[data-settings]");
  const readerToggle = document.querySelector('[data-setting="readerEnabled"]');
  const columnSlider = document.querySelector('[data-setting="columnCount"]');
  const densityLabels = [...document.querySelectorAll("[data-density-label]")];
  const quickActionsToggle = document.querySelector('[data-setting="cardQuickActions"]');
  const controls = [readerToggle, columnSlider, quickActionsToggle];
  let activeTabId = null;
  let busy = false;

  function setStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    settingsPanel.setAttribute("aria-busy", String(nextBusy));
    controls.forEach((control) => {
      control.disabled = nextBusy || (control !== readerToggle && !readerToggle.checked);
    });
  }

  function renderState(state) {
    document.body.dataset.theme = state.darkTheme ? "dark" : "light";
    readerToggle.checked = Boolean(state.readerEnabled);
    columnSlider.value = String(state.columnCount);
    updateDensityState(state.columnCount);
    quickActionsToggle.checked = Boolean(state.cardQuickActions);
    settingsPanel.hidden = false;
    setStatus("", "ready");
    setBusy(false);
  }

  function updateDensityState(columnCount) {
    const normalizedColumnCount = Number(columnCount);
    columnSlider.setAttribute(
      "aria-valuetext",
      COLUMN_LABELS[normalizedColumnCount] || COLUMN_LABELS[2]
    );
    columnSlider.style.setProperty(
      "--density-progress",
      `${((normalizedColumnCount - 2) / 2) * 100}%`
    );
    densityLabels.forEach((label) => {
      label.classList.toggle(
        "density-label--active",
        Number(label.dataset.densityLabel) === normalizedColumnCount
      );
    });
  }

  async function sendToPage(message) {
    if (!activeTabId) {
      throw new Error("没有可用的微博页面。");
    }
    return chrome.tabs.sendMessage(activeTabId, message);
  }

  async function updateSetting(key, value) {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus("正在应用设置…");
    try {
      const response = await sendToPage({ type: "update-reader-setting", key, value });
      if (!response?.ok) {
        if (response?.settings) {
          renderState(response.settings);
        } else {
          setBusy(false);
        }
        setStatus(response?.reason || "设置没有生效。", "error");
        return;
      }
      renderState(response.settings);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "设置失败，请刷新微博页面后重试。";
      try {
        const response = await sendToPage({ type: "get-reader-state" });
        if (response?.ok) {
          renderState(response.settings);
        }
      } catch {
        setBusy(false);
      }
      setStatus(reason, "error");
    }
  }

  readerToggle.addEventListener("change", () => {
    void updateSetting("readerEnabled", readerToggle.checked);
  });
  columnSlider.addEventListener("input", () => {
    updateDensityState(columnSlider.value);
  });
  columnSlider.addEventListener("change", () => {
    void updateSetting("columnCount", Number(columnSlider.value));
  });
  quickActionsToggle.addEventListener("change", () => {
    void updateSetting("cardQuickActions", quickActionsToggle.checked);
  });

  async function start() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTabId = tab?.id || null;
      const url = new URL(tab?.url || "");
      const isWeiboFeed = /^(?:www\.)?weibo\.com$/i.test(url.hostname)
        && (url.pathname === "/" || url.pathname === "/mygroups");
      if (!isWeiboFeed) {
        setStatus("请先打开微博首页或关注分组，再使用 rebo 设置。", "error");
        return;
      }

      const response = await sendToPage({ type: "get-reader-state" });
      if (!response?.ok) {
        throw new Error(response?.reason || "无法读取当前页面状态。");
      }
      renderState(response.settings);
    } catch {
      setStatus("无法连接当前微博页面，请刷新页面后重试。", "error");
    }
  }

  void start();
})();
