// 成就系统定义。
// 仅维护成就清单，不负责存储、统计或解锁判断，方便装配层复用。
(function (global) {
  'use strict';

  var ACHIEVEMENT_CATEGORIES = {
    ENTRY: 'entry',
    TOTAL_MOYU_TIME: 'total_moyu_time',
    MOYU_DAYS: 'moyu_days',
    STREAK: 'streak',
    WORKDAY: 'workday',
    DAILY_MOYU_TIME: 'daily_moyu_time',
    WATER_COUNT: 'water_count'
  };

  var HOUR = 60 * 60;

  var ACHIEVEMENTS = [
    {
      id: 'main_view_first_open',
      title: '你说的对但是',
      category: ACHIEVEMENT_CATEGORIES.ENTRY,
      conditionType: 'main_view_opened_at_least',
      threshold: 1,
      description: '首次打开摸鱼主界面',
      flavorText: '你说的都对，但是我要开始摸鱼了。',
      icon: '🚪'
    },
    {
      id: 'total_1_hour',
      title: '我摸故我在',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 1 * HOUR,
      description: '累计摸鱼满 1 小时',
      flavorText: '当你开始摸鱼，存在就有了明确证据。',
      icon: '⏱️'
    },
    {
      id: 'total_3_hours',
      title: '再给我摸5毛钱的鱼',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 3 * HOUR,
      description: '累计摸鱼满 3 小时',
      flavorText: '那得花不少时间，先生。',
      icon: '🪙'
    },
    {
      id: 'total_8_hours',
      title: '公司没有这一天',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 8 * HOUR,
      description: '累计摸鱼满 8 小时',
      flavorText: '这一天没有消失，只是被你外包给了鱼塘。',
      icon: '🏢'
    },
    {
      id: 'total_12_hours',
      title: '子非鱼',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 12 * HOUR,
      description: '累计摸鱼满 12 小时',
      flavorText: '子非鱼，安知鱼之乐；子非打工人，安知摸鱼之乐。',
      icon: '🐟'
    },
    {
      id: 'total_24_hours',
      title: '二十四桥明月夜',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 24 * HOUR,
      description: '累计摸鱼满 24 小时',
      flavorText: '渔人何处教吹箫。',
      icon: '🌙'
    },
    {
      id: 'total_40_hours',
      title: '公司没有这一周',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 40 * HOUR,
      description: '累计摸鱼满 40 小时',
      flavorText: '这一周没有旷工，只是以另一种方式全勤。',
      icon: '📆'
    },
    {
      id: 'total_160_hours',
      title: '公司没有这个月',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 160 * HOUR,
      description: '累计摸鱼满 160 小时',
      flavorText: '月报写不下的部分，鱼塘替你记着。',
      icon: '🗓️'
    },
    {
      id: 'total_365_hours',
      title: '流水它带走光阴的故事',
      category: ACHIEVEMENT_CATEGORIES.TOTAL_MOYU_TIME,
      conditionType: 'total_moyu_seconds_at_least',
      threshold: 365 * HOUR,
      description: '累计摸鱼满 365 小时',
      flavorText: '一年有三百六十五天，你有三百六十五小时不在场。',
      icon: '⏳'
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
      title: '七天无理由摸鱼',
      category: ACHIEVEMENT_CATEGORIES.MOYU_DAYS,
      conditionType: 'moyu_days_at_least',
      threshold: 7,
      description: '累计 7 天有摸鱼记录',
      flavorText: '一周过去了，工作也许没做完，但鱼肯定摸圆了。',
      icon: '🛒'
    },
    {
      id: 'moyu_31_days',
      title: '严谨点，31天才行',
      category: ACHIEVEMENT_CATEGORIES.MOYU_DAYS,
      conditionType: 'moyu_days_at_least',
      threshold: 31,
      description: '累计 31 天有摸鱼记录',
      flavorText: '一个月到底几天不重要，严谨点，三十一天才算数。',
      icon: '📏'
    },
    {
      id: 'moyu_366_days',
      title: '众所周知，一年有366天',
      category: ACHIEVEMENT_CATEGORIES.MOYU_DAYS,
      conditionType: 'moyu_days_at_least',
      threshold: 366,
      description: '累计 366 天有摸鱼记录',
      flavorText: '多出来的那一天，当然也是用来摸鱼的。',
      icon: '🌏'
    },
    {
      id: 'weekday_span_recorded',
      title: '世界需要七休日',
      category: ACHIEVEMENT_CATEGORIES.WORKDAY,
      conditionType: 'weekday_span_moyu_recorded',
      threshold: 5,
      description: '存在完整周一到周五都有摸鱼记录',
      flavorText: '一周有七天，所以理论上应该有七个休息日。',
      icon: '🛌'
    },
    {
      id: 'consecutive_7_days',
      title: '世界不需要七休日',
      category: ACHIEVEMENT_CATEGORIES.STREAK,
      conditionType: 'consecutive_moyu_days_at_least',
      threshold: 7,
      description: '连续 7 天有摸鱼记录',
      flavorText: '一周有七天，所以理论上应该有七个休息日，但你为什么上七天班。',
      icon: '🔥'
    },
    {
      id: 'legal_workday_month_full',
      title: '摸鱼全勤奖',
      category: ACHIEVEMENT_CATEGORIES.WORKDAY,
      conditionType: 'month_legal_workdays_all_recorded',
      threshold: 1,
      description: '某月每个法定工作日都有摸鱼记录',
      flavorText: '本月应出勤：鱼。实际出勤：鱼。',
      icon: '🏅'
    },
    {
      id: 'calendar_month_full',
      title: '工作全勤奖',
      category: ACHIEVEMENT_CATEGORIES.WORKDAY,
      conditionType: 'month_all_days_recorded',
      threshold: 1,
      description: '某自然月每天都有摸鱼记录',
      flavorText: '你既然摸了，那必然上班了。',
      icon: '💼'
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
      id: 'daily_3_hours',
      title: '没人比我更懂下班',
      category: ACHIEVEMENT_CATEGORIES.DAILY_MOYU_TIME,
      conditionType: 'daily_moyu_seconds_at_least',
      threshold: 3 * HOUR,
      description: '任意一天摸鱼满 3 小时',
      flavorText: '下班是一种时间，摸鱼是一种提前抵达。',
      icon: '🏃'
    },
    {
      id: 'daily_8_hours',
      title: '白拿一天工资',
      category: ACHIEVEMENT_CATEGORIES.DAILY_MOYU_TIME,
      conditionType: 'daily_moyu_seconds_at_least',
      threshold: 8 * HOUR,
      description: '任意一天摸鱼满 8 小时',
      flavorText: '这一天你全勤在岗，只是岗位设在鱼塘正中央。',
      icon: '💸'
    },
    {
      id: 'daily_12_hours',
      title: '你应该是忘关了帕？',
      category: ACHIEVEMENT_CATEGORIES.DAILY_MOYU_TIME,
      conditionType: 'daily_moyu_seconds_at_least',
      threshold: 12 * HOUR,
      description: '任意一天摸鱼满 12 小时',
      flavorText: '下次下班记得关电脑。',
      icon: '🖥️'
    },
    {
      id: 'water_daily_3',
      title: '杯水主义实践者',
      category: ACHIEVEMENT_CATEGORIES.WATER_COUNT,
      conditionType: 'daily_water_count_at_least',
      threshold: 3,
      description: '单日完成喝水提醒 3 次',
      flavorText: '理论联系实际，实际落实到杯。',
      icon: '🥤'
    },
    {
      id: 'water_daily_8',
      title: '人形加湿器',
      category: ACHIEVEMENT_CATEGORIES.WATER_COUNT,
      conditionType: 'daily_water_count_at_least',
      threshold: 8,
      description: '单日完成喝水提醒 8 次',
      flavorText: '喝到这份上，办公室绿植都开始感谢你。',
      icon: '💧'
    },
    {
      id: 'water_total_10',
      title: '内置小型潮汐系统',
      category: ACHIEVEMENT_CATEGORIES.WATER_COUNT,
      conditionType: 'total_water_count_at_least',
      threshold: 10,
      description: '累计完成喝水提醒 10 次',
      flavorText: '潮起，喝水；潮落，去厕所。',
      icon: '🌙'
    },
    {
      id: 'water_total_50',
      title: '资深续杯选手',
      category: ACHIEVEMENT_CATEGORIES.WATER_COUNT,
      conditionType: 'total_water_count_at_least',
      threshold: 50,
      description: '累计完成喝水提醒 50 次',
      flavorText: '你与饮水机之间已建立长期战略合作关系。',
      icon: '🤝'
    },
    {
      id: 'water_total_100',
      title: '带薪如厕研究员',
      category: ACHIEVEMENT_CATEGORIES.WATER_COUNT,
      conditionType: 'total_water_count_at_least',
      threshold: 100,
      description: '累计完成喝水提醒 100 次',
      flavorText: '课题：厕所隔间的声学与信号强度。经费公司出，成果归我。',
      icon: '🚽'
    },
    {
      id: 'water_total_300',
      title: '水利工程总指挥',
      category: ACHIEVEMENT_CATEGORIES.WATER_COUNT,
      conditionType: 'total_water_count_at_least',
      threshold: 300,
      description: '累计完成喝水提醒 300 次',
      flavorText: '大禹治水靠疏，你治渴靠续；功成不必在我，杯满一定有我。',
      icon: '🌊'
    }
  ];

  global.MoyuAchievements = {
    categories: ACHIEVEMENT_CATEGORIES,
    list: ACHIEVEMENTS
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
