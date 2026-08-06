// 喝水提醒 · 后台核心模块（V1）
//
// 由 js/background.js 通过 importScripts('js/water-reminder.js') 引入，运行在同一个
// MV3 Service Worker 进程内。使用独立的 alarm 名称 "water-remind"，与摸鱼计时
// ("moyu-bg-tick") 互不干扰。
//
// 职责：
//   1. 读取用户配置（storage.sync: water-settings），据此调度周期 alarm。
//   2. alarm 触发时查询当前活动标签页：能注入则用 chrome.scripting 注入浮层
//      (content-reminder.js) 并发消息渲染；否则用 chrome.notifications 系统通知兜底。
//   3. 处理浮层/通知回传的「稍后」「关闭」，按 PRD 4.4 重排 alarm。
//
// 存储契约（与现有 moyu-* 键并存）：
//   storage.sync  water-settings -> { enabled, intervalMin, sound }（用户配置，可跨设备）
//   storage.local water-runtime  -> { mode:'periodic'|'snooze', nextAt }（仅辅助 UI 显示，非计时权威）
// 计时权威由 chrome.alarms 承担。
(function () {
  'use strict';

  var ALARM_NAME = 'water-remind';
  var KEY_SETTINGS = 'water-settings'; // storage.sync
  var KEY_RUNTIME = 'water-runtime';   // storage.local
  var SNOOZE_MIN = 5;                  // 稍后延后分钟数
  var PANEL_TEXT = '该喝口水啦 👀';

  var DEFAULTS = { enabled: false, intervalMin: 30, sound: true };

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
        sound: s.sound !== false // 缺省视为开启
      });
    });
  }

  // 写运行态（仅供 popup 展示"下次提醒时间"，非计时权威）。
  function setRuntime(mode, nextAt) {
    var o = {};
    o[KEY_RUNTIME] = { mode: mode, nextAt: nextAt };
    try { chrome.storage.local.set(o, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
  }

  // 建立周期 alarm（启用 / 修改间隔 / 关闭本周期后重建都走这里）。
  function schedulePeriodic(intervalMin) {
    chrome.alarms.clear(ALARM_NAME, function () {
      void chrome.runtime.lastError;
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMin });
      setRuntime('periodic', Date.now() + intervalMin * 60000);
    });
  }

  // 建立单次 snooze alarm（延后 5 分钟，不影响原周期）。
  function scheduleSnooze() {
    chrome.alarms.clear(ALARM_NAME, function () {
      void chrome.runtime.lastError;
      chrome.alarms.create(ALARM_NAME, { delayInMinutes: SNOOZE_MIN });
      setRuntime('snooze', Date.now() + SNOOZE_MIN * 60000);
    });
  }

  // 停止所有提醒（禁用时）。
  function stopAll() {
    chrome.alarms.clear(ALARM_NAME, function () { void chrome.runtime.lastError; });
    try { chrome.storage.local.remove(KEY_RUNTIME, function () { void chrome.runtime.lastError; }); } catch (e) { /* 忽略 */ }
  }

  // 依据配置对齐 alarm：启用→建周期；禁用→清空。用于安装/启动/配置变更时调和。
  function applySettings() {
    getSettings(function (s) {
      if (s.enabled) {
        schedulePeriodic(s.intervalMin);
      } else {
        stopAll();
      }
    });
  }

  // 注入可行性判定（见架构文档 §6）：仅 http/https 普通页可注入浮层，
  // chrome://、edge://、about:、网上应用店、PDF 等一律走通知兜底。
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
        silent: sound !== true // 提示音关闭时静音（系统通知声由 OS 决定，此处尽力而为）
      }, function () { void chrome.runtime.lastError; });
    } catch (e) { /* 通知 API 不可用时静默 */ }
  }

  // alarm 触发：查当前活动标签页 → 能注入渲染浮层，否则通知兜底。
  function fireReminder() {
    getSettings(function (s) {
      if (!s.enabled) { return; } // 触发瞬间被禁用则忽略
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        if (tab && tab.id != null && canInject(tab.url)) {
          chrome.scripting.executeScript(
            { target: { tabId: tab.id }, files: ['js/content-reminder.js'] },
            function () {
              if (chrome.runtime.lastError) {
                // 注入抛错（权限/特殊页）→ 兜底
                fallbackNotify(s.sound);
                return;
              }
              // 注入成功，通知 content script 渲染浮层
              chrome.tabs.sendMessage(
                tab.id,
                { type: 'water-show', text: PANEL_TEXT, sound: s.sound },
                function () { void chrome.runtime.lastError; }
              );
            }
          );
        } else {
          fallbackNotify(s.sound);
        }
      });
    });
  }

  // 「稍后」：延后 5 分钟单次；再点稍后再次重置 5 分钟（覆盖式 create 天然支持）。
  function onSnooze() {
    scheduleSnooze();
  }

  // 「关闭」：结束本次，按原间隔重建周期 alarm。
  function onDismiss() {
    getSettings(function (s) {
      // 若期间被禁用则不再重建
      if (s.enabled) { schedulePeriodic(s.intervalMin); }
      else { stopAll(); }
    });
  }

  // ---- 事件注册（与 background.js 的同类监听并存，MV3 允许多个 addListener）----

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm && alarm.name === ALARM_NAME) {
      fireReminder();
    }
  });

  // 浮层按钮回传。
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || typeof msg !== 'object') { return; }
    if (msg.type === 'water-snooze') { onSnooze(); }
    else if (msg.type === 'water-dismiss') { onDismiss(); }
  });

  // 系统通知兜底按钮：btnIdx 0=稍后，1=关闭。
  chrome.notifications.onButtonClicked.addListener(function (notifId, btnIdx) {
    if (typeof notifId !== 'string' || notifId.indexOf('water-remind-') !== 0) { return; }
    chrome.notifications.clear(notifId, function () { void chrome.runtime.lastError; });
    if (btnIdx === 0) { onSnooze(); } else { onDismiss(); }
  });

  // 点通知主体只清除，不改变周期。
  chrome.notifications.onClicked.addListener(function (notifId) {
    if (typeof notifId === 'string' && notifId.indexOf('water-remind-') === 0) {
      chrome.notifications.clear(notifId, function () { void chrome.runtime.lastError; });
    }
  });

  // 配置变更（popup 修改后立即生效并重置计时）。
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes && changes[KEY_SETTINGS]) {
      applySettings();
    }
  });

  // 安装 / 浏览器启动时按配置调和 alarm。
  chrome.runtime.onInstalled.addListener(applySettings);
  chrome.runtime.onStartup.addListener(applySettings);

  // 暴露给调试用。
  self.__waterReminder = {
    fireReminder: fireReminder,
    applySettings: applySettings,
    ALARM_NAME: ALARM_NAME,
    canInject: canInject
  };
})();
