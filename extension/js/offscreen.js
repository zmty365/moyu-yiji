// 喝水提醒 · 离屏音频脚本（运行在 offscreen.html 中）
//
// 收到后台 water-reminder.js 发来的 { target:'offscreen', type:'water-ding' } 消息后，
// 用 WebAudio 合成极短「叮咚」（< 0.5s）。offscreen document 以 AUDIO_PLAYBACK 理由创建，
// 不受宿主网页「需用户手势才能播放」的自动播放策略限制，因此提醒音可稳定发声。
(function () {
  'use strict';

  var ctx = null; // 复用同一个 AudioContext，避免频繁创建

  function getCtx() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { return null; }
    if (!ctx) { ctx = new Ctx(); }
    return ctx;
  }

  // 合成「叮—咚」双音：880Hz → 1174.66Hz，清亮明显。
  function ding() {
    var c = getCtx();
    if (!c) { return; }
    var run = function () {
      var t0 = c.currentTime;
      var freqs = [880, 1174.66];
      freqs.forEach(function (f, i) {
        var start = t0 + i * 0.14;
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(start);
        osc.stop(start + 0.24);
      });
    };
    // offscreen 场景下一般允许直接播放；若仍被挂起则尝试 resume 后再播。
    if (c.state === 'suspended' && c.resume) {
      c.resume().then(run).catch(function () { /* 忽略 */ });
    } else {
      run();
    }
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.target === 'offscreen' && msg.type === 'water-ding') {
      ding();
    }
  });
})();
