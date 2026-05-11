// ============= 入力管理 (ジャイロ + タッチ + キーボード) =============
const Input = {
  steer: 0,       // -1 (左) .. +1 (右)
  accel: false,
  brake: false,
  useItem: false,

  gyroEnabled: false,
  gyroCalibrated: false,
  gyroBaseGamma: 0,

  init() {
    this._bindKeys();
    this._bindTouch();
  },

  _bindKeys() {
    const keys = {};
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      this._updateFromKeys(keys);
      if (e.key === ' ' || e.key.toLowerCase() === 'x') { this.useItem = true; }
    });
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
      this._updateFromKeys(keys);
    });
  },
  _updateFromKeys(keys) {
    if (!this.gyroEnabled) {
      this.steer = (keys['arrowright'] || keys['d'] ? 1 : 0) + (keys['arrowleft'] || keys['a'] ? -1 : 0);
    }
    this.accel = !!(keys['arrowup'] || keys['w']);
    this.brake = !!(keys['arrowdown'] || keys['s']);
  },

  _bindTouch() {
    const accelBtn = document.getElementById('ctrl-accel');
    const brakeBtn = document.getElementById('ctrl-brake');
    const itemBtn = document.getElementById('ctrl-item');

    const setBtn = (btn, prop) => {
      const on = (e) => { e.preventDefault(); this[prop] = true; btn.classList.add('pressed'); };
      const off = (e) => { e.preventDefault(); this[prop] = false; btn.classList.remove('pressed'); };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off, { passive: false });
      btn.addEventListener('touchcancel', off, { passive: false });
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
      btn.addEventListener('mouseleave', off);
    };
    setBtn(accelBtn, 'accel');
    setBtn(brakeBtn, 'brake');

    // アイテムボタンは押した瞬間にフラグ立てるだけ
    const itemOn = (e) => {
      e.preventDefault();
      this.useItem = true;
      itemBtn.classList.add('pressed');
      setTimeout(() => itemBtn.classList.remove('pressed'), 150);
    };
    itemBtn.addEventListener('touchstart', itemOn, { passive: false });
    itemBtn.addEventListener('mousedown', itemOn);
  },

  async enableGyro() {
    // iOS 13+ では明示的に許可を取る必要がある
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      } catch (e) {
        console.warn('gyro permission error', e);
        return false;
      }
    }
    window.addEventListener('deviceorientation', this._onOrient.bind(this));
    this.gyroEnabled = true;
    this.gyroCalibrated = false;
    return true;
  },

  _onOrient(e) {
    // 横画面想定: gamma は -90..90 (端末の左右の傾き)
    // 横画面では beta が左右ハンドルに対応する場合もある（OS/向きで変わる）
    let g = e.gamma || 0;  // 左右の傾き
    let b = e.beta || 0;   // 前後の傾き

    // 横向き状態判定: screen.orientation.angle で 90 or -90 のとき横
    const angle = (screen.orientation && screen.orientation.angle) ||
                  window.orientation || 0;

    let val;
    if (angle === 90) {
      // 横向き(時計回り90度): betaが左右の傾きに対応
      val = b;
    } else if (angle === -90 || angle === 270) {
      val = -b;
    } else {
      // 縦向き保険: gamma使用
      val = g;
    }

    if (!this.gyroCalibrated) {
      this.gyroBaseGamma = val;
      this.gyroCalibrated = true;
    }

    // ±25度を最大ハンドルとする
    const diff = val - this.gyroBaseGamma;
    const max = 25;
    this.steer = Utils.clamp(diff / max, -1, 1);
  },

  // 毎フレーム呼ぶ：useItemフラグをconsume
  consumeItemUse() {
    const v = this.useItem;
    this.useItem = false;
    return v;
  },

  recalibrate() {
    this.gyroCalibrated = false;
  },
};
