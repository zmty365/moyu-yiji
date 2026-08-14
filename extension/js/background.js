// 后台计时 Service Worker（Manifest V3）
//
// 职责：在"浏览器打开但扩展 UI（popup/full）都关闭"时，仍持续把 running 状态的时间
// 按时间戳差分推进到当天的 moyu-log，并维护 lastLogged/alive 水印，实现"后台持续计时"。
//
// 与页面（js/popup.js、js/mini.js）共享同一套 chrome.storage.local 契约：
//   moyu-log:YYYY-MM-DD   -> 当日摸鱼累计秒数（单调递增：任何写入方都写 max(旧值, acc)）
//   moyu-timer-state      -> { status, hourlyRate, accSeconds, startAt, lastLogged, alive }
//
// 幂等设计：累计秒数 acc 是"单调递增的总量"，因此落库一律采用 `max` 合并——
// 无论页面还是 SW 的写入顺序如何，都不会重复记账，也不会倒退。
//
// "关浏览器自动暂停"：SW 随浏览器关闭被终止，alive 水印停止更新。下次任一 UI 初始化若读到
// running 且 alive 距今过久（STALE_ALIVE_MS），即视为浏览器期间被关闭->仅把已提交的
// accSeconds 留账、剩余未提交的时间丢弃，并置为 paused（自动暂停）。
// 引入喝水提醒模块：其全部逻辑（alarm 调度、注入/兜底、按钮消息处理）都在 water-reminder.js，
// 使用独立 alarm 名 "water-remind"，与下面的摸鱼计时逻辑解耦、互不干扰。
// 注意：importScripts 的相对路径基于 SW 脚本自身位置（/js/background.js），
// 用相对扩展根的绝对路径 '/js/water-reminder.js' 才能正确解析。
try {
  importScripts('/js/holiday-data.js', '/js/achievements.js', '/js/achievement-engine.js');
  importScripts('/js/water-reminder.js');
} catch (e) {
  // 提醒模块加载失败不影响摸鱼计时核心，但需暴露到控制台便于排查。
  console.error('[moyu] 喝水提醒模块加载失败:', e);
}

(function () {
  'use strict';

  var KEY_PREFIX_LOG = 'moyu-log:';
  var KEY_TIMER = 'moyu-timer-state';
  var KEY_ACHIEVEMENTS = 'moyu-achievements';
  var KEY_ACHIEVEMENT_STATS = 'moyu-achievement-stats';
  var KEY_WATER_STATS = 'water-stats';
  var KEY_WATER_TOTAL = 'water-total-dismiss';

  // running 状态判定为"浏览器仍在"的阈值：alive 距 now 超过该值即认为 SW 已随浏览器关闭。
  var STALE_ALIVE_MS = 5 * 60 * 1000; // 5 分钟（远大于 alarm 周期 1 分钟）
  var ALARM_NAME = 'moyu-bg-tick';
  var ALARM_PERIOD_MIN = 1;

  function pad(v) { return String(v).padStart(2, '0'); }
  function toDateStr(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function todayStr() {
    var t = new Date();
    return toDateStr(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  // 从存储读取当前计时上下文（含 alive 水印）。
  function readTimerState(cb) {
    chrome.storage.local.get(KEY_TIMER, function (obj) {
      var t = (obj && typeof obj === 'object' && obj[KEY_TIMER]) ? obj[KEY_TIMER] : null;
      cb(t);
    });
  }

  // 把"当天累计秒数"以 max 单调合并的方式落库，保证任何并发写入方幂等。
  function commitLog(dateStr, acc, cb) {
    var key = KEY_PREFIX_LOG + dateStr;
    chrome.storage.local.get(key, function (obj) {
      var prev = (obj && typeof obj === 'object' && typeof obj[key] === 'number' && isFinite(obj[key])) ? obj[key] : 0;
      var next = Math.max(prev, acc);
      var o = {};
      o[key] = next;
      chrome.storage.local.set(o, function () {
        if (cb) { cb(next); }
      });
    });
  }

  // 后台推进一次：若处于 running，把"已确认累计 + 距上次仍在计时打点(alive)的残余"写入当天 log 并刷新水印。
  // 权威累计基准用 alive（而非 startAt）：alive 是最近一次确认"仍在计时"的打点，
  // 残余 = now - alive 被 SW 周期(≤1min)/alive 过期阈值限制，不会因旧的 startAt 把暂停/关闭后的时段顶高。
  function bgTick() {
    readTimerState(function (t) {
      if (!t || t.status !== 'running' || !(typeof t.startAt === 'number')) {
        return;
      }
      if (typeof t.accSeconds !== 'number' || !isFinite(t.accSeconds)) { t.accSeconds = 0; }
      var now = Date.now();
      var today = todayStr();
      // 跨天检测：t.logDate 记录当前 accSeconds 归属的日期。若与今天不同，说明计时跨过午夜：
      // 先把截止此刻的总量归档到昨天，再把 accSeconds 归零、alive 重置到现在，让今天从 0 重算。
      var logDate = (typeof t.logDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.logDate)) ? t.logDate : today;
      if (logDate !== today) {
        var yBase = Math.max(0, t.accSeconds);
        var yAlive = (typeof t.alive === 'number' && isFinite(t.alive)) ? t.alive : 0;
        var yAcc = yBase;
        if (yAlive > 0 && (now - yAlive) < STALE_ALIVE_MS) {
          yAcc = yBase + Math.max(0, (now - yAlive) / 1000);
        }
        commitLog(logDate, yAcc, function () {
          var reset = {
            status: 'running',
            hourlyRate: (typeof t.hourlyRate === 'number' && isFinite(t.hourlyRate)) ? t.hourlyRate : 0,
            accSeconds: 0,
            startAt: now,
            lastLogged: 0,
            alive: now,
            logDate: today
          };
          var ro = {};
          ro[KEY_TIMER] = reset;
          chrome.storage.local.set(ro, function () {});
        });
        return;
      }
      var base = Math.max(0, t.accSeconds);
      var alive = (typeof t.alive === 'number' && isFinite(t.alive)) ? t.alive : 0;
      var acc = base;
      if (alive > 0 && (now - alive) < STALE_ALIVE_MS) {
        // 仅在 alive 仍新鲜（确认还在、浏览器未关）时补残余，且残余被 alive 窗口封顶。
        acc = base + Math.max(0, (now - alive) / 1000);
      }
      // 幂等落账：写 max(旧值, acc)。
      commitLog(today, acc, function () {
        // 刷新水位：accSeconds = lastLogged = acc，alive = now。startAt 仅为"实时时钟起点"参考，
        // 存储中保留原值以便 UI 判 running；补不补 accounting 以 acc/alive 为准。
        var next = {
          status: 'running',
          hourlyRate: (typeof t.hourlyRate === 'number' && isFinite(t.hourlyRate)) ? t.hourlyRate : 0,
          accSeconds: acc,
          startAt: t.startAt,
          lastLogged: acc,
          alive: now,
          logDate: today
        };
        var o = {};
        o[KEY_TIMER] = next;
        chrome.storage.local.set(o, function () {});
      });
    });
  }

  function createAlarm() {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
  }

  function readAchievementInputs(cb) {
    chrome.storage.local.get(null, function (obj) {
      obj = obj || {};
      var logs = {};
      Object.keys(obj).forEach(function (key) {
        if (key.indexOf(KEY_PREFIX_LOG) === 0) {
          logs[key.slice(KEY_PREFIX_LOG.length)] = obj[key];
        }
      });
      var stats = obj[KEY_WATER_STATS] && typeof obj[KEY_WATER_STATS] === 'object' ? obj[KEY_WATER_STATS] : null;
      cb(obj[KEY_ACHIEVEMENTS] || { unlocked: {} }, logs, {
        dailyDismiss: stats && stats.date === todayStr() ? stats.dismiss : 0,
        totalDismiss: obj[KEY_WATER_TOTAL]
      }, {
        mainViewOpenCount: obj[KEY_ACHIEVEMENT_STATS] && obj[KEY_ACHIEVEMENT_STATS].mainViewOpenCount
      });
    });
  }

  function notifyAchievement(item) {
    findInjectableTab(function (tab) {
      if (!tab) { fallbackAchievementNotify(item); return; }
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['js/content-reminder.js'] },
        function () {
          if (!chrome.runtime.lastError) {
            chrome.tabs.sendMessage(tab.id, { type: 'achievement-show', achievement: item }, function () { void chrome.runtime.lastError; });
            return;
          }
          fallbackAchievementNotify(item);
        }
      );
    });
  }

  function canInjectAchievement(url) {
    return typeof url === 'string' && (/^https?:/i.test(url) || /^file:/i.test(url));
  }

  function firstInjectable(tabs) {
    tabs = Array.isArray(tabs) ? tabs : [];
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i] && tabs[i].id != null && canInjectAchievement(tabs[i].url || '')) {
        return tabs[i];
      }
    }
    return null;
  }

  function findInjectableTab(cb) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
      var tab = firstInjectable(tabs);
      if (tab) { cb(tab); return; }
      chrome.tabs.query({ active: true, currentWindow: true }, function (currentTabs) {
        tab = firstInjectable(currentTabs);
        if (tab) { cb(tab); return; }
        chrome.tabs.query({ active: true }, function (activeTabs) {
          cb(firstInjectable(activeTabs));
        });
      });
    });
  }

  function fallbackAchievementNotify(item) {
    try {
      chrome.notifications.create('moyu-achievement-' + item.id + '-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '解锁成就：' + item.title,
        message: item.flavorText || item.description,
        priority: 1
      }, function () { void chrome.runtime.lastError; });
    } catch (e) { /* ignore */ }
  }

  function checkAchievements(reason, cb) {
    if (!self.MoyuAchievements || !self.MoyuAchievementEngine) { if (cb) { cb([]); } return; }
    readAchievementInputs(function (state, logs, water, extra) {
      var snapshot = MoyuAchievementEngine.snapshotFromLogs(logs, water, extra);
      var result = MoyuAchievementEngine.unlockNew(MoyuAchievements.list, state, snapshot, {
        includeWater: true,
        dailyBetweenMode: 'deferred'
      });
      if (!result.newlyUnlocked.length) { if (cb) { cb([]); } return; }
      var o = {}; o[KEY_ACHIEVEMENTS] = result.state;
      chrome.storage.local.set(o, function () {
        result.newlyUnlocked.forEach(notifyAchievement);
        if (cb) { cb(result.newlyUnlocked); }
      });
    });
  }

  self.MoyuCheckAchievements = checkAchievements;

  chrome.runtime.onInstalled.addListener(createAlarm);
  chrome.runtime.onStartup.addListener(createAlarm);
  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm && alarm.name === ALARM_NAME) {
      bgTick();
    }
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg !== 'object' || msg.type !== 'achievement-check') { return; }
    checkAchievements(msg.reason || 'manual', function (items) {
      sendResponse({
        ok: true,
        unlocked: items.map(function (item) {
          return { id: item.id, title: item.title, description: item.description, flavorText: item.flavorText, icon: item.icon };
        })
      });
    });
    return true;
  });

  // 浏览器启动时也趁机推进一次（onStartup 后 SW 短暂存活，可立即补账）。
  chrome.runtime.onStartup.addListener(function () {
    // onStartup 与 createAlarm 同处注册；这里再主动 tick 一次，避免等首个 alarm。
    setTimeout(bgTick, 100);
  });

  // 暴露给测试/调试用。
  self.__bgTick = bgTick;
  self.__bgConstants = { STALE_ALIVE_MS: STALE_ALIVE_MS, ALARM_NAME: ALARM_NAME };
})();
