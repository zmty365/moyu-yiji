// 装配层（Chrome 扩展 popup · 月历版）：同 js/app.js 的月历装配逻辑，
// 差异点：
//   1. 本地持久化改用 chrome.storage.local（原网页版用 localStorage）。
//      由于 chrome.storage 是异步 API，而月历渲染/计时以同步读为主，
//      这里维护同步的内存缓存（logCache / settings），真正落盘走异步写入。
//   2. 新增计时器自身上下文持久化（going/paused/idle + 累计秒 + 进入状态基准时间戳），
//      关闭弹窗/浏览器后重开可精确续算（running 按真实时间戳差分）。
// 依赖：YijiModule（yiji-data.js）、MoyuTimer（moyu-timer.js）。
(function () {
  'use strict';

  // ---- 常量 ----
  var MAX_RATE = 9999;
  var DEFAULT_SALARY = 10000;
  var DEFAULT_WORKDAYS = 22;
  var DEFAULT_HOURS = 8;
  var YI_COUNT = 2;
  var JI_COUNT = 2;

  // 存储键（chrome.storage.local 命名空间，与原网页版同构）
  var KEY_PREFIX_LOG = 'moyu-log:';            // moyu-log:YYYY-MM-DD -> 当日摸鱼累计秒数
  var KEY_SETTINGS = 'moyu-settings';          // 薪资模型设置对象
  var KEY_TIMER = 'moyu-timer-state';          // 计时器上下文（状态+累计+基准时间戳）
  var KEY_ACHIEVEMENTS = 'moyu-achievements';  // 已解锁成就
  var KEY_WATER_STATS = 'water-stats';         // 今日喝水统计
  var KEY_WATER_TOTAL = 'water-total-dismiss'; // 点击关闭的累计次数

  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  var MONTHS_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

  function renderAchievementsFromData(data) {
    var grid = document.getElementById('achievements-grid');
    var count = document.getElementById('achievements-count');
    if (!grid || !count || !window.MoyuAchievements || !window.MoyuAchievementEngine) { return; }
    data = data || {};
    var logs = {};
    Object.keys(data).forEach(function (key) {
      if (key.indexOf(KEY_PREFIX_LOG) === 0) {
        logs[key.slice(KEY_PREFIX_LOG.length)] = data[key];
      }
    });
    var stats = data[KEY_WATER_STATS] && typeof data[KEY_WATER_STATS] === 'object' ? data[KEY_WATER_STATS] : null;
    var snapshot = MoyuAchievementEngine.snapshotFromLogs(logs, {
      dailyDismiss: stats && stats.date === todayStr() ? stats.dismiss : 0,
      totalDismiss: data[KEY_WATER_TOTAL]
    });
    var entries = MoyuAchievementEngine.evaluate(MoyuAchievements.list, data[KEY_ACHIEVEMENTS] || { unlocked: {} }, snapshot, {
      includeWater: true,
      dailyBetweenMode: 'deferred'
    });
    var unlockedCount = entries.filter(function (entry) { return entry.unlocked; }).length;
    count.textContent = unlockedCount + ' / ' + entries.length;
    grid.innerHTML = entries.map(function (entry) {
      var item = entry.achievement;
      var pct = Math.round((entry.progress.ratio || 0) * 100);
      return '<article class="achievement-card ' + (entry.unlocked ? 'is-unlocked' : 'is-locked') + '">' +
        '<div class="achievement-top"><span class="achievement-icon">' + item.icon + '</span><div>' +
        '<h3 class="achievement-title">' + item.title + '</h3>' +
        '<p class="achievement-desc">' + item.description + '</p></div></div>' +
        '<p class="achievement-flavor">' + item.flavorText + '</p>' +
        '<div class="achievement-progress"><i style="width:' + pct + '%"></i></div>' +
        '<span class="achievement-state">' + (entry.unlocked ? '已解锁' : '进度 ' + pct + '%') + '</span>' +
        '</article>';
    }).join('');
  }

  function refreshAchievements() {
    if (!document.getElementById('achievements-grid')) { return; }
    chrome.storage.local.get(null, renderAchievementsFromData);
  }

  function requestAchievementCheck(reason) {
    try {
      chrome.runtime.sendMessage({ type: 'achievement-check', reason: reason }, function (response) {
        void chrome.runtime.lastError;
        if (response && Array.isArray(response.unlocked) && response.unlocked.length) {
          enqueueAchievements(response.unlocked);
        }
        refreshAchievements();
      });
    } catch (e) { refreshAchievements(); }
  }

  // 依次弹出全部已解锁成就（一条接一条）。无已解锁则不弹。
  function popUnlockedFromData(data) {
    if (!window.MoyuAchievements || !window.MoyuAchievementEngine) { return; }
    data = data || {};
    var logs = {};
    Object.keys(data).forEach(function (key) {
      if (key.indexOf(KEY_PREFIX_LOG) === 0) {
        logs[key.slice(KEY_PREFIX_LOG.length)] = data[key];
      }
    });
    var stats = data[KEY_WATER_STATS] && typeof data[KEY_WATER_STATS] === 'object' ? data[KEY_WATER_STATS] : null;
    var snapshot = MoyuAchievementEngine.snapshotFromLogs(logs, {
      dailyDismiss: stats && stats.date === todayStr() ? stats.dismiss : 0,
      totalDismiss: data[KEY_WATER_TOTAL]
    });
    var entries = MoyuAchievementEngine.evaluate(MoyuAchievements.list, data[KEY_ACHIEVEMENTS] || { unlocked: {} }, snapshot, {
      includeWater: true,
      dailyBetweenMode: 'deferred'
    });
    var unlocked = entries.filter(function (entry) { return entry.progress.matched; })
      .map(function (entry) { return entry.achievement; });
    if (!unlocked.length) { return; }
    enqueueAchievements(unlocked);
  }

  // 手动刷新：先请求 SW 重算解锁状态，再读最新存储依次弹出全部已解锁成就。
  function refreshAndPopAchievements() {
    var afterCheck = function () {
      refreshAchievements();
      chrome.storage.local.get(null, popUnlockedFromData);
    };
    try {
      chrome.runtime.sendMessage({ type: 'achievement-check', reason: 'manual' }, function () {
        void chrome.runtime.lastError;
        afterCheck();
      });
    } catch (e) { afterCheck(); }
  }

  // ---- 成就富弹窗：排队式，一次一个，点「收下这份荣誉」关闭后弹下一个 ----
  var achievementQueue = [];
  var achievementShowing = false;

  function enqueueAchievements(items) {
    if (!items || !items.length) { return; }
    achievementQueue = achievementQueue.concat(items);
    popNextAchievement();
  }

  function popNextAchievement() {
    if (achievementShowing) { return; }
    var item = achievementQueue.shift();
    if (!item) { return; }
    achievementShowing = true;
    showAchievementPanel(item, function () {
      achievementShowing = false;
      popNextAchievement();
    });
  }

  // 复刻扩展暂停时的成就富卡片（同 content-reminder.js 样式），在 full 页 DOM 内展示。
  function showAchievementPanel(item, onClose) {
    if (!document.body) { if (onClose) { onClose(); } return; }
    item = item && typeof item === 'object' ? item : {};
    var host = document.createElement('div');
    host.id = 'moyu-ach-panel-host';
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;width:320px;';
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' +
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      '.wr-card{position:relative;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;width:320px;background:linear-gradient(180deg,#fffdf4,#fff1cc);border:1px solid #e2bd67;border-radius:16px;box-shadow:0 10px 28px rgba(122,91,46,.24);padding:0 0 14px;color:#3a3328;animation:wr-in .26s cubic-bezier(.2,.9,.3,1.2);}' +
      '@keyframes wr-in{from{opacity:0;transform:translateY(16px) scale(.96);}to{opacity:1;transform:translateY(0) scale(1);}}' +
      '.wr-scene{position:relative;height:64px;background:linear-gradient(180deg,#ffe6a8,#ffd18a);overflow:hidden;border-bottom:1px solid #ecc577;}' +
      '.wr-medal{position:absolute;left:18px;bottom:10px;font-size:36px;line-height:1;animation:wr-bounce 1.8s ease-in-out infinite;}' +
      '@keyframes wr-bounce{0%,100%{transform:translateY(0) rotate(-5deg);}50%{transform:translateY(-5px) rotate(5deg);}}' +
      '.wr-fish{position:absolute;right:20px;bottom:12px;font-size:26px;}' +
      '.wr-spark{position:absolute;color:#fff;font-size:16px;animation:wr-rise 2.6s ease-in infinite;}.s1{left:48%;bottom:12px}.s2{left:68%;bottom:4px;animation-delay:.7s}.s3{left:82%;bottom:18px;animation-delay:1.1s}' +
      '@keyframes wr-rise{0%{transform:translateY(8px) scale(.8);opacity:0;}20%{opacity:.95;}100%{transform:translateY(-44px) scale(1.1);opacity:0;}}' +
      '.wr-body{padding:13px 16px 0;}' +
      '.wr-kicker{font-size:12px;color:#a06b24;letter-spacing:.12em;font-weight:700;}' +
      '.wr-title{font-size:17px;font-weight:800;color:#7a4a15;line-height:1.4;margin:5px 0 6px;}' +
      '.wr-text{font-size:13px;color:#8d754c;line-height:1.55;margin:0 0 8px;}' +
      '.wr-flavor{font-size:13px;color:#9a6b31;line-height:1.55;margin:0 0 12px;}' +
      '.wr-btns{display:flex;gap:8px;padding:0 16px;}' +
      '.wr-btn{flex:1;cursor:pointer;border-radius:11px;padding:9px 0;font-size:13px;font-weight:700;border:1px solid #d8c49a;transition:transform .12s ease,filter .12s ease;}' +
      '.wr-btn:hover{transform:translateY(-1px);filter:brightness(1.04);}' +
      '.wr-dismiss{background:linear-gradient(135deg,#f0a43a,#cf4c35);color:#fff;border-color:transparent;}' +
      '</style>' +
      '<div class="wr-card" role="dialog" aria-label="成就解锁">' +
      '<div class="wr-scene"><span class="wr-spark s1">✨</span><span class="wr-spark s2">✨</span><span class="wr-spark s3">✨</span><span class="wr-medal">' + (item.icon || '🏅') + '</span><span class="wr-fish">🐟</span></div>' +
      '<div class="wr-body"><div class="wr-kicker">🏅 解锁成就</div><div class="wr-title" id="wr-ach-title"></div><p class="wr-text" id="wr-ach-desc"></p><p class="wr-flavor" id="wr-ach-flavor"></p></div>' +
      '<div class="wr-btns"><button class="wr-btn wr-dismiss" id="wr-ach-close" type="button">收下这份荣誉</button></div>' +
      '</div>';
    shadow.getElementById('wr-ach-title').textContent = item.title || '新的摸鱼成就';
    shadow.getElementById('wr-ach-desc').textContent = item.description || '';
    shadow.getElementById('wr-ach-flavor').textContent = item.flavorText || '';
    shadow.getElementById('wr-ach-close').addEventListener('click', function () {
      if (host.parentNode) { host.parentNode.removeChild(host); }
      if (onClose) { onClose(); }
    });
    document.body.appendChild(host);
  }

  // ---- 金句池（同网页版） ----
  var FORTUNE_POOL = [
    '今天也要当只快乐摸鱼小猫 🐱',
    '猫咪都在打盹，你在卷什么 😴',
    '摸到就是赚到，猫咪都给你伸爪点赞 🐾',
    '摸鱼一时爽，一直摸鱼一直爽 🐟',
    '当一只猫的快乐，是理直气壮地打个盹 😸',
    '鱼都把日子过成了水，你也学着点 🐠',
    '躺平不是堕落，是给明天留点力气 🛋️',
    '今天的关键词：蹭小鱼干、蹭下午茶 ✨',
    '别人卷设计稿，你卷下午觉 🐻',
    '摸鱼要趁早，晚了鱼就游走了 🎣',
    '累了就眯一会儿，猫咪都懂的道理 😌',
    '鱼生得意须尽欢，莫使金樽空对月 🍵',
    '把笔记本合上，那是今天最大的成交 📒',
    '水是鱼的床，工位是你的躺椅 🍃',
    '今天只许自己：快乐、轻松、慢慢来 🌿',
    '小猫打哈欠的时候，也是在上班 😹',
    '别急，鱼都会慢慢游到你面前 🐟',
    '摸完这波鱼，再好好给生活打个盹 🛌',
    '你的温柔，今天也要用来对自己 🐾',
    '把烦恼扔进水里，让鱼帮你消化 🐠',
    '一只会摸鱼的猫，从不觉得日子难 🐱',
    '今天不做卷王，做只晒太阳的熊 ☀️',
    '水波会累也会停，你也可以 🫧',
    '躺平三分钟，快乐拉满一整天 😴',
    '鱼缸里没有 KPI，只有水草和自由 🌱',
    '给自己放半天水，生活会更甜 🍯',
    '摸鱼是对工作的温柔反抗，别太过就好 😌',
    '今天允许发呆，发呆也是灵感的鱼食 🐟',
    '猫都打个盹，权当给自己充个电 🔋',
    '水往低处流，鱼往轻松处游 🌊',
    '偷得浮生半日闲，正适合跟小鱼聊聊 🐠',
    '把心情摊平，比把工牌摊平重要 🛋️',
    '今天的鱼，养在心情的鱼缸里 🐡',
    '别把自己卷成干锅鱼，留点水汽 🐟',
    '熊宝宝都知道，饿了下树吃饱就睡 🐻',
    '摸鱼是一场修行，贵在坚持与快乐 🙏',
    '把脑洞开到水里，灵感自己游进来 💭',
    '今天宜慵懒，忌对自己太苛刻 ☁️',
    '给猫咪让条路，也给自己让条路 🐾',
    '日落前，先摸完今天最后一条鱼 🌇'
  ];

  function fortuneOf(dateStr) {
    var seed = YijiModule.hashString('moyu-fortune:' + dateStr);
    var rand = YijiModule.mulberry32(seed);
    var idx = Math.floor(rand() * FORTUNE_POOL.length);
    return FORTUNE_POOL[idx];
  }

  // ---- 工具函数 ----
  function pad(v) {
    return String(v).padStart(2, '0');
  }
  function toDateStr(y, m, d) {
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function todayStr() {
    var t = new Date();
    return toDateStr(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  function formatClock(seconds) {
    var total = Math.floor(seconds);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  // ============================================================
  // Storage 适配层（localStorage 同步 -> chrome.storage.local 异步）
  // 维护同步内存缓存，落盘走异步 set；读以缓存为准，保证渲染即时正确。
  // ============================================================
  // 记录最近的本地自写，供 storage.onChanged 抑制"自身写入→又触发恢复"的反馈环，
  // 使多个 UI（弹窗/完整页）与 SW 只看同一份 chrome.storage 真源。
  var lastSelfWrite = null; // { keys:{k:1}, at:ts }

  function isSelfWrite(changes) {
    if (!lastSelfWrite || Date.now() - lastSelfWrite.at > 80) {
      return false;
    }
    for (var k0 in changes) {
      if (Object.prototype.hasOwnProperty.call(changes, k0) && !lastSelfWrite.keys[k0]) {
        return false;
      }
    }
    return true;
  }

  function storageSet(obj) {
    var keys = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        keys[k] = 1;
      }
    }
    lastSelfWrite = { keys: keys, at: Date.now() };
    try {
      chrome.storage.local.set(obj, function () {});
    } catch (e) { /* 忽略写入异常 */ }
  }

  // 摸鱼记录：dateStr -> 秒数（内存缓存，初始化时全量载入）
  var logCache = {};
  var LogStore = {
    get: function (dateStr) {
      var v = logCache[dateStr];
      return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0;
    },
    // 单调幂等落账：当天累计秒数是"只增不减"的总量，写 max(旧值, acc)，
    // 与 Service Worker 的写遵守同一契约，任何写入顺序都不会重复记账/倒退。
    commit: function (dateStr, acc) {
      var next = Math.max(this.get(dateStr), acc);
      logCache[dateStr] = next;
      var o = {};
      o[KEY_PREFIX_LOG + dateStr] = next;
      storageSet(o);
      return next;
    },
    add: function (dateStr, delta) {
      if (!(delta > 0)) {
        return this.get(dateStr);
      }
      return this.commit(dateStr, this.get(dateStr) + delta);
    },
    // 直接覆盖写入某日秒数：用于把当日 log 对齐到真实计时值/清除脏存量（不经 max）。
    setValue: function (dateStr, value) {
      var v = (typeof value === 'number' && isFinite(value) && value > 0) ? value : 0;
      logCache[dateStr] = v;
      var o = {};
      o[KEY_PREFIX_LOG + dateStr] = v;
      storageSet(o);
      return v;
    }
  };

  // 薪资设置：内存中为同步读，保存时异步落盘。
  function defaultSettings() {
    return {
      hourlyRate: '',
      monthlySalary: DEFAULT_SALARY,
      workdays: DEFAULT_WORKDAYS,
      hoursPerDay: DEFAULT_HOURS
    };
  }
  var settings = defaultSettings();

  function applySettingsObject(o) {
    if (!o || typeof o !== 'object') {
      return;
    }
    if (typeof o.hourlyRate === 'number') settings.hourlyRate = o.hourlyRate;
    if (typeof o.hourlyRate === 'string') settings.hourlyRate = o.hourlyRate;
    if (typeof o.monthlySalary === 'number') settings.monthlySalary = o.monthlySalary;
    if (typeof o.workdays === 'number') settings.workdays = o.workdays;
    if (typeof o.hoursPerDay === 'number') settings.hoursPerDay = o.hoursPerDay;
  }

  function persistSettings() {
    var o = {};
    o[KEY_SETTINGS] = {
      hourlyRate: settings.hourlyRate,
      monthlySalary: settings.monthlySalary,
      workdays: settings.workdays,
      hoursPerDay: settings.hoursPerDay
    };
    storageSet(o);
  }

  // 校验数值区间。
  function parsePosNum(input, max, label) {
    var trimmed = String(input).trim();
    if (trimmed === '') {
      return '请填写' + label;
    }
    var num = Number(trimmed);
    if (!isFinite(num)) {
      return label + '必须是数字';
    }
    if (num <= 0) {
      return label + '必须大于 0';
    }
    if (typeof max === 'number' && num > max) {
      return label + '不能超过 ' + max;
    }
    return { valid: true, value: num };
  }

  // 计算"用于计价的时薪"：手填优先，否则月薪推算等效时薪。
  function effectiveRate(settingsObj) {
    var manual = String(settingsObj.hourlyRate).trim();
    if (manual !== '') {
      var m = Number(manual);
      if (isFinite(m) && m > 0 && m <= MAX_RATE) {
        return m;
      }
    }
    var salary = settingsObj.monthlySalary;
    var days = settingsObj.workdays;
    var hours = settingsObj.hoursPerDay;
    if (salary > 0 && days > 0 && hours > 0) {
      return (salary / days / hours);
    }
    return 0;
  }

  // ---- DOM 引用 ----
  var calTitle = document.getElementById('cal-title');
  var calGrid = document.getElementById('cal-grid');
  var btnPrev = document.getElementById('cal-prev');
  var btnNext = document.getElementById('cal-next');
  var btnToday = document.getElementById('cal-today');

  var settingsPanel = document.getElementById('settings-panel');
  var settingsToggle = document.getElementById('settings-toggle');
  var settingsBody = document.getElementById('settings-body');
  var settingsSave = document.getElementById('settings-save');
  var settingsError = document.getElementById('settings-error');
  var effectiveRateEl = document.getElementById('effective-rate');
  var rateInput = document.getElementById('rate-input');
  var salaryInput = document.getElementById('salary-input');
  var workdaysInput = document.getElementById('workdays-input');
  var hoursInput = document.getElementById('hours-input');

  var rateError = document.getElementById('rate-error');
  var timeText = document.getElementById('time-text');
  var amountText = document.getElementById('amount-text');
  var controlsBox = document.getElementById('timer-controls');
  var ringProgress = document.getElementById('ring-progress');
  var statusChip = document.getElementById('status-chip');
  var timerCard = document.getElementById('timer-card');
  var timerToday = document.getElementById('timer-today');

  var petEnabledInput = document.getElementById('pet-enabled');
  var petDroppedCoin = document.getElementById('pet-dropped-coin');
  var petStatusText = document.getElementById('pet-status-text');

  var fortuneText = document.getElementById('fortune-text');

  var KEY_PET_ENABLED = 'pet-enabled';
  var KEY_PET_DROPPED = 'pet-dropped-coin';

  var RING_R = 108;
  var RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
  var RING_PERIOD_SECONDS = 24 * 3600;

  // ---- 月历状态 & 渲染 ----
  var cursor = new Date();
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  var manualRingCache = {};

  function getYiji(dateStr) {
    if (!manualRingCache[dateStr]) {
      manualRingCache[dateStr] = YijiModule.generateYiji(dateStr, YI_COUNT);
    }
    return manualRingCache[dateStr];
  }

  // 唯一数据源：今天累计秒数。running 时等于计时器真源的实时总量（已含历史段），
  // 否则用已落账的 moyu-log。日历"今日"格、今日已摸、计时器金额/时长都从这里取。
  function todayTotalSeconds() {
    var t = todayStr();
    if (timer && timer.status === 'running') {
      return timer.getSeconds();
    }
    return LogStore.get(t);
  }

  function renderPetCard(data) {
    if (!petEnabledInput && !petDroppedCoin && !petStatusText) return;
    data = data || {};
    var enabled = data[KEY_PET_ENABLED] !== false;
    var dropped = Number(data[KEY_PET_DROPPED]) || 0;
    if (petEnabledInput) petEnabledInput.checked = enabled;
    if (petDroppedCoin) petDroppedCoin.textContent = String(Math.max(0, Math.floor(dropped)));
    if (petStatusText) {
      petStatusText.textContent = enabled
        ? '桌宠已开启，会常驻网页右下角陪你摸鱼。'
        : '桌宠已隐藏，可随时重新开启。';
    }
  }

  function cellHTML(y, m, d, isOther) {
    var dateStr = toDateStr(y, m, d);
    var yiji = getYiji(dateStr);
    // 今天用唯一真源（计时中实时总量/否则已落账）；其它日用已落账累计。
    var isToday = dateStr === todayStr();
    var minutes = isToday ? todayTotalSeconds() : LogStore.get(dateStr);
    var hasLog = minutes > 0;
    var cls = 'day-cell';
    if (isOther) cls += ' is-other';
    if (isToday) cls += ' is-today';
    if (hasLog) cls += ' has-log';

    var yiItems = '', jiItems = '';
    for (var i = 0; i < yiji.yi.length; i++) {
      yiItems += '<div class="cell-yi"><i class="chip chip-yi">宜</i><span>' + yiji.yi[i] + '</span></div>';
    }
    for (var j = 0; j < yiji.ji.length; j++) {
      jiItems += '<div class="cell-ji"><i class="chip chip-ji">忌</i><span>' + yiji.ji[j] + '</span></div>';
    }

    var rate = effectiveRate(settings);
    // 所有格子时长统一用 HH:MM:SS（formatClock）：今天每秒联动，历史/其它日静态。
    var timeStr = hasLog ? formatClock(minutes) : '—';
    var amount = (rate * minutes) / 3600;
    var amountStr = hasLog ? amount.toFixed(2) + ' 元' : '—';

    return '<div class="' + cls + '" data-date="' + dateStr + '" role="gridcell">' +
      '<div class="cell-date">' +
        '<span class="cell-date-num">' + d + '</span>' +
        '<span class="cell-date-week">周' + WEEKDAYS[new Date(y, m - 1, d).getDay()] + '</span>' +
      '</div>' +
      '<div class="cell-yiji">' + yiItems + jiItems + '</div>' +
      '<div class="cell-log">' +
        '<div class="cell-log-row"><span>摸鱼</span><b>' + timeStr + '</b></div>' +
        '<div class="cell-log-row"><span>入账</span><b class="amt">' + amountStr + '</b></div>' +
      '</div>' +
    '</div>';
  }

  function renderMonth() {
    var y = cursor.getFullYear();
    var m = cursor.getMonth() + 1;
    calTitle.textContent = y + ' 年 ' + MONTHS_CN[m - 1] + ' 月';

    var first = new Date(y, m - 1, 1);
    var lead = first.getDay();
    var lastDay = new Date(y, m, 0).getDate();

    var today = todayStr();
    var todayParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
    var ty = parseInt(todayParts[1], 10);
    var tm = parseInt(todayParts[2], 10);
    var td = parseInt(todayParts[3], 10);

    var prevM = m === 1 ? 12 : m - 1;
    var prevY = m === 1 ? y - 1 : y;
    var prevLastDay = new Date(prevY, prevM, 0).getDate();

    var cells = '';
    for (var i = 0; i < lead; i++) {
      cells += cellHTML(prevY, prevM, prevLastDay - (lead - 1) + i, true);
    }
    for (var d = 1; d <= lastDay; d++) {
      cells += cellHTML(y, m, d, false);
    }
    var totalCells = lead + lastDay;
    var remainder = totalCells % 7;
    if (remainder > 0) {
      var nextM = m === 12 ? 1 : m + 1;
      var nextY = m === 12 ? y + 1 : y;
      for (var t = 1; t <= (7 - remainder); t++) {
        cells += cellHTML(nextY, nextM, t, true);
      }
    }
    calGrid.innerHTML = cells;
    renderMonthSummary(y, m);
  }

  // 当月汇总：遍历当月所有日期的 moyu-log，累加秒数 / 金额。
  function renderMonthSummary(year, month) {
    var summaryTime = document.getElementById('cal-summary-time');
    var summaryAmount = document.getElementById('cal-summary-amount');
    if (!summaryTime || !summaryAmount) return;

    var rate = effectiveRate(settings);
    var totalSecs = 0;
    var lastDay = new Date(year, month, 0).getDate();
    for (var d = 1; d <= lastDay; d++) {
      totalSecs += LogStore.get(toDateStr(year, month, d));
    }

    // 如果当前月包含今天，且计时器正在运行，用实时总量覆盖今天的数据
    var today = todayStr();
    var tParts = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(today);
    if (tParts) {
      var tY = parseInt(tParts[1], 10);
      var tM = parseInt(tParts[2], 10);
      if (tY === year && tM === month && timer && timer.status === 'running') {
        totalSecs = totalSecs - LogStore.get(today) + timer.getSeconds();
      }
    }

    summaryTime.textContent = formatClock(totalSecs);
    summaryAmount.textContent = (rate * totalSecs / 3600).toFixed(2) + ' 元';
  }

  // ---- 设置面板 ----
  function fillSettingsForm() {
    rateInput.value = settings.hourlyRate;
    salaryInput.value = settings.monthlySalary;
    workdaysInput.value = settings.workdays;
    hoursInput.value = settings.hoursPerDay;
    updateEffectiveHint();
  }

  function updateEffectiveHint() {
    var s = settings;
    var manual = String(s.hourlyRate).trim();
    if (manual !== '') {
      var m = Number(manual);
      if (isFinite(m) && m > 0 && m <= MAX_RATE) {
        effectiveRateEl.textContent = '当前使用手填时薪：' + m.toFixed(1) + ' 元/时（优先于推算）';
        return;
      }
    }
    if (s.monthlySalary > 0 && s.workdays > 0 && s.hoursPerDay > 0) {
      var v = (s.monthlySalary / s.workdays / s.hoursPerDay);
      effectiveRateEl.textContent = '等效时薪：月薪' + toCN(s.monthlySalary) + ' ÷ ' + s.workdays + '天 ÷ ' + s.hoursPerDay + 'h ≈ ' + v.toFixed(1) + ' 元/时';
    } else {
      effectiveRateEl.textContent = '等效时薪：月薪 ÷ 工作天数 ÷ 每天时长';
    }
  }

  function toCN(n) {
    if (n >= 10000) {
      return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万';
    }
    return String(n);
  }

  function saveSettingsFromForm() {
    var err = '';
    var manualRaw = rateInput.value.trim();
    if (manualRaw !== '') {
      var r = parsePosNum(manualRaw, MAX_RATE, '时薪');
      if (typeof r === 'string') {
        err = r;
      } else {
        settings.hourlyRate = Number(manualRaw);
      }
    } else {
      settings.hourlyRate = '';
    }

    var sa = parsePosNum(salaryInput.value, 1000000, '月薪');
    if (typeof sa === 'string') { err = sa; } else { settings.monthlySalary = sa.value; }

    var wd = parsePosNum(workdaysInput.value, 31, '月工作天数');
    if (typeof wd === 'string') { err = wd; } else { settings.workdays = wd.value; }

    var hd = parsePosNum(hoursInput.value, 24, '每天工作时长');
    if (typeof hd === 'string') { err = hd; } else { settings.hoursPerDay = hd.value; }

    if (err) {
      settingsError.textContent = err;
      return;
    }

    settingsError.textContent = '';
    persistSettings();
    updateEffectiveHint();
    renderMonth();
    renderTimer();
  }

  function toggleSettings(force) {
    var open = force !== undefined ? !!force : settingsPanel.getAttribute('data-open') !== 'true';
    settingsPanel.setAttribute('data-open', open ? 'true' : 'false');
    settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      settingsBody.classList.remove('is-hidden');
    } else {
      settingsBody.classList.add('is-hidden');
    }
  }

  // ---- 计时器 ----
  var timer = new MoyuTimer();

  // alive 水印：最近一次"running 仍在持续"的打点（ms）。SW 与页面读写同一存放于
  // moyu-timer-state.alive 的水印。若运行中 alive 距今过久，说明浏览器/SW 已随关闭停止，
  // 恢复时据此自动暂停（后台持续计时 + 关浏览器自动暂停依赖此信号）。
  var STALE_ALIVE_MS = 5 * 60 * 1000; // 与 background.js 保持一致
  var lastLogged = 0;
  // 记录上次落账时的日期，用于检测跨天：跨过午夜时把昨天的总量归档到昨天，今天从 0 重算。
  var lastLoggedDate = todayStr();

  // 跨天结算：计时器持续运行跨过午夜时，把截止昨天的总量落账到昨天，
  // 然后把计时器归零重置，让今天从 0 重新累计（每天独立记录，避免总量污染新一天）。
  function settleDayRollover() {
    var today = todayStr();
    if (lastLoggedDate === today) {
      return;
    }
    // 跨天了：先把昨天的总量幂等落账到昨天，再清零计时器让今天从 0 起算。
    LogStore.commit(lastLoggedDate, timer.getSeconds());
    timer.accSeconds = 0;
    timer.startAt = (timer.status === 'running') ? Date.now() : null;
    lastLogged = 0;
    lastLoggedDate = today;
    LogStore.setValue(today, 0);
  }

  // 把 running 的累计（时间戳差分总量 acc）以"max 单调幂等"方式提交到当天 log 并刷新
  // alive 水印。与 SW 的落账遵守同一契约：写 max(旧值, acc)，不重复、不倒退。
  var syncTicker = function () {
    settleDayRollover();
    var acc = timer.getSeconds();
    if (acc - lastLogged >= 0.25) {
      LogStore.commit(todayStr(), acc);
      lastLogged = acc;
    }
    writeAlive();
    return true;
  };
  var settlePending = syncTicker;
  // 开启全新计时段：以"本次会话内真实开始算起的增量"为唯一真实值（从 0 起算）。
  // 不沿用/不叠加可能被早前多写入者 max() 顶高的存量 log/accSeconds，并把当日 log
  // 拉齐到本会话真实起点，消除脏存量对该会话的污染。
  function beginSegment() {
    var base = 0;
    timer.accSeconds = base;
    lastLogged = base;
    lastLoggedDate = todayStr();
    LogStore.setValue(todayStr(), base);
  }

  // 刷新 running 的 alive 水印到存储（供后台/下次恢复判断"浏览器是否仍在"）。
  function writeAlive() {
    if (timer.status !== 'running') {
      return;
    }
    var o = {};
    o[KEY_TIMER] = snapshotTimerState();
    storageSet(o);
  }

  function validateRateForTimer() {
    var manual = String(settings.hourlyRate).trim();
    if (manual !== '') {
      var m = Number(manual);
      if (!isFinite(m)) {
        return '时薪必须是数字';
      }
      if (m <= 0) {
        return '时薪必须大于 0';
      }
      if (m > MAX_RATE) {
        return '时薪不能超过 ' + MAX_RATE + ' 元/时';
      }
      return null;
    }
    if (!(settings.monthlySalary > 0 && settings.workdays > 0 && settings.hoursPerDay > 0)) {
      return '请先设置月薪、工作天数与每天时长';
    }
    return null;
  }

  function renderRing(seconds) {
    if (!ringProgress) {
      return;
    }
    var t = seconds % RING_PERIOD_SECONDS;
    var progress = Math.min(1, t / RING_PERIOD_SECONDS);
    var offset = RING_CIRCUMFERENCE * (1 - progress);
    ringProgress.style.strokeDashoffset = offset.toFixed(2);
  }

  var STATUS_TEXT = { idle: '未开始', running: '摸鱼中', paused: '已暂停' };
  var STATUS_CLASS = { idle: 'is-idle', running: 'is-running', paused: 'is-paused' };

  // "浏览器关闭自动暂停"提示：置位后状态行持续显示该提示，直到用户主动开始/重置清除。
  var autoPausedNotice = false;

  function renderTimer() {
    var status = timer.status;
    // 唯一数据源：计时器时钟/金额 与 今日已摸/今日入账 都用今天的同一总量。
    var todaySecs = todayTotalSeconds();
    timeText.textContent = formatClock(todaySecs);
    amountText.textContent = (effectiveRate(settings) * todaySecs / 3600).toFixed(2) + ' 元';
    renderRing(todaySecs);

    if (statusChip) {
      var label = STATUS_TEXT[status] || status;
      var cls = STATUS_CLASS[status] || 'is-idle';
      if (autoPausedNotice && status === 'paused') {
        label = '已自动暂停';
      }
      statusChip.textContent = label;
      statusChip.className = 'status-chip ' + cls;
    }
    if (timerCard) {
      timerCard.setAttribute('data-state', status);
    }

    if (timerToday) {
      timerToday.innerHTML =
        '<div class="today-date">今日 ' + todayStr() + '</div>' +
        '<div class="today-row"><span>今日已摸</span><b>' + formatClock(todaySecs) + '</b></div>' +
        '<div class="today-row"><span>今日入账</span><b>' + (effectiveRate(settings) * todaySecs / 3600).toFixed(2) + ' 元</b></div>';
    }
    updateControlsVisibility(status);
  }

  function updateControlsVisibility(status) {
    var btnStart = document.getElementById('btn-start');
    var btnPause = document.getElementById('btn-pause');
    var btnResume = document.getElementById('btn-resume');

    if (!btnStart || !btnPause || !btnResume) return;

    btnStart.classList.add('is-hidden');
    btnPause.classList.add('is-hidden');
    btnResume.classList.add('is-hidden');

    if (status === 'idle') {
      btnStart.classList.remove('is-hidden');
    } else if (status === 'running') {
      btnPause.classList.remove('is-hidden');
    } else if (status === 'paused') {
      btnResume.classList.remove('is-hidden');
    }
  }

  // ============================================================
  // 计时器自身状态持久化（跨弹窗/浏览器重启继续）
  // ============================================================
  // 快照此刻上下文。status+accSeconds+startAt 供差分续算；lastLogged 为当天已入账的水位；
  // alive 为最近一次"running 仍在持续"打点（SW 与页面共用），供后台持续/"关浏览器自动暂停"判断。
  function snapshotTimerState() {
    var status = timer.status;
    var acc = status === 'running' ? timer.getSeconds() : timer.getSeconds();
    return {
      status: status,
      hourlyRate: timer.hourlyRate,
      accSeconds: acc,
      startAt: (status === 'running' && timer.startAt !== null) ? timer.startAt : null,
      lastLogged: acc,
      alive: status === 'running' ? Date.now() : null,
      logDate: lastLoggedDate
    };
  }

  function persistTimerState() {
    var o = {};
    o[KEY_TIMER] = snapshotTimerState();
    storageSet(o);
  }

  // 恢复：应用保存的计时器上下文（在 storage 全量读取回调中调用）。
  // 边界：
  //   idle   -> 累计从 0 开始，lastLogged 归零（不回填时薪）。
  //   paused -> 保持冻结累计（startAt=null，时间不再流逝），lastLogged=当前累计。
  //   running+alive 新鲜 -> 浏览器仍在，SW 持续计；保留 startAt 按时间戳差分续算，
  //                         并把已流逝累计以 max 幂等补记当天（与 SW 不重复）。
  //   running+alive 过期 -> 浏览器被关闭 → 自动暂停：只把已提交的 accSeconds 留账，
  //                         关闭期间未提交的剩余时间不记，置为 paused 并向 UI 提示。
  // 返回 { autoPaused: boolean } 供 UI 提示"浏览器关闭自动暂停"。
  function restoreTimerState(saved) {
    var flag = { autoPaused: false };
    if (!saved || typeof saved !== 'object') {
      return flag;
    }
    if (typeof saved.hourlyRate === 'number' && isFinite(saved.hourlyRate)) {
      timer.hourlyRate = saved.hourlyRate;
    }
    // 跨天归档：saved.logDate 记录该状态所属日期。若与今天不同（保存后跨过午夜），
    // 先把昨天累计落账到昨天，再把 saved 改写为今天 idle 的全新起点，让今天从 0 起算，
    // 避免把昨天的 accSeconds 恢复进今天（与 background.js 的 bgTick 跨天契约一致）。
    var todayForRestore = todayStr();
    var savedLogDate = (typeof saved.logDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.logDate)) ? saved.logDate : todayForRestore;
    if (savedLogDate !== todayForRestore) {
      var rolloverAcc = (typeof saved.accSeconds === 'number' && isFinite(saved.accSeconds)) ? Math.max(0, saved.accSeconds) : 0;
      LogStore.commit(savedLogDate, rolloverAcc);
      saved = {
        status: 'idle',
        hourlyRate: saved.hourlyRate,
        accSeconds: 0,
        startAt: null,
        lastLogged: 0,
        alive: null,
        logDate: todayForRestore
      };
      lastLoggedDate = todayForRestore;
    }
    if (saved.status === 'running' && typeof saved.startAt === 'number') {
      var nowMs = Date.now();
      var aliveOk = typeof saved.alive === 'number' && (nowMs - saved.alive) < STALE_ALIVE_MS;
      if (aliveOk) {
        // 浏览器仍在/最近刚打开：续算并幂等补账。
        // 权威累计基准 = 已确认的 accSeconds + 距上次"仍在计时"打点(alive)的残余；
        // 绝不采用任意旧的 startAt 差分（避免把关闭/暂停期间不该算的时段补进当天）。
        var base = (typeof saved.accSeconds === 'number' && isFinite(saved.accSeconds)) ? saved.accSeconds : 0;
        var residual = Math.max(0, (nowMs - saved.alive) / 1000);
        var restoredAcc = base + residual;
        timer.accSeconds = restoredAcc;
        timer.startAt = nowMs; // 以当前为起点续跑实时时钟（不沿用旧 startAt）
        timer.status = 'running';
        LogStore.commit(todayStr(), restoredAcc);
        lastLogged = restoredAcc;
        writeAlive();
      } else {
        // alive 过期 => 浏览器/SW 已随关闭停止：自动暂停。
        var frozen = (typeof saved.accSeconds === 'number' && isFinite(saved.accSeconds)) ? saved.accSeconds : 0;
        LogStore.commit(todayStr(), frozen); // 确保已提交部分留账（幂等）
        timer.accSeconds = frozen;
        timer.startAt = null;
        timer.status = 'paused';
        lastLogged = frozen;
        flag.autoPaused = true;
        persistTimerState(); // 把"已自动暂停"写回存储，避免后续仍按 running 处理
      }
      if (timer.hourlyRate > 0) {
        rateInput.value = String(timer.hourlyRate);
      }
    } else if (saved.status === 'paused') {
      var pausedAcc = (typeof saved.accSeconds === 'number' && isFinite(saved.accSeconds)) ? saved.accSeconds : 0;
      timer.accSeconds = pausedAcc;
      timer.startAt = null;
      timer.status = 'paused';
      lastLogged = pausedAcc;
      if (timer.hourlyRate > 0) {
        rateInput.value = String(timer.hourlyRate);
      }
    } else {
      // idle
      timer.accSeconds = 0;
      timer.startAt = null;
      timer.status = 'idle';
      lastLogged = 0;
    }
    return flag;
  }

  // ---- 事件绑定 ----
  settingsToggle.addEventListener('click', function () {
    toggleSettings();
  });
  settingsSave.addEventListener('click', function () {
    saveSettingsFromForm();
  });
  rateInput.addEventListener('input', function () {
    var manual = rateInput.value.trim();
    if (manual !== '') {
      var m = Number(manual);
      if (isFinite(m) && m > 0 && m <= MAX_RATE) {
        effectiveRateEl.textContent = '当前使用手填时薪：' + m.toFixed(1) + ' 元/时（优先于推算）';
        return;
      }
    }
    var sal = Number(salaryInput.value);
    var wd = Number(workdaysInput.value);
    var hd = Number(hoursInput.value);
    if (sal > 0 && wd > 0 && hd > 0) {
      effectiveRateEl.textContent = '等效时薪：月薪' + toCN(sal) + ' ÷ ' + wd + '天 ÷ ' + hd + 'h ≈ ' + (sal / wd / hd).toFixed(1) + ' 元/时';
    } else {
      effectiveRateEl.textContent = '等效时薪：月薪 ÷ 工作天数 ÷ 每天时长';
    }
  });

  btnPrev.addEventListener('click', function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    renderMonth();
  });
  btnNext.addEventListener('click', function () {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    renderMonth();
  });
  btnToday.addEventListener('click', function () {
    var t = new Date();
    cursor = new Date(t.getFullYear(), t.getMonth(), 1);
    renderMonth();
  });

  // 状态变化 -> 持久化计时器上下文（start/pause/resume/reset 触发 _emit）
  timer.onChange(function () {
    persistTimerState();
  });
  timer.onChange(renderTimer);

  // 金句（按日期固定）。
  if (fortuneText) {
    fortuneText.textContent = fortuneOf(todayStr());
  }

  // 心跳：实时刷新 + running 单调落库 + 刷新 alive 水印（syncTicker 已含写 alive 快照）。
  setInterval(function () {
    if (timer.status === 'running') {
      settlePending();
      // 每 tick 都重绘月历：让"今日"格子与计时器/今日已摸同 tick 取同一唯一源，秒级严格相等。
      renderMonth();
    }
    renderTimer();
  }, 1000);

  // 关闭/失去焦点前兜底保存计时器上下文。
  window.addEventListener('beforeunload', persistTimerState);

  // ============================================================
  // 初始化：先同步搭好事件绑定与静态内容，再异步恢复存储后渲染。
  // ============================================================
  chrome.storage.local.get(null, function (data) {
    var restoreFlag = {};
    if (chrome.runtime.lastError) {
      data = null;
    }
    if (data && typeof data === 'object') {
      // 1) 恢复每日摸鱼记录（moyu-log:*）
      var prefix = KEY_PREFIX_LOG;
      Object.keys(data).forEach(function (key) {
        if (key.indexOf(prefix) === 0) {
          var v = data[key];
          if (typeof v === 'number' && isFinite(v) && v > 0) {
            logCache[key.slice(prefix.length)] = v;
          }
        }
      });
      // 2) 恢复薪资设置
      if (data[KEY_SETTINGS] !== undefined) {
        applySettingsObject(data[KEY_SETTINGS]);
      }
      // 3) 恢复计时器上下文（含"浏览器关闭→自动暂停"判定）
      if (data[KEY_TIMER] !== undefined) {
        restoreFlag = restoreTimerState(data[KEY_TIMER]);
      }
    }

    // 全部恢复后，首次装配渲染。
    sanitizePollutedToday();
    fillSettingsForm();
    renderMonth();
    renderPetCard(data);
    refreshAchievements();

    var achievementsRefresh = document.getElementById('achievements-refresh');
    if (achievementsRefresh) {
      achievementsRefresh.addEventListener('click', refreshAndPopAchievements);
    }

    if (petEnabledInput) {
      petEnabledInput.addEventListener('change', function () {
        var set = {}; set[KEY_PET_ENABLED] = !!petEnabledInput.checked;
        chrome.storage.local.set(set, function () {
          renderPetCard(set);
        });
      });
    }

    // 一次性绑定按钮事件
    document.getElementById('btn-start').addEventListener('click', function () {
      var err = validateRateForTimer();
      if (err) { rateError.textContent = err; return; }
      rateError.textContent = '';
      autoPausedNotice = false;
      beginSegment();
      timer.start(effectiveRate(settings));
      renderMonth();
    });
    document.getElementById('btn-pause').addEventListener('click', function () {
      LogStore.commit(todayStr(), timer.getSeconds());
      timer.pause();
      renderMonth();
      setTimeout(function () { requestAchievementCheck('moyu-pause'); }, 80);
    });
    document.getElementById('btn-resume').addEventListener('click', function () {
      autoPausedNotice = false;
      timer.resume();
      renderMonth();
    });

    renderTimer();
    if (restoreFlag.autoPaused) {
      showAutoPauseNote();
    }
  });

  // 一次性数据兜底：非计时状态下，当天 log 必须与计时器冻结的真实累计(timer.accSeconds)一致。
  // 若早前多写入者用 max() 把某天 log 顶成远超计时器现状的虚高值，这里把它校正回计时器的真实值
  // （new 会话会另经 beginSegment 从 0 起算，这里主要兜住"未开始前就看到脏 log"的情况）。
  function sanitizePollutedToday() {
    var ds = todayStr();
    var log = LogStore.get(ds);
    var acc = (typeof timer.accSeconds === 'number' && isFinite(timer.accSeconds)) ? timer.accSeconds : 0;
    if (timer.status !== 'running' && log > acc + 2) {
      LogStore.setValue(ds, acc);
    }
  }

  // 置位"浏览器关闭自动暂停"提示，renderTimer 会持续显示直到用户开始/重置。
  function showAutoPauseNote() {
    autoPausedNotice = true;
    renderTimer();
  }

  // ============================================================
  // 唯一数据源同步：chrome.storage.local 任一变动（本页/其它页/SW）都据此刷新，
  // 保证完整页/弹窗/Service Worker 看同一份当日秒数与计器状态，避免各跑各的漂移。
  // 自身写入由 storageSet 记录的 lastSelfWrite 抑制，只剩外部写入触发同步。
  // ============================================================
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local' || !changes || isSelfWrite(changes)) {
        return;
      }
      var needTimer = false;
      var needRerender = false;
      for (var key in changes) {
        if (!Object.prototype.hasOwnProperty.call(changes, key)) {
          continue;
        }
        var newVal = changes[key].newValue;
        if (key === KEY_TIMER) {
          needTimer = true;
        } else if (key.indexOf(KEY_PREFIX_LOG) === 0) {
          var dateStr = key.slice(KEY_PREFIX_LOG.length);
          if (typeof newVal === 'number' && isFinite(newVal) && newVal > 0) {
            logCache[dateStr] = newVal;
          } else if (newVal === undefined || newVal === null) {
            delete logCache[dateStr];
          }
          needRerender = true;
        } else if (key === KEY_SETTINGS && newVal && typeof newVal === 'object') {
          applySettingsObject(newVal);
          fillSettingsForm();
          needRerender = true;
        } else if (key === KEY_PET_ENABLED || key === KEY_PET_DROPPED) {
          var petData = {};
          petData[key] = newVal;
          if (key === KEY_PET_ENABLED && petDroppedCoin) {
            petData[KEY_PET_DROPPED] = Number(petDroppedCoin.textContent) || 0;
          }
          if (key === KEY_PET_DROPPED && petEnabledInput) {
            petData[KEY_PET_ENABLED] = petEnabledInput.checked;
          }
          renderPetCard(petData);
        }
      }
      if (needTimer && changes[KEY_TIMER] && changes[KEY_TIMER].newValue) {
        restoreTimerState(changes[KEY_TIMER].newValue);
      }
      if (needRerender || needTimer) {
        renderMonth();
        renderTimer();
      }
    });
  }

  // ============================================================
  // 日期悬浮窗（tooltip）—— 共享实现 js/calendar-tooltip.js（与网页版 index.html 同源）
  // ============================================================
  if (typeof CalendarTooltip === 'object' && CalendarTooltip.attach) {
    var tipApi = CalendarTooltip.attach({
      grid: calGrid,
      build: function (dateStr) {
        var m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
        if (!m2) {
          return '';
        }
        var p = { y: parseInt(m2[1], 10), m: parseInt(m2[2], 10), d: parseInt(m2[3], 10) };
        var yiji = getYiji(dateStr);
        // 与 cellHTML/renderMonth 同一数据源：今天用唯一真源，其它日用已落账。
        var secs = (dateStr === todayStr() ? todayTotalSeconds() : LogStore.get(dateStr));
        var hasLog = secs > 0;
        var rate = effectiveRate(settings);
        var timeStr = hasLog ? formatClock(secs) : '—';
        var amountStr = hasLog ? (rate * secs / 3600).toFixed(2) + ' 元' : '—';
        return CalendarTooltip.buildHtml({
          dateLabel: p.y + ' 年 ' + p.m + ' 月 ' + p.d + ' 日' + ' · 周' + WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()],
          yi: yiji.yi,
          ji: yiji.ji,
          timeStr: timeStr,
          amountStr: amountStr
        });
      }
    });
    // 重绘月历（翻页/今天/落库）时收起悬浮窗，避免残留指向旧位置。
    var origRenderMonth = renderMonth;
    renderMonth = function () {
      origRenderMonth();
      if (tipApi && tipApi.hide) {
        tipApi.hide();
      }
    };
  }
})();
