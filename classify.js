/* ============================================================
 * 分类引擎（第三级：本地规则）—— 与本地工具规则一致
 * 判断顺序：风险(敏感/版权) > 内容主题 > 页面类型
 * ============================================================ */

const RISK_RULES = [
  ["adult", [
    "porn", "xvideos", "xhamster", "xnxx", "hentai", "adult",
    "色情", "成人", "黄色网站", "18禁", "情色", "av影片",
    "missav", "91porn", "sex"
  ]],
  ["copyright_risk", [
    "盗版", "破解", "磁力", "bt种子", "bt吧", "种子搜索", "免费看",
    "免费影视", "免费电影", "在线观看", "影视大全", "电影天堂", "高清资源",
    "资源站", "资源下载", "全集下载", "番号", "neets", "爱看", "片库",
    "人人影视", "yyets", "网盘资源", "夸克资源", "阿里云盘资源"
  ]]
];

const THEME_RULES = [
  ["编程开发", [
    "github", "gitlab", "gitee", "stackoverflow", "csdn", "掘金", "juejin",
    "leetcode", "力扣", "菜鸟教程", "runoob", "w3school", "菜鸟", "mdn",
    "developer", "开发", "编程", "代码", "api", "文档中心", "python",
    "java", "c++", "c语言", "javascript", "typescript", "php", "sql",
    "linux", "docker", "k8s", "kubernetes", "git", "vscode", "visual studio",
    "程序", "软件工程", "前端", "后端", "数据库", "算法", "人工智能",
    "机器学习", "深度学习", "pytorch", "tensorflow", "大模型", "openai"
  ]],
  ["视频影视", [
    "youtube", "youtu.be", "bilibili", "b23.tv", "哔哩哔哩", "b站", "抖音",
    "douyin", "tiktok", "爱奇艺", "iqiyi", "优酷", "youku", "腾讯视频",
    "芒果tv", "西瓜视频", "netflix", "奈飞", "disney+", "disneyplus",
    "hbo", "电视剧", "电影", "动漫", "追剧", "视频", "影视", "剧场", "片单",
    "直播", "央视频", "咪咕"
  ]],
  ["游戏", [
    "游戏", "game", "steam", "epicgames", "epic", "origin", "uplay",
    "4399", "7k7k", "王者荣耀", "原神", "genshin", "米哈游", "mihoyo",
    "和平精英", "英雄联盟", "lol", "csgo", "cs2", "绝地求生", "pubg",
    "我的世界", "minecraft", "mc百科", "taptap", "tap", "nga", "游民星空",
    "游侠", "3dmgame", "3dm", "gamedb", "游戏下载", "电玩", "switch",
    "ps5", "xbox", "任天堂", "nintendo", "模拟器"
  ]],
  ["购物", [
    "淘宝", "taobao", "tmall", "天猫", "京东", "jd.com", "拼多多",
    "pinduoduo", "唯品会", "vip.com", "亚马逊", "amazon", "闲鱼", "咸鱼",
    "转转", "苏宁", "国美", "盒马", "叮咚买菜", "美团", "meituan",
    "饿了么", "ele.me", "商城", "购物", "下单", "秒杀", "优惠券", "折扣"
  ]],
  ["社交聊天", [
    "微信", "weixin", "wechat", "qq.com", "腾讯qq", "微博", "weibo",
    "知乎", "zhihu", "贴吧", "tieba", "小红书", "xiaohongshu", "xhs",
    "豆瓣", "douban", "facebook", "fb.com", "twitter", "x.com",
    "instagram", "telegram", "t.me", "discord", "reddit", "whatsapp",
    "脉脉", "即刻", "探探", "soul", "陌陌"
  ]],
  ["医疗健康", [
    "医院", "医生", "挂号", "预约挂号", "医疗", "健康", "疾病", "症状",
    "药品", "药房", "体检", "三甲", "疾控", "防疫", "疫苗", "问诊",
    "health", "hospital", "med", "clinic", "牙科", "眼科", "皮肤科",
    "中医", "养生", "保健品", "病历", "医学", "医药", "就诊"
  ]],
  ["新闻资讯", [
    "新闻", "news", "澎湃", "thepaper", "新浪", "sina", "搜狐", "sohu",
    "网易新闻", "腾讯新闻", "头条", "今日头条", "央视", "cctv", "人民日报",
    "新华社", "凤凰网", "ifeng", "财新", "caixin", "界面新闻", "36氪",
    "虎嗅", "钛媒体", "科技资讯"
  ]],
  ["工具效率", [
    "工具", "tool", "在线工具", "计算器", "翻译", "translate", "转换",
    "convert", "pdf", "压缩", "解压", "网盘", "云盘", "百度网盘", "pan.baidu",
    "阿里云盘", "夸克网盘", "腾讯文档", "石墨", "印象笔记", "notion",
    "有道", "youdao", "ocr", "二维码", "时间", "倒计时", "天气", "日历",
    "便签", "todo", "待办", "效率", "办公"
  ]],
  ["系统官方", [
    "microsoft", "windows", "微软", "update", "更新", "驱动", "驱动之家",
    "官网", "official", "apple", "android", "ios", "系统", "补丁",
    "ubuntu", "centos", "debian", "win10", "win11", "装机", "重装系统",
    "office", "微软账户"
  ]],
  ["教育学习", [
    "学习", "课程", "慕课", "mooc", "学堂在线", "网易云课堂", "教育",
    "考试", "公务员", "考研", "英语", "背单词", "四级", "六级", "雅思",
    "托福", "学习强国", "知网", "cnki", "论文", "文献", "学术", "讲座",
    "公开课", "教程", "入门"
  ]],
  ["银行金融", [
    "银行", "bank", "icbc", "工商银行", "建设银行", "ccb", "农业银行",
    "abc", "中国银行", "boc", "招商银行", "cmb", "支付宝", "alipay",
    "微信支付", "paypal", "证券", "股票", "基金", "理财", "股票软件",
    "同花顺", "东方财富", "eastmoney", "招商证券", "社保", "公积金"
  ]],
  ["邮箱通讯", [
    "mail", "gmail", "outlook", "邮箱", "163.com", "126.com",
    "qq邮箱", "foxmail", "企业邮箱", "邮局"
  ]],
  ["搜索导航", [
    "百度", "baidu", "google", "bing", "必应", "搜狗", "sogou",
    "360搜索", "360.cn", "hao123", "导航", "主页", "门户", "hao",
    "duckduckgo", "yandex"
  ]]
];

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

const DEFAULT_THEME = "其他";

const RISK_CN = { adult: "敏感内容", copyright_risk: "版权风险" };

function riskCn(risk) {
  return RISK_CN[risk] || risk;
}

function matchKeywords(text, keywords) {
  const hits = [];
  for (const k of keywords) {
    if (text.includes(k)) hits.push(k);
  }
  return hits;
}

/* 对一个条目分类。返回 { theme, pageTypes, risks, evidence } */
function classify(url, title) {
  const text = ((url || "") + " " + (title || "")).toLowerCase();

  const risks = [];
  const evidence = [];
  for (const [riskName, kws] of RISK_RULES) {
    const hits = matchKeywords(text, kws);
    if (hits.length) {
      risks.push(riskName);
      evidence.push(...hits);
    }
  }

  let theme = DEFAULT_THEME;
  for (const [themeName, kws] of THEME_RULES) {
    const hits = matchKeywords(text, kws);
    if (hits.length) {
      theme = themeName;
      evidence.push(...hits);
      break;
    }
  }

  const pageTypes = [];
  for (const [ptype, kws] of PAGE_TYPE_RULES) {
    const hits = matchKeywords(text, kws);
    if (hits.length) {
      pageTypes.push(ptype);
      evidence.push(...hits);
    }
  }

  return {
    theme,
    pageTypes,
    risks,
    evidence: [...new Set(evidence)].slice(0, 8)
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

/* URL 规范化：用于去重识别（去掉大小写/尾部斜杠/锚点/追踪参数） */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
     "fbclid", "gclid", "spm"].forEach((k) => u.searchParams.delete(k));
    return u.href.replace(/\/+$/, "").toLowerCase();
  } catch (e) {
    return String(url || "").trim().toLowerCase().replace(/\/+$/, "");
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { classify, riskCn, normalizeUrl, THEME_COLOR, DEFAULT_THEME };
}
