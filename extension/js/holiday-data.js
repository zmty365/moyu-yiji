// 2026 法定节假日与调休数据（内置兜底）。
// type: holiday=法定休息日；workday=法定调休上班日。
(function (global) {
  'use strict';

  var HOLIDAY_DATA_BY_YEAR = {
    2026: {
      version: '2026.1',
      days: {
        '2026-01-01': { type: 'holiday', name: '元旦' },
        '2026-02-15': { type: 'holiday', name: '春节' },
        '2026-02-16': { type: 'holiday', name: '春节' },
        '2026-02-17': { type: 'holiday', name: '春节' },
        '2026-02-18': { type: 'holiday', name: '春节' },
        '2026-02-19': { type: 'holiday', name: '春节' },
        '2026-02-20': { type: 'holiday', name: '春节' },
        '2026-02-21': { type: 'holiday', name: '春节' },
        '2026-04-04': { type: 'holiday', name: '清明节' },
        '2026-04-05': { type: 'holiday', name: '清明节' },
        '2026-04-06': { type: 'holiday', name: '清明节' },
        '2026-05-01': { type: 'holiday', name: '劳动节' },
        '2026-05-02': { type: 'holiday', name: '劳动节' },
        '2026-05-03': { type: 'holiday', name: '劳动节' },
        '2026-05-04': { type: 'holiday', name: '劳动节' },
        '2026-05-05': { type: 'holiday', name: '劳动节' },
        '2026-06-19': { type: 'holiday', name: '端午节' },
        '2026-06-20': { type: 'holiday', name: '端午节' },
        '2026-06-21': { type: 'holiday', name: '端午节' },
        '2026-09-25': { type: 'holiday', name: '中秋节' },
        '2026-09-26': { type: 'holiday', name: '中秋节' },
        '2026-09-27': { type: 'holiday', name: '中秋节' },
        '2026-10-01': { type: 'holiday', name: '国庆节' },
        '2026-10-02': { type: 'holiday', name: '国庆节' },
        '2026-10-03': { type: 'holiday', name: '国庆节' },
        '2026-10-04': { type: 'holiday', name: '国庆节' },
        '2026-10-05': { type: 'holiday', name: '国庆节' },
        '2026-10-06': { type: 'holiday', name: '国庆节' },
        '2026-10-07': { type: 'holiday', name: '国庆节' }
      }
    }
  };

  global.MoyuHolidayData = {
    get: function (dateStr) {
      var year = parseInt(String(dateStr).slice(0, 4), 10);
      var data = HOLIDAY_DATA_BY_YEAR[year];
      return data && data.days[dateStr] ? data.days[dateStr] : null;
    },
    hasYear: function (year) {
      return !!HOLIDAY_DATA_BY_YEAR[year];
    },
    getVersion: function (year) {
      return HOLIDAY_DATA_BY_YEAR[year] && HOLIDAY_DATA_BY_YEAR[year].version;
    },
    getAll: function () {
      return HOLIDAY_DATA_BY_YEAR;
    }
  };
})(window);
