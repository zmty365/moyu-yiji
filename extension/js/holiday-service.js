// 节假日服务：法定工作日用于薪资/成就；用户自定义仅用于月历展示。
(function (global) {
  'use strict';

  var KEY_OVERRIDES = 'holiday-overrides';

  var THEMES = {
    overtime: { label: '加班', type: 'workday', badge: '加班' },
    makeUpWork: { label: '补班', type: 'workday', badge: '补班' },
    annualLeave: { label: '年假', type: 'holiday', badge: '年假' },
    personalLeave: { label: '请假', type: 'holiday', badge: '请假' },
    companyHoliday: { label: '公司假', type: 'holiday', badge: '公司假' },
    rest: { label: '休息', type: 'holiday', badge: '休' },
    custom: { label: '自定义', type: null, badge: '自定义' }
  };

  function getLegalDayInfo(dateStr) {
    var builtin = global.MoyuHolidayData && global.MoyuHolidayData.get(dateStr);
    if (builtin) {
      return { date: dateStr, type: builtin.type, name: builtin.name || '', source: 'builtin' };
    }
    var day = new Date(dateStr + 'T00:00:00').getDay();
    var isWeekend = day === 0 || day === 6;
    return { date: dateStr, type: isWeekend ? 'holiday' : 'workday', name: isWeekend ? '周末' : '工作日', source: 'default' };
  }

  function getDisplayDayInfo(dateStr, overrides) {
    var legal = getLegalDayInfo(dateStr);
    var override = overrides && overrides[dateStr];
    if (!override) { return legal; }
    var theme = THEMES[override.theme] || THEMES.custom;
    return {
      date: dateStr,
      type: override.type,
      name: override.title || theme.label,
      theme: override.theme || 'custom',
      note: override.note || '',
      source: 'user',
      legalType: legal.type,
      legalName: legal.name,
      legalSource: legal.source
    };
  }

  function isLegalWorkday(dateStr) { return getLegalDayInfo(dateStr).type === 'workday'; }

  function countLegalWorkdays(year, month) {
    var count = 0;
    var lastDay = new Date(year, month, 0).getDate();
    for (var d = 1; d <= lastDay; d++) {
      var mm = month < 10 ? '0' + month : '' + month;
      var dd = d < 10 ? '0' + d : '' + d;
      if (isLegalWorkday(year + '-' + mm + '-' + dd)) { count++; }
    }
    return count;
  }

  var OverrideStore = {
    key: KEY_OVERRIDES,
    normalize: function (value) {
      return value && typeof value === 'object' ? value : {};
    },
    getAll: function (callback) {
      chrome.storage.local.get([KEY_OVERRIDES], function (res) {
        callback(OverrideStore.normalize(res[KEY_OVERRIDES]));
      });
    },
    set: function (dateStr, item, callback) {
      this.getAll(function (overrides) {
        var now = Date.now();
        var old = overrides[dateStr] || {};
        overrides[dateStr] = {
          type: item.type === 'workday' ? 'workday' : 'holiday',
          theme: item.theme || 'custom',
          title: item.title || '',
          note: item.note || '',
          createdAt: old.createdAt || now,
          updatedAt: now
        };
        var data = {};
        data[KEY_OVERRIDES] = overrides;
        chrome.storage.local.set(data, callback || function () {});
      });
    },
    remove: function (dateStr, callback) {
      this.getAll(function (overrides) {
        delete overrides[dateStr];
        var data = {};
        data[KEY_OVERRIDES] = overrides;
        chrome.storage.local.set(data, callback || function () {});
      });
    }
  };

  global.MoyuHolidayService = {
    key: KEY_OVERRIDES,
    themes: THEMES,
    getLegalDayInfo: getLegalDayInfo,
    getDisplayDayInfo: getDisplayDayInfo,
    isLegalWorkday: isLegalWorkday,
    countLegalWorkdays: countLegalWorkdays,
    OverrideStore: OverrideStore
  };
})(window);
