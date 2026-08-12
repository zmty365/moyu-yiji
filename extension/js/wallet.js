// 摸鱼币钱包：全系统唯一货币出入口，桌宠抚摸与等级升级奖励都走这里。
// 抽离自原 pet-content.js 内联逻辑，底层仍存 chrome.storage.local 的 'pet-coin'，
// 保证老用户余额无缝兼容。可在 content script / popup 两种上下文复用（都能访问 storage.local）。
//
// 关键设计：add() 采用 read-modify-write（基于 storage 最新值累加），而非缓存值覆盖，
// 避免抚摸掉币与升级发币在不同上下文并发时互相覆盖。
(function (global) {
  'use strict';

  var KEY_COIN = 'pet-coin';

  function num(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  // 读取当前余额（异步）。storage 不可用时回调 0。
  function getBalance(cb) {
    try {
      chrome.storage.local.get([KEY_COIN], function (o) {
        cb(num(o && o[KEY_COIN]));
      });
    } catch (e) {
      cb(0);
    }
  }

  // 原子增加余额（delta 可为任意正整数）。基于 storage 最新值累加后回写，
  // 回调返回加币后的最新余额。delta<=0 时不写入，直接回调当前余额。
  function add(delta, cb) {
    delta = num(delta);
    try {
      chrome.storage.local.get([KEY_COIN], function (o) {
        var next = num(o && o[KEY_COIN]) + delta;
        if (delta <= 0) { if (cb) cb(next); return; }
        var set = {}; set[KEY_COIN] = next;
        chrome.storage.local.set(set, function () { if (cb) cb(next); });
      });
    } catch (e) {
      if (cb) cb(0);
    }
  }

  global.MoyuWallet = {
    KEY: KEY_COIN,
    getBalance: getBalance,
    add: add
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);