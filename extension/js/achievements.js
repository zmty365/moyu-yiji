// 成就系统定义。
// 仅维护第一版成就清单，不负责存储、统计或解锁判断，方便网页与扩展装配层后续复用。
(function (global) {
  'use strict';

  var ACHIEVEMENT_CATEGORIES = {
    TOTAL_MOYU_TIME: 'total_moyu_time',
    MOYU_DAYS: 'moyu_days',
    DAILY_MOYU_TIME: 'daily_moyu_time',
    WATER_COUNT: 'water_count'
  };

  var ACHIEVEMENTS = [
    {
      id: 'first_moyu',
      title: '此刻，一条鱼决定上班',
      category: ACHIEVEMENT_CATEGORIES.MOYU_DAYS,
      conditionType: 'moyu_days_at_least',
      threshold: 1,
      description: '首次产生摸鱼记录',
      flavorText: '命运的齿轮开始打滑，鱼塘的水开始上涨。',
      icon: '🐟'
    },
    {
      id: 'total_1_hour',
      title: '我摸故我在',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 60 * 60,
      description: '累计摸鱼满 1 小时',
      flavorText: '当你开始摸鱼，存在就有了明确证据。',
      icon: '⏱️'
    },
    {
      id: 'total_8_hours',
      title: '公司没有这一天',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 8 * 60 * 60,
      description: '累计摸鱼满 8 小时',
      flavorText: '这一天没有消失，只是被你外包给了鱼塘。',
      icon: '🏢'
    },
    {
      id: 'total_24_hours',
      title: '子非鱼',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 24 * 60 * 60,
      description: '累计摸鱼满 24 小时',
      flavorText: '子非鱼，安知鱼之乐；子非打工人，安知摸鱼之乐。',
      icon: '🌊'
    },
    {
      id: 'moyu_3_days',
      title: '三次经过同一条河',
      category: ACHIEVEMENT_CATEGORIES.MOYU_DAYS,
      conditionType: 'moyu_days_at_least',
      threshold: 3,
      description: '累计 3 天有摸鱼记录',
      flavorText: '赫拉克利特看了都说：这河怎么还有打卡记录？',
      icon: '🏞️'
    },
    {
      id: 'moyu_7_days',
      title: '世界需要七休日',
      category: ACHIEVEMENT_CATEGORIES.MOYU_DAYS,
      conditionType: 'moyu_days_at_least',
      threshold: 7,
      description: '累计 7 天有摸鱼记录',
      flavorText: '一周有七天，所以理论上应该有七个休息日。',
      icon: '📅'
    },
    {
      id: 'daily_5_hours',
      title: '没人比我更懂下班',
      category: ACHIEVEMENT_CATEGORIES.DAILY_MOYU_TIME,
      conditionType: 'daily_moyu_seconds_at_least',
      threshold: 5 * 60 * 60,
      description: '任意一天摸鱼满 5 小时',
      flavorText: '下班是一种时间，摸鱼是一种提前抵达。',
      icon: '🏆'
    },
    {
      id: 'daily_2_minutes',
      title: '很不高兴为您服务',
      category: ACHIEVEMENT_CATEGORIES.DAILY_MOYU_TIME,
      conditionType: 'daily_moyu_seconds_between',
      minThreshold: 1,
      maxThreshold: 2 * 60,
      description: '任意一天摸鱼时长大于 0 且不超过 2 分钟',
      flavorText: '本次服务持续两分钟以内，主打一个态度明确。',
      icon: '🫡'
    },
    {
      id: 'water_3_times',
      title: '杯水主义实践者',
      category: ACHIEVEMENT_CATEGORIES.WATER_COUNT,
      conditionType: 'daily_water_count_at_least',
      threshold: 3,
      description: '单日完成喝水提醒 3 次',
      flavorText: '理论联系实际，实际落实到杯。',
      icon: '🥤'
    },
    {
      id: 'water_10_times',
      title: '内置小型潮汐系统',
      category: ACHIEVEMENT_CATEGORIES.WATER_COUNT,
      conditionType: 'total_water_count_at_least',
      threshold: 10,
      description: '累计完成喝水提醒 10 次',
      flavorText: '潮起，喝水；潮落，去厕所。',
      icon: '🌙'
    }
  ];

  global.MoyuAchievements = {
    categories: ACHIEVEMENT_CATEGORIES,
    list: ACHIEVEMENTS
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
