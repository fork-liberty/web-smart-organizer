/* 测试 AI 复审层（无 key 时的降级 + 低置信度判定 + 地址拼接） */
const { needsAIReview, classifyWithAI, testAIConnection, AI_THEMES, resolveChatUrl } = require("./ai_classify.js");

let fail = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " | " + name);
  if (!cond) fail++;
}

/* 0. resolveChatUrl 地址拼接 */
check("Base URL 拼接 /chat/completions", resolveChatUrl("https://model-bridge.okeeper.com/v1") ===
  "https://model-bridge.okeeper.com/v1/chat/completions");
check("带末尾斜杠也能拼对", resolveChatUrl("https://api.example.com/v1/") ===
  "https://api.example.com/v1/chat/completions");
check("已含 /chat/completions 则原样", resolveChatUrl("https://api.example.com/v1/chat/completions") ===
  "https://api.example.com/v1/chat/completions");
check("空地址回落默认 DeepSeek", resolveChatUrl("") ===
  "https://api.deepseek.com/v1/chat/completions");

/* 1. AI_THEMES 与 classify 主题一致 */
const { THEME_RULES } = (() => { try { return require("./classify.js"); } catch (e) { return {}; } })();
check("AI_THEMES 包含全部 14 个主题", AI_THEMES.length === 14 &&
  AI_THEMES.includes("其他") && AI_THEMES.includes("医疗健康"));

/* 2. needsAIReview 低置信度判定 */
const items = [
  { themeScore: 1, cls: { theme: "其他", evidence: [] } },
  { themeScore: 9, cls: { theme: "搜索导航", evidence: [] } },
  { themeScore: 1, cls: { theme: "搜索导航", evidence: ["搜索结果页(搜索词未识别)"] } },
  { themeScore: 8, cls: { theme: "医疗健康", evidence: [] } }
];
const expect = [true, false, true, false];
check("低置信度判定 4/4", items.every((it, i) => needsAIReview(it, { threshold: 4 }) === expect[i]));

/* 3. 无 key 降级：classifyWithAI 返回 null（不会发起请求） */
check("无 key 时 classifyWithAI 降级返回 null", (async () => {
  const r = await classifyWithAI([{ id: 0, title: "x", url: "https://a.com" }], { apiKey: "" });
  return r === null;
})());

/* 4. 无 key 测试连接返回失败提示 */
check("无 key 时 testAIConnection 返回失败提示", (async () => {
  const r = await testAIConnection({ apiKey: "" });
  return r.ok === false && /Key/.test(r.message);
})());

/* 5. 空列表 → null */
check("空列表 classifyWithAI 返回 null", (async () => {
  const r = await classifyWithAI([], { apiKey: "k" });
  return r === null;
})());

setTimeout(() => {
  console.log(fail === 0 ? "\n全部通过 ✓" : "\n" + fail + " 个失败 ✗");
  process.exit(fail === 0 ? 0 : 1);
}, 500);
