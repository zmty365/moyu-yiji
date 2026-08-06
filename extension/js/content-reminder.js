// 喝水提醒 · 注入到宿主网页的浮层脚本（content script，V1）
//
// 由 water-reminder.js 通过 chrome.scripting.executeScript 按需注入到当前活动标签页。
// 职责：在右下角渲染轻量浮层（当前时间 + 文案 + 稍后/关闭两按钮），可选播放极短「叮」，
// 按钮点击后 chrome.runtime.sendMessage 回传后台，由 water-reminder.js 重排 alarm。
//
// 隔离原则：浮层用 Shadow DOM 承载，样式内联在 shadow 内，既不被宿主页 CSS 影响，
// 也不污染宿主页；不劫持页面键鼠焦点，点击面板外部不关闭（仅按钮操作）。
(function () {
  'use strict';

  // 幂等守卫：同一页可能被多次注入，只在首次注册监听，后续注入直接复用已存在的监听。
  if (window.__moyuWaterReminderInjected) { return; }
  window.__moyuWaterReminderInjected = true;

  var HOST_ID = '__moyu-water-panel-host';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function nowClock() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // 随机喝水文案池：每次弹出随机取一条，生动一点。
  var MESSAGES = [
    '该喝口水啦 💧',
    '喵~ 主人该补水啦 🐱',
    '小鱼在水里游得欢，你也来口水 🐟',
    '咕噜咕噜，来杯水续个命 🥤',
    '久坐一时爽，喝水才健康 💦',
    '起身接杯水，顺便伸个懒腰 🙆',
    '眼睛和颈椎都想让你歇会儿、喝口水 👀',
    '水杯是不是又空了？去续满它 🚰',
    '摸鱼也别忘了喝水哦 🐟',
    '猫猫提醒：再忙也要喝口水 🐾',
    '给身体浇点水，才不会变成干鱼干 🐡',
    '停一停，喝口水，世界还在 🌊',
    '一口水，一点温柔，都给自己 💧',
    '起来走两步，顺路灌口水 🚶',
    '水波都会累，你也该歇口气喝点水 🫧'
  ];
  function pickMessage() {
    return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  }

  // 极短「叮咚」（< 0.5s），用 WebAudio 合成，避免额外资源与跨域。
  // 提醒无用户手势，部分页面自动播放策略会挂起 AudioContext——先尝试 resume()，
  // 页面此前有过交互（sticky activation）时即可发声；仍失败则静默。
  function playDing() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { return; }
      var ctx = new Ctx();
      var play = function () {
        var t0 = ctx.currentTime;
        // 双音「叮—咚」：880Hz 起、上滑到 1174Hz，更清亮明显。
        var freqs = [880, 1174.66];
        freqs.forEach(function (f, i) {
          var start = t0 + i * 0.14;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.35, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.24);
        });
        setTimeout(function () { try { ctx.close(); } catch (e) { /* 忽略 */ } }, 700);
      };
      if (ctx.state === 'suspended' && ctx.resume) {
        ctx.resume().then(play).catch(function () { /* 被自动播放策略拦截，静默 */ });
      } else {
        play();
      }
    } catch (e) { /* 播放失败静默 */ }
  }

  function removePanel() {
    var el = document.getElementById(HOST_ID);
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
  }

  function sendBg(type) {
    try {
      chrome.runtime.sendMessage({ type: type }, function () { void chrome.runtime.lastError; });
    } catch (e) { /* 忽略 */ }
  }

  function showPanel(text, sound) {
    removePanel(); // 若已有面板，先移除避免叠加

    var host = document.createElement('div');
    host.id = HOST_ID;
    // 宿主 div 只定位，不含视觉；具体样式在 shadow 内，避免被宿主页 CSS 干扰。
    host.style.cssText = [
      'position:fixed', 'right:20px', 'bottom:20px',
      'z-index:2147483647', 'width:300px', 'margin:0', 'padding:0', 'border:0'
    ].join(' !important;') + ' !important;';

    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' +
      ':host{all:initial;}' +
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      '.wr-card{' +
      'position:relative;overflow:hidden;' +
      'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'width:300px;background:linear-gradient(180deg,#fffdf4,#f3ead6);' +
      'border:1px solid #e8dcbe;border-radius:16px;' +
      'box-shadow:0 10px 28px rgba(122,91,46,.24);' +
      'padding:0 0 14px;color:#3a3328;' +
      'animation:wr-in .26s cubic-bezier(.2,.9,.3,1.2);}' +
      '@keyframes wr-in{from{opacity:0;transform:translateY(16px) scale(.96);}to{opacity:1;transform:translateY(0) scale(1);}}' +
      // 顶部小场景：水波背景 + 猫咪探头 + 游动小鱼 + 气泡
      '.wr-scene{position:relative;height:64px;' +
      'background:linear-gradient(180deg,#dff1fb,#bfe3f5);overflow:hidden;' +
      'border-bottom:1px solid #cfe6f2;}' +
      '.wr-wave{position:absolute;left:0;right:0;bottom:0;height:20px;' +
      'background:radial-gradient(circle at 10px -6px,#a8d8f0 8px,transparent 9px) repeat-x;' +
      'background-size:20px 20px;opacity:.7;}' +
      '.wr-cat{position:absolute;left:14px;bottom:6px;font-size:34px;line-height:1;' +
      'animation:wr-peek 2.6s ease-in-out infinite;transform-origin:bottom center;}' +
      '@keyframes wr-peek{0%,100%{transform:translateY(2px) rotate(-4deg);}50%{transform:translateY(-3px) rotate(4deg);}}' +
      '.wr-fish{position:absolute;bottom:12px;font-size:22px;' +
      'animation:wr-swim 5s linear infinite;}' +
      '@keyframes wr-swim{0%{left:-24px;transform:scaleX(1);}49%{left:calc(100% + 4px);transform:scaleX(1);}50%{transform:scaleX(-1);}99%{left:-24px;transform:scaleX(-1);}100%{left:-24px;transform:scaleX(1);}}' +
      '.wr-bubble{position:absolute;bottom:8px;color:#fff;font-size:12px;opacity:.85;' +
      'animation:wr-rise 3.2s ease-in infinite;}' +
      '.wr-bubble.b2{left:64%;font-size:9px;animation-delay:1.1s;}' +
      '.wr-bubble.b3{left:80%;font-size:14px;animation-delay:.5s;}' +
      '.wr-bubble.b1{left:48%;}' +
      '@keyframes wr-rise{0%{transform:translateY(0);opacity:0;}20%{opacity:.85;}100%{transform:translateY(-54px);opacity:0;}}' +
      '.wr-body{padding:12px 16px 0;}' +
      '.wr-top{display:flex;align-items:center;justify-content:flex-end;margin-bottom:6px;}' +
      '.wr-time{font-size:12px;color:#a0885a;font-variant-numeric:tabular-nums;}' +
      '.wr-text{font-size:16px;font-weight:700;color:#7a5b2e;line-height:1.5;margin:2px 0 14px;}' +
      '.wr-btns{display:flex;gap:8px;padding:0 16px;}' +
      '.wr-btn{flex:1;cursor:pointer;border-radius:11px;padding:9px 0;' +
      'font-size:13px;font-weight:600;border:1px solid #d8c49a;' +
      'transition:transform .12s ease,filter .12s ease;}' +
      '.wr-btn:hover{transform:translateY(-1px);filter:brightness(1.04);}' +
      '.wr-snooze{background:#fff;color:#8c6a34;}' +
      '.wr-dismiss{background:linear-gradient(135deg,#6fb7d6,#8a9ce2);color:#fff;border-color:transparent;}' +
      '</style>' +
      '<div class="wr-card" role="dialog" aria-label="喝水提醒">' +
      '<div class="wr-scene">' +
      '<span class="wr-bubble b1">🫧</span><span class="wr-bubble b2">🫧</span><span class="wr-bubble b3">🫧</span>' +
      '<span class="wr-fish">🐟</span>' +
      '<span class="wr-cat">🐱</span>' +
      '<div class="wr-wave"></div>' +
      '</div>' +
      '<div class="wr-body">' +
      '<div class="wr-top"><span class="wr-time" id="wr-time"></span></div>' +
      '<div class="wr-text" id="wr-text"></div>' +
      '</div>' +
      '<div class="wr-btns">' +
      '<button class="wr-btn wr-snooze" id="wr-snooze" type="button">稍后（5 分钟）</button>' +
      '<button class="wr-btn wr-dismiss" id="wr-dismiss" type="button">关闭</button>' +
      '</div></div>';

    // 填充动态文本（用 textContent 避免注入内容被当作 HTML）。
    // 文案每次随机；后台传入的非空 text 优先，否则从本地文案池随机取。
    shadow.getElementById('wr-time').textContent = nowClock();
    shadow.getElementById('wr-text').textContent = pickMessage();

    shadow.getElementById('wr-snooze').addEventListener('click', function () {
      removePanel();
      sendBg('water-snooze');
    });
    shadow.getElementById('wr-dismiss').addEventListener('click', function () {
      removePanel();
      sendBg('water-dismiss');
    });

    (document.body || document.documentElement).appendChild(host);

    if (sound) { playDing(); }
  }

  // 接收后台的渲染指令。
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'water-show') {
      showPanel(msg.text, msg.sound === true);
    }
  });
})();
