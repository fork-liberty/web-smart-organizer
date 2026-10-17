/* 测试：搜索结果页按搜索词分类 */
const { classify, extractSearchQuery } = require("./classify.js");

const cases = [
  // [url, title, 期望主题]
  ["https://cn.bing.com/search?q=%E7%97%85%E8%8B%A6%E6%A2%A6", "病苦梦 - 搜索", "医疗健康"],
  ["https://cn.bing.com/search?q=%E4%B8%AD%E5%8C%BB%E5%85%BB%E7%94%9F", "中医养生 - 搜索", "医疗健康"],
  ["https://www.baidu.com/s?wd=%E6%B8%B8%E6%88%8F%E4%B8%8B%E8%BD%BD", "游戏下载_百度搜索", "游戏"],
  ["https://www.google.com/search?q=javascript%20tutorial", "javascript tutorial - Google Search", "编程开发"],
  ["https://cn.bing.com/search?q=%E8%8F%9C%E9%B8%A1%E7%BF%BB%E8%AF%91", "菜鸡翻译 - 搜索", "工具效率"],
  ["https://www.baidu.com", "百度一下，你就知道", "搜索导航"],
  ["https://www.bing.com", "必应", "搜索导航"],
  ["https://cn.bing.com/search?q=asdfghjklqwerty", "asdfghjklqwerty - 搜索", "搜索导航"],
  ["https://www.baidu.com/s?wd=%E5%8C%BB%E9%99%A2%E6%8C%82%E5%8F%B7", "医院挂号_百度搜索", "医疗健康"],
  ["https://www.zhihu.com/question/123456", "知乎 - 中医问题", "社交聊天"]
];

let fail = 0;
for (const [url, title, expect] of cases) {
  const r = classify(url, title);
  const ok = r.theme === expect;
  if (!ok) fail++;
  console.log(
    (ok ? "PASS" : "FAIL") + " | 期望[" + expect + "] 实际[" + r.theme + "] 分=" + r.themeScore +
    " | " + title + "\n       " + url + "\n       命中: " + r.evidence.join(", ")
  );
}
console.log("\n" + (fail === 0 ? "全部通过 ✓" : fail + " 个失败 ✗"));
process.exit(fail === 0 ? 0 : 1);
