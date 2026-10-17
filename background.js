/* ============================================================
 * 后台服务（MV3 service worker）
 * 功能：每 30 分钟自动保存一次当前打开的所有标签页快照
 *       （含标题+网址，存入 chrome.storage.local，不写收藏夹）
 * ============================================================ */

const SNAP_KEY = "__tab_snapshots";
const MAX_SNAPS = 30;
const SAVE_INTERVAL_MIN = 30;

function isSkipUrl(u) {
  return !u || /^(chrome|edge|about|extension|devtools|view-source):/.test(u);
}

async function saveTabSnapshot() {
  try {
    const tabs = await chrome.tabs.query({});
    const list = tabs
      .filter((t) => t.url && !isSkipUrl(t.url))
      .map((t) => ({ title: String(t.title || "").slice(0, 200), url: t.url }));
    if (!list.length) return;
    const got = await chrome.storage.local.get(SNAP_KEY);
    const arr = got[SNAP_KEY] || [];
    /* 去重：与最近一条完全相同则不重复保存 */
    if (arr.length && JSON.stringify(arr[0].tabs) === JSON.stringify(list)) return;
    arr.unshift({ time: Date.now(), tabs: list });
    await chrome.storage.local.set({ [SNAP_KEY]: arr.slice(0, MAX_SNAPS) });
  } catch (e) {
    console.warn("后台保存标签页快照失败", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("tab-snap", { periodInMinutes: SAVE_INTERVAL_MIN });
  saveTabSnapshot();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tab-snap") saveTabSnapshot();
});
