/* 规则一致性测试：打分制引擎 + normalizeUrl（评审修订版）
 * 覆盖：权重主导、URL>标题、风险强词单触发/弱词组合、URL 归一化 */
const { classify, normalizeUrl } = require("./classify.js");

const cases = [
  // [url, title, theme, risks, pageTypes]
  ["https://www.baidu.com/", "百度", "搜索导航", [], []],
  ["https://pan.baidu.com/", "百度网盘", "工具效率", [], []],
  ["https://fanyi.baidu.com/", "百度翻译", "工具效率", [], []],
  ["https://mail.google.com/", "Gmail", "邮箱通讯", [], []],
  ["https://www.google.com/", "Google", "搜索导航", [], []],
  ["https://www.github.com/", "GitHub", "编程开发", [], []],
  ["https://developer.mozilla.org/zh-CN/docs/Web/JavaScript", "MDN JavaScript文档", "编程开发", [], ["文档教程"]],
  ["https://adult.example.com/", "一个网站", "其他", ["adult"], []],
  ["https://movie.example.com/", "某某影视在线观看", "视频影视", ["copyright_risk"], []],
  ["https://sso.douyin.com/login/", "抖音登录页", "视频影视", [], ["登录页"]],
  ["https://game.example.com/download", "某游戏下载页面", "游戏", [], ["下载页"]],
  ["https://support.microsoft.com/zh-cn/windows/update", "Windows 更新服务页面", "系统官方", [], ["更新服务"]],
  ["https://www.dxy.cn/", "丁香园医学论坛", "医疗健康", [], ["论坛社区"]],
  ["https://www.bilibili.com/", "哔哩哔哩", "视频影视", [], []],
  ["https://store.steampowered.com/", "Steam商店", "游戏", [], []],

  // —— 评审关键用例：误判修复 ——
  // 弱词“在线观看”单独出现 → 不判版权风险（此前被秒标）
  ["https://www.yangshipin.cn/", "央视频 在线观看", "视频影视", [], []],
  ["https://www.cctv.com/", "央视新闻", "新闻资讯", [], []],
  // GitHub 标题带“视频” → 仍归编程开发（github 强词 3 > 视频弱词 1）
  ["https://github.com/example/video-tools", "视频处理工具 GitHub", "编程开发", [], []],
  // 版权弱组合：影视 + 在线观看 = 2 → 判版权
  ["https://movie.example.com/", "某某影视在线观看", "视频影视", ["copyright_risk"], []],
  // 版权弱组合：免费看 + 在线观看 + 电影 ≥2 → 判版权
  ["https://www.example.com/movie", "免费看电影在线观看", "视频影视", ["copyright_risk"], []],
  // 版权强词单触发：磁力 / 破解
  ["https://magnet.example.com/", "磁力搜索站", "其他", ["copyright_risk"], []],
  ["https://www.example.com/crack/", "破解软件下载", "其他", ["copyright_risk"], []],
  // URL 命中 > 标题命中：URL 带 java 强词，标题泛化 → 编程开发
  ["https://example.com/java/", "娱乐视频在线", "编程开发", [], []],
  // 医疗弱词“健康”不误判购物/其他：医院强词主导
  ["https://www.example.com/", "某医院预约挂号", "医疗健康", [], []],
  // 游戏登录页
  ["https://login.example.com/", "某某游戏登录", "游戏", [], ["登录页"]],
];

let failed = 0;
for (const [url, title, theme, risks, pageTypes] of cases) {
  const r = classify(url, title);
  const okTheme = r.theme === theme;
  const okRisk = risks.every((x) => r.risks.includes(x));
  const noExtraRisk = risks.length === r.risks.length;
  const okType = pageTypes.every((x) => r.pageTypes.includes(x));
  const ok = okTheme && okRisk && noExtraRisk && okType;
  if (!ok) {
    failed++;
    console.log("FAIL:", title);
    console.log("  期望 theme=" + theme + " risks=" + risks + " types=" + pageTypes);
    console.log("  实际 theme=" + r.theme + " risks=" + r.risks + " types=" + r.pageTypes);
    console.log("  证据=" + r.evidence.join("、"));
  } else {
    console.log("PASS:", title, "->", r.theme);
  }
}

// normalizeUrl 用例
const normCases = [
  ["https://www.taobao.com/item/123", "https://taobao.com/item/123"],
  ["http://m.bilibili.com/video/BV1xx", "https://bilibili.com/video/bv1xx"],
  ["https://www.example.com/post/amp", "https://example.com/post"],
  ["https://www.example.com/post?utm_source=x&id=1", "https://example.com/post?id=1"],
  ["https://EXAMPLE.com/Path/", "https://example.com/path"],
];
for (const [input, expect] of normCases) {
  const got = normalizeUrl(input);
  if (got !== expect) {
    failed++;
    console.log("FAIL normalize:", input, "=>", got, "期望", expect);
  } else {
    console.log("PASS normalize:", input, "->", got);
  }
}

console.log(failed === 0 ? "\n全部通过（" + (cases.length + normCases.length) + " 条）" : "\n失败 " + failed + " 条");
process.exit(failed === 0 ? 0 : 1);
