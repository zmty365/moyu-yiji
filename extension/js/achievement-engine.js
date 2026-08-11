// 成就判断引擎：只处理统计快照、进度与解锁判断，不直接读写存储或操作 DOM。
(function (global) {
  'use strict';

  var WATER_CATEGORY = 'water_count';
  var DAILY_BETWEEN_DEFERRED = 'deferred';

  function num(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function normalizeUnlocked(state) {
    if (!state || typeof state !== 'object') { return {}; }
    return state.unlocked && typeof state.unlocked === 'object' ? state.unlocked : {};
  }

  function filterList(list, options) {
    var includeWater = options && options.includeWater === true;
    return (list || []).filter(function (item) {
      return includeWater || item.category !== WATER_CATEGORY;
    });
  }

  function snapshotFromLogs(logs, water) {
    var total = 0;
    var days = 0;
    var maxDaily = 0;
    var previousDaily = [];
    var today = todayStr();
    logs = logs || {};
    Object.keys(logs).forEach(function (dateStr) {
      var seconds = num(logs[dateStr]);
      if (seconds <= 0) { return; }
      total += seconds;
      days += 1;
      if (seconds > maxDaily) { maxDaily = seconds; }
      if (dateStr < today) { previousDaily.push(seconds); }
    });
    water = water || {};
    return {
      totalMoyuSeconds: total,
      moyuDays: days,
      maxDailyMoyuSeconds: maxDaily,
      previousDailyMoyuSeconds: previousDaily,
      dailyWaterCount: num(water.dailyDismiss),
      totalWaterCount: num(water.totalDismiss)
    };
  }

  function result(current, target) {
    target = num(target);
    current = num(current);
    return {
      matched: target > 0 && current >= target,
      current: current,
      target: target,
      ratio: target > 0 ? Math.min(1, current / target) : 0
    };
  }

  function evaluateOne(item, snapshot, options) {
    var type = item.conditionType;
    if (type === 'total_moyu_seconds_at_least') {
      return result(snapshot.totalMoyuSeconds, item.threshold);
    }
    if (type === 'moyu_days_at_least') {
      return result(snapshot.moyuDays, item.threshold);
    }
    if (type === 'daily_moyu_seconds_at_least') {
      return result(snapshot.maxDailyMoyuSeconds, item.threshold);
    }
    if (type === 'daily_water_count_at_least') {
      return result(snapshot.dailyWaterCount, item.threshold);
    }
    if (type === 'total_water_count_at_least') {
      return result(snapshot.totalWaterCount, item.threshold);
    }
    if (type === 'daily_moyu_seconds_between') {
      var values = options && options.dailyBetweenMode === DAILY_BETWEEN_DEFERRED
        ? snapshot.previousDailyMoyuSeconds || []
        : [snapshot.maxDailyMoyuSeconds];
      var min = num(item.minThreshold);
      var max = num(item.maxThreshold);
      var matched = values.some(function (v) { return v >= min && v <= max; });
      var best = values.reduce(function (acc, v) { return Math.max(acc, v); }, 0);
      return { matched: matched, current: best, target: max, ratio: max > 0 ? Math.min(1, best / max) : 0 };
    }
    return { matched: false, current: 0, target: num(item.threshold), ratio: 0 };
  }

  function evaluate(list, state, snapshot, options) {
    var unlocked = normalizeUnlocked(state);
    return filterList(list, options).map(function (item) {
      var progress = evaluateOne(item, snapshot || {}, options || {});
      return {
        achievement: item,
        unlocked: !!unlocked[item.id],
        unlockedAt: unlocked[item.id] && unlocked[item.id].unlockedAt,
        progress: progress
      };
    });
  }

  function unlockNew(list, state, snapshot, options) {
    var unlocked = normalizeUnlocked(state);
    var next = { unlocked: {} };
    Object.keys(unlocked).forEach(function (id) { next.unlocked[id] = unlocked[id]; });
    var now = new Date().toISOString();
    var newly = [];
    evaluate(list, state, snapshot, options).forEach(function (entry) {
      if (!entry.unlocked && entry.progress.matched) {
        next.unlocked[entry.achievement.id] = { unlockedAt: now };
        newly.push(entry.achievement);
      }
    });
    return { state: next, newlyUnlocked: newly };
  }

  global.MoyuAchievementEngine = {
    snapshotFromLogs: snapshotFromLogs,
    evaluate: evaluate,
    unlockNew: unlockNew,
    filterList: filterList
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
