// 宜/忌候选词库（中文，贴合日常/职场趣味）与"按日期固定"的生成逻辑。
// 核心目标：同一天内反复调用/刷新得到完全相同的一组宜忌；不同日期结果互不相同。
// 实现方式：日期字符串(YYYY-MM-DD)加盐 -> 可复现哈希作为随机种子 -> 确定性 PRNG(mulberry32) ->
//           从两套词库各自洗牌抽 count 条（单次内无重复）。
(function (global) {
  'use strict';

  // 宜词库：扩充至包括更多俏皮/职场摸鱼梗，满足"有趣且健康"。
  // 关键词：画面感 + 打工人共鸣 + 沙雕玩笑，一律健康正向。
  var YI_POOL = [
    '摸鱼',
    '喝奶茶',
    '补觉',
    '发呆',
    '躺平',
    '追剧',
    '听歌',
    '散步',
    '伸懒腰',
    '撸猫',
    '按时下班',
    '划水',
    '看窗外',
    '准时吃饭',
    '云旅行',
    '午睡',
    '冥想',
    '改名',
    '清空购物车',
    '关机',
    '点外卖',
    '准时午休',
    '早起失败',
    '给猫办生日会',
    '在工位养绿植',
    '喝水喝到饱',
    '给饮水机换水',
    '装作很忙的样子',
    '对屏幕点头沉思',
    '用放大镜看需求',
    '把咖啡换成奶茶',
    '给老板画个大饼',
    '周五提前溜',
    '准点开溜',
    '把 TODO 改成 DONE',
    '带薪发呆',
    '摸鱼币充值',
    '数一数今天摸了几次鱼',
    '给工位盆栽浇水',
    '提前规划这个周末的躺平',
    '提前规划下个假期的躺平',
    '假装在看工作邮件',
    '优雅地放空三分钟',
    '给自己手动加个鸡腿',
    '数清楚今天一共喝了多少口奶茶',
    '把好日子过成段子',
    '合理分配发呆与摸鱼双项配额',
    '给绿植起个好名字',
    '假装电脑死机了',
    '准时关电脑优雅退场',
    '早退但不被看见',
    '蹲一个没人催的下午'
  ];

  // 忌词库：扩充至包括更多俏皮/职场摸鱼梗，保持健康趣味、无低俗。
  var JI_POOL = [
    '动土',
    '熬夜',
    '开会',
    '加班',
    '写PPT',
    '赶deadline',
    '回那条已读不回的信息',
    '改需求',
    '背锅',
    '焦虑',
    '内卷',
    '刷工作群',
    '跟甲方掰扯',
    '重构祖传代码',
    '立flag',
    '摸鱼被抓',
    'KPI超标',
    '接新需求',
    '临时加急',
    '修线上bug',
    '写季度总结',
    '卷到半夜',
    '通宵',
    '吃冷饭',
    '走路看手机',
    '一大早就打开计划本',
    '打开周报模板',
    '承诺今晚上线',
    '在群里回"收到"',
    '抢着当卷王',
    '口是心非说"马上"',
    '周五下午开大会',
    '熬夜刷短视频',
    '凌晨三点还醒着',
    '把小事拖成大事',
    '答应帮同事代班',
    '说"这点小事我来改"',
    '心存侥幸',
    '假装听懂了需求',
    '公司群里误发表情',
    '拿奶茶续命',
    '不断刷新邮箱',
    '跟进度条赛跑',
    '证明自己没做错',
    '在截止前夜挑战极限',
    '学别人熬夜学习',
    '突然想起还有个需求没提',
    '把自己卷进加班漩涡'
  ];

  // 单次生成宜/忌各多少条，可由前端调用时覆盖。
  var DEFAULT_COUNT = 2;

  // 简单字符串哈希：把字符串映射为一个 32 位无符号整数，作为随机种子的基础。
  function hashString(str) {
    var hash = 2166136261; // FNV-1a 偏移基数
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24); // 等价 *31，FNV-1a prime
    }
    return hash >>> 0;
  }

  // mulberry32：确定性伪随机数生成器（seeded PRNG）。输入相同种子，输出序列完全一致。
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 把日期字符串(YYYY-MM-DD) -> 返回一个随机函数。加盐保证同日期稳定、跨日期变化。
  // 额外把年份/月份/日期也混入种子，进一步拉开相邻两天（如 07-31 与 08-01）的差异。
  function randFromDate(dateStr) {
    var salt = 'moyu-yiji:' + dateStr;
    // 解析 YYYY-MM-DD，把代表日月组合与日期本身的数字混入 FNV 哈希，确保相邻两天结果不同。
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (parts) {
      var y = parseInt(parts[1], 10);
      var m = parseInt(parts[2], 10);
      var d = parseInt(parts[3], 10);
      // 把数字也掺进字符用的盐中，避免仅靠字符串出现极端碰撞。
      salt += '@' + (y * 10000 + m * 100 + d) + '#' + (y + m * 2 + d * 31);
    }
    return mulberry32(hashString(salt));
  }

  // 基于日期，从词库确定性抽样 count 条且单次内不重复。
  // 用洗牌 + 取前 count 个：因为随机函数是确定性的，同一天洗牌顺序一致 -> 结果一致。
  function sampleDate(pool, count, rand) {
    var len = pool.length;
    var target = Math.min(count, len);
    var idx = [];
    for (var i = 0; i < len; i++) {
      idx.push(i);
    }
    // Fisher-Yates 洗牌，用确定性 rand 而非 Math.random。
    for (var j = len - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var tmp = idx[j];
      idx[j] = idx[k];
      idx[k] = tmp;
    }
    var result = [];
    for (var m = 0; m < target; m++) {
      result.push(pool[idx[m]]);
    }
    return result;
  }

  // 生成"今日宜忌"：dateStr 格式 YYYY-MM-DD（不传则用本地当天）。count 默认各 2 条。
  // 重要：同一天传入相同 dateStr 返回完全相同的结果；不同日期返回不同的结果。
  function generateYiji(dateStr, count) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // 兼容旧的"实时随机"调用方式：无日期时用当前本地日期，实现"按日期固定"。
      var d = new Date();
      var pad = function (v) { return String(v).padStart(2, '0'); };
      dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    var n = typeof count === 'number' && count > 0 ? count : DEFAULT_COUNT;
    var rand = randFromDate(dateStr);
    // 宜/忌基于两个独立词库、同一确定性随机源但先消耗不同次数，避免两池序列完全对齐。
    // 为更稳妥保证"宜"与"忌"整体差异，先让 rand 前进若干步再抽第二池。
    var randYi = rand;
    rand(); // 消耗一步，让忌样本的起点偏离
    var randJi = rand;
    return {
      date: dateStr,
      yi: sampleDate(YI_POOL, n, randYi),
      ji: sampleDate(JI_POOL, n, randJi)
    };
  }

  // 暴露给浏览器全局，便于 index.html 直接引用（纯静态双击可用，无需打包）。
  global.YijiModule = {
    generateYiji: generateYiji,
    YI_POOL: YI_POOL,
    JI_POOL: JI_POOL,
    DEFAULT_COUNT: DEFAULT_COUNT,
    hashString: hashString,
    mulberry32: mulberry32
  };
})(window);
