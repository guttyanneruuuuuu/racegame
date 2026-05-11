// ============= 入力管理 (ジャイロ + タッチ + キーボード) =============
const Input = {
  steer: 0,       // -1 (左) .. +1 (右)
  accel: false,
  brake: false,
  useItem: false,

  gyroEnabled: false,
  gyroCalibrated: false,
  gyroBase: 0,
  gyroRaw: 0,

  // ジャイロ感度設定 (ローカルストレージ保存)
  // sensitivity: 最大角度 (deg) → ±この角度で steer ±1
  sensitivity: 18,
  deadzone: 1.2,    // 小さな揺らぎを無視 (deg)

  _keys: {},
  _touchSteer: 0,   // タッチハンドルからの入力

  init() {
    // 保存された感度を復元
    const saved = parseFloat(localStorage.getItem('gyrorush-sensitivity'));
    if (!isNaN(saved) && saved > 5 && saved < 60) this.sensitivity = saved;

    this._bindKeys();
    this._bindTouch();
  },

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      this._keys[e.key.toLowerCase()] = true;
      this._updateFromKeys();
      if (e.key === ' ' || e.key.toLowerCase() === 'x') { this.useItem = true; }
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.key.toLowerCase()] = false;
      this._updateFromKeys();
    });
  },
  _updateFromKeys() {
    const keys = this._keys;
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

    const itemOn = (e) => {
      e.preventDefault();
      this.useItem = true;
      itemBtn.classList.add('pressed');
      setTimeout(() => itemBtn.classList.remove('pressed'), 150);
    };
    itemBtn.addEventListener('touchstart', itemOn, { passive: false });
    itemBtn.addEventListener('mousedown', itemOn);

    // タッチハンドル (画面左右ドラッグでも舵を切れるバックアップ)
    this._bindSteerOverlay();
  },

  // 画面左右をドラッグでステアできるオーバーレイ (ジャイロが効かないPC等のバックアップ)
  _bindSteerOverlay() {
    const overlay = document.getElementById('steer-overlay');
    if (!overlay) return;
    let active = false;
    let startX = 0;
    const setSteer = (sx, cx) => {
      const dx = cx - sx;
      const max = Math.min(220, window.innerWidth * 0.25);
      this._touchSteer = Utils.clamp(dx / max, -1, 1);
      if (!this.gyroEnabled) this.steer = this._touchSteer;
    };
    const onStart = (e) => {
      const t = e.touches ? e.touches[0] : e;
      startX = t.clientX;
      active = true;
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!active) return;
      const t = e.touches ? e.touches[0] : e;
      setSteer(startX, t.clientX);
      e.preventDefault();
    };
    const onEnd = (e) => {
      active = false;
      this._touchSteer = 0;
      if (!this.gyroEnabled) this.steer = 0;
    };
    overlay.addEventListener('touchstart', onStart, { passive: false });
    overlay.addEventListener('touchmove', onMove, { passive: false });
    overlay.addEventListener('touchend', onEnd);
    overlay.addEventListener('touchcancel', onEnd);
    overlay.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  },

  async enableGyro() {
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
    let g = e.gamma || 0;  // 左右の傾き
    let b = e.beta || 0;   // 前後の傾き

    // 横向き判定
    let angle = 0;
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      angle = screen.orientation.angle;
    } else {
      angle = window.orientation || 0;
    }

    // 横向き時はbetaが左右ハンドルに対応
    // 縦向きはgamma
    let val;
    if (angle === 90) {
      val = b;
    } else if (angle === -90 || angle === 270) {
      val = -b;
    } else {
      val = g;
    }

    this.gyroRaw = val;

    if (!this.gyroCalibrated) {
      this.gyroBase = val;
      this.gyroCalibrated = true;
    }

    let diff = val - this.gyroBase;
    // デッドゾーン
    if (Math.abs(diff) < this.deadzone) diff = 0;
    else diff -= Math.sign(diff) * this.deadzone;

    // 非線形カーブ(中央付近マイルド、外側強力)
    const norm = Utils.clamp(diff / this.sensitivity, -1.2, 1.2);
    const curved = Math.sign(norm) * Math.pow(Math.min(1, Math.abs(norm)), 1.35);
    // 右傾きで右へ曲がる方向に統一（従来の逆向き設定から変更）
    this.steer = Utils.clamp(curved, -1, 1);
  },

  consumeItemUse() {
    const v = this.useItem;
    this.useItem = false;
    return v;
  },

  recalibrate() {
    this.gyroCalibrated = false;
  },

  setSensitivity(deg) {
    this.sensitivity = Utils.clamp(deg, 6, 50);
    localStorage.setItem('gyrorush-sensitivity', String(this.sensitivity));
  },
};
