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

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch (e) { return ""; }
}

function normTitle(t) {
  return String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/* 重复标记（两档，评审修订版）：
 * - 强重复：规范化 URL 相同（不管标题），自动处理，每组留第一个
 * - 弱重复：URL 不同但 域名相同 且 标题规范化相同（同一页面收藏了不同网址），
 *   只标记“疑似”，不自动清理，需人工确认
 * 返回 { strong, weak } 可清理的强重复数 / 疑似弱重复条数 */
function markDuplicates(items) {
  const byUrl = {};
  for (const it of items) {
    const k = normalizeUrl(it.url);
    (byUrl[k] = byUrl[k] || []).push(it);
  }
  let strong = 0, weak = 0;
  for (const g of Object.values(byUrl)) {
    if (g.length > 1) {
      g.forEach((it, i) => {
        it.dup = true;
        it.dupStrong = true;
        it.dupWeak = false;
        it.dupTotal = g.length;
        it.keep = i === 0;
      });
      strong += g.length - 1;
    }
  }
  const byTitle = {};
  for (const it of items) {
    if (it.dupStrong) continue;
    const dom = domainOf(it.url);
    const t = normTitle(it.title);
    if (!dom || !t) continue;
    const k = dom + "||" + t;
    (byTitle[k] = byTitle[k] || []).push(it);
  }
  for (const g of Object.values(byTitle)) {
    if (g.length > 1) {
      g.forEach((it) => {
        if (!it.dup) {
          it.dup = true;
          it.dupWeak = true;
          it.dupTotal = g.length;
          weak++;
        }
      });
    }
  }
  return { strong, weak };
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
        if (it.dupWeak) {
          dupTag = '<span class="tag dup-weak">疑似重复×' + it.dupTotal + "·需确认</span>";
        } else {
          dupTag = it.keep
            ? '<span class="tag dup-keep">重复×' + it.dupTotal + "·保留</span>"
            : '<span class="tag dup-del">重复×' + it.dupTotal + "·可清理</span>";
        }
      }
      const aiTag = it.cls.aiRefined ? '<span class="tag ai-tag">AI复审</span>' : "";
      const closeBtn = opts.showClose
        ? '<button class="close-btn" data-id="' + it.id + '" title="关闭此标签页">×</button>'
        : "";
      row.innerHTML =
        '<span class="title">' + escapeHtml(it.title || it.url || "") + "</span>" +
        (opts.showUrl && it.url
          ? '<span class="url">' + escapeHtml(it.url) + "</span>" : "") +
        typeTags + riskTags + dupTag + aiTag + closeBtn;
      body.appendChild(row);
    }
    head.addEventListener("click", () => {
      body.style.display = body.style.display === "none" ? "block" : "none";
    });
    container.appendChild(head);
    container.appendChild(body);
  }
}

/* ---------- AI 复审：规则拿不准的条目批量送 AI 覆盖主题 ---------- */

async function applyAIRefine(items) {
  const cfg = await getAIConfig();
  if (!cfg.enabled) return { refined: 0, aiUsed: false };
  const review = items
    .map((it, idx) => Object.assign({ _idx: idx }, it))
    .filter((it) => needsAIReview(it, cfg));
  if (!review.length) return { refined: 0, aiUsed: false };
  const map = await classifyWithAI(
    review.map((r) => ({
      id: r._idx,
      title: r.title,
      url: r.url,
      searchQuery: extractSearchQuery(r.url)
    })),
    cfg
  );
  if (!map || !map.size) return { refined: 0, aiUsed: false }; // 失败/降级
  let refined = 0;
  for (const r of review) {
    const theme = map.get(r._idx);
    if (theme && theme !== r.cls.theme) {
      r.cls.theme = theme;
      r.cls.aiRefined = true;
      refined++;
    }
  }
  return { refined, aiUsed: true };
}

/* ---------- 搜索：按标题或网址过滤当前视图 ---------- */

function currentSearchPool() {
  if ($("view-bookmarks").classList.contains("active")) {
    return { key: "bm", items: window.__bmItems || [] };
  }
  return { key: "tabs", items: window.__tabItems || [] };
}

function applySearch() {
  const q = $("search-input").value.trim().toLowerCase();
  const mode = $("search-mode").value;
  const { key, items } = currentSearchPool();
  const detailId = key === "bm" ? "bm-detail" : "tab-list";
  const opts = key === "bm" ? { showUrl: true } : { showUrl: true, showClose: true };
  if (!q) {
    renderGroups($(detailId), groupItems(items), opts);
    return;
  }
  const filtered = items.filter((it) => {
    const hay = mode === "url" ? String(it.url || "") : String(it.title || "");
    return hay.toLowerCase().includes(q);
  });
  renderGroups($(detailId), groupItems(filtered), opts);
  const sumId = key === "bm" ? "bm-summary" : "tab-summary";
  const el = $(sumId);
  if (el) {
    const base = key === "bm" ? "书签" : "网页";
    el.innerHTML = '搜索「' + escapeHtml($("search-input").value.trim()) + '」（' +
      (mode === "url" ? "按网址" : "按标题") + "）共 " + filtered.length + " 个" +
      (filtered.length ? "" : "，无匹配");
  }
}

$("search-input").addEventListener("input", applySearch);
$("search-mode").addEventListener("change", applySearch);

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

    const dup = markDuplicates(items);
    const ai = await applyAIRefine(items);
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
      (dup.strong
        ? " · 重复可清理 " + dup.strong + " 个"
        : " · 无强重复") +
      (dup.weak ? " · 疑似重复 " + dup.weak + " 条需确认" : "") +
      (ai.aiUsed ? " · AI复审 " + ai.refined + " 个" : "") +
      "<br>" + chips;
    renderGroups($("bm-detail"), groups, { showUrl: true });
    status.textContent = ai.aiUsed
      ? "书签分析完成（只读）——AI 已复审 " + ai.refined + " 个拿不准的条目"
      : "书签分析完成（只读）——重复项已标出，可点下方清理";
  } catch (e) {
    status.textContent = "读取书签失败：" + e.message;
  }
}

async function cleanDupBookmarks() {
  const items = window.__bmItems || [];
  const byUrl = {};
  for (const it of items) {
    if (!it.dupStrong) continue; // 只处理强重复（URL 相同）
    const k = normalizeUrl(it.url);
    (byUrl[k] = byUrl[k] || []).push(it);
  }
  const groups = Object.values(byUrl).filter((g) => g.length > 1);
  if (!groups.length) {
    alert("没有强重复书签（网址完全相同才算自动清理）。疑似重复需在明细里人工确认。");
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

/* 在 root 下复用或创建同名分类文件夹（避免重复整理产生重复空文件夹） */
async function findOrCreateFolder(rootId, title) {
  const kids = await chrome.bookmarks.getChildren(rootId);
  const hit = kids.find((k) => k.url === undefined && k.title === title);
  if (hit) return hit;
  return chrome.bookmarks.create({ title, parentId: rootId });
}

/* 删除 root 下所有空的分类文件夹（整理/恢复后清理残留空壳） */
async function cleanupEmptyFolders(rootId) {
  try {
    const kids = await chrome.bookmarks.getChildren(rootId);
    for (const k of kids) {
      if (k.url === undefined) {
        try {
          const sub = await chrome.bookmarks.getChildren(k.id);
          if (!sub.length) await chrome.bookmarks.removeTree(k.id);
        } catch (e) { /* 文件夹可能已被删，忽略 */ }
      }
    }
  } catch (e) { /* 忽略 */ }
}

/* 恢复整理后：找到「AI分类整理」根文件夹并清理其下空文件夹 */
async function cleanupAfterRestore() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const findRoot = (nodes) => {
      for (const n of nodes) {
        if (n.title === "AI分类整理" && n.children) return n;
        if (n.children) { const r = findRoot(n.children); if (r) return r; }
      }
      return null;
    };
    const r = findRoot(tree);
    if (r) await cleanupEmptyFolders(r.id);
  } catch (e) { /* 忽略 */ }
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
      /* 评审修订：按原 index 排序后逐个 append 回原 parentId（不写死 index，
       * 避免整理后增删过书签导致错位）；原父文件夹若已被删除则兜底到收藏夹栏 */
      const sorted = [...snap].sort(
        (a, b) => (a.index || 0) - (b.index || 0)
      );
      let ok = 0, fail = 0;
      for (const s of sorted) {
        try {
          let parentId = s.parentId;
          try { await chrome.bookmarks.get(parentId); }
          catch (e) { parentId = "1"; } // 原文件夹不存在，放收藏夹栏
          await chrome.bookmarks.move(s.id, { parentId });
          ok++;
        } catch (e) { fail++; }
      }
      await chrome.storage.local.remove(SNAP_KEY);
      status.textContent = "已恢复 " + ok + " 个书签原位置" +
        (fail ? "（失败 " + fail + " 个）" : "");
      cleanupAfterRestore(); // 恢复后清掉残留的空分类文件夹
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
    "· 已存在同名的分类文件夹会复用，整理后自动清理空文件夹\n" +
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
        folders[key] = await findOrCreateFolder(root.id, key);
      }
    }
    let moved = 0, failed = 0;
    for (const it of items) {
      try {
        await chrome.bookmarks.move(it.id, { parentId: folders[itemGroupKey(it)].id });
        moved++;
      } catch (e) { failed++; }
    }
    await cleanupEmptyFolders(root.id); // 清理空分类文件夹
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

    const dup = markDuplicates(items);
    const ai = await applyAIRefine(items);
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
      (dup.strong ? " · 重复 " + dup.strong + " 个" : " · 无强重复") +
      (dup.weak ? " · 疑似 " + dup.weak + " 条" : "") +
      (ai.aiUsed ? " · AI复审 " + ai.refined + " 个" : "") +
      "<br>" + chips;
    renderGroups($("tab-list"), groups, { showUrl: true, showClose: true });
    status.textContent = ai.aiUsed
      ? "点击条目可跳转 · 点 × 关闭单个 · AI 已复审 " + ai.refined + " 个条目"
      : "点击条目可跳转 · 点 × 关闭单个 · 重复项已标出";
  } catch (e) {
    status.textContent = "读取标签页失败：" + e.message;
  }
}

async function groupTabs() {
  const status = $("tab-status");
  status.textContent = "正在分组…";
  try {
    const items = window.__tabItems || [];
    /* 评审修订：先按域名聚合（同站 ≥2 才成组，组名=域名），
     * 剩下的单标签再按主题聚合（≥2 成组，组名=主题名+颜色） */
    const byDomain = {};
    for (const it of items) {
      const d = domainOf(it.url);
      if (!d) continue;
      (byDomain[d] = byDomain[d] || []).push(it);
    }
    const domainGroups = [];
    const groupedIds = new Set();
    for (const [dom, ts] of Object.entries(byDomain)) {
      if (ts.length >= 2) {
        domainGroups.push({ title: dom, ids: ts.map((t) => t.id), color: "grey" });
        ts.forEach((t) => groupedIds.add(t.id));
      }
    }
    const byTheme = {};
    for (const it of items) {
      if (groupedIds.has(it.id)) continue;
      let key;
      if (it.cls.risks.includes("adult")) key = "【敏感内容】";
      else if (it.cls.risks.includes("copyright_risk")) key = "【版权风险】";
      else key = it.cls.theme;
      (byTheme[key] = byTheme[key] || []).push(it);
    }
    for (const [key, ts] of Object.entries(byTheme)) {
      if (ts.length >= 2) {
        const color = key === "【敏感内容】" || key === "【版权风险】"
          ? "red" : (THEME_COLOR[key] || "grey");
        domainGroups.push({ title: key, ids: ts.map((t) => t.id), color });
      }
    }
    const created = [];
    for (const g of domainGroups) {
      try {
        const gid = await chrome.tabs.group({ tabIds: g.ids });
        await chrome.tabGroups.update(gid, { title: g.title, color: g.color });
        created.push(gid);
      } catch (e) {
        console.warn("分组失败", g.title, e);
      }
    }
    /* 记录本插件建的组，取消分组只撤这些 */
    const got = await chrome.storage.local.get("__myGroups");
    const prev = got.__myGroups || [];
    await chrome.storage.local.set({ __myGroups: prev.concat(created) });
    status.textContent = "完成：新建 " + created.length + " 个标签组（同站点优先成组）";
  } catch (e) {
    status.textContent = "分组失败：" + e.message;
  }
}

async function ungroupTabs() {
  const status = $("tab-status");
  status.textContent = "正在取消分组…";
  try {
    /* 评审修订：只撤本插件建的组，不动用户自己手分的组 */
    const got = await chrome.storage.local.get("__myGroups");
    const ids = got.__myGroups || [];
    let undone = 0;
    for (const gid of ids) {
      try { await chrome.tabGroups.ungroup(gid); undone++; }
      catch (e) { /* 组可能已被手动取消 */ }
    }
    await chrome.storage.local.remove("__myGroups");
    status.textContent = "已取消本插件建的 " + undone + " 个标签组（你手分的组不受影响）";
  } catch (e) {
    status.textContent = "取消失败：" + e.message;
  }
}

/* 一键关闭重复标签页：只关强重复（URL 相同），每组保留第一个 */
async function closeDupTabs() {
  const status = $("tab-status");
  const items = window.__tabItems || [];
  const byUrl = {};
  for (const it of items) {
    if (!it.dupStrong) continue;
    const k = normalizeUrl(it.url);
    (byUrl[k] = byUrl[k] || []).push(it);
  }
  const groups = Object.values(byUrl).filter((g) => g.length > 1);
  if (!groups.length) {
    status.textContent = "没有强重复标签页（网址完全相同才算重复）";
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

/* ---------- 标签页快照：定期保存当前打开的标签页，可一键恢复 ---------- */

const SNAP_TABS_KEY = "__tab_snapshots";
const MAX_SNAPSHOTS = 30;

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
    const got = await chrome.storage.local.get(SNAP_TABS_KEY);
    const arr = got[SNAP_TABS_KEY] || [];
    if (arr.length && JSON.stringify(arr[0].tabs) === JSON.stringify(list)) return;
    arr.unshift({ time: Date.now(), tabs: list });
    await chrome.storage.local.set({ [SNAP_TABS_KEY]: arr.slice(0, MAX_SNAPSHOTS) });
    return arr.slice(0, MAX_SNAPSHOTS);
  } catch (e) {
    console.warn("保存标签页快照失败", e);
    return null;
  }
}

async function renderSnapshots() {
  const box = $("snap-list");
  if (!box) return;
  const got = await chrome.storage.local.get(SNAP_TABS_KEY);
  const arr = got[SNAP_TABS_KEY] || [];
  if (!arr.length) {
    box.innerHTML = '<div class="empty">还没有快照。点「立即保存」，或等自动保存（每 30 分钟一次）。</div>';
    return;
  }
  box.innerHTML = arr
    .map((s, i) => {
      const d = new Date(s.time);
      const ts = d.toLocaleString("zh-CN", { hour12: false });
      return (
        '<div class="snap-item">' +
        '<span class="snap-time">' + ts + " · " + s.tabs.length + " 个标签页</span>" +
        '<button class="snap-restore" data-idx="' + i + '">恢复</button>' +
        "</div>"
      );
    })
    .join("");
}

async function restoreSnapshot(idx) {
  const got = await chrome.storage.local.get(SNAP_TABS_KEY);
  const arr = got[SNAP_TABS_KEY] || [];
  const s = arr[idx];
  if (!s || !s.tabs.length) return;
  const urls = s.tabs.map((t) => t.url).filter(Boolean);
  const n = urls.length;
  if (!confirm("将打开该快照的 " + n + " 个网页（在新窗口，不影响当前窗口）。是否继续？")) return;
  if (n <= 20) {
    await chrome.windows.create({ url: urls });
  } else {
    /* 超过 20 个分批：第一个窗口开前 20 个，其余依次补开 */
    await chrome.windows.create({ url: urls.slice(0, 20) });
    for (let i = 20; i < n; i += 10) {
      await chrome.windows.create({ url: urls.slice(i, i + 10) });
    }
  }
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
  renderSnapshots();
});

$("btn-reload-bm").addEventListener("click", loadBookmarks);
$("btn-report").addEventListener("click", openReport);
$("btn-clean-dup").addEventListener("click", cleanDupBookmarks);
$("btn-organize").addEventListener("click", organizeBookmarks);
$("btn-group").addEventListener("click", groupTabs);
$("btn-ungroup").addEventListener("click", ungroupTabs);
$("btn-close-dup").addEventListener("click", closeDupTabs);
$("btn-reload-tabs").addEventListener("click", loadTabs);

/* ---------- AI 设置：加载到表单 / 保存 / 测试连接 ---------- */

async function renderAISettings() {
  const cfg = await getAIConfig();
  $("ai-enabled").checked = !!cfg.enabled;
  $("ai-baseurl").value = cfg.baseUrl;
  $("ai-key").value = cfg.apiKey;
  $("ai-model").value = cfg.model;
  $("ai-threshold").value = cfg.threshold;
}

$("btn-ai-save").addEventListener("click", async () => {
  await saveAIConfig({
    enabled: $("ai-enabled").checked,
    baseUrl: $("ai-baseurl").value.trim() || AI_DEFAULT_BASE_URL,
    apiKey: $("ai-key").value.trim(),
    model: $("ai-model").value.trim() || AI_DEFAULT_MODEL,
    threshold: Number($("ai-threshold").value) || 4
  });
  const st = $("ai-status");
  st.className = "status";
  st.textContent = "设置已保存" +
    ($("ai-enabled").checked ? "。重新点「书签分析 / 标签页整理」即用 AI 复审。" : "（AI 复审未启用，当前用本地规则分类）");
});

$("btn-ai-test").addEventListener("click", async () => {
  const st = $("ai-status");
  st.className = "status";
  st.textContent = "正在测试连接…";
  const cfg = await getAIConfig();
  const t = await testAIConnection(cfg);
  st.className = "status " + (t.ok ? "ok" : "err");
  st.textContent = t.message;
});

/* 标签页快照：立即保存 / 恢复 */
$("btn-save-snap").addEventListener("click", async () => {
  const arr = await saveTabSnapshot();
  const status = $("tab-status");
  if (status) status.textContent = "已保存当前标签页快照（共 " + (arr ? arr.length : 0) + " 条历史）";
  renderSnapshots();
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".snap-restore");
  if (btn) {
    restoreSnapshot(Number(btn.dataset.idx));
    e.stopPropagation();
  }
});

/* 启动：默认加载书签视图；加载 AI 设置到表单；静默保存一次当前标签页快照 */
loadBookmarks();
renderAISettings();
saveTabSnapshot();
