// 桌宠 demo · 内容脚本（注入到任意网页右下角常驻）
// 对齐 growth-system-prd.md 桌宠 V1：两态联动 + 抚摸掉币 + 反向监督气泡，零负担。
// 自包含：内嵌 SVG + 样式 + 交互，不依赖页面环境；数据存 chrome.storage.local。
(function () {
  'use strict';

  // 避免重复注入（同页多次执行时）
  if (window.__moyuPetInjected) return;
  window.__moyuPetInjected = true;

  // ---- 存储键 ----
  var K_COIN = 'pet-coin';        // 摸鱼币余额
  var K_PET_DAY = 'pet-pat-day';  // 记录抚摸次数所属日期（YYYY-MM-DD）
  var K_PET_CNT = 'pet-pat-count';// 当日已抚摸掉币次数
  var K_PET_DROPPED = 'pet-dropped-coin'; // 桌宠累计掉落摸鱼币
  var K_PET_ENABLED = 'pet-enabled'; // 是否显示桌宠（默认显示）
  var DAILY_PAT_LIMIT = 10;       // 每日抚摸掉币上限（PRD §6.3）

  // ---- 文案库 ----
  var IDLE_BUBBLES = ['哥们儿…要不摸一会儿？', '工位这么安静，不像你啊', '老板不在，良辰吉时', '闲着也是闲着，摸一把？'];
  var PAT_EGGS = ['喵，蹭到你了', '今天也要开心摸鱼哦', '别卷了，卷不动了', '这一下值一个亿（情绪价值）', '摸鱼使我快乐 🫧'];

  // ---- 内嵌小猫 SVG（复用 assets/mascot-cat.svg 造型）----
  var CAT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="72" height="72" aria-label="摸鱼小猫">'
    + '<defs><linearGradient id="mpCatBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d9a6"/><stop offset="1" stop-color="#e9b877"/></linearGradient></defs>'
    + '<path d="M70 76 C 84 74, 86 60, 76 54" fill="none" stroke="#e9b877" stroke-width="7" stroke-linecap="round"/>'
    + '<path d="M28 82 C 26 60, 34 52, 48 52 C 62 52, 70 60, 68 82 Z" fill="url(#mpCatBody)" stroke="#c98f45" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<ellipse cx="48" cy="72" rx="12" ry="14" fill="#fff7ea" opacity="0.85"/>'
    + '<ellipse cx="38" cy="82" rx="7" ry="5" fill="#fff7ea" stroke="#c98f45" stroke-width="2"/>'
    + '<ellipse cx="58" cy="82" rx="7" ry="5" fill="#fff7ea" stroke="#c98f45" stroke-width="2"/>'
    + '<path d="M28 34 L 24 14 L 42 26 Z" fill="url(#mpCatBody)" stroke="#c98f45" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<path d="M68 34 L 72 14 L 54 26 Z" fill="url(#mpCatBody)" stroke="#c98f45" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<path d="M30 30 L 28 20 L 37 26 Z" fill="#f5a6a6"/><path d="M66 30 L 68 20 L 59 26 Z" fill="#f5a6a6"/>'
    + '<circle cx="48" cy="40" r="24" fill="url(#mpCatBody)" stroke="#c98f45" stroke-width="2.5"/>'
    + '<path d="M48 17 v7 M40 18 l2 6 M56 18 l-2 6" stroke="#c98f45" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>'
    + '<ellipse class="mp-eye" cx="39" cy="42" rx="5.5" ry="6.5" fill="#3a3328"/>'
    + '<ellipse class="mp-eye" cx="57" cy="42" rx="5.5" ry="6.5" fill="#3a3328"/>'
    + '<circle cx="41" cy="39.5" r="1.8" fill="#fff"/><circle cx="59" cy="39.5" r="1.8" fill="#fff"/>'
    + '<path d="M46 49 L 50 49 L 48 51.5 Z" fill="#f5a6a6"/>'
    + '<path d="M48 51.5 v2 M48 53.5 Q 44 56, 41 54 M48 53.5 Q 52 56, 55 54" stroke="#3a3328" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<ellipse cx="33" cy="48" rx="4" ry="2.6" fill="#f5a6a6" opacity="0.55"/><ellipse cx="63" cy="48" rx="4" ry="2.6" fill="#f5a6a6" opacity="0.55"/>'
    + '</svg>';

  // ---- 样式（独立命名空间 mp-，极高 z-index）----
  var style = document.createElement('style');
  style.textContent = ''
    + '#moyu-pet{position:fixed;right:20px;bottom:20px;z-index:2147483646;width:110px;font-family:-apple-system,"PingFang SC",sans-serif;user-select:none;cursor:grab}'
    + '#moyu-pet.mp-dragging{cursor:grabbing}'
    + '#moyu-pet .mp-cat{display:block;margin:0 auto;transform-origin:center bottom;animation:mp-float 3.6s ease-in-out infinite}'
    + '#moyu-pet .mp-eye{transform-origin:center;animation:mp-blink 4s ease-in-out infinite}'
    + '#moyu-pet .mp-cat:active{transform:scale(0.92)}'
    + '#moyu-pet .mp-panel{margin-top:4px;text-align:center}'
    + '#moyu-pet .mp-coin{display:inline-block;background:#fff6e5;border:1.5px solid #c49a4a;color:#8a5a1a;border-radius:12px;padding:1px 8px;font-size:12px;font-weight:600}'
    + '#moyu-pet .mp-bubble{position:absolute;left:50%;top:-8px;transform:translate(-50%,-100%);background:#fff;border:1.5px solid #3a3328;border-radius:10px;padding:5px 9px;font-size:12px;color:#3a3328;white-space:nowrap;max-width:200px;box-shadow:0 3px 8px rgba(0,0,0,.15);opacity:0;transition:opacity .25s;pointer-events:none}'
    + '#moyu-pet .mp-bubble.mp-show{opacity:1}'
    + '#moyu-pet .mp-toggle{position:absolute;right:-6px;top:-6px;width:20px;height:20px;border-radius:50%;border:1.5px solid #3a3328;background:#fff;color:#3a3328;font-size:12px;line-height:1;cursor:pointer;padding:0}'
    + '#moyu-pet.mp-collapsed .mp-panel,#moyu-pet.mp-collapsed .mp-bubble{display:none}'
    + '#moyu-pet.mp-collapsed{width:auto}'
    + '#moyu-pet.mp-collapsed .mp-cat{opacity:.5;width:44px;height:44px}'
    + '@keyframes mp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}'
    + '@keyframes mp-blink{0%,46%,100%{transform:scaleY(1)}50%{transform:scaleY(.3)}}';
  document.documentElement.appendChild(style);

  // ---- DOM 构建 ----
  var root = document.createElement('div');
  root.id = 'moyu-pet';
  root.innerHTML = ''
    + '<div class="mp-bubble"></div>'
    + '<div class="mp-cat">' + CAT_SVG + '</div>'
    + '<div class="mp-panel">'
    + '  <span class="mp-coin">🐟 0</span>'
    + '</div>'
    + '<button class="mp-toggle" type="button" title="收起/展开">–</button>';
  document.documentElement.appendChild(root);

  var elBubble = root.querySelector('.mp-bubble');
  var elCat = root.querySelector('.mp-cat');
  var elCoin = root.querySelector('.mp-coin');
  var elToggle = root.querySelector('.mp-toggle');

  var isMoyu = false;   // 摸鱼态
  var coin = 0;
  var bubbleTimer = null;
  var idleTimer = null;

  // ---- 工具 ----
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function showBubble(text) {
    elBubble.textContent = text;
    elBubble.classList.add('mp-show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { elBubble.classList.remove('mp-show'); }, 2600);
  }

  function renderCoin() { elCoin.textContent = '🐟 ' + coin; }

  // 抚摸掉币走统一钱包（原子加币），避免与等级升级发币在不同上下文互相覆盖。
  function awardCoin(gain) {
    try {
      chrome.storage.local.get([K_PET_DROPPED], function (o) {
        var current = Number(o && o[K_PET_DROPPED]) || 0;
        var set = {}; set[K_PET_DROPPED] = current + gain;
        chrome.storage.local.set(set);
      });
    } catch (e) { /* 忽略 */ }
    if (window.MoyuWallet) {
      MoyuWallet.add(gain, function (next) { coin = next; renderCoin(); });
    } else {
      coin += gain; renderCoin();
      try { chrome.storage.local.set({ 'pet-coin': coin }); } catch (e) { /* 忽略 */ }
    }
  }

  // ---- 抚摸掉落（PRD §6.3：70% 掉币 / 25% 彩蛋 / 每日 10 次上限）----
  function onPat() {
    try {
      chrome.storage.local.get([K_PET_DAY, K_PET_CNT], function (o) {
        var today = todayStr();
        var cnt = (o[K_PET_DAY] === today) ? (o[K_PET_CNT] || 0) : 0;
        if (cnt >= DAILY_PAT_LIMIT) {
          showBubble('今天摸够本啦，' + pick(PAT_EGGS));
          return;
        }
        var r = Math.random();
        if (r < 0.7) {
          var gain = 1 + Math.floor(Math.random() * 3); // 1~3 币
          awardCoin(gain);
          showBubble('+' + gain + ' 摸鱼币 🐟');
        } else {
          showBubble(pick(PAT_EGGS));
        }
        var set = {}; set[K_PET_DAY] = today; set[K_PET_CNT] = cnt + 1;
        chrome.storage.local.set(set);
      });
    } catch (e) { /* 扩展上下文失效时忽略 */ }
  }

  // ---- 待机态反向劝摸气泡（低频，PRD §6.4）----
  function startIdleBubbles() {
    clearInterval(idleTimer);
    idleTimer = setInterval(function () {
      if (!isMoyu && !root.classList.contains('mp-collapsed')) {
        showBubble(pick(IDLE_BUBBLES));
      }
    }, 45000); // 约 45s 冒一句，低频不打扰
  }

  // ---- 拖动 ----
  var drag = null;
  elCat.addEventListener('mousedown', function (e) {
    drag = { x: e.clientX, y: e.clientY, moved: false, right: parseInt(root.style.right || '20', 10), bottom: parseInt(root.style.bottom || '20', 10) };
    root.classList.add('mp-dragging');
  });
  document.addEventListener('mousemove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    root.style.right = Math.max(0, drag.right - dx) + 'px';
    root.style.bottom = Math.max(0, drag.bottom - dy) + 'px';
  });
  document.addEventListener('mouseup', function () {
    if (!drag) return;
    var moved = drag.moved;
    drag = null;
    root.classList.remove('mp-dragging');
    if (!moved) onPat(); // 未拖动视为「抚摸」
  });

  // ---- 收起/展开 ----
  elToggle.addEventListener('click', function () {
    var collapsed = root.classList.toggle('mp-collapsed');
    elToggle.textContent = collapsed ? '+' : '–';
  });

  function applyEnabled(enabled) {
    root.style.display = enabled === false ? 'none' : '';
  }

  // ---- 初始化：读币 + 启动待机气泡 ----
  try {
    chrome.storage.local.get([K_PET_ENABLED], function (o) {
      applyEnabled(!(o && o[K_PET_ENABLED] === false));
    });
    if (window.MoyuWallet) {
      MoyuWallet.getBalance(function (v) { coin = v; renderCoin(); });
    } else {
      chrome.storage.local.get([K_COIN], function (o) {
        coin = o[K_COIN] || 0;
        renderCoin();
      });
    }
  } catch (e) { /* 忽略 */ }
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes[K_PET_ENABLED]) {
        applyEnabled(changes[K_PET_ENABLED].newValue !== false);
      }
    });
  } catch (e) { /* 忽略 */ }
  startIdleBubbles();
  setTimeout(function () { showBubble('嗨，我是你的摸鱼搭子 😼'); }, 1200);
})();
