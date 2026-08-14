// 成就判断引擎：只处理统计快照、进度与解锁判断，不直接读写存储或操作 DOM。
(function (global) {
  'use strict';

  var WATER_CATEGORY = 'water_count';
  var DAILY_BETWEEN_DEFERRED = 'deferred';
  var DAY_MS = 24 * 60 * 60 * 1000;

  function num(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toDateStr(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseDate(dateStr) {
    return new Date(dateStr + 'T00:00:00');
  }

  function todayStr() { return toDateStr(new Date()); }

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

  function getBuiltinLegalDay(dateStr) {
    if (global.MoyuHolidayData && typeof global.MoyuHolidayData.get === 'function') {
      return global.MoyuHolidayData.get(dateStr);
    }
    return null;
  }

  function isLegalWorkday(dateStr) {
    var builtin = getBuiltinLegalDay(dateStr);
    if (builtin && builtin.type) { return builtin.type === 'workday'; }
    var day = parseDate(dateStr).getDay();
    return day !== 0 && day !== 6;
  }

  function monthKey(dateStr) { return dateStr.slice(0, 7); }

  function addDays(dateStr, days) {
    var date = parseDate(dateStr);
    date.setDate(date.getDate() + days);
    return toDateStr(date);
  }

  function uniqueSortedDates(logs) {
    var dates = [];
    Object.keys(logs || {}).forEach(function (dateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && num(logs[dateStr]) > 0) {
        dates.push(dateStr);
      }
    });
    dates.sort();
    return dates;
  }

  function maxConsecutiveDays(dates) {
    var best = 0;
    var current = 0;
    var prev = null;
    dates.forEach(function (dateStr) {
      if (prev && addDays(prev, 1) === dateStr) {
        current += 1;
      } else {
        current = 1;
      }
      if (current > best) { best = current; }
      prev = dateStr;
    });
    return best;
  }

  function isoWeekKey(dateStr) {
    var date = parseDate(dateStr);
    var day = date.getDay() || 7;
    date.setDate(date.getDate() + 4 - day);
    var yearStart = new Date(date.getFullYear(), 0, 1);
    var week = Math.ceil((((date - yearStart) / DAY_MS) + 1) / 7);
    return date.getFullYear() + '-W' + pad(week);
  }

  function hasWeekdaySpan(dates) {
    var weeks = {};
    dates.forEach(function (dateStr) {
      var day = parseDate(dateStr).getDay();
      if (day < 1 || day > 5) { return; }
      var key = isoWeekKey(dateStr);
      weeks[key] = weeks[key] || {};
      weeks[key][day] = true;
    });
    return Object.keys(weeks).some(function (key) {
      return weeks[key][1] && weeks[key][2] && weeks[key][3] && weeks[key][4] && weeks[key][5];
    });
  }

  function monthGroups(dates) {
    var groups = {};
    dates.forEach(function (dateStr) {
      var key = monthKey(dateStr);
      groups[key] = groups[key] || {};
      groups[key][dateStr] = true;
    });
    return groups;
  }

  function hasFullCalendarMonth(dates) {
    var groups = monthGroups(dates);
    return Object.keys(groups).some(function (key) {
      var year = Number(key.slice(0, 4));
      var month = Number(key.slice(5, 7));
      var lastDay = new Date(year, month, 0).getDate();
      for (var day = 1; day <= lastDay; day++) {
        if (!groups[key][year + '-' + pad(month) + '-' + pad(day)]) { return false; }
      }
      return true;
    });
  }

  function hasFullLegalWorkdayMonth(dates) {
    var groups = monthGroups(dates);
    return Object.keys(groups).some(function (key) {
      var year = Number(key.slice(0, 4));
      var month = Number(key.slice(5, 7));
      var lastDay = new Date(year, month, 0).getDate();
      var workdayCount = 0;
      for (var day = 1; day <= lastDay; day++) {
        var dateStr = year + '-' + pad(month) + '-' + pad(day);
        if (!isLegalWorkday(dateStr)) { continue; }
        workdayCount += 1;
        if (!groups[key][dateStr]) { return false; }
      }
      return workdayCount > 0;
    });
  }

  function snapshotFromLogs(logs, water, extra) {
    var total = 0;
    var maxDaily = 0;
    var previousDaily = [];
    var dailyByDate = {};
    var today = todayStr();
    logs = logs || {};
    Object.keys(logs).forEach(function (dateStr) {
      var seconds = num(logs[dateStr]);
      if (seconds <= 0) { return; }
      total += seconds;
      dailyByDate[dateStr] = seconds;
      if (seconds > maxDaily) { maxDaily = seconds; }
      if (dateStr < today) { previousDaily.push(seconds); }
    });
    var dates = uniqueSortedDates(logs);
    water = water || {};
    extra = extra || {};
    return {
      totalMoyuSeconds: total,
      moyuDays: dates.length,
      moyuDateList: dates,
      dailyMoyuSecondsByDate: dailyByDate,
      maxDailyMoyuSeconds: maxDaily,
      previousDailyMoyuSeconds: previousDaily,
      dailyWaterCount: num(water.dailyDismiss),
      totalWaterCount: num(water.totalDismiss),
      mainViewOpenCount: num(extra.mainViewOpenCount),
      maxConsecutiveMoyuDays: maxConsecutiveDays(dates),
      hasWeekdaySpanMoyuRecord: hasWeekdaySpan(dates),
      hasFullLegalWorkdayMonth: hasFullLegalWorkdayMonth(dates),
      hasFullCalendarMonth: hasFullCalendarMonth(dates)
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

  function booleanResult(matched) {
    return { matched: !!matched, current: matched ? 1 : 0, target: 1, ratio: matched ? 1 : 0 };
  }

  function evaluateOne(item, snapshot, options) {
    var type = item.conditionType;
    snapshot = snapshot || {};
    if (type === 'main_view_opened_at_least') {
      return result(snapshot.mainViewOpenCount, item.threshold);
    }
    if (type === 'total_moyu_seconds_at_least') {
      return result(snapshot.totalMoyuSeconds, item.threshold);
    }
    if (type === 'moyu_days_at_least') {
      return result(snapshot.moyuDays, item.threshold);
    }
    if (type === 'consecutive_moyu_days_at_least') {
      return result(snapshot.maxConsecutiveMoyuDays, item.threshold);
    }
    if (type === 'weekday_span_moyu_recorded') {
      return booleanResult(snapshot.hasWeekdaySpanMoyuRecord);
    }
    if (type === 'month_legal_workdays_all_recorded') {
      return booleanResult(snapshot.hasFullLegalWorkdayMonth);
    }
    if (type === 'month_all_days_recorded') {
      return booleanResult(snapshot.hasFullCalendarMonth);
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
