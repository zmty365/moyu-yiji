// 装配层（月历重构版）：月历网格 + 摸鱼账本 + 计时器 + 薪资模型设置面板。
// 依赖 YijiModule（js/yiji-data.js，按日期可复现）与 MoyuTimer（js/moyu-timer.js）。
(function () {
  'use strict';

  // ============================================================
  // 常量
  // ============================================================
  var MAX_RATE = 9999;                       // 时薪上限（元/时）
  var DEFAULT_SALARY = 10000;                // 默认月薪
  var DEFAULT_WORKDAYS = 22;                 // 默认月工作天数
  var DEFAULT_HOURS = 8;                     // 默认每天工作时长（小时）
  var YI_COUNT = 2;                          // 每个日期格子展示的宜条数
  var JI_COUNT = 2;                          // 每个日期格子展示的忌条数

  // localStorage 键
  var KEY_PREFIX_LOG = 'moyu-log:';          // moyu-log:YYYY-MM-DD -> 当日摸鱼累计秒数
  var KEY_SETTINGS = 'moyu-settings';        // 薪资模型设置对象

  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  var MONTHS_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

  // ============================================================
  // 今日金句池（猫/熊/鱼/躺平梗，简短俏皮健康；按日期确定性每日一条）。
  // ============================================================
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

  // 按日期确定性抽取一条金句：同一天固定、跨天变化。
  function fortuneOf(dateStr) {
    var seed = YijiModule.hashString('moyu-fortune:' + dateStr);
    var rand = YijiModule.mulberry32(seed);
    var idx = Math.floor(rand() * FORTUNE_POOL.length);
    return FORTUNE_POOL[idx];
  }

  // ============================================================
  // 工具函数
  // ============================================================
  function pad(v) {
    return String(v).padStart(2, '0');
  }
  // 本地日期 -> YYYY-MM-DD
  function toDateStr(y, m, d) {
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function todayStr() {
    var t = new Date();
    return toDateStr(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  // 秒 -> HH:MM:SS
  function formatClock(seconds) {
    var total = Math.floor(seconds);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  // ============================================================
  // 摸鱼记录存取（localStorage，按日期）
  // ============================================================
  var LogStore = {
    // 读取某日累计秒数（浮点，无记录返回 0）。
    get: function (dateStr) {
      try {
        var raw = localStorage.getItem(KEY_PREFIX_LOG + dateStr);
        if (raw === null || raw === '') {
          return 0;
        }
        var v = parseFloat(raw);
        return isFinite(v) && v > 0 ? v : 0;
      } catch (e) {
        return 0;
      }
    },
    // 累加某日的累计秒数（delta>0）。返回写入后的该日秒数。
    add: function (dateStr, delta) {
      if (!(delta > 0)) {
        return this.get(dateStr);
      }
      var next = this.get(dateStr) + delta;
      try {
        localStorage.setItem(KEY_PREFIX_LOG + dateStr, String(next));
      } catch (e) {
        // 存储被禁用/满时静默失败，不影响计时器本身。
      }
      return next;
    },
    // 直接写入某日的累计秒数（覆盖）。用于把当日 log 对齐到真实计时值/清除脏存量。
    setValue: function (dateStr, value) {
      try {
        localStorage.setItem(KEY_PREFIX_LOG + dateStr, String(value));
      } catch (e) {
        // ignore
      }
    }
  };

  // ============================================================
  // 薪资模型设置存取 + 计算
  // ============================================================
  function defaultSettings() {
    return {
      hourlyRate: '',        // 手填时薪（元/时），空则走推算
      monthlySalary: DEFAULT_SALARY,
      workdays: DEFAULT_WORKDAYS,
      hoursPerDay: DEFAULT_HOURS
    };
  }

  function loadSettings() {
    var s = defaultSettings();
    try {
      var raw = localStorage.getItem(KEY_SETTINGS);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          if (typeof o.hourlyRate === 'number') s.hourlyRate = o.hourlyRate;
          if (typeof o.hourlyRate === 'string') s.hourlyRate = o.hourlyRate;
          if (typeof o.monthlySalary === 'number') s.monthlySalary = o.monthlySalary;
          if (typeof o.workdays === 'number') s.workdays = o.workdays;
          if (typeof o.hoursPerDay === 'number') s.hoursPerDay = o.hoursPerDay;
        }
      }
    } catch (e) {
      // ignore
    }
    return s;
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
    } catch (e) {
      // ignore
    }
  }

  // 校验数值区间：num 可为数字或字符串，返回 { valid, value } 或错误文案。
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

  var settings = loadSettings();

  // 计算"用于计价的时薪"：手填时薪优先，否则月薪推算等效时薪。
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

  // ============================================================
  // DOM 引用
  // ============================================================
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

  var fortuneText = document.getElementById('fortune-text');

  // 环形进度参数（一轮 24h）。
  var RING_R = 108;
  var RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
  var RING_PERIOD_SECONDS = 24 * 3600;

  // ============================================================
  // 月历状态 & 渲染
  // ============================================================
  var cursor = new Date();   // 当前翻到的月份（取年月）
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  // 宜忌缓存：dateStr -> {yi, ji}
  var manualRingCache = {};

  // 生成某日宜忌并缓存（固定、跨月历界面稳定）。
  function getYiji(dateStr) {
    if (!manualRingCache[dateStr]) {
      manualRingCache[dateStr] = YijiModule.generateYiji(dateStr, YI_COUNT);
    }
    return manualRingCache[dateStr];
  }

  // 唯一数据源：今天累计秒数。running 时等于计时器真源的实时总量（已含历史段），
  // 否则用已落账的 moyu-log。日历"今日"格、今日已摸、计时器金额/时长都从这里取，
  // 保证同 tick 数值严格相等，杜绝各 block 各缓一套。
  function todayTotalSeconds() {
    var t = todayStr();
    if (timer && timer.status === 'running') {
      return timer.getSeconds();
    }
    return LogStore.get(t);
  }

  // 一次性数据兜底：非计时状态下，当天 log 需与计时器冻结的真实累计一致，清除脏存量。
  function sanitizePollutedToday() {
    var ds = todayStr();
    var log = LogStore.get(ds);
    var acc = (typeof timer !== 'undefined' && timer && typeof timer.accSeconds === 'number' && isFinite(timer.accSeconds)) ? timer.accSeconds : 0;
    if ((typeof timer === 'undefined' || !timer || timer.status !== 'running') && log > acc + 2) {
      LogStore.setValue(ds, acc);
    }
  }

  // 构建一个日期格子的 HTML。
  function cellHTML(y, m, d, isOther) {
    var dateStr = toDateStr(y, m, d);
    var yiji = getYiji(dateStr);
    var isToday = dateStr === todayStr();
    // 今天用唯一真源（计时中实时总量/否则已落账）；其它日用已落账累计。
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

    // 摸鱼时长与金额：hasLog 显示，否则显示 "—" / 0.00。
    // 所有格子时长统一用 HH:MM:SS（formatClock）：今天每秒联动，历史/其它日静态。
    var rate = effectiveRate(settings);
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

    // 当月 1 号是周几，决定前置空位（月历通常从周日起点）。
    var first = new Date(y, m - 1, 1);
    var lead = first.getDay();
    // 当月天数。
    var lastDay = new Date(y, m, 0).getDate();

    var today = todayStr();
    var todayParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
    var ty = parseInt(todayParts[1], 10);
    var tm = parseInt(todayParts[2], 10);
    var td = parseInt(todayParts[3], 10);

    // 上一月（补前置空格子）
    var prevM = m === 1 ? 12 : m - 1;
    var prevY = m === 1 ? y - 1 : y;
    var prevLastDay = new Date(prevY, prevM, 0).getDate();

    var cells = '';
    // 前置空位填入上月尾部几天（灰显）。
    for (var i = 0; i < lead; i++) {
      cells += cellHTML(prevY, prevM, prevLastDay - (lead - 1) + i, true);
    }
    // 当月天数。
    for (var d = 1; d <= lastDay; d++) {
      var isToday = (y === ty && m === tm && d === td);
      cells += cellHTML(y, m, d, false);
    }
    // 补充尾部到补齐 7 的倍数（下月头几天，灰显）。
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
    // 只在非"今天"月份时，"今天"按钮可用以跳回（已在按钮上处理，这里仅滚动）。
  }

  // ============================================================
  // 设置面板
  // ============================================================
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
    // 时薪可留空；填了则校验。
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
    saveSettings(settings);
    updateEffectiveHint();
    renderMonth();        // 时薪/推算变化会重算每个格子的金额
    renderTimer();        // 实时金额同步
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

  // ============================================================
  // 计时器
  // ============================================================
  var timer = new MoyuTimer();

  // 摸鱼秒数落库采用"增量"模型，避免重复累计：
  // lastLogged 记录本计时段内已被写入当天的秒数基准；
  // settlePending() 把 [lastLogged, getSeconds()] 的增量追加写入当天一次并推进基准。
  // 这样无论运行中的每秒心跳、暂停、重置、继续，都不会把同秒数重复记入。
  var lastLogged = 0;
  // 记录上次落库时的日期，用于检测跨天，自动将昨天的秒数归档到昨天。
  var lastLoggedDate = null;

  // 跨天结算：计时器持续运行跨过午夜时，把截止昨天的秒数归档到昨天，
  // 然后把今天零点之后的秒数作为新的一天的起始值。
  function settleDayRollover() {
    var today = todayStr();
    if (lastLoggedDate === null) {
      lastLoggedDate = today;
      return;
    }
    if (lastLoggedDate === today) {
      return;
    }
    // 跨天了：计算昨天已落账的秒数 + 本段增量中属于昨天的部分
    // lastLogged 是截止到上次落库时的总秒数（已写入 lastLoggedDate）
    // 昨天的 log 已经通过 settlePending 累加到 lastLoggedDate 的 key 中，无需再补
    // 只需把 timer 的 accSeconds 重置为"今天零点后经过的秒数"，lastLogged 归零
    var current = timer.getSeconds();
    // 计算今天零点后经过的秒数：当前总秒数 - lastLogged（昨天及之前的已落账量）
    var todaySeconds = current - lastLogged;
    timer.accSeconds = todaySeconds;
    timer.startAt = Date.now();
    lastLogged = 0;
    lastLoggedDate = today;
    // 把今天的秒数写入今天的 log
    LogStore.setValue(today, todaySeconds);
  }

  function settlePending() {
    // 先检查是否跨天
    settleDayRollover();
    var current = timer.getSeconds();
    var delta = current - lastLogged;
    // 保留很小浮点容差，避免连续写丢。增量至少 0.25s 才记，防止阈值抖动。
    if (delta >= 0.25) {
      LogStore.add(todayStr(), delta);
      lastLogged = current;
      return true;
    }
    return false;
  }
  // 开启全新计时段：以"本次会话内真实开始算起的增量"为唯一真实值（从 0 起算）。
  // 不沿用/不叠加可能被早前多写入者用 max() 顶高的存量 moyu-log 或 timer.accSeconds，
  // 并把当日 log 拉齐到本会话真实起点，消除脏存量对该会话的污染。
  function beginSegment() {
    var base = 0;
    timer.accSeconds = base;
    lastLogged = base;
    lastLoggedDate = todayStr();
    LogStore.setValue(todayStr(), base);
  }

  // 校验时薪相关：现在用 effectiveRate（手填或推算），仍保留 >9999 / 非数字 / ≤0 报错。
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
    // 无手填时薪：需确保推算参数齐全。
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

  function renderTimer() {
    var status = timer.status;
    // 唯一数据源：计时器时钟/金额 与 今日已摸/今日入账 都用今天的同一总量。
    var todaySecs = todayTotalSeconds();
    timeText.textContent = formatClock(todaySecs);
    amountText.textContent = (effectiveRate(settings) * todaySecs / 3600).toFixed(2) + ' 元';
    renderRing(todaySecs);

    if (statusChip) {
      statusChip.textContent = STATUS_TEXT[status] || status;
      statusChip.className = 'status-chip ' + (STATUS_CLASS[status] || 'is-idle');
    }
    if (timerCard) {
      timerCard.setAttribute('data-state', status);
    }

    // 右侧"今天"摘要：与计时器同一来源。
    if (timerToday) {
      timerToday.innerHTML =
        '<div class="today-date">今日 ' + todayStr() + '</div>' +
        '<div class="today-row"><span>今日已摸</span><b>' + formatClock(todaySecs) + '</b></div>' +
        '<div class="today-row"><span>今日入账</span><b>' + (effectiveRate(settings) * todaySecs / 3600).toFixed(2) + ' 元</b></div>';
    }
    buildControls(status);
  }

  function buildControls(status) {
    var html = '';
    if (status === 'idle') {
      html = '<button class="btn btn-start" id="btn-start">开始摸鱼</button>';
    } else if (status === 'running') {
      html = '<button class="btn btn-pause" id="btn-pause">暂停</button>' +
        '<button class="btn btn-reset" id="btn-reset">重置</button>';
    } else if (status === 'paused') {
      html = '<button class="btn btn-start" id="btn-resume">继续摸鱼</button>' +
        '<button class="btn btn-reset" id="btn-reset">重置</button>';
    }
    controlsBox.innerHTML = html;
    bindControls(status);
  }

  function bindControls(status) {
    var start = document.getElementById('btn-start');
    if (start) {
      start.addEventListener('click', function () {
        var err = validateRateForTimer();
        if (err) {
          rateError.textContent = err;
          return;
        }
        rateError.textContent = '';
        // 开启全新计时段：基准从 0 开始，后续增量才落库。
        beginSegment();
        timer.start(effectiveRate(settings));
        renderMonth();
      });
    }
    var pause = document.getElementById('btn-pause');
    if (pause) {
      pause.addEventListener('click', function () {
        // 暂停前先把本段的增量落库（冻结基准到当前秒数）。
        settlePending();
        timer.pause();
        renderMonth();
      });
    }
    var resume = document.getElementById('btn-resume');
    if (resume) {
      resume.addEventListener('click', function () {
        // 继续：基准保持为暂停时的秒数，之后的增量继续入库。
        timer.resume();
        renderMonth();
      });
    }
    var reset = document.getElementById('btn-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        // 先结算本段剩余增量到当天，再清零计时器（保留设置，不清空输入框）。
        settlePending();
        timer.reset();
        beginSegment();
        renderMonth();
      });
    }
  }

  // ============================================================
  // 初始化
  // ============================================================

  // 设置面板交互。
  settingsToggle.addEventListener('click', function () {
    toggleSettings();
  });
  settingsSave.addEventListener('click', function () {
    saveSettingsFromForm();
  });
  rateInput.addEventListener('input', function () {
    // 实时预览等效时薪（不落库，点击保存才持久化）。
    var manual = rateInput.value.trim();
    if (manual !== '') {
      var m = Number(manual);
      if (isFinite(m) && m > 0 && m <= MAX_RATE) {
        effectiveRateEl.textContent = '当前使用手填时薪：' + m.toFixed(1) + ' 元/时（优先于推算）';
        return;
      }
    }
    // 用输入框当前值即时预演推算。
    var sal = Number(salaryInput.value);
    var wd = Number(workdaysInput.value);
    var hd = Number(hoursInput.value);
    if (sal > 0 && wd > 0 && hd > 0) {
      effectiveRateEl.textContent = '等效时薪：月薪' + toCN(sal) + ' ÷ ' + wd + '天 ÷ ' + hd + 'h ≈ ' + (sal / wd / hd).toFixed(1) + ' 元/时';
    } else {
      effectiveRateEl.textContent = '等效时薪：月薪 ÷ 工作天数 ÷ 每天时长';
    }
  });

  // 月历翻页。
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

  // 初次渲染。
  sanitizePollutedToday();
  fillSettingsForm();
  renderMonth();

  // 今日金句（按日期固定）。
  if (fortuneText) {
    fortuneText.textContent = fortuneOf(todayStr());
  }

  // 计时器。
  timer.onChange(renderTimer);   // start/pause 等状态变化都会落库并刷新（renderTimer 会调 buildControls）
  renderTimer();

  // 实时刷新显示 + 运行中的增量实时落库（保证每次页面刷新都有记录，且日历格子实时跳动）。
  setInterval(function () {
    if (timer.status === 'running') {
      settlePending();
      // 每 tick 都重绘月历：让"今日"格子与计时器/今日已摸同 tick 取同一唯一源，秒级严格相等。
      renderMonth();
      renderTimer();
    }
  }, 1000);

  // ============================================================
  // 日期悬浮窗（tooltip）—— 复用共享实现 js/calendar-tooltip.js（与扩展完整页同源）
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
