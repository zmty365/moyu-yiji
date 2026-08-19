// 桌宠 demo · 内容脚本（注入到任意网页右下角常驻）
// 对齐 growth-system-prd.md 桌宠 V1：两态联动 + 抚摸掉币 + 反向监督气泡，零负担。
// 自包含：内嵌 SVG + 样式 + 交互，不依赖页面环境；数据存 chrome.storage.local。
// V2：多桌宠切换——造型/文案统一取自 pet-registry.js 的 MoyuPets 图鉴，
//     选中的桌宠写入 'pet-selected'，可跨页面实时切换；抚摸会触发带大厂彩蛋的文字气泡。
(function bootMoyuPet(retryCount) {
  'use strict';

  // 避免重复注入（同页多次执行时）
  if (window.__moyuPetInjected) return;

  // 桌宠图鉴由 manifest 先于本脚本注入；缺失则安全退出（不渲染桌宠）。
  var Pets = window.MoyuPets;
  if (!Pets || !Pets.get) {
    if ((retryCount || 0) < 10) {
      setTimeout(function () { bootMoyuPet((retryCount || 0) + 1); }, 50);
    }
    return;
  }
  window.__moyuPetInjected = true;

  // ---- 存储键 ----
  var K_COIN = 'pet-coin';        // 摸鱼币余额
  var K_PET_DAY = 'pet-pat-day';  // 记录抚摸次数所属日期（YYYY-MM-DD）
  var K_PET_CNT = 'pet-pat-count';// 当日已抚摸掉币次数
  var K_PET_DROPPED = 'pet-dropped-coin'; // 桌宠累计掉落摸鱼币
  var K_PET_ENABLED = 'pet-enabled'; // 是否显示桌宠（默认显示）
  var K_PET_SELECTED = 'pet-selected'; // 当前选中的桌宠 id
  var DAILY_PAT_LIMIT = 10;       // 每日抚摸掉币上限（PRD §6.3）

  // 当前桌宠（id 与定义对象）
  var petId = Pets.DEFAULT;
  var pet = Pets.get(petId);

  // ---- 样式（独立命名空间 mp-，极高 z-index）----
  var style = document.createElement('style');
  style.textContent = ''
    + '#moyu-pet{position:fixed;right:20px;bottom:20px;z-index:2147483646;width:110px;font-family:-apple-system,"PingFang SC",sans-serif;user-select:none;cursor:grab}'
    + '#moyu-pet.mp-dragging{cursor:grabbing}'
    + '#moyu-pet .mp-cat{display:block;margin:0 auto;transform-origin:center bottom;animation:mp-float 3.6s ease-in-out infinite}'
    + '#moyu-pet .mp-cat svg{display:block;margin:0 auto}'
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
    + '#moyu-pet.mp-collapsed .mp-cat svg{width:44px;height:44px}'
    + '@keyframes mp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}'
    + '@keyframes mp-blink{0%,46%,100%{transform:scaleY(1)}50%{transform:scaleY(.3)}}';
  (document.head || document.documentElement).appendChild(style);

  // ---- DOM 构建 ----
  var root = document.createElement('div');
  root.id = 'moyu-pet';
  root.innerHTML = ''
    + '<div class="mp-bubble"></div>'
    + '<div class="mp-cat"></div>'
    + '<div class="mp-panel">'
    + '  <span class="mp-coin">🐟 0</span>'
    + '</div>'
    + '<button class="mp-toggle" type="button" title="收起/展开">–</button>';
  function mountRoot() {
    var parent = document.body || document.documentElement;
    if (root.parentNode === parent) return;
    parent.appendChild(root);
  }
  if (document.body) {
    mountRoot();
  } else {
    document.addEventListener('DOMContentLoaded', mountRoot, { once: true });
    mountRoot();
  }

  var elBubble = root.querySelector('.mp-bubble');
  var elCat = root.querySelector('.mp-cat');
  var elCoin = root.querySelector('.mp-coin');
  var elToggle = root.querySelector('.mp-toggle');

  // 先渲染默认桌宠，避免没有 pet-selected 历史值时页面只出现空容器。
  elCat.innerHTML = pet.svg;

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

  // 切换桌宠：更新造型 + 播报登场问候。
  function applyPet(id) {
    var next = Pets.get(id);
    petId = next.id;
    pet = next;
    elCat.innerHTML = pet.svg;
    showBubble(pet.greeting);
  }

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

  // ---- 抚摸掉落：50% 掉币 / 50% 大厂彩蛋文字（PRD §6.3 基础上把彩蛋概率拉高）----
  function onPat() {
    try {
      chrome.storage.local.get([K_PET_DAY, K_PET_CNT], function (o) {
        var today = todayStr();
        var cnt = (o[K_PET_DAY] === today) ? (o[K_PET_CNT] || 0) : 0;
        if (cnt >= DAILY_PAT_LIMIT) {
          showBubble('今天摸够本啦，' + pick(pet.pat));
          return;
        }
        var r = Math.random();
        if (r < 0.5) {
          var gain = 1 + Math.floor(Math.random() * 3); // 1~3 币
          awardCoin(gain);
          showBubble('+' + gain + ' 摸鱼币 🐟');
        } else {
          showBubble(pick(pet.egg));
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
        showBubble(pick(pet.idle));
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

  // ---- 初始化：读币 + 选中桌宠 + 启动待机气泡 ----
  try {
    chrome.storage.local.get([K_PET_ENABLED, K_PET_SELECTED], function (o) {
      applyEnabled(!(o && o[K_PET_ENABLED] === false));
      if (o && o[K_PET_SELECTED]) {
        applyPet(o[K_PET_SELECTED]);
      } else {
        showBubble(pet.greeting);
      }
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
      if (area === 'local' && changes[K_PET_SELECTED] && changes[K_PET_SELECTED].newValue) {
        applyPet(changes[K_PET_SELECTED].newValue);
      }
    });
  } catch (e) { /* 忽略 */ }

  startIdleBubbles();
})();
