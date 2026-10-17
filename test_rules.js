/* 规则一致性测试：验证 JS 版分类引擎与 Python 版结论一致 */
const { classify } = require("./classify.js");

const cases = [
  ["https://www.baidu.com/", "百度", "搜索导航", [], []],
  ["https://pan.baidu.com/", "百度网盘", "工具效率", [], []],
  ["https://fanyi.baidu.com/", "百度翻译", "工具效率", [], []],
  ["https://mail.google.com/", "Gmail", "邮箱通讯", [], []],
  ["https://www.google.com/", "Google", "搜索导航", [], []],
  ["https://www.github.com/", "GitHub", "编程开发", [], []],
  ["https://developer.mozilla.org/zh-CN/docs/Web/JavaScript", "MDN JavaScript文档", "编程开发", [], ["文档教程"]],
  ["https://adult.example.com/", "一个网站", "其他", ["adult"], []],
  ["https://movie.example.com/free", "某某影视在线观看", "视频影视", ["copyright_risk"], []],
  ["https://sso.douyin.com/login/", "抖音登录页", "视频影视", [], ["登录页"]],
  ["https://game.example.com/download", "某游戏下载页面", "游戏", [], ["下载页"]],
  ["https://support.microsoft.com/zh-cn/windows/update", "Windows 更新服务页面", "系统官方", [], ["更新服务"]],
  ["https://www.dxy.cn/", "丁香园医学论坛", "医疗健康", [], ["论坛社区"]],
  ["https://www.bilibili.com/", "哔哩哔哩", "视频影视", [], []],
  ["https://store.steampowered.com/", "Steam商店", "游戏", [], []],
];

let failed = 0;
for (const [url, title, theme, risks, pageTypes] of cases) {
  const r = classify(url, title);
  const okTheme = r.theme === theme;
  const okRisk = risks.every((x) => r.risks.includes(x));
  const okType = pageTypes.every((x) => r.pageTypes.includes(x));
  const ok = okTheme && okRisk && okType;
  if (!ok) {
    failed++;
    console.log("FAIL:", title);
    console.log("  期望 theme=" + theme + " risks=" + risks + " types=" + pageTypes);
    console.log("  实际 theme=" + r.theme + " risks=" + r.risks + " types=" + r.pageTypes);
  } else {
    console.log("PASS:", title, "->", r.theme);
  }
}
console.log(failed === 0 ? "\n全部通过（" + cases.length + " 条）" : "\n失败 " + failed + " 条");
process.exit(failed === 0 ? 0 : 1);
