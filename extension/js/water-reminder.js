// 喝水提醒 · 后台核心模块（V2）
//
// 由 js/background.js 通过 importScripts('/js/water-reminder.js') 引入，运行在同一个
// MV3 Service Worker 进程内。使用独立 alarm 名 "water-remind"，与摸鱼计时
// ("moyu-bg-tick") 互不干扰。
//
// 职责：
//   1. 读取用户配置（storage.sync: water-settings / water-whitelist），据此调度周期 alarm。
//   2. alarm 触发时做防打扰决策：静音时段 / 白名单 命中则跳过本次；否则查当前活动标签页，
//      能注入则注入浮层 (content-reminder.js) 并发消息渲染，页面端再做全屏/输入检测；
//      不能注入则用 chrome.notifications 系统通知兜底。
//   3. 处理浮层/通知回传：稍后、关闭、暂停 1 小时、输入延后重试。
//   4. 维护今日统计（提醒/稍后/关闭次数）与「稍后」频次滑窗。
//
// 存储契约（与现有 moyu-* 键并存）：
//   storage.sync  water-settings  -> { enabled, intervalMin, sound, quietEnabled, quietStart, quietEnd }
//   storage.sync  water-whitelist -> string[]（域名，子域名匹配）
//   storage.local water-runtime   -> { mode:'periodic'|'snooze'|'retry'|'pause', nextAt }（辅助 UI，非权威）
//   storage.local water-stats     -> { date:'YYYY-MM-DD', remind, snooze, dismiss }（跨天自动重置）
//   storage.local water-snooze-log-> number[]（最近「稍后」时间戳，15 分钟滑窗）
// 计时权威由 chrome.alarms 承担。
(function () {
  'use strict';

  var ALARM_NAME = 'water-remind';
  var KEY_SETTINGS = 'water-settings';     // storage.sync
  var KEY_WHITELIST = 'water-whitelist';   // storage.sync
  var KEY_RUNTIME = 'water-runtime';       // storage.local
  var KEY_STATS = 'water-stats';           // storage.local
  var KEY_SNOOZE_LOG = 'water-snooze-log'; // storage.local

  var SNOOZE_MIN = 5;                 // 稍后延后分钟数
  var RETRY_MIN = 1;                  // 输入中延后重试分钟数
  var PAUSE_MIN = 60;                 // 暂停 1 小时
  var SNOOZE_WINDOW_MS = 15 * 60000;  // 稍后频次滑窗 15 分钟
  var SNOOZE_THRESHOLD = 3;           // 窗口内达到该次数即提示「暂停 1 小时」
  var PANEL_TEXT = '该喝口水啦 👀';

  var DEFAULTS = {
    enabled: false, intervalMin: 30, sound: true,
    quietEnabled: false, quietStart: '22:00', quietEnd: '08:00'
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // 读取并归一化配置（缺省/非法值回落到默认）。
  function getSettings(cb) {
    chrome.storage.sync.get(KEY_SETTINGS, function (obj) {
      var s = (obj && typeof obj === 'object' && obj[KEY_SETTINGS] && typeof obj[KEY_SETTINGS] === 'object')
        ? obj[KEY_SETTINGS] : {};
      var interval = (typeof s.intervalMin === 'number' && isFinite(s.intervalMin) && s.intervalMin >= 1)
        ? s.intervalMin : DEFAULTS.intervalMin;
      cb({
        enabled: s.enabled === true,
        intervalMin: interval,
        sound: s.sound !== false,
        quietEnabled: s.quietEnabled === true,
        quietStart: /^\d{2}:\d{2}$/.test(s.quietStart) ? s.quietStart : DEFAULTS.quietStart,
        quietEnd: /^\d{2}:\d{2}$/.test(s.quietEnd) ? s.quietEnd : DEFAULTS.quietEnd
      });
    });
  }

  function getWhitelist(cb) {
    chrome.storage.sync.get(KEY_WHITELIST, function (obj) {
      var arr = (obj && Array.isArray(obj[KEY_WHITELIST])) ? obj[KEY_WHITELIST] : [];
      cb(arr.filter(function (d) { return typeof d === 'string' && d.trim() !== ''; }));
    });
  }

  // "HH:MM" -> 当天分钟数。
  function hmToMin(hm) {
    var m = /^(\d{2}):(\d{2})$/.exec(hm);
    if (!m) { return -1; }
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  // 是否处于静音时段（支持跨午夜：如 22:00–08:00）。
  function inQuietHours(s) {
    if (!s.quietEnabled) { return false; }
    var start = hmToMin(s.quietStart);
    var end = hmToMin(s.quietEnd);
    if (start < 0 || end < 0 || start === end) { return false; }
    var now = new Date();
    var cur = now.getHours() * 60 + now.getMinutes();
    if (start < end) {
      return cur >= start && cur < end;          // 同日区间
    }
    return cur >= start || cur < end;            // 跨午夜区间
  }

  // 从 URL 取 host（失败返回空串）。
  function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
  }

  // host 是否命中白名单（精确或子域名匹配：youtube.com 命中 www.youtube.com）。
  function hostInWhitelist(url, list) {
    var host = hostOf(url);
    if (!host || !list || !list.length) { return false; }
    for (var i = 0; i < list.length; i++) {
      var d = String(list[i]).trim().toLowerCase().replace(/^\*?\.?/, '');
      if (!d) { continue; }
      if (host === d || host.slice(-(d.length + 1)) === '.' + d) { return true; }
    }
    return false;
  }

  // ---- 运行态（仅供 popup 展示）----
  function setRuntime(mode, nextAt) {
    var o = {};
    o[KEY_RUNTIME] = { mode: mode, nextAt: nextAt };
    try { chrome.storage.local.set(o, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
  }
  function getRuntime(cb) {
    chrome.storage.local.get(KEY_RUNTIME, function (obj) {
      cb((obj && obj[KEY_RUNTIME]) ? obj[KEY_RUNTIME] : null);
    });
  }

  // ---- 今日统计（跨天自动重置）----
  function bumpStat(kind) {
    chrome.storage.local.get(KEY_STATS, function (obj) {
      var s = (obj && obj[KEY_STATS] && typeof obj[KEY_STATS] === 'object') ? obj[KEY_STATS] : null;
      var today = todayStr();
      if (!s || s.date !== today) {
        s = { date: today, remind: 0, snooze: 0, dismiss: 0 };
      }
      if (kind === 'remind') { s.remind = (s.remind || 0) + 1; }
      else if (kind === 'snooze') { s.snooze = (s.snooze || 0) + 1; }
      else if (kind === 'dismiss') { s.dismiss = (s.dismiss || 0) + 1; }
      var o = {}; o[KEY_STATS] = s;
      try { chrome.storage.local.set(o, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
    });
  }

  // ---- 稍后频次滑窗 ----
  // 记录一次「稍后」，清理 15 分钟外的旧记录，返回窗口内计数。
  function pushSnoozeAndCount(cb) {
    chrome.storage.local.get(KEY_SNOOZE_LOG, function (obj) {
      var now = Date.now();
      var arr = (obj && Array.isArray(obj[KEY_SNOOZE_LOG])) ? obj[KEY_SNOOZE_LOG] : [];
      arr = arr.filter(function (t) { return typeof t === 'number' && (now - t) < SNOOZE_WINDOW_MS; });
      arr.push(now);
      var o = {}; o[KEY_SNOOZE_LOG] = arr;
      try { chrome.storage.local.set(o, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
      if (cb) { cb(arr.length); }
    });
  }
  // 读当前窗口内「稍后」计数（不写入），用于决定是否在面板显示「暂停 1 小时」。
  function readSnoozeCount(cb) {
    chrome.storage.local.get(KEY_SNOOZE_LOG, function (obj) {
      var now = Date.now();
      var arr = (obj && Array.isArray(obj[KEY_SNOOZE_LOG])) ? obj[KEY_SNOOZE_LOG] : [];
      arr = arr.filter(function (t) { return typeof t === 'number' && (now - t) < SNOOZE_WINDOW_MS; });
      cb(arr.length);
    });
  }
  function clearSnoozeLog() {
    try { chrome.storage.local.remove(KEY_SNOOZE_LOG, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
  }

  // ---- 离屏音频（提示音）----
  // Service Worker 无法播放音频，content script 在宿主页播放又受自动播放策略限制；
  // 改用 offscreen document 播放提示音，不需要宿主页用户手势，可稳定发声。
  var creatingOffscreen = null; // 去重：并发创建时复用同一个 Promise
  function ensureOffscreen() {
    if (!chrome.offscreen) { return Promise.reject(new Error('no offscreen api')); }
    return chrome.offscreen.hasDocument().then(function (has) {
      if (has) { return; }
      if (!creatingOffscreen) {
        creatingOffscreen = chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification: '播放喝水提醒提示音'
        }).then(function () { creatingOffscreen = null; })
          .catch(function (e) { creatingOffscreen = null; throw e; });
      }
      return creatingOffscreen;
    });
  }
  // 播放一次提示音（离屏）。失败静默，不影响提醒主流程。
  function playSound() {
    try {
      ensureOffscreen().then(function () {
        chrome.runtime.sendMessage(
          { target: 'offscreen', type: 'water-ding' },
          function () { void chrome.runtime.lastError; }
        );
      }).catch(function () { /* 离屏不可用则静默 */ });
    } catch (e) { /* 忽略 */ }
  }

  // ---- alarm 调度 ----
  function schedulePeriodic(intervalMin) {
    chrome.alarms.clear(ALARM_NAME, function () {
      void chrome.runtime.lastError;
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMin });
      setRuntime('periodic', Date.now() + intervalMin * 60000);
    });
  }
  function scheduleOnce(mode, delayMin) {
    chrome.alarms.clear(ALARM_NAME, function () {
      void chrome.runtime.lastError;
      chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMin });
      setRuntime(mode, Date.now() + delayMin * 60000);
    });
  }
  function stopAll() {
    chrome.alarms.clear(ALARM_NAME, function () { void chrome.runtime.lastError; });
    try { chrome.storage.local.remove(KEY_RUNTIME, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
  }

  // 依据配置对齐 alarm：启用→建周期；禁用→清空。用于安装/启动/配置变更时调和。
  function applySettings() {
    getSettings(function (s) {
      if (s.enabled) { schedulePeriodic(s.intervalMin); }
      else { stopAll(); }
    });
  }

  // 注入可行性判定（架构 §6）：仅 http/https 普通页可注入浮层。
  function canInject(url) {
    if (!url || typeof url !== 'string') { return false; }
    if (!/^https?:\/\//i.test(url)) { return false; }
    if (/^https?:\/\/chrome\.google\.com\/webstore/i.test(url)) { return false; }
    if (/^https?:\/\/chromewebstore\.google\.com/i.test(url)) { return false; }
    if (/\.pdf(\?|#|$)/i.test(url)) { return false; }
    return true;
  }

  // 系统通知兜底：无法注入浮层时降级，按钮逻辑与面板一致（0=稍后，1=关闭）。
  function fallbackNotify(sound) {
    var id = 'water-remind-' + Date.now();
    try {
      chrome.notifications.create(id, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: PANEL_TEXT,
        message: '久坐记得喝口水、起来活动一下～',
        buttons: [{ title: '稍后（5 分钟）' }, { title: '关闭' }],
        requireInteraction: true,
        silent: sound !== true
      }, function () {
        if (!chrome.runtime.lastError) { bumpStat('remind'); } // 通知成功即计一次提醒
      });
    } catch (e) { /* 通知 API 不可用时静默 */ }
  }

  // alarm 触发的核心决策。
  function fireReminder() {
    getSettings(function (s) {
      if (!s.enabled) { return; }
      if (inQuietHours(s)) { return; }          // 静音时段：跳过本次，周期继续
      getWhitelist(function (list) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
          var tab = tabs && tabs[0];
          if (tab && hostInWhitelist(tab.url, list)) { return; } // 白名单：跳过本次
          if (tab && tab.id != null && canInject(tab.url)) {
            readSnoozeCount(function (cnt) {
              var showPauseHour = cnt >= SNOOZE_THRESHOLD;
              chrome.scripting.executeScript(
                { target: { tabId: tab.id }, files: ['js/content-reminder.js'] },
                function () {
                  if (chrome.runtime.lastError) { fallbackNotify(s.sound); return; }
                  chrome.tabs.sendMessage(
                    tab.id,
                    { type: 'water-show', text: PANEL_TEXT, sound: s.sound, showPauseHour: showPauseHour },
                    function () { void chrome.runtime.lastError; }
                  );
                  // 提醒计数在收到 content 回传 water-shown 时才 +1（真正渲染成功才算）。
                }
              );
            });
          } else {
            fallbackNotify(s.sound);
          }
        });
      });
    });
  }

  // 「稍后」：记录频次、延后 5 分钟单次；再点稍后再次重置 5 分钟。
  function onSnooze() {
    bumpStat('snooze');
    pushSnoozeAndCount(function () {
      scheduleOnce('snooze', SNOOZE_MIN);
    });
  }

  // 「关闭」：结束本次，清稍后频次，按原间隔重建周期。
  function onDismiss() {
    bumpStat('dismiss');
    clearSnoozeLog();
    getSettings(function (s) {
      if (s.enabled) { schedulePeriodic(s.intervalMin); } else { stopAll(); }
    });
  }

  // 「暂停 1 小时」：清稍后频次，建 60 分钟单次 pause alarm；到点恢复周期。
  function onPauseHour() {
    clearSnoozeLog();
    scheduleOnce('pause', PAUSE_MIN);
  }

  // 页面端「正在输入」延后：1 分钟后重试触发。
  function onDefer(reason) {
    if (reason === 'input') {
      scheduleOnce('retry', RETRY_MIN);
    }
  }

  // ---- 事件注册（与 background.js 的同类监听并存）----

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (!alarm || alarm.name !== ALARM_NAME) { return; }
    getRuntime(function (rt) {
      if (rt && rt.mode === 'pause') {
        // 暂停结束：恢复周期，本次不弹。
        getSettings(function (s) {
          if (s.enabled) { schedulePeriodic(s.intervalMin); } else { stopAll(); }
        });
        return;
      }
      // periodic / snooze / retry 都触发一次提醒决策。
      fireReminder();
    });
  });

  // 浮层/内容脚本回传。
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || typeof msg !== 'object') { return; }
    if (msg.target === 'offscreen') { return; } // 发给离屏页的音频消息，后台不处理
    if (msg.type === 'water-snooze') { onSnooze(); }
    else if (msg.type === 'water-dismiss') { onDismiss(); }
    else if (msg.type === 'water-pause-1h') { onPauseHour(); }
    else if (msg.type === 'water-defer') { onDefer(msg.reason); }
    else if (msg.type === 'water-shown') {
      bumpStat('remind');
      if (msg.sound === true) { playSound(); } // 浮层渲染成功且开启提示音 → 离屏播放
    }
  });

  // 系统通知兜底按钮：0=稍后，1=关闭。
  chrome.notifications.onButtonClicked.addListener(function (notifId, btnIdx) {
    if (typeof notifId !== 'string' || notifId.indexOf('water-remind-') !== 0) { return; }
    chrome.notifications.clear(notifId, function () { void chrome.runtime.lastError; });
    if (btnIdx === 0) { onSnooze(); } else { onDismiss(); }
  });
  chrome.notifications.onClicked.addListener(function (notifId) {
    if (typeof notifId === 'string' && notifId.indexOf('water-remind-') === 0) {
      chrome.notifications.clear(notifId, function () { void chrome.runtime.lastError; });
    }
  });

  // 配置变更（popup 修改间隔/开关/静音时段后立即生效并重排）。白名单变更不需重排 alarm。
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes && changes[KEY_SETTINGS]) {
      applySettings();
    }
  });

  chrome.runtime.onInstalled.addListener(applySettings);
  chrome.runtime.onStartup.addListener(applySettings);

  self.__waterReminder = {
    fireReminder: fireReminder,
    applySettings: applySettings,
    inQuietHours: inQuietHours,
    hostInWhitelist: hostInWhitelist,
    ALARM_NAME: ALARM_NAME
  };
})();
