/* 报告页面逻辑：从 storage 读书签分析结果，渲染表格 + 下载 */

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function init() {
  const { reportItems } = await chrome.storage.local.get("reportItems");
  if (!reportItems || !reportItems.length) {
    $("summary").textContent = "暂无数据：请先在扩展弹窗的「书签分析」里点「生成分类报告」。";
    return;
  }

  // 统计
  const stats = {};
  for (const it of reportItems) {
    stats[it.cls.theme] = (stats[it.cls.theme] || 0) + 1;
  }
  $("stats").innerHTML =
    "<h2>分类统计</h2><table><tr><th>分类</th><th>数量</th></tr>" +
    Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => "<tr><td>" + escapeHtml(k) + "</td><td>" + v + "</td></tr>")
      .join("") +
    "</table>";

  // 明细
  const dupTotal = reportItems.filter((it) => it.dupStrong && !it.keep).length;
  const weakTotal = reportItems.filter((it) => it.dupWeak).length;
  $("summary").textContent =
    "共 " + reportItems.length + " 个书签 · 重复可清理 " + dupTotal +
    (weakTotal ? " · 疑似重复 " + weakTotal + " 条需人工确认" : "") +
    " · 原始书签不删除 · 规则引擎：本地离线";

  const rows = reportItems.map((it) => {
    const risk = it.cls.risks.length
      ? it.cls.risks
          .map((r) => '<span class="risk risk-' + r + '">' +
            (r === "adult" ? "敏感内容" : "版权风险") + "</span>")
          .join("")
      : '<span class="risk" style="background:#888">无</span>';
    const types = it.cls.pageTypes
      .map((p) => '<span class="tag">' + escapeHtml(p) + "</span>")
      .join("");
    const ev = it.cls.evidence.length ? escapeHtml(it.cls.evidence.join("、")) : "—";
    const dup = it.dupWeak
      ? '<span class="dup" style="color:#8a6d00">疑似重复×' + it.dupTotal + "·需确认</span>"
      : (it.dup
          ? (it.keep
              ? '<span class="dup" style="color:#1a7f37">重复×' + it.dupTotal + "·保留</span>"
              : '<span class="dup" style="color:#d1242f">重复×' + it.dupTotal + "·可清理</span>")
          : "—");
    return (
      "<tr><td>" + escapeHtml(it.folder || "（根）") + "</td>" +
      "<td>" + escapeHtml(it.title) + "</td>" +
      "<td class='mono'><a href='" + escapeHtml(it.url) + "' target='_blank'>" +
        escapeHtml(it.url.length > 60 ? it.url.slice(0, 60) + "…" : it.url) + "</a></td>" +
      "<td>" + escapeHtml(it.cls.theme) + "</td>" +
      "<td>" + types + "</td>" +
      "<td>" + risk + "</td>" +
      "<td>" + dup + "</td>" +
      "<td class='mono'>" + ev + "</td></tr>"
    );
  });
  document.querySelector("#report-table tbody").innerHTML = rows.join("");

  $("btn-download").addEventListener("click", () => {
    const html = buildFullHtml(reportItems, stats);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "书签分类报告.html";
    a.click();
    URL.revokeObjectURL(url);
  });
}

function buildFullHtml(items, stats) {
  const rows = items.map((it) => {
    const risk = it.cls.risks.length
      ? it.cls.risks
          .map((r) => '<span class="risk risk-' + r + '">' +
            (r === "adult" ? "敏感内容" : "版权风险") + "</span>")
          .join("")
      : '<span class="risk" style="background:#888">无</span>';
    const types = it.cls.pageTypes
      .map((p) => "<span>" + escapeHtml(p) + "</span>")
      .join("、");
    return (
      "<tr><td>" + escapeHtml(it.folder || "（根）") + "</td>" +
      "<td>" + escapeHtml(it.title) + "</td>" +
      "<td class='mono'><a href='" + escapeHtml(it.url) + "'>" + escapeHtml(it.url) + "</a></td>" +
      "<td>" + escapeHtml(it.cls.theme) + "</td>" +
      "<td>" + types + "</td><td>" + risk + "</td></tr>"
    );
  });
  const statRows = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => "<tr><td>" + escapeHtml(k) + "</td><td>" + v + "</td></tr>")
    .join("");
  const today = new Date().toISOString().slice(0, 10);
  return (
    "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'>" +
    "<title>书签分类报告</title><style>" +
    "body{font-family:'Microsoft YaHei',sans-serif;margin:24px}" +
    "table{border-collapse:collapse;width:100%}" +
    "th,td{border:1px solid #d0d7de;padding:6px 10px;font-size:13px;text-align:left}" +
    "th{background:#f6f8fa}.mono{font-family:Consolas,monospace;font-size:12px;word-break:break-all}" +
    ".risk{display:inline-block;padding:1px 8px;border-radius:10px;color:#fff;font-size:12px}" +
    ".risk-adult{background:#b3261e}.risk-copyright_risk{background:#f9ab00;color:#222}" +
    "</style></head><body>" +
    "<h1>书签分类报告</h1>" +
    "<p>共 " + items.length + " 个书签 · 生成于 " + today +
    " · 原始书签全部保留，无删除 · 规则引擎：本地离线</p>" +
    "<h2>分类统计</h2><table><tr><th>分类</th><th>数量</th></tr>" + statRows + "</table>" +
    "<h2>明细</h2><table><tr><th>原始位置</th><th>标题</th><th>网址</th>" +
    "<th>内容分类</th><th>页面类型</th><th>风险</th></tr>" + rows.join("") + "</table>" +
    "</body></html>"
  );
}

init();
