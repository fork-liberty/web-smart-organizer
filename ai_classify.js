/* ============================================================
 * AI 复审层（v1.7）—— 规则引擎的增强层
 * 架构：本地规则初筛 → 低置信度条目批量送 AI 复审 → 覆盖主题
 *   - 无 API key / 请求失败 / 额度耗尽 → 自动降级到规则结果，功能永不失效
 *   - 只发送 标题 + URL + 搜索词（不发网页正文，保护隐私、控制成本）
 * 服务：任意 OpenAI 兼容 Chat Completions API（可填接口地址）
 *   默认指向 KeepKey / ModelBridge 中转（okeeper.com），可改为你自己的地址
 * ============================================================ */

const AI_DEFAULT_MODEL = "deepseek-chat";
/* DeepSeek 官方 API 地址（OpenAI 兼容；可改为你的中转站地址） */
const AI_DEFAULT_BASE_URL = "https://api.deepseek.com/v1";

/* 把 Base URL 拼成完整请求地址：已含 /chat/completions 则原样用 */
function resolveChatUrl(baseUrl) {
  let b = String(baseUrl || AI_DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(b)) return b;
  return b + "/chat/completions";
}

/* 与 classify.js 词表一致的 14 个主题（AI 只能从中选） */
const AI_THEMES = [
  "编程开发", "视频影视", "游戏", "购物", "社交聊天", "医疗健康",
  "新闻资讯", "工具效率", "系统官方", "教育学习", "银行金融",
  "邮箱通讯", "搜索导航", "其他"
];

const AI_CFG_KEY = "aiConfig";

/* 读取 AI 配置。默认关闭（不打扰用户），有 key 才启用。 */
async function getAIConfig() {
  const got = await chrome.storage.local.get(AI_CFG_KEY);
  const cfg = got[AI_CFG_KEY] || {};
  return {
    enabled: !!(cfg.enabled && cfg.apiKey),
    apiKey: String(cfg.apiKey || ""),
    model: String(cfg.model || AI_DEFAULT_MODEL),
    baseUrl: String(cfg.baseUrl || AI_DEFAULT_BASE_URL),
    threshold: Math.max(1, Number(cfg.threshold) || 4)
  };
}

async function saveAIConfig(partial) {
  const got = await chrome.storage.local.get(AI_CFG_KEY);
  const cur = got[AI_CFG_KEY] || {};
  await chrome.storage.local.set({ [AI_CFG_KEY]: Object.assign(cur, partial) });
}

/* 低置信度判定：分数低于阈值 / 归入"其他" / 搜索词未识别 → 值得送 AI */
function needsAIReview(item, cfg) {
  const low = item.themeScore < cfg.threshold;
  const uncategorized = item.cls && item.cls.theme === "其他";
  const searchUnknown = item.cls && item.cls.theme === "搜索导航" &&
    /未识别|兜底/.test((item.cls.evidence || []).join(","));
  return low || uncategorized || searchUnknown;
}

/* 批量 AI 分类。
 * items: [{id, title, url, searchQuery}]
 * 成功 → Map<id, theme>；失败/无 key → null（调用方用规则结果兜底） */
async function classifyWithAI(items, cfg) {
  if (!items || !items.length || !cfg || !cfg.apiKey) return null;
  if (items.length > 60) items = items.slice(0, 60); // 单次上限，防超时
  const lines = items.map((it, i) =>
    i + ". 标题:" + String(it.title || "(无)") +
    "\n   URL:" + String(it.url || "(无)") +
    (it.searchQuery ? "\n   搜索词:" + it.searchQuery : "")
  );
  const system =
    "你是浏览器书签分类助手。只做一件事：把下面每个网页条目归入这 14 个主题之一：\n" +
    AI_THEMES.map((t, i) => (i + 1) + ". " + t).join("\n") +
    "\n判定规则：" +
    "\n1. 按网页实际内容归主题，不看域名品牌；搜索页按搜索词内容归主题，搜索" +
    "\n   首页/导航站才归'搜索导航'；下载/工具/教程页按内容主题归（如编程工具→编程开发）。" +
    "\n2. 拿不准就选'其他'，不要硬猜。" +
    "\n3. 只输出 JSON，不要任何解释。格式：{\"results\":[{\"id\":0,\"theme\":\"医疗健康\"}]}" +
    "\n   id 必须对应输入条目的编号，theme 必须是上面 14 个之一。";
  let resp;
  try {
    resp = await fetch(resolveChatUrl(cfg.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + cfg.apiKey
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: lines.join("\n\n") }
        ],
        temperature: 0.1,
        max_tokens: 1024
      })
    });
  } catch (e) {
    return null; // 网络失败 → 降级
  }
  if (!resp.ok) return null; // 401/429/额度不足 → 降级
  let data;
  try { data = await resp.json(); } catch (e) { return null; }
  const text = (data && data.choices && data.choices[0] &&
    data.choices[0].message && data.choices[0].message.content) || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch (e) { return null; }
  const out = new Map();
  if (Array.isArray(parsed && parsed.results)) {
    for (const r of parsed.results) {
      if (Number.isInteger(r && r.id) && typeof (r && r.theme) === "string" &&
          AI_THEMES.includes(r.theme)) {
        out.set(r.id, r.theme);
      }
    }
  }
  return out;
}

/* 测试连接：发一条最小请求验证 key/模型是否可用。
 * 返回 {ok, message} */
async function testAIConnection(cfg) {
  if (!cfg || !cfg.apiKey) return { ok: false, message: "请先填写 API Key" };
  try {
    const resp = await fetch(resolveChatUrl(cfg.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + cfg.apiKey
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "回复'连接成功'四个字" }],
        temperature: 0.1,
        max_tokens: 16
      })
    });
    if (resp.ok) {
      return { ok: true, message: "连接成功，模型 " + cfg.model + " 可用" };
    }
    let detail = "";
    try {
      const d = await resp.json();
      detail = (d && d.error && d.error.message) || "";
    } catch (e) { /* 忽略解析失败 */ }
    const hint = resp.status === 401 ? "Key 无效或未开通" :
      resp.status === 403 ? "无权限访问该模型" :
      resp.status === 429 ? "额度不足或触发限流" :
      "HTTP " + resp.status;
    return { ok: false, message: hint + (detail ? "：" + detail : "") };
  } catch (e) {
    return { ok: false, message: "网络错误：" + e.message };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getAIConfig, saveAIConfig, needsAIReview, classifyWithAI,
                     testAIConnection, AI_THEMES, AI_DEFAULT_MODEL, AI_DEFAULT_BASE_URL,
                     resolveChatUrl };
}
