// 装配层（Chrome 扩展 popup · 简洁小窗版）：
// 弹窗只保留三块：今日宜忌 / 今日摸鱼账本 / 紧凑摸鱼计时器，另有一个"打开完整页面"按钮。
// 与 js/popup.js（完整页 full.html 用）共用同一套 chrome.storage.local 数据契约：
//   键 moyu-log:YYYY-MM-DD、moyu-settings、moyu-timer-state，保证小窗与完整页数据一致、互相衔接。
// 依赖：YijiModule（yiji-data.js）、MoyuTimer（moyu-timer.js）。
(function () {
  'use strict';

  // ---- 常量（与 popup.js 完全一致，保证契约对齐）----
  var MAX_RATE = 9999;
  var DEFAULT_SALARY = 10000;
  var DEFAULT_WORKDAYS = 22;
  var DEFAULT_HOURS = 8;
  var YI_COUNT = 2;
  var JI_COUNT = 2;

  var KEY_PREFIX_LOG = 'moyu-log:';
  var KEY_SETTINGS = 'moyu-settings';
  var KEY_TIMER = 'moyu-timer-state';

  // ---- 金句池（与 popup.js 完全一致，保证与完整页同日期同金句）----
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
  function pad(v) { return String(v).padStart(2, '0'); }
  function toDateStr(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
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

  // ---- Storage 适配层（与 popup.js 同源契约）----
  // 记录最近的本地自写，供 storage.onChanged 抑制"自身写入→又触发恢复"的反馈环，
  // 只对其它页面/SW 的外部写入做同步。
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
    if (!o || typeof o !== 'object') { return; }
    if (typeof o.hourlyRate === 'number' || typeof o.hourlyRate === 'string') settings.hourlyRate = o.hourlyRate;
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

  function validateRateForTimer() {
    var manual = String(settings.hourlyRate).trim();
    if (manual !== '') {
      var m = Number(manual);
      if (!isFinite(m)) { return '时薪必须是数字'; }
      if (m <= 0) { return '时薪必须大于 0'; }
      if (m > MAX_RATE) { return '时薪不能超过 ' + MAX_RATE + ' 元/时'; }
      return null;
    }
    if (!(settings.monthlySalary > 0 && settings.workdays > 0 && settings.hoursPerDay > 0)) {
      return '请先设置月薪、工作天数与每天时长';
    }
    return null;
  }

  // ---- DOM 引用 ----
  var fortuneEl = document.getElementById('mini-fortune-text');
  var dateEl = document.getElementById('mini-date');
  var yiEl = document.getElementById('mini-yi-text');
  var jiEl = document.getElementById('mini-ji-text');
  var todayTimeEl = document.getElementById('mini-today-time');
  var todayAmountEl = document.getElementById('mini-today-amount');
  var timerCard = document.getElementById('mini-timer-card');
  var statusChip = document.getElementById('mini-status-chip');
  var timeText = document.getElementById('mini-time-text');
  var amountText = document.getElementById('mini-amount-text');
  var rateError = document.getElementById('mini-rate-error');
  var controlsBox = document.getElementById('mini-controls');
  var btnOpenFull = document.getElementById('btn-open-full');

  // ---- 计时器 ----
  var timer = new MoyuTimer();

  // alive 水印：最近一次"running 仍在持续"打点（ms），SW 与页面读写同一存放于
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
    if (timer.status !== 'running') { return; }
    var o = {};
    o[KEY_TIMER] = snapshotTimerState();
    storageSet(o);
  }

  var STATUS_TEXT = { idle: '未开始', running: '摸鱼中', paused: '已暂停' };
  var STATUS_CLASS = { idle: 'is-idle', running: 'is-running', paused: 'is-paused' };

  // "浏览器关闭自动暂停"提示：置位后状态行持续显示，直到用户主动开始/恢复清除。
  var autoPausedNotice = false;

  // ---- 三块渲染 ----
  // 唯一数据源：今天累计秒数。running 时等于计时器真源实时总量（已含历史段），
  // 否则用已落账的 moyu-log。今日账本与计时器时钟/金额都从这里取，杜绝各 block 各缓一套。
  function todayTotalSeconds() {
    var t = todayStr();
    if (timer && timer.status === 'running') {
      return timer.getSeconds();
    }
    return LogStore.get(t);
  }

  function renderYiji() {
    var dateStr = todayStr();
    var yiji = YijiModule.generateYiji(dateStr, YI_COUNT);
    if (dateEl) dateEl.textContent = dateStr;
    if (yiEl) yiEl.textContent = yiji.yi.join('、');
    if (jiEl) jiEl.textContent = yiji.ji.join('、');
  }

  function renderBook() {
    var todaySecs = todayTotalSeconds();
    var rate = effectiveRate(settings);
    if (todayTimeEl) todayTimeEl.textContent = formatClock(todaySecs);
    if (todayAmountEl) todayAmountEl.textContent = (rate * todaySecs / 3600).toFixed(2) + ' 元';
  }

  function renderTimer() {
    var status = timer.status;
    var todaySecs = todayTotalSeconds();
    if (timeText) timeText.textContent = formatClock(todaySecs);
    if (amountText) amountText.textContent = (effectiveRate(settings) * todaySecs / 3600).toFixed(2) + ' 元';    if (statusChip) {
      var label = STATUS_TEXT[status] || status;
      var cls = STATUS_CLASS[status] || 'is-idle';
      if (autoPausedNotice && status === 'paused') {
        label = '已自动暂停';
      }
      statusChip.textContent = label;
      statusChip.className = 'status-chip ' + cls;
    }
    if (timerCard) timerCard.setAttribute('data-state', status);
    renderBook(); // 今日账本跟随计时落库实时刷新
    updateControlsVisibility(status);
  }

  function updateControlsVisibility(status) {
    var btnStart = document.getElementById('btn-start');
    var btnPause = document.getElementById('btn-pause');
    var btnResume = document.getElementById('btn-resume');
    var btnReset = document.getElementById('btn-reset');

    if (!btnStart || !btnPause || !btnResume || !btnReset) return;

    btnStart.classList.add('is-hidden');
    btnPause.classList.add('is-hidden');
    btnResume.classList.add('is-hidden');
    btnReset.classList.add('is-hidden');

    if (status === 'idle') {
      btnStart.classList.remove('is-hidden');
    } else if (status === 'running') {
      btnPause.classList.remove('is-hidden');
      btnReset.classList.remove('is-hidden');
    } else if (status === 'paused') {
      btnResume.classList.remove('is-hidden');
      btnReset.classList.remove('is-hidden');
    }
  }

  // ---- 计时器自身状态持久化（与 popup.js / background.js 同契约）----
  function snapshotTimerState() {
    var status = timer.status;
    var acc = timer.getSeconds();
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

  // 恢复计时器上下文。若读取到 running 但 alive 过期，判定"浏览器被关闭"→自动暂停：
  // 只把已提交的 accSeconds 留账、剩余未提交时间不记，返回 { autoPaused:true } 供 UI 提示。
  function restoreTimerState(saved) {
    var flag = { autoPaused: false };
    if (!saved || typeof saved !== 'object') { return flag; }
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
        // 浏览器仍在：续算并幂等补账。
        // 权威累计基准 = 已确认 accSeconds + 距上次"仍在计时"打点(alive)的残余；
        // 绝不采用旧 startAt 差分（避免把暂停/关闭后不该算的时段补进当天）。
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
        // alive 过期 => 浏览器/SW 已随关闭停止：自动暂停，只留已提交部分。
        var frozen = (typeof saved.accSeconds === 'number' && isFinite(saved.accSeconds)) ? saved.accSeconds : 0;
        LogStore.commit(todayStr(), frozen);
        timer.accSeconds = frozen;
        timer.startAt = null;
        timer.status = 'paused';
        lastLogged = frozen;
        flag.autoPaused = true;
        persistTimerState(); // 把"已自动暂停"写回存储，避免后续仍按 running 处理
      }
      if (timer.hourlyRate > 0) {
        //（小窗无时薪输入，不回填）
      }
    } else if (saved.status === 'paused') {
      var pausedAcc = (typeof saved.accSeconds === 'number' && isFinite(saved.accSeconds)) ? saved.accSeconds : 0;
      timer.accSeconds = pausedAcc;
      timer.startAt = null;
      timer.status = 'paused';
      lastLogged = pausedAcc;
    } else {
      timer.accSeconds = 0;
      timer.startAt = null;
      timer.status = 'idle';
      lastLogged = 0;
    }
    return flag;
  }

  // ---- 打开完整页面 ----
  if (btnOpenFull) {
    btnOpenFull.addEventListener('click', function () {
      try {
        chrome.tabs.create({ url: chrome.runtime.getURL('full.html') });
      } catch (e) {
        // 极少数环境无 tabs API 时降级为新窗口。
        window.open(chrome.runtime.getURL('full.html'), '_blank');
      }
    });
  }

  // ---- 事件/心跳 ----
  timer.onChange(persistTimerState);
  timer.onChange(renderTimer);

  setInterval(function () {
    if (timer.status === 'running') {
      settlePending();
    }
    renderTimer();
  }, 1000);

  window.addEventListener('beforeunload', persistTimerState);

  // ---- 初始化：先落静态内容，再异步恢复存储后渲染 ----
  renderYiji();
  if (fortuneEl) fortuneEl.textContent = fortuneOf(todayStr());

  chrome.storage.local.get(null, function (data) {
    var restoreFlag = {};
    if (chrome.runtime && chrome.runtime.lastError) {
      data = null;
    }
    if (data && typeof data === 'object') {
      var prefix = KEY_PREFIX_LOG;
      Object.keys(data).forEach(function (key) {
        if (key.indexOf(prefix) === 0) {
          var v = data[key];
          if (typeof v === 'number' && isFinite(v) && v > 0) {
            logCache[key.slice(prefix.length)] = v;
          }
        }
      });
      if (data[KEY_SETTINGS] !== undefined) {
        applySettingsObject(data[KEY_SETTINGS]);
      }
      if (data[KEY_TIMER] !== undefined) {
        restoreFlag = restoreTimerState(data[KEY_TIMER]);
      }
    }
    // 一次性数据兜底：非计时状态下，当天 log 需与计时器冻结的真实累计一致，清除脏存量。
    sanitizePollutedToday();
    if (restoreFlag.autoPaused) {
      autoPausedNotice = true;
    }
    renderBook();

    // 一次性绑定按钮事件
    document.getElementById('btn-start').addEventListener('click', function () {
      var err = validateRateForTimer();
      if (err) { rateError.textContent = err; return; }
      rateError.textContent = '';
      autoPausedNotice = false;
      beginSegment();
      timer.start(effectiveRate(settings));
    });
    document.getElementById('btn-pause').addEventListener('click', function () {
      LogStore.commit(todayStr(), timer.getSeconds());
      timer.pause();
      setTimeout(function () {
        try { chrome.runtime.sendMessage({ type: 'achievement-check', reason: 'moyu-pause' }, function () { void chrome.runtime.lastError; }); } catch (e) { /* ignore */ }
      }, 80);
    });
    document.getElementById('btn-resume').addEventListener('click', function () {
      autoPausedNotice = false;
      timer.resume();
    });
    document.getElementById('btn-reset').addEventListener('click', function () {
      LogStore.commit(todayStr(), timer.getSeconds());
      timer.reset();
      beginSegment();
    });

    renderTimer();
  });

  // 一次性数据兜底：非计时状态下，当天 log 必须与计时器冻结的真实累计(timer.accSeconds)一致。
  function sanitizePollutedToday() {
    var ds = todayStr();
    var log = LogStore.get(ds);
    var acc = (typeof timer.accSeconds === 'number' && isFinite(timer.accSeconds)) ? timer.accSeconds : 0;
    if (timer.status !== 'running' && log > acc + 2) {
      LogStore.setValue(ds, acc);
    }
  }

  // ============================================================
  // 唯一数据源同步：chrome.storage.local 任一变动（本页/其它页/SW）都据此刷新，
  // 保证弹窗/完整页/Service Worker 看同一份当日秒数与计器状态，避免各跑各的漂移。
  // 自身写入由 storageSet 记录的 lastSelfWrite 抑制，只剩外部写入触发同步。
  // ============================================================
  // ============================================================
  // 喝水提醒设置区：读写 storage.sync 的 water-settings。
  // 写入后由 Service Worker (water-reminder.js) 监听 storage.onChanged 立即重排 alarm，
  // 因此这里只负责 UI ↔ 存储的双向绑定，不直接操作 alarm。
  // ============================================================
  (function initWaterReminder() {
    var KEY_WATER = 'water-settings';       // storage.sync
    var KEY_WHITELIST = 'water-whitelist';  // storage.sync
    var KEY_STATS = 'water-stats';          // storage.local
    var PRESET_INTERVALS = { 5: 1, 15: 1, 30: 1, 60: 1 };
    var DEFAULTS = {
      enabled: false, intervalMin: 30, sound: true,
      quietEnabled: false, quietStart: '22:00', quietEnd: '08:00'
    };

    var elEnabled = document.getElementById('water-enabled');
    var elInterval = document.getElementById('water-interval');
    var elCustom = document.getElementById('water-custom');
    var elSound = document.getElementById('water-sound');
    var elQuietEnabled = document.getElementById('water-quiet-enabled');
    var elQuietRange = document.getElementById('water-quiet-range');
    var elQuietStart = document.getElementById('water-quiet-start');
    var elQuietEnd = document.getElementById('water-quiet-end');
    var elWhitelist = document.getElementById('water-whitelist');
    var elStatRemind = document.getElementById('water-stat-remind');
    var elStatSnooze = document.getElementById('water-stat-snooze');
    var elStatDismiss = document.getElementById('water-stat-dismiss');
    if (!elEnabled || !elInterval || !elCustom || !elSound) { return; }

    // 从 UI 读出规范化的间隔（自定义时取输入框，最小 1 分钟）。
    function readIntervalFromUI() {
      if (elInterval.value === 'custom') {
        var v = parseInt(elCustom.value, 10);
        if (!isFinite(v) || v < 1) { v = 1; }
        if (v > 480) { v = 480; }
        return v;
      }
      return parseInt(elInterval.value, 10) || DEFAULTS.intervalMin;
    }

    // 把配置回填到 UI：预设值命中下拉，否则切到"自定义"并填输入框。
    function applyToUI(s) {
      elEnabled.checked = s.enabled === true;
      elSound.checked = s.sound !== false;
      var interval = (typeof s.intervalMin === 'number' && s.intervalMin >= 1) ? s.intervalMin : DEFAULTS.intervalMin;
      if (PRESET_INTERVALS[interval]) {
        elInterval.value = String(interval);
        elCustom.classList.add('is-hidden');
        elCustom.value = '';
      } else {
        elInterval.value = 'custom';
        elCustom.classList.remove('is-hidden');
        elCustom.value = String(interval);
      }
      if (elQuietEnabled) {
        elQuietEnabled.checked = s.quietEnabled === true;
        if (elQuietStart) { elQuietStart.value = /^\d{2}:\d{2}$/.test(s.quietStart) ? s.quietStart : DEFAULTS.quietStart; }
        if (elQuietEnd) { elQuietEnd.value = /^\d{2}:\d{2}$/.test(s.quietEnd) ? s.quietEnd : DEFAULTS.quietEnd; }
        if (elQuietRange) { elQuietRange.classList.toggle('is-hidden', !elQuietEnabled.checked); }
      }
    }

    // 收集 UI 当前值写入 sync；修改立即生效由 SW 侧监听触发。
    function persist() {
      var o = {};
      o[KEY_WATER] = {
        enabled: elEnabled.checked,
        intervalMin: readIntervalFromUI(),
        sound: elSound.checked,
        quietEnabled: elQuietEnabled ? elQuietEnabled.checked : false,
        quietStart: (elQuietStart && /^\d{2}:\d{2}$/.test(elQuietStart.value)) ? elQuietStart.value : DEFAULTS.quietStart,
        quietEnd: (elQuietEnd && /^\d{2}:\d{2}$/.test(elQuietEnd.value)) ? elQuietEnd.value : DEFAULTS.quietEnd
      };
      try { chrome.storage.sync.set(o, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
    }

    // 下拉切换：选"自定义"显示输入框并默认填当前预设值。
    elInterval.addEventListener('change', function () {
      if (elInterval.value === 'custom') {
        elCustom.classList.remove('is-hidden');
        if (!elCustom.value) { elCustom.value = String(DEFAULTS.intervalMin); }
        elCustom.focus();
      } else {
        elCustom.classList.add('is-hidden');
      }
      persist();
    });
    elCustom.addEventListener('input', persist);
    elCustom.addEventListener('change', persist);
    elEnabled.addEventListener('change', persist);
    elSound.addEventListener('change', persist);
    if (elQuietEnabled) {
      elQuietEnabled.addEventListener('change', function () {
        if (elQuietRange) { elQuietRange.classList.toggle('is-hidden', !elQuietEnabled.checked); }
        persist();
      });
    }
    if (elQuietStart) { elQuietStart.addEventListener('change', persist); }
    if (elQuietEnd) { elQuietEnd.addEventListener('change', persist); }

    // ---- 白名单（storage.sync: water-whitelist，字符串数组）----
    function parseWhitelist() {
      if (!elWhitelist) { return []; }
      return elWhitelist.value.split('\n')
        .map(function (s) { return s.trim().toLowerCase(); })
        .filter(function (s) { return s !== ''; });
    }
    function persistWhitelist() {
      var o = {}; o[KEY_WHITELIST] = parseWhitelist();
      try { chrome.storage.sync.set(o, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
    }
    if (elWhitelist) {
      // 失焦时写入，避免每次敲键都写 sync（sync 有写入频率配额）。
      elWhitelist.addEventListener('blur', persistWhitelist);
    }

    // ---- 今日统计（storage.local: water-stats，只读展示）----
    function renderStats(s) {
      if (!elStatRemind) { return; }
      var valid = s && typeof s === 'object';
      elStatRemind.textContent = String((valid && s.remind) || 0);
      elStatSnooze.textContent = String((valid && s.snooze) || 0);
      elStatDismiss.textContent = String((valid && s.dismiss) || 0);
    }

    // 初始化：读取已存配置 + 白名单 + 统计。
    try {
      chrome.storage.sync.get([KEY_WATER, KEY_WHITELIST], function (obj) {
        var s = (obj && typeof obj === 'object' && obj[KEY_WATER] && typeof obj[KEY_WATER] === 'object')
          ? obj[KEY_WATER] : DEFAULTS;
        applyToUI(s);
        if (elWhitelist && obj && Array.isArray(obj[KEY_WHITELIST])) {
          elWhitelist.value = obj[KEY_WHITELIST].join('\n');
        }
      });
      chrome.storage.local.get(KEY_STATS, function (obj) {
        renderStats(obj && obj[KEY_STATS]);
      });
    } catch (e) {
      applyToUI(DEFAULTS);
    }

    // 跨设备/其它页面改动时同步回 UI；统计随 SW 计数实时刷新。
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'sync' && changes) {
          if (changes[KEY_WATER] && changes[KEY_WATER].newValue) {
            applyToUI(changes[KEY_WATER].newValue);
          }
          if (changes[KEY_WHITELIST] && Array.isArray(changes[KEY_WHITELIST].newValue) && elWhitelist &&
              document.activeElement !== elWhitelist) {
            elWhitelist.value = changes[KEY_WHITELIST].newValue.join('\n');
          }
        } else if (area === 'local' && changes && changes[KEY_STATS]) {
          renderStats(changes[KEY_STATS].newValue);
        }
      });
    }
  })();

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local' || !changes || isSelfWrite(changes)) {
        return;
      }
      var needBook = false;
      var needTimer = false;
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
          needBook = true;
        } else if (key === KEY_SETTINGS && newVal && typeof newVal === 'object') {
          applySettingsObject(newVal);
          needBook = true;
        }
      }
      if (needTimer && changes[KEY_TIMER] && changes[KEY_TIMER].newValue) {
        restoreTimerState(changes[KEY_TIMER].newValue);
      }
      if (needBook || needTimer) {
        renderBook();
        renderTimer();
      }
    });
  }
})();
