"use strict";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !/^https:\/\/(?:www\.)?weibo\.com(?:\/|$)/i.test(tab.url || "")) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle-reader-drawer" });
  } catch {
    // The content script may not be ready on a newly opened or restricted tab.
  }
});
