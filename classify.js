/* ============================================================
 * 分类引擎 v2（打分制）—— 评审修订版
 * 设计：
 *   - 每个主题一组关键词，带权重：强词 3 / 中词 2 / 弱词 1
 *   - URL 命中权重 ×2（网址比标题更可信）
 *   - 主题取最高分，平分时按词表声明顺序优先
 *   - 风险：强词单触发；版权风险弱词需 ≥2 组合才触发
 *     （"在线观看"单独出现不判版权，必须搭配影视/资源等）
 *   - 输出命中词与分数依据（evidence），供用户解释与纠正
 * ============================================================ */

/* ---------- 主题关键词表：[词, 权重] ---------- */
const THEME_RULES = [
  ["编程开发", [
    ["github", 3], ["gitlab", 3], ["gitee", 3], ["stackoverflow", 3],
    ["csdn", 2], ["掘金", 2], ["juejin", 2], ["leetcode", 3], ["力扣", 3],
    ["菜鸟教程", 3], ["runoob", 2], ["w3school", 2], ["mdn", 2],
    ["developer", 1], ["开发", 1], ["编程", 2], ["代码", 1], ["api", 2],
    ["文档中心", 1], ["python", 3], ["java", 3], ["c++", 3], ["c语言", 2],
    ["javascript", 3], ["typescript", 3], ["php", 3], ["sql", 2],
    ["linux", 3], ["docker", 3], ["k8s", 3], ["kubernetes", 3], ["git", 2],
    ["vscode", 3], ["visual studio", 3], ["前端", 2], ["后端", 2],
    ["数据库", 2], ["算法", 2], ["机器学习", 3], ["深度学习", 3],
    ["pytorch", 3], ["tensorflow", 3], ["大模型", 2], ["openai", 2],
    ["人工智能", 2], ["软件工程", 1], ["程序", 1]
  ]],
  ["视频影视", [
    ["youtube", 3], ["youtu.be", 3], ["bilibili", 3], ["b23.tv", 3],
    ["哔哩哔哩", 3], ["抖音", 3], ["douyin", 3], ["tiktok", 3],
    ["爱奇艺", 3], ["iqiyi", 3], ["优酷", 3], ["youku", 3], ["腾讯视频", 3],
    ["芒果tv", 3], ["西瓜视频", 3], ["netflix", 3], ["奈飞", 3],
    ["disney+", 3], ["hbo", 3], ["电视剧", 3], ["电影", 3], ["动漫", 3],
    ["追剧", 3], ["影视", 2], ["剧场", 2], ["片单", 2], ["直播", 2],
    ["央视频", 3], ["咪咕", 2], ["视频", 1]
  ]],
  ["游戏", [
    ["steam", 3], ["epicgames", 3], ["epic", 2], ["origin", 2], ["uplay", 3],
    ["4399", 3], ["7k7k", 3], ["王者荣耀", 3], ["原神", 3], ["genshin", 3],
    ["米哈游", 3], ["mihoyo", 3], ["和平精英", 3], ["英雄联盟", 3], ["lol", 2],
    ["csgo", 3], ["cs2", 3], ["绝地求生", 3], ["pubg", 3], ["我的世界", 3],
    ["minecraft", 3], ["taptap", 3], ["nga", 2], ["游民星空", 3], ["游侠", 2],
    ["3dmgame", 3], ["游戏下载", 3], ["switch", 2], ["ps5", 2], ["xbox", 2],
    ["任天堂", 2], ["nintendo", 2], ["模拟器", 2], ["游戏", 1], ["game", 1]
  ]],
  ["购物", [
    ["淘宝", 3], ["taobao", 3], ["tmall", 3], ["天猫", 3], ["京东", 3],
    ["jd.com", 3], ["拼多多", 3], ["pinduoduo", 3], ["唯品会", 3],
    ["亚马逊", 3], ["amazon", 3], ["闲鱼", 3], ["转转", 2], ["苏宁", 2],
    ["国美", 2], ["盒马", 3], ["美团", 3], ["meituan", 3], ["饿了么", 3],
    ["ele.me", 3], ["商城", 2], ["购物", 2], ["秒杀", 2], ["优惠券", 2],
    ["下单", 1]
  ]],
  ["社交聊天", [
    ["微信", 3], ["weixin", 3], ["wechat", 3], ["qq.com", 3], ["腾讯qq", 3],
    ["微博", 3], ["weibo", 3], ["知乎", 3], ["zhihu", 3], ["贴吧", 3],
    ["tieba", 3], ["小红书", 3], ["xiaohongshu", 3], ["豆瓣", 3], ["douban", 3],
    ["facebook", 3], ["twitter", 3], ["x.com", 3], ["instagram", 3],
    ["telegram", 3], ["discord", 3], ["reddit", 3], ["whatsapp", 3],
    ["脉脉", 2], ["即刻", 2], ["探探", 2], ["soul", 2], ["陌陌", 2]
  ]],
  ["医疗健康", [
    ["医院", 3], ["医生", 3], ["挂号", 3], ["预约挂号", 3], ["医疗", 2],
    ["健康", 1], ["疾病", 2], ["症状", 2], ["药品", 3], ["药房", 3],
    ["体检", 3], ["三甲", 3], ["疾控", 3], ["疫苗", 3], ["问诊", 3],
    ["health", 2], ["hospital", 3], ["clinic", 3], ["牙科", 3], ["眼科", 3],
    ["皮肤科", 3], ["中医", 3], ["养生", 2], ["保健品", 2], ["病历", 3],
    ["医学", 3], ["医药", 3], ["就诊", 3]
  ]],
  ["新闻资讯", [
    ["新闻", 3], ["news", 3], ["澎湃", 3], ["thepaper", 3], ["新浪", 3],
    ["sina", 3], ["搜狐", 3], ["sohu", 3], ["腾讯新闻", 3], ["今日头条", 3],
    ["头条", 2], ["央视", 3], ["cctv", 3], ["人民日报", 3], ["新华社", 3],
    ["凤凰网", 3], ["ifeng", 3], ["财新", 3], ["caixin", 3], ["界面新闻", 3],
    ["36氪", 3], ["虎嗅", 3], ["钛媒体", 3]
  ]],
  ["工具效率", [
    ["工具", 2], ["tool", 1], ["在线工具", 3], ["计算器", 3], ["翻译", 3],
    ["translate", 3], ["转换", 2], ["convert", 2], ["pdf", 2], ["压缩", 3],
    ["网盘", 3], ["云盘", 3], ["百度网盘", 3], ["阿里云盘", 3], ["夸克网盘", 3],
    ["pan.baidu", 3], ["fanyi.baidu", 3], ["youdao", 3], ["dict.youdao", 3],
    ["腾讯文档", 3], ["石墨", 3], ["印象笔记", 3], ["notion", 3], ["有道", 2],
    ["ocr", 3], ["二维码", 3], ["天气", 2], ["日历", 2],
    ["便签", 3], ["todo", 3], ["待办", 3], ["效率", 1], ["办公", 1]
  ]],
  ["系统官方", [
    ["microsoft", 3], ["windows", 3], ["微软", 3], ["update", 2], ["更新", 1],
    ["驱动", 3], ["官网", 1], ["official", 1], ["apple", 3], ["android", 3],
    ["ios", 3], ["系统", 1], ["补丁", 3], ["ubuntu", 3], ["centos", 3],
    ["debian", 3], ["win10", 3], ["win11", 3], ["office", 3], ["微软账户", 3]
  ]],
  ["教育学习", [
    ["学习", 2], ["课程", 2], ["慕课", 3], ["mooc", 3], ["学堂在线", 3],
    ["网易云课堂", 3], ["教育", 2], ["考试", 2], ["公务员", 3], ["考研", 3],
    ["英语", 2], ["背单词", 3], ["四级", 3], ["六级", 3], ["雅思", 3],
    ["托福", 3], ["学习强国", 3], ["知网", 3], ["cnki", 3], ["论文", 3],
    ["文献", 3], ["学术", 3], ["讲座", 2], ["公开课", 3], ["教程", 1],
    ["入门", 1]
  ]],
  ["银行金融", [
    ["银行", 3], ["bank", 3], ["icbc", 3], ["工商银行", 3], ["建设银行", 3],
    ["ccb", 3], ["农业银行", 3], ["中国银行", 3], ["boc", 3], ["招商银行", 3],
    ["cmb", 3], ["支付宝", 3], ["alipay", 3], ["微信支付", 3], ["paypal", 3],
    ["证券", 3], ["股票", 3], ["基金", 3], ["理财", 3], ["同花顺", 3],
    ["东方财富", 3], ["eastmoney", 3], ["社保", 3], ["公积金", 3]
  ]],
  ["邮箱通讯", [
    ["mail", 3], ["gmail", 3], ["outlook", 3], ["邮箱", 3], ["163.com", 3],
    ["126.com", 3], ["qq邮箱", 3], ["foxmail", 3], ["企业邮箱", 3], ["邮局", 3]
  ]],
  ["搜索导航", [
    ["百度", 3], ["baidu", 3], ["google", 3], ["bing", 3], ["必应", 3],
    ["搜狗", 3], ["sogou", 3], ["360搜索", 3], ["360.cn", 3], ["hao123", 3],
    ["导航", 1], ["门户", 1], ["duckduckgo", 3], ["yandex", 3]
  ]]
];

/* ---------- 搜索结果页识别：提取搜索词，按搜索内容分类 ----------
 * 搜索引擎结果页（bing/baidu/google 的 /search?q= 等）不应按引擎品牌
 * 归"搜索导航"，而应按"用户搜的是什么内容"归主题：
 *   搜"病苦梦/中医疾病" → 医疗健康；搜"游戏下载" → 游戏。
 * 只有搜索首页/导航站（baidu.com、bing.com 无 search 路径等）才归搜索导航。
 * 每个引擎用其查询参数名（bing=q、百度=wd、搜狗=query 等）。
 */
const SEARCH_ENGINE_PATTERNS = [
  [/bing\.com\/search/, "q"], [/bing\.com\/images\/search/, "q"],
  [/baidu\.com\/s/, "wd"], [/baidu\.com\/search/, "wd"], [/baidu\.com\/sf/, "wd"],
  [/google\.(com|cn|com\.hk|com\.tw)\/search/, "q"],
  [/sogou\.com\/web/, "query"], [/sogou\.com\/sogou/, "query"],
  [/so\.com\/s/, "q"], [/so\.com\/link/, "q"],
  [/360\.cn\/so/, "q"], [/so\.360\.cn\/so/, "q"],
  [/sm\.cn\/s/, "q"], [/yandex\.com\/search/, "text"]
];

function extractSearchQuery(url) {
  try {
    const u = new URL(url);
    for (const [re, param] of SEARCH_ENGINE_PATTERNS) {
      if (re.test(u.hostname + u.pathname)) {
        const q = u.searchParams.get(param);
        if (q && q.trim()) return decodeURIComponent(q.trim());
      }
    }
  } catch (e) { /* 非法 URL 忽略 */ }
  return null;
}

/* ---------- 页面类型关键词表（命中即标注，不影响主题） ---------- */
const PAGE_TYPE_RULES = [
  ["下载页", ["下载", "download", "下载中心", "下载站", "绿色版", "安装包",
              "exe", "zip", "客户端"]],
  ["登录页", ["登录", "login", "signin", "sign-in", "账号登录", "登录页面"]],
  ["文档教程", ["文档", "doc", "documentation", "教程", "tutorial", "guide",
               "manual", "手册", "wiki", "帮助", "help", "帮助中心", "faq",
               "说明", "使用指南", "readme"]],
  ["论坛社区", ["论坛", "forum", "bbs", "社区", "community", "问答",
               "question", "留言", "发帖", "贴吧"]],
  ["官方门户", ["官网", "official", "官方网站", "首页", "index", "home"]],
  ["更新服务", ["更新", "update", "service", "服务", "维护", "版本"]]
];

/* ---------- 风险规则：强词单触发 / 弱词组合 ---------- */
const RISK_RULES = {
  adult: {
    strong: [
      "adult", "porn", "xvideos", "xhamster", "xnxx", "hentai", "sex", "成人",
      "色情", "黄色网站", "18禁", "情色", "av影片", "91porn", "missav",
      "javbus", "javdb", "stripcam", "chaturbate", "onlyfans", "f95zone",
      "nhentai", "e-hentai", "pixiv.net", "r18"
    ],
    weak: []
  },
  copyright_risk: {
    strong: [
      "盗版", "破解", "磁力", "bt种子", "种子搜索", "番号", "neets",
      "yyets", "人人影视", "网盘资源", "夸克资源", "阿里云盘资源",
      "资源下载", "全集下载", "电影天堂", "片库", "迅雷下载", "bt吧"
    ],
    weak: ["在线观看", "免费看", "免费影视", "免费电影", "影视大全",
           "高清资源", "资源站", "影视", "电影", "高清", "资源"]
  }
};

const DEFAULT_THEME = "其他";

const RISK_CN = { adult: "敏感内容", copyright_risk: "版权风险" };

function riskCn(risk) {
  return RISK_CN[risk] || risk;
}

/* 打分：text 中命中的词 → {score, hits[]} */
function scoreText(text, kws, urlBoost) {
  let score = 0;
  const hits = [];
  for (const [kw, w] of kws) {
    if (text.includes(kw)) {
      const add = urlBoost ? w * 2 : w;
      score += add;
      hits.push(urlBoost ? kw + "(url)" : kw);
    }
  }
  return { score, hits };
}

/* 主题打分：URL 权重 ×2，取最高分；平分按词表顺序优先。
 * 搜索结果页：提取搜索词并入打分，且不参与"搜索导航"竞争；
 * 搜索词打不出分才兜底"搜索导航"。 */
function classifyTheme(url, title) {
  const searchQuery = extractSearchQuery(url);
  if (searchQuery) {
    let best = { name: DEFAULT_THEME, score: 0, hits: [] };
    for (const [themeName, kws] of THEME_RULES) {
      if (themeName === "搜索导航") continue;
      const r = scoreText(searchQuery + " " + title, kws, false);
      if (r.score > best.score) {
        best = {
          name: themeName, score: r.score,
          hits: r.hits.map((h) => h + "(搜索词)")
        };
      }
    }
    if (best.score === 0) {
      /* 词表没命中时兜底：搜索词含医疗字根（病/症/医/药/失眠/焦虑等）→ 医疗健康。
       * 这是规则引擎的"最后补救"，其余内容用 AI 复审层补足。 */
      if (/病|症|医|药|诊|痛|失眠|焦虑|抑郁|惊恐|噩梦|梦魇/.test(searchQuery)) {
        return { name: "医疗健康", score: 1, hits: ["搜索词含医疗字根(病/症/医/药/失眠等)"] };
      }
      return { name: "搜索导航", score: 1, hits: ["搜索结果页(搜索词未识别)"] };
    }
    return best;
  }
  let best = { name: DEFAULT_THEME, score: 0, hits: [] };
  for (const [themeName, kws] of THEME_RULES) {
    const rUrl = scoreText(url, kws, true);
    const rTitle = scoreText(title, kws, false);
    const score = rUrl.score + rTitle.score;
    if (score > best.score) {
      best = { name: themeName, score, hits: rUrl.hits.concat(rTitle.hits) };
    }
  }
  return best;
}

/* 风险判定：adult 强词单触发；copyright 强词单触发 + 弱词 ≥2 组合 */
function detectRisks(url, title) {
  const risks = [];
  const evidence = [];
  for (const kw of RISK_RULES.adult.strong) {
    if (url.includes(kw) || title.includes(kw)) {
      risks.push("adult");
      evidence.push(kw + (url.includes(kw) ? "(url)" : ""));
      break;
    }
  }
  if (!risks.includes("copyright_risk")) {
    for (const kw of RISK_RULES.copyright_risk.strong) {
      if (url.includes(kw) || title.includes(kw)) {
        risks.push("copyright_risk");
        evidence.push(kw + (url.includes(kw) ? "(url)" : ""));
        break;
      }
    }
  }
  if (!risks.includes("copyright_risk")) {
    const weakHits = RISK_RULES.copyright_risk.weak.filter(
      (kw) => url.includes(kw) || title.includes(kw)
    );
    if (weakHits.length >= 2) {
      risks.push("copyright_risk");
      evidence.push(...weakHits.map((kw) => kw + (url.includes(kw) ? "(url)" : "")));
    }
  }
  return { risks, evidence };
}

/* 对一个条目分类。返回 { theme, pageTypes, risks, evidence } */
function classify(url, title) {
  const u = String(url || "").toLowerCase();
  const t = String(title || "").toLowerCase();

  const themeResult = classifyTheme(u, t);
  const riskResult = detectRisks(u, t);

  const pageTypes = [];
  const typeEvidence = [];
  for (const [ptype, kws] of PAGE_TYPE_RULES) {
    const hits = kws.filter((k) => u.includes(k) || t.includes(k));
    if (hits.length) {
      pageTypes.push(ptype);
      typeEvidence.push(...hits);
    }
  }

  return {
    theme: themeResult.name,
    themeScore: themeResult.score,
    pageTypes,
    risks: riskResult.risks,
    evidence: [...new Set(riskResult.evidence.concat(typeEvidence))].slice(0, 10)
  };
}

/* 主题 → 标签组颜色（tabGroups 支持的颜色） */
const THEME_COLOR = {
  "编程开发": "blue",
  "视频影视": "red",
  "游戏": "purple",
  "购物": "orange",
  "社交聊天": "cyan",
  "医疗健康": "green",
  "新闻资讯": "grey",
  "搜索导航": "grey",
  "工具效率": "yellow",
  "系统官方": "blue",
  "教育学习": "green",
  "邮箱通讯": "grey",
  "银行金融": "yellow",
  "其他": "grey"
};

/* URL 规范化：用于去重识别
 * 去 hash / 追踪参数 / 尾部斜杠 / www. / m. 移动域 / /amp/ 后缀 / 协议统一 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.protocol === "http:" || u.protocol === "https:") u.protocol = "https:";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
     "fbclid", "gclid", "spm", "spm_id_from", "amp"].forEach((k) => u.searchParams.delete(k));
    let href = u.href.replace(/\/+$/, "").toLowerCase();
    href = href.replace(/^(https?:\/\/)(www|m)\./, "$1");
    href = href.replace(/\/amp$/, "");
    return href;
  } catch (e) {
    return String(url || "").trim().toLowerCase().replace(/\/+$/, "");
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { classify, riskCn, normalizeUrl, THEME_COLOR, DEFAULT_THEME, extractSearchQuery };
}
