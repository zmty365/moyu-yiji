// 共享日期悬浮窗（tooltip）：网页版 index.html 与扩展完整页 full.html 共用。
// 交互/样式外壳 + 边缘防裁切 在此统一维护；内容由各页面通过 opts.build(dateStr) 提供，
// 从而各自复用本页自己的唯一数据源（yiji + log + effectiveRate），保持与当月历一致。
(function (global) {
  'use strict';

  // opts: { grid, build }:  grid 为月历容器（.cal-grid），build(dateStr) 返回 tooltip HTML(空串则不显示)。
  // 返回 { hide }：供调用方在重绘月历（翻页/今天/落库重渲染）时调用以收起悬浮窗。
  function attach(opts) {
    var grid = opts.grid;
    var build = opts.build;
    var tipEl = null;
    var tipActiveDate = null;
    var tipMoved = false;

    function ensureTip() {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = 'cal-tooltip';
        tipEl.className = 'cal-tooltip';
        document.body.appendChild(tipEl);
      }
      return tipEl;
    }

    function showTipFor(dateStr, mx, my) {
      var content = build(dateStr);
      if (!content) {
        return;
      }
      tipActiveDate = dateStr;
      var tip = ensureTip();
      tip.innerHTML = content;
      tip.style.display = 'block';
      tip.style.visibility = 'hidden';
      tip.style.left = '0px';
      tip.style.top = '0px';
      var w = tip.offsetWidth;
      var h = tip.offsetHeight;
      var vw = document.documentElement.clientWidth;
      var vh = document.documentElement.clientHeight;
      var left = mx + 12;
      var top = my + 16;
      if (left + w + 8 > vw) { left = mx - w - 12; }
      if (top + h + 8 > vh) { top = my - h - 10; }
      if (left < 6) { left = 6; }
      if (top < 6) { top = 6; }
      if (left + w + 6 > vw) { left = vw - w - 6; }
      if (top + h + 6 > vh) { top = vh - h - 6; }
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
      tip.style.visibility = 'visible';
    }

    function hideTip() {
      tipActiveDate = null;
      if (tipEl) {
        tipEl.style.display = 'none';
      }
    }

    // 事件委托：hover cell 即生成/定位；跨 cell 移动更新；移出月历隐藏。
    grid.addEventListener('mouseover', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('.day-cell') : null;
      if (!cell) {
        return;
      }
      var dateStr = cell.getAttribute('data-date');
      if (!dateStr) {
        return;
      }
      showTipFor(dateStr, e.clientX, e.clientY);
      tipMoved = false;
    });

    grid.addEventListener('mousemove', function (e) {
      if (tipActiveDate === null || !tipEl || tipEl.style.display === 'none') {
        return;
      }
      var cell = e.target && e.target.closest ? e.target.closest('.day-cell') : null;
      if (!cell || cell.getAttribute('data-date') !== tipActiveDate) {
        return;
      }
      if (tipMoved) {
        return;
      }
      tipMoved = true;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { tipMoved = false; });
      }
      showTipFor(cell.getAttribute('data-date'), e.clientX, e.clientY);
    });

    grid.addEventListener('mouseleave', function () {
      hideTip();
    });

    window.addEventListener('scroll', hideTip, true);

    return { hide: hideTip };
  }

  // 通用内容构造：由各页面传解析好的片段，保证风格/结构一致。
  function buildHtml(data) {
    function items(list) {
      if (!list || !list.length) {
        return '<li class="tt-empty">无</li>';
      }
      return list.map(function (v) { return '<li>' + v + '</li>'; }).join('');
    }
    return '' +
      '<div class="tt-date">' + data.dateLabel + '</div>' +
      '<div class="tt-head"><span class="tt-item">今日宜 / 忌</span></div>' +
      '<div class="tt-yiji">' +
        '<div class="tt-col"><i class="chip chip-yi">宜</i><ul>' + items(data.yi) + '</ul></div>' +
        '<div class="tt-col"><i class="chip chip-ji">忌</i><ul>' + items(data.ji) + '</ul></div>' +
      '</div>' +
      '<div class="tt-head"><span class="tt-item">摸鱼账本</span></div>' +
      '<div class="tt-book">' +
        '<div class="tt-row"><span>时长</span><b>' + data.timeStr + '</b></div>' +
        '<div class="tt-row"><span>入账</span><b class="amt">' + data.amountStr + '</b></div>' +
      '</div>' +
      (data.holidayHtml || '');
  }

  global.CalendarTooltip = { attach: attach, buildHtml: buildHtml };
})(window);
