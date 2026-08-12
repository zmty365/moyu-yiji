// 摸鱼等级系统（合并版）：引擎 + 结算服务 + 展示渲染 + 页面挂载，全部收敛到一个文件。
// 导出三个全局对象 MoyuLevelEngine / MoyuLevelService / MoyuLevelView，并在加载时
// 自动探测 popup(#mini-level-card) / full(#full-level-card) 挂载点，谁在就渲染谁。
// 依赖 MoyuWallet（发币）。等级只涨不掉；封顶 Lv.8。
(function (global) {
  'use strict';

  var H = 3600; // 1 小时秒数

  // ===== 1. 等级引擎（纯函数）=====
  // 段位门槛对齐 growth-system-prd.md §5.1（8 段）。threshold = 达成该级所需累计秒数。
  // reward = 升级到该级时一次性奖励的摸鱼币（Lv0 初始不发）；privilege = 该级特权（暂留空，未来填）。
  var LEVELS = [
    { level: 0, title: '公司最佳员工',   flavor: '你竟然不会摸鱼？',       threshold: 0,          reward: 0,    privilege: '' },
    { level: 1, title: '初级摸鱼学徒',   flavor: '刚学会假装在忙',         threshold: 10 * 60,    reward: 100,  privilege: '' },
    { level: 2, title: '带薪如厕研究员', flavor: '厕所是第一生产力',       threshold: 1 * H,      reward: 300,  privilege: '' },
    { level: 3, title: '划水中级工程师', flavor: '摸鱼开始有技术含量',     threshold: 3 * H,      reward: 500,  privilege: '' },
    { level: 4, title: '资深咸鱼',       flavor: '躺平已成肌肉记忆',       threshold: 8 * H,      reward: 1000, privilege: '' },
    { level: 5, title: '摸鱼特级技师',   flavor: '老板走过都看不出来',     threshold: 20 * H,     reward: 2000, privilege: '' },
    { level: 6, title: '划水艺术家',     flavor: '摸鱼是一种美学',         threshold: 60 * H,     reward: 3000, privilege: '' },
    { level: 7, title: '摸鱼界扫地僧',   flavor: '深藏功与名',             threshold: 160 * H,    reward: 5000, privilege: '' },
    { level: 8, title: '摸鱼之神',       flavor: '传说级，已羽化登仙',     threshold: 365 * H,    reward: 8000, privilege: '' }
  ];

  function num(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  // 计算等级信息：level/title/flavor 当前段位，isMax 是否封顶，current 累计秒，
  // nextThreshold 升级所需累计秒（封顶 null），ratio 当前段位进度 [0,1]。
  function compute(totalSeconds) {
    var total = num(totalSeconds);
    var idx = 0;
    for (var i = 0; i < LEVELS.length; i++) {
      if (total >= LEVELS[i].threshold) { idx = i; } else { break; }
    }
    var cur = LEVELS[idx];
    var isMax = idx >= LEVELS.length - 1;
    var next = isMax ? null : LEVELS[idx + 1];
    var ratio = 1;
    if (!isMax) {
      var span = next.threshold - cur.threshold;
      ratio = span > 0 ? Math.min(1, (total - cur.threshold) / span) : 1;
    }
    return {
      level: cur.level,
      title: cur.title,
      flavor: cur.flavor,
      reward: cur.reward,
      privilege: cur.privilege,
      isMax: isMax,
      current: total,
      nextThreshold: isMax ? null : next.threshold,
      ratio: ratio
    };
  }

  global.MoyuLevelEngine = { LEVELS: LEVELS, compute: compute };

  // ===== 2. 等级服务（结算 + 幂等发币）=====
  // 依赖 MoyuWallet。记录已发奖励的最高等级 rewardedLevel，只补发差额，绝不重发。
  var KEY_LEVEL_STATE = 'moyu-level-state'; // { rewardedLevel: number }
  var KEY_PREFIX_LOG = 'moyu-log:';

  // 累加从 fromLevel(不含) 到 toLevel(含) 各级的升级奖励币。
  function rewardBetween(fromLevel, toLevel) {
    var sum = 0;
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].level > fromLevel && LEVELS[i].level <= toLevel) {
        sum += num(LEVELS[i].reward);
      }
    }
    return sum;
  }

  function totalSecondsFrom(data) {
    var total = 0;
    data = data || {};
    Object.keys(data).forEach(function (key) {
      if (key.indexOf(KEY_PREFIX_LOG) === 0) { total += num(data[key]); }
    });
    return total;
  }

  // 结算等级并按需发币。回调 { info, leveledUp, from, to, coinAwarded }。
  function settle(cb) {
    try {
      chrome.storage.local.get(null, function (data) {
        var total = totalSecondsFrom(data);
        var info = compute(total);
        var state = (data && data[KEY_LEVEL_STATE]) || {};
        var rewarded = num(state.rewardedLevel);
        var curLevel = info.level;

        if (curLevel <= rewarded) {
          if (cb) cb({ info: info, leveledUp: false, from: rewarded, to: rewarded, coinAwarded: 0 });
          return;
        }

        var award = rewardBetween(rewarded, curLevel);
        var set = {}; set[KEY_LEVEL_STATE] = { rewardedLevel: curLevel };
        chrome.storage.local.set(set, function () {
          global.MoyuWallet.add(award, function () {
            if (cb) cb({ info: info, leveledUp: true, from: rewarded, to: curLevel, coinAwarded: award });
          });
        });
      });
    } catch (e) {
      if (cb) cb(null);
    }
  }

  global.MoyuLevelService = {
    KEY_LEVEL_STATE: KEY_LEVEL_STATE,
    settle: settle
  };

  // ===== 3. 展示渲染（可复用）=====
  // mount(els)：els 为 { card, badge, title, flavor, fill, next } DOM 元素（card 必填）。
  function humanize(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    var h = Math.floor(seconds / 3600);
    var m = Math.ceil((seconds % 3600) / 60);
    if (h > 0) { return h + ' 小时' + (m > 0 ? ' ' + m + ' 分' : ''); }
    return m + ' 分';
  }

  function mount(els) {
    if (!els || !els.card) { return; }

    function render(info) {
      if (!info) { return; }
      if (els.badge) { els.badge.textContent = 'Lv.' + info.level; }
      if (els.title) { els.title.textContent = info.title; }
      if (els.flavor) { els.flavor.textContent = info.flavor; }
      if (els.fill) { els.fill.style.width = Math.round(info.ratio * 100) + '%'; }
      if (els.next) {
        els.next.textContent = info.isMax
          ? '已封顶 · 羽化登仙 🐟'
          : '距下一级还需 ' + humanize(info.nextThreshold - info.current);
      }
    }

    function settleAndRender() {
      settle(function (res) {
        if (!res) { return; }
        render(res.info);
        if (res.leveledUp && res.coinAwarded > 0 && els.card.animate) {
          els.card.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }],
            { duration: 500 }
          );
        }
      });
    }

    settleAndRender();

    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') { return; }
        var touched = Object.keys(changes).some(function (k) {
          return k.indexOf(KEY_PREFIX_LOG) === 0;
        });
        if (touched) { settleAndRender(); }
      });
    } catch (e){ /* 忽略 */ }
  }

  // 等级晋级里程碑轴（横向进度轨道，参考美团/网易云会员成长体系）：
  // 8 个等级节点串成一条横轨，走过的点亮、当前脉冲高亮、未来灰暗；
  // 轨道上叠一段“已达进度”彩条，直观呈现距下一级的推进程度。
  // 每个节点下方标 Lv / 头衔 / 门槛时长 / 升级奖励币。container 为容器 DOM。
  function mountChart(container) {
    if (!container) { return; }
    var n = LEVELS.length;

    function render(info) {
      if (!info) { return; }
      var curLevel = info.level;
      // 已达进度百分比：整段轨道均分 (n-1) 格，当前级 + 本级内 ratio 占一格。
      var seg = 100 / (n - 1);
      var fillPct = Math.min(100, curLevel * seg + (info.isMax ? 0 : info.ratio * seg));

      var html = '<div class="ms-track">';
      html += '<div class="ms-rail"></div>';
      html += '<div class="ms-rail-fill" style="width:' + fillPct.toFixed(1) + '%"></div>';
      html += '<div class="ms-nodes">';
      for (var i = 0; i < n; i++) {
        var lv = LEVELS[i];
        var cls = i < curLevel ? 'done' : (i === curLevel ? 'current' : 'locked');
        var mark = i < curLevel ? '✓' : (i === curLevel ? '★' : i);
        var rewardTxt = lv.reward > 0 ? ('🐟' + lv.reward) : '起点';
        html += ''
          + '<div class="ms-node ' + cls + '">'
          +   (i === curLevel ? '<span class="ms-here">你在这里</span>' : '')
          +   '<span class="ms-dot">' + mark + '</span>'
          +   '<span class="ms-lv">Lv.' + lv.level + '</span>'
          +   '<span class="ms-title">' + lv.title + '</span>'
          +   '<span class="ms-thr">' + (lv.threshold > 0 ? humanize(lv.threshold) : '0') + '</span>'
          +   '<span class="ms-reward">' + rewardTxt + '</span>'
          + '</div>';
      }
      html += '</div></div>';
      container.innerHTML = html;
    }

    settle(function (res) { if (res) { render(res.info); } });

    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') { return; }
        var touched = Object.keys(changes).some(function (k) {
          return k.indexOf(KEY_PREFIX_LOG) === 0;
        });
        if (touched) { settle(function (res) { if (res) { render(res.info); } }); }
      });
    } catch (e) { /* 忽略 */ }
  }

  // 段位图鉴：遍历 LEVELS 渲染 8 行，按当前累计秒与等级标注 已达成 / 当前 / 未解锁。
  // container 为列表容器 DOM；progressEl 可选，用于显示 "已达成/总数"。
  function mountGallery(container, progressEl) {
    if (!container) { return; }

    function render(info) {
      if (!info) { return; }
      var curLevel = info.level;
      var total = info.current;
      var reached = 0;
      var html = '';
      for (var i = 0; i < LEVELS.length; i++) {
        var lv = LEVELS[i];
        var state, hint;
        if (lv.level < curLevel) {
          state = 'done'; reached++;
          hint = '已达成';
        } else if (lv.level === curLevel) {
          state = 'current'; reached++;
          hint = info.isMax ? '已封顶 · 巅峰' : '当前段位';
        } else {
          state = 'locked';
          hint = '还需 ' + humanize(lv.threshold - total);
        }
        html += ''
          + '<div class="gallery-row ' + state + '">'
          +   '<span class="gallery-lv">Lv.' + lv.level + '</span>'
          +   '<div class="gallery-info">'
          +     '<div class="gallery-title-row">'
          +       '<span class="gallery-title">' + lv.title + '</span>'
          +       (state === 'current' ? '<span class="gallery-tag">当前</span>' : '')
          +     '</div>'
          +     '<span class="gallery-flavor">' + lv.flavor + '</span>'
          +     '<div class="gallery-meta">'
          +       (lv.reward > 0 ? '<span class="gallery-reward">🐟 升级奖励 ' + lv.reward + ' 币</span>' : '<span class="gallery-reward muted">初始等级</span>')
          +       '<span class="gallery-priv">' + (lv.privilege ? '🎁 ' + lv.privilege : '特权：敬请期待') + '</span>'
          +     '</div>'
          +   '</div>'
          +   '<span class="gallery-hint">' + hint + '</span>'
          + '</div>';
      }
      container.innerHTML = html;
      if (progressEl) { progressEl.textContent = reached + ' / ' + LEVELS.length; }
    }

    function settleAndRender() {
      settle(function (res) {
        if (res) { render(res.info); }
      });
    }

    settleAndRender();

    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') { return; }
        var touched = Object.keys(changes).some(function (k) {
          return k.indexOf(KEY_PREFIX_LOG) === 0;
        });
        if (touched) { settleAndRender(); }
      });
    } catch (e) { /* 忽略 */ }
  }

  global.MoyuLevelView = { mount: mount, mountGallery: mountGallery, mountChart: mountChart };

  // ===== 4. 页面自动挂载（探测 popup / full 挂载点）=====
  // popup 小窗与 full 宽屏各有一套样式与挂载点 ID，谁存在就注入对应样式并渲染。
  function injectStyle(id, css) {
    if (document.getElementById(id)) { return; }
    var style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function el(id) { return document.getElementById(id); }

  function autoMount() {
    // popup 小窗（#mini-level-card）
    if (el('mini-level-card')) {
      injectStyle('moyu-level-style-mini', ''
        + '.mini-level-badge{background:#3b5a4e;color:#fff;border-radius:10px;padding:1px 8px;font-size:12px;font-weight:700}'
        + '.mini-level-title{margin-top:6px;font-size:15px;font-weight:700;color:#3a3328}'
        + '.mini-level-flavor{margin-top:2px;font-size:12px;color:#8a7f6a}'
        + '.mini-level-bar{margin-top:8px;height:8px;border-radius:6px;background:#eadfc4;overflow:hidden}'
        + '.mini-level-bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c49a4a,#3b5a4e);transition:width .4s ease}'
        + '.mini-level-next{margin-top:6px;font-size:11px;color:#8a7f6a;text-align:right}');
      mount({
        card: el('mini-level-card'),
        badge: el('mini-level-badge'),
        title: el('mini-level-title'),
        flavor: el('mini-level-flavor'),
        fill: el('mini-level-bar-fill'),
        next: el('mini-level-next')
      });
    }

    // full 宽屏（#full-level-card），样式对齐 .achievements 大卡
    if (el('full-level-card')) {
      injectStyle('moyu-level-style-full', ''
        + '.level-panel{margin-top:22px;background:rgba(255,253,244,.92);border:1px solid rgba(208,178,113,.72);border-radius:24px;padding:20px;box-shadow:0 18px 40px rgba(80,52,20,.10)}'
        + '.level-head{display:flex;justify-content:space-between;align-items:center;gap:14px}'
        + '.level-kicker{display:block;color:#a06b24;font-size:12px;letter-spacing:.14em}'
        + '.level-head h2{margin:4px 0 0;color:#6f3f18;font-size:24px}'
        + '.level-badge{flex:0 0 auto;padding:8px 14px;border-radius:999px;background:#fff5d8;color:#8b5a18;font-weight:800}'
        + '.level-flavor{margin:12px 0 0;color:#8b6b3a;font-size:14px}'
        + '.level-bar{margin-top:14px;height:12px;border-radius:8px;background:#f0e4c6;overflow:hidden}'
        + '.level-bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#e0b451,#c49a4a);transition:width .4s ease}'
        + '.level-next{margin:8px 0 0;color:#a08658;font-size:12px;text-align:right}');
      mount({
        card: el('full-level-card'),
        badge: el('full-level-badge'),
        title: el('full-level-title'),
        flavor: el('full-level-flavor'),
    fill: el('full-level-bar-fill'),
        next: el('full-level-next')
      });
    }

    // full 晋级曲线（#full-chart-canvas）
    if (el('full-chart-canvas')) {
      injectStyle('moyu-level-chart-style', ''
        + '.level-chart{margin-top:22px;background:rgba(255,253,244,.92);border:1px solid rgba(208,178,113,.72);border-radius:24px;padding:20px;box-shadow:0 18px 40px rgba(80,52,20,.10)}'
        + '.chart-head{margin-bottom:6px}'
        + '.chart-kicker{display:block;color:#a06b24;font-size:12px;letter-spacing:.14em}'
        + '.chart-head h2{margin:4px 0 0;color:#6f3f18;font-size:22px}'
        + '.chart-canvas{margin-top:18px;overflow-x:auto;padding:8px 4px 4px}'
        + '.ms-track{position:relative;min-width:640px;padding:26px 0 6px}'
        + '.ms-rail{position:absolute;left:5%;right:5%;top:34px;height:6px;border-radius:999px;background:#ece0c4}'
        + '.ms-rail-fill{position:absolute;left:5%;top:34px;height:6px;border-radius:999px;max-width:90%;background:linear-gradient(90deg,#e8c064,#e0964b);box-shadow:0 2px 8px rgba(224,150,75,.4);transition:width .6s ease}'
        + '.ms-nodes{position:relative;display:grid;grid-template-columns:repeat(9,1fr);z-index:1}'
        + '.ms-node{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px}'
        + '.ms-dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;background:#e6dcc4;color:#a08658;border:2px solid #fff;box-shadow:0 2px 6px rgba(120,90,40,.15)}'
        + '.ms-node.done .ms-dot{background:linear-gradient(180deg,#f0cf78,#e0b451);color:#7a4d12}'
        + '.ms-node.current .ms-dot{background:linear-gradient(180deg,#f6a35a,#e0964b);color:#fff;border-color:#8b5a18;transform:scale(1.18);animation:ms-pulse 1.6s ease-in-out infinite}'
        + '.ms-node.locked .ms-dot{background:#eee6d5;color:#b6ab92}'
        + '@keyframes ms-pulse{0%,100%{box-shadow:0 0 0 0 rgba(224,150,75,.5)}50%{box-shadow:0 0 0 8px rgba(224,150,75,0)}}'
        + '.ms-here{position:absolute;top:-24px;padding:2px 8px;border-radius:999px;background:#8b5a18;color:#fff;font-size:10px;font-weight:800;white-space:nowrap}'
        + '.ms-lv{margin-top:4px;font-size:11px;font-weight:800;color:#8b5a18}'
        + '.ms-title{font-size:11px;color:#6f3f18;line-height:1.2;max-width:66px}'
        + '.ms-thr{font-size:10px;color:#a08658}'
        + '.ms-reward{font-size:10px;font-weight:700;color:#c0812a}'
        + '.ms-node.locked .ms-lv,.ms-node.locked .ms-title,.ms-node.locked .ms-reward{color:#b6ab92}'
        + '.ms-node.locked .ms-thr{color:#c3b99f}');
      mountChart(el('full-chart-canvas'));
    }

    // full 段位图鉴（#full-level-gallery）
    if (el('full-gallery-list')) {
      injectStyle('moyu-level-gallery-style', ''
        + '.level-gallery{margin-top:22px;background:rgba(255,253,244,.92);border:1px solid rgba(208,178,113,.72);border-radius:24px;padding:20px;box-shadow:0 18px 40px rgba(80,52,20,.10)}'
        + '.gallery-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}'
        + '.gallery-kicker{display:block;color:#a06b24;font-size:12px;letter-spacing:.14em}'
        + '.gallery-head h2{margin:4px 0 0;color:#6f3f18;font-size:22px}'
        + '.gallery-progress{padding:6px 12px;border-radius:999px;background:#fff5d8;color:#8b5a18;font-weight:800;font-size:13px}'
        + '.gallery-list{display:flex;flex-direction:column;gap:10px}'
        + '.gallery-row{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:16px;background:#fbf4e2;border:1px solid transparent;transition:transform .2s ease}'
        + '.gallery-row.done{background:linear-gradient(180deg,#fff7df,#ffeec2);border-color:rgba(208,178,113,.6)}'
        + '.gallery-row.current{background:linear-gradient(180deg,#fff2c9,#ffe19a);border-color:#e0b451;box-shadow:0 8px 20px rgba(208,150,50,.28);transform:scale(1.015)}'
        + '.gallery-row.locked{background:#f2ede2;opacity:.62}'
        + '.gallery-lv{flex:0 0 auto;min-width:48px;text-align:center;padding:6px 10px;border-radius:12px;background:#fff5d8;color:#8b5a18;font-weight:800;font-size:14px}'
        + '.gallery-row.locked .gallery-lv{background:#e6dfce;color:#9a8f78}'
        + '.gallery-info{flex:1 1 auto;min-width:0}'
        + '.gallery-title-row{display:flex;align-items:center;gap:8px}'
        + '.gallery-title{font-size:16px;font-weight:700;color:#5b3a16}'
        + '.gallery-row.locked .gallery-title{color:#8a7f6a}'
        + '.gallery-tag{padding:1px 8px;border-radius:999px;background:#c49a4a;color:#fff;font-size:11px;font-weight:700}'
        + '.gallery-flavor{display:block;margin-top:2px;font-size:13px;color:#8b6b3a}'
        + '.gallery-row.locked .gallery-flavor{color:#a59a83}'
        + '.gallery-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}'
        + '.gallery-reward{font-size:12px;color:#b5761c;background:#fff2ce;border-radius:8px;padding:2px 8px;font-weight:700}'
        + '.gallery-reward.muted{color:#9a8f78;background:#efe8d8;font-weight:600}'
        + '.gallery-priv{font-size:12px;color:#8a7f6a;background:#f1ece0;border-radius:8px;padding:2px 8px}'
        + '.gallery-row.locked .gallery-reward{color:#a68a5a;background:#ece4d2}'
        + '.gallery-hint{flex:0 0 auto;font-size:12px;color:#a08658;font-weight:600}'
        + '.gallery-row.current .gallery-hint{color:#8b5a18}');
      mountGallery(el('full-gallery-list'), el('full-gallery-progress'));
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoMount);
    } else {
      autoMount();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);