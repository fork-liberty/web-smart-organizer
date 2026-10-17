/* ============================================================
 * 网页智能整理 popup 主逻辑（v1.1：去重识别 + 可操作管理）
 * ============================================================ */

const $ = (id) => document.getElementById(id);

/* ---------- 通用 ---------- */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* 给条目列表打重复标记：仅当【规范化 URL 相同 且 标题相同】才算重复，
 * 每组第一个标 keep。避免“同游戏不同页面”被误判。 */
function markDuplicates(items) {
  const map = {};
  for (const it of items) {
    const k = normalizeUrl(it.url) + "||" + String(it.title || "").trim().toLowerCase();
    (map[k] = map[k] || []).push(it);
  }
  let dupCount = 0;
  for (const g of Object.values(map)) {
    if (g.length > 1) {
      g.forEach((it, i) => {
        it.dup = true;
        it.dupTotal = g.length;
        it.keep = i === 0;
      });
      dupCount += g.length - 1;
    }
  }
  return dupCount; // 可清理的重复条数
}

function groupItems(items) {
  const groups = {};
  for (const it of items) {
    const key = it.cls.theme;
    (groups[key] = groups[key] || []).push(it);
  }
  return groups;
}

function renderGroups(container, groups, opts) {
  opts = opts || {};
  container.innerHTML = "";
  const themes = Object.keys(groups).sort(
    (a, b) => groups[b].length - groups[a].length
  );
  if (!themes.length) {
    container.innerHTML = '<div class="empty">暂无内容</div>';
    return;
  }
  for (const theme of themes) {
    const items = groups[theme];
    const head = document.createElement("div");
    head.className = "group-title";
    head.innerHTML =
      '<span class="dot" style="background:' +
      (THEME_COLOR[theme] === "grey" ? "#8c959f" : THEME_COLOR[theme]) +
      '"></span>' + escapeHtml(theme) + "（" + items.length + "）" +
      '<span class="collapse-hint">点击展开/收起</span>';
    const body = document.createElement("div");
    body.className = "group-body";
    body.style.display = "none";

    for (const it of items) {
      const row = document.createElement("div");
      row.className = "item" + (it.dup ? " dup" : "");
      if (it.id !== undefined && it.id !== null && !opts.noClick) {
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          chrome.tabs.update(it.id, { active: true });
        });
      }
      const riskTags = it.cls.risks
        .map((r) => '<span class="tag risk-' + r + '">' + riskCn(r) + "</span>")
        .join("");
      const typeTags = it.cls.pageTypes
        .map((p) => '<span class="tag">' + escapeHtml(p) + "</span>")
        .join("");
      let dupTag = "";
      if (it.dup) {
        dupTag = it.keep
          ? '<span class="tag dup-keep">重复×' + it.dupTotal + "·保留</span>"
          : '<span class="tag dup-del">重复×' + it.dupTotal + "·可清理</span>";
      }
      const closeBtn = opts.showClose
        ? '<button class="close-btn" data-id="' + it.id + '" title="关闭此标签页">×</button>'
        : "";
      row.innerHTML =
        '<span class="title">' + escapeHtml(it.title || it.url || "") + "</span>" +
        (opts.showUrl && it.url
          ? '<span class="url">' + escapeHtml(it.url) + "</span>" : "") +
        typeTags + riskTags + dupTag + closeBtn;
      body.appendChild(row);
    }
    head.addEventListener("click", () => {
      body.style.display = body.style.display === "none" ? "block" : "none";
    });
    container.appendChild(head);
    container.appendChild(body);
  }
}

/* ---------- 书签视图 ---------- */

function collectBookmarks(nodes, folderPath, out) {
  for (const node of nodes) {
    if (node.url) {
      out.push({
        id: node.id,
        title: node.title,
        url: node.url,
        folder: folderPath || "（根）",
        cls: classify(node.url, node.title)
      });
    }
    if (node.children) {
      const path = node.title
        ? (folderPath ? folderPath + " > " + node.title : node.title)
        : folderPath;
      collectBookmarks(node.children, path, out);
    }
  }
}

async function loadBookmarks() {
  const status = $("bm-status") || document.createElement("div");
  status.id = "bm-status";
  status.className = "status";
  $("bm-summary").before(status);
  status.textContent = "正在分析书签…";
  try {
    const tree = await chrome.bookmarks.getTree();
    const items = [];
    collectBookmarks(tree, "", items);
    window.__bmItems = items;

    const dupCount = markDuplicates(items);
    const groups = groupItems(items);
    const chips = Object.keys(groups)
      .sort((a, b) => groups[b].length - groups[a].length)
      .map(
        (t) =>
          '<span class="chip"><span class="dot" style="background:' +
          (THEME_COLOR[t] === "grey" ? "#8c959f" : THEME_COLOR[t]) +
          '"></span>' + escapeHtml(t) + " " + groups[t].length + "</span>"
      )
      .join("");
    const riskCount = items.filter((i) => i.cls.risks.length).length;
    $("bm-summary").innerHTML =
      "共 " + items.length + " 个书签" +
      (riskCount ? " · 风险标注 " + riskCount + " 个" : "") +
      (dupCount ? " · 重复可清理 " + dupCount + " 个" : " · 无重复") +
      "<br>" + chips;
    renderGroups($("bm-detail"), groups, { showUrl: true });
    status.textContent = "书签分析完成（只读）——重复项已标出，可点下方清理";
  } catch (e) {
    status.textContent = "读取书签失败：" + e.message;
  }
}

async function cleanDupBookmarks() {
  const items = window.__bmItems || [];
  const map = {};
  for (const it of items) {
    const k = normalizeUrl(it.url) + "||" + String(it.title || "").trim().toLowerCase();
    (map[k] = map[k] || []).push(it);
  }
  const groups = Object.values(map).filter((g) => g.length > 1);
  if (!groups.length) {
    alert("没有重复书签（网址和标题都相同才算重复），无需清理");
    return;
  }
  const total = groups.reduce((n, g) => n + g.length - 1, 0);
  if (!confirm("将删除 " + total + " 个重复书签（每组保留第一个），其余收藏全部不动。是否继续？")) {
    return;
  }
  let removed = 0, failed = 0;
  for (const g of groups) {
    for (const it of g.slice(1)) {
      try { await chrome.bookmarks.remove(it.id); removed++; }
      catch (e) { failed++; }
    }
  }
  alert("清理完成：删除重复书签 " + removed + " 个" +
        (failed ? "，失败 " + failed + " 个" : ""));
  loadBookmarks();
}

/* ---------- 一键整理书签：创建分类文件夹并移动归类（不删除） ---------- */

async function findOrCreateRoot() {
  const tree = await chrome.bookmarks.getTree();
  const roots = (tree[0] && tree[0].children) || [];
  const bar = roots.find((r) => r.id === "1") || roots[0];
  let existing = null;
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.title === "AI分类整理" && n.children) { existing = n; return; }
      if (n.children) walk(n.children);
    }
  };
  walk(roots);
  if (existing) {
    if (existing.parentId !== bar.id) {
      await chrome.bookmarks.move(existing.id, { parentId: bar.id });
    }
    return existing;
  }
  return chrome.bookmarks.create({ title: "AI分类整理", parentId: bar.id });
}

function itemGroupKey(it) {
  if (it.cls.risks.includes("adult")) return "【敏感内容】";
  if (it.cls.risks.includes("copyright_risk")) return "【版权风险】";
  return it.cls.theme;
}

const SNAP_KEY = "__org_snapshot_v1";

async function organizeBookmarks() {
  const items = window.__bmItems || [];
  if (!items.length) return;
  const got = await chrome.storage.local.get(SNAP_KEY);
  const snap = got[SNAP_KEY] || [];
  if (snap.length) {
    if (confirm(
      "检测到已经整理过一次。\n" +
      "· 点「确定」：把书签恢复回整理前的位置（原样还原）\n" +
      "· 点「取消」：保持当前整理结果\n" +
      "（此操作不删除任何书签）"
    )) {
      const status = $("bm-status") || document.createElement("div");
      status.textContent = "正在恢复整理前状态…";
      let ok = 0, fail = 0;
      for (const s of snap) {
        try {
          await chrome.bookmarks.move(s.id, { parentId: s.parentId, index: s.index });
          ok++;
        } catch (e) { fail++; }
      }
      await chrome.storage.local.remove(SNAP_KEY);
      status.textContent = "已恢复 " + ok + " 个书签原位置" +
        (fail ? "（失败 " + fail + " 个）" : "");
      loadBookmarks();
    }
    return;
  }
  const riskCount = items.filter((it) => it.cls.risks.length).length;
  if (!confirm(
    "将把 " + items.length + " 个书签按分类移入「AI分类整理」文件夹：\n" +
    "· 不删除任何书签\n" +
    "· 书签会从原来的位置移入对应分类子文件夹\n" +
    (riskCount ? "· 风险标注书签会单独归入「敏感内容/版权风险」文件夹\n" : "") +
    "· 整理后可再次点击本按钮一键恢复原位置\n" +
    "确定整理吗？"
  )) return;
  const status = $("bm-status") || document.createElement("div");
  status.textContent = "正在整理书签…";
  try {
    const root = await findOrCreateRoot();
    const folders = {};
    for (const it of items) {
      const key = itemGroupKey(it);
      if (!folders[key]) {
        folders[key] = await chrome.bookmarks.create({ title: key, parentId: root.id });
      }
    }
    let moved = 0, failed = 0;
    for (const it of items) {
      try {
        await chrome.bookmarks.move(it.id, { parentId: folders[itemGroupKey(it)].id });
        moved++;
      } catch (e) { failed++; }
    }
    status.textContent = "整理完成：移动 " + moved + " 个书签到分类文件夹" +
      (failed ? "（失败 " + failed + " 个）" : "");
    const before = items.map((it) => ({
      id: it.id,
      parentId: it.parentId,
      index: it.index,
    }));
    await chrome.storage.local.set({ [SNAP_KEY]: before });
    loadBookmarks();
  } catch (e) {
    status.textContent = "整理失败：" + e.message;
  }
}

/* ---------- 标签页视图 ---------- */

async function loadTabs() {
  const status = $("tab-status") || document.createElement("div");
  status.className = "status";
  $("tab-summary").before(status);
  status.textContent = "正在分析标签页…";
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const items = tabs
      .filter((t) => t.url && !t.url.startsWith("chrome://") &&
               !t.url.startsWith("edge://") && !t.url.startsWith("about:"))
      .map((t) => ({
        title: t.title,
        url: t.url,
        id: t.id,
        cls: classify(t.url, t.title)
      }));
    window.__tabItems = items;

    const dupCount = markDuplicates(items);
    const groups = groupItems(items);
    const chips = Object.keys(groups)
      .sort((a, b) => groups[b].length - groups[a].length)
      .map(
        (t) =>
          '<span class="chip"><span class="dot" style="background:' +
          (THEME_COLOR[t] === "grey" ? "#8c959f" : THEME_COLOR[t]) +
          '"></span>' + escapeHtml(t) + " " + groups[t].length + "</span>"
      )
      .join("");
    $("tab-summary").innerHTML =
      "本窗口 " + items.length + " 个网页" +
      (dupCount ? " · 重复 " + dupCount + " 个" : " · 无重复") +
      "<br>" + chips;
    renderGroups($("tab-list"), groups, { showUrl: true, showClose: true });
    status.textContent = "点击条目可跳转 · 点 × 关闭单个 · 重复项已标出";
  } catch (e) {
    status.textContent = "读取标签页失败：" + e.message;
  }
}

async function groupTabs() {
  const status = $("tab-status");
  status.textContent = "正在按分类分组…";
  try {
    const items = window.__tabItems || [];
    const map = {};
    for (const it of items) {
      let key;
      if (it.cls.risks.includes("adult")) key = "【敏感内容】";
      else if (it.cls.risks.includes("copyright_risk")) key = "【版权风险】";
      else key = it.cls.theme;
      (map[key] = map[key] || []).push(it.id);
    }
    let made = 0;
    for (const [key, ids] of Object.entries(map)) {
      if (ids.length < 2) continue;
      try {
        const gid = await chrome.tabs.group({ tabIds: ids });
        const color = key === "【敏感内容】" || key === "【版权风险】"
          ? "red" : (THEME_COLOR[key] || "grey");
        await chrome.tabGroups.update(gid, { title: key, color });
        made++;
      } catch (e) {
        console.warn("分组失败", key, e);
      }
    }
    status.textContent = "完成：新建 " + made + " 个标签组（右键组标题可取消）";
  } catch (e) {
    status.textContent = "分组失败：" + e.message;
  }
}

async function ungroupTabs() {
  const status = $("tab-status");
  status.textContent = "正在取消分组…";
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const ids = tabs.map((t) => t.id);
    await chrome.tabs.ungroup({ tabIds: ids });
    status.textContent = "已取消本窗口所有标签组";
  } catch (e) {
    status.textContent = "取消失败：" + e.message;
  }
}

/* 一键关闭重复标签页：每组保留第一个（网址和标题都相同才算重复） */
async function closeDupTabs() {
  const status = $("tab-status");
  const items = window.__tabItems || [];
  const map = {};
  for (const it of items) {
    const k = normalizeUrl(it.url) + "||" + String(it.title || "").trim().toLowerCase();
    (map[k] = map[k] || []).push(it);
  }
  const groups = Object.values(map).filter((g) => g.length > 1);
  if (!groups.length) {
    status.textContent = "没有重复标签页（网址和标题都相同才算重复）";
    return;
  }
  status.textContent = "正在关闭重复标签页…";
  let closed = 0, failed = 0;
  for (const g of groups) {
    for (const it of g.slice(1)) {
      try { await chrome.tabs.remove(it.id); closed++; }
      catch (e) { failed++; }
    }
  }
  status.textContent = "已关闭重复标签页 " + closed + " 个（每组保留第一份）" +
    (failed ? "，失败 " + failed + " 个" : "");
  loadTabs();
}

/* 点击关闭按钮：事件委托 */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".close-btn");
  if (btn) {
    const id = Number(btn.dataset.id);
    chrome.tabs.remove(id).then(() => loadTabs()).catch(() => {});
    e.stopPropagation();
  }
});

/* ---------- 报告 ---------- */

async function openReport() {
  const items = window.__bmItems || [];
  if (!items.length) {
    alert("请先打开「书签分析」标签页再生成报告");
    return;
  }
  await chrome.storage.local.set({ reportItems: items });
  await chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
}

/* ---------- 事件绑定 ---------- */

$("tab-bookmarks").addEventListener("click", () => {
  $("tab-bookmarks").classList.add("active");
  $("tab-tabs").classList.remove("active");
  $("view-bookmarks").classList.add("active");
  $("view-tabs").classList.remove("active");
  if (!$("bm-detail").childElementCount) loadBookmarks();
});

$("tab-tabs").addEventListener("click", () => {
  $("tab-tabs").classList.add("active");
  $("tab-bookmarks").classList.remove("active");
  $("view-tabs").classList.add("active");
  $("view-bookmarks").classList.remove("active");
  if (!$("tab-list").childElementCount) loadTabs();
});

$("btn-reload-bm").addEventListener("click", loadBookmarks);
$("btn-report").addEventListener("click", openReport);
$("btn-clean-dup").addEventListener("click", cleanDupBookmarks);
$("btn-organize").addEventListener("click", organizeBookmarks);
$("btn-group").addEventListener("click", groupTabs);
$("btn-ungroup").addEventListener("click", ungroupTabs);
$("btn-close-dup").addEventListener("click", closeDupTabs);
$("btn-reload-tabs").addEventListener("click", loadTabs);

/* 启动：默认加载书签视图 */
loadBookmarks();
