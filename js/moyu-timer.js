// 摸鱼计时器状态机。
// 使用"累计秒数 + 状态 + 状态起点时间戳"建模，而非单纯依赖 setInterval 计数，
// 这样即使回调被浏览器节流，金额仍按真实流逝时间计算，保证金额无 NaN、暂停恢复精确。
(function (global) {
  'use strict';

  // 状态常量：空闲 / 进行中 / 已暂停。
  var IDLE = 'idle';
  var RUNNING = 'running';
  var PAUSED = 'paused';

  // 回调事件名，方便装配层监听统一的状态变化。
  var CHANGE = 'change';

  function MoyuTimer() {
    // 时薪（元/时），由外部校验后写入，模块自身不负责输入校验。
    this.hourlyRate = 0;
    // running 状态下用于计算当前累计值的基准秒数（相对上一次开始/继续的时刻）。
    this.accSeconds = 0;
    // 当前状态。
    this.status = IDLE;
    // 仅 running 时有效：本次计时段开始的时间戳（ms）。
    this.startAt = null;
    // 监听器集合。
    this._listeners = [];
  }

  // 订阅状态变化回调，返回退订函数。
  MoyuTimer.prototype.onChange = function (fn) {
    this._listeners.push(fn);
    var self = this;
    return function () {
      var i = self._listeners.indexOf(fn);
      if (i >= 0) {
        self._listeners.splice(i, 1);
      }
    };
  };

  // 内部通知所有监听器。
  MoyuTimer.prototype._emit = function () {
    var listeners = this._listeners.slice();
    for (var i = 0; i < listeners.length; i++) {
      listeners[i](this);
    }
  };

  // 当前已累计秒数（浮点）。running 状态叠加本次计时段，以真实时间戳差分计算。
  MoyuTimer.prototype.getSeconds = function () {
    var total = this.accSeconds;
    if (this.status === RUNNING && this.startAt !== null) {
      total = this.accSeconds + (Date.now() - this.startAt) / 1000;
    }
    return total;
  };

  // 已摸鱼金额（元）。safeToFixed 避免出现 NaN 或超长小数。
  MoyuTimer.prototype.getAmount = function () {
    var seconds = this.getSeconds();
    var amount = (this.hourlyRate * seconds) / 3600;
    if (!isFinite(amount) || amount < 0) {
      // 防御：非法时薪或异常状态保证不产出 NaN/负数金额。
      return 0;
    }
    // 截断到分，避免浮点误差引起的显示抖动。
    return Math.floor(amount * 100) / 100;
  };

  // 开始：仅允许从空闲或已暂停进入。传入的 rate 覆盖时薪。
  MoyuTimer.prototype.start = function (rate) {
    if (this.status === RUNNING) {
      return false;
    }
    if (typeof rate === 'number' && isFinite(rate)) {
      this.hourlyRate = rate;
    }
    this.startAt = Date.now();
    this.status = RUNNING;
    this._emit();
    return true;
  };

  // 暂停：冻结当前累计，之后恢复从此继续。
  MoyuTimer.prototype.pause = function () {
    if (this.status !== RUNNING) {
      return false;
    }
    this.accSeconds = this.getSeconds();
    this.startAt = null;
    this.status = PAUSED;
    this._emit();
    return true;
  };

  // 继续：从已暂停状态恢复计时（不重置累计）。
  MoyuTimer.prototype.resume = function () {
    if (this.status !== PAUSED) {
      return false;
    }
    this.startAt = Date.now();
    this.status = RUNNING;
    this._emit();
    return true;
  };

  // 重置：清零累计并回到空闲，但保留时薪输入（由外部决定是否同时清空输入框）。
  MoyuTimer.prototype.reset = function () {
    this.accSeconds = 0;
    this.startAt = null;
    this.status = IDLE;
    this._emit();
    return true;
  };

  // 暴露给浏览器全局。
  global.MoyuTimer = MoyuTimer;
})(window);
