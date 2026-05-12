// ============= 入力管理 (ジャイロ + タッチ + キーボード) =============
const Input = {
  steer: 0,
  accel: false,
  brake: false,
  useItem: false,
  lookBack: false,    // 後方視点 (タップで)

  gyroEnabled: false,
  gyroCalibrated: false,
  gyroBase: 0,
  gyroRaw: 0,
  gyroLastSampleTime: 0,
  gyroSamples: [],     // 自動キャリブレーション用に最初の数サンプルを記録
  _smoothed: 0,        // ローパスフィルタ後
  _gyroOrientHandler: null,
  _fallbackLandscapeSign: 1,

  // ジャイロ感度設定
  sensitivity: 18,
  deadzone: 1.5,
  invert: false,

  // タッチハンドル/ボタン押下
  _keys: {},
  _keySteer: 0,
  _touchSteer: 0,
  _touchSteerActive: false,

  init() {
    const saved = parseFloat(localStorage.getItem('gyrorush-sensitivity'));
    if (!isNaN(saved) && saved > 5 && saved < 60) this.sensitivity = saved;
    const invSaved = localStorage.getItem('gyrorush-invert');
    if (invSaved === '1') this.invert = true;

    this._bindKeys();
    this._bindTouch();
    this._setupAutoCalibrate();
  },

  // ゲーム開始直後に自動キャリブレーション
  autoCalibrateOnStart() {
    this.gyroCalibrated = false;
    this.gyroSamples = [];
    this.gyroLastSampleTime = 0;
    this._smoothed = 0;
    this._fallbackLandscapeSign = 1;
  },

  _setupAutoCalibrate() {
    // 画面の向きが変わったら再キャリブ
    if (screen.orientation) {
      try {
        screen.orientation.addEventListener('change', () => {
          this.gyroCalibrated = false;
          this.gyroSamples = [];
          this.gyroLastSampleTime = 0;
          this._smoothed = 0;
          this._fallbackLandscapeSign = 1;
        });
      } catch (_) {}
    }
    window.addEventListener('orientationchange', () => {
      this.gyroCalibrated = false;
      this.gyroSamples = [];
      this.gyroLastSampleTime = 0;
      this._smoothed = 0;
      this._fallbackLandscapeSign = 1;
    });
  },

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      this._keys[e.key.toLowerCase()] = true;
      this._updateFromKeys();
      if (e.key === ' ' || e.key.toLowerCase() === 'x') { this.useItem = true; }
      if (e.key.toLowerCase() === 'r') {
        // R: マニュアル復活
        if (Game && Game.localCar && !Game.localCar.finished) Game.localCar.respawn();
      }
      if (e.key.toLowerCase() === 'c') {
        // C: 後方視点 トグル
        this.lookBack = !this.lookBack;
      }
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.key.toLowerCase()] = false;
      this._updateFromKeys();
    });
  },
  _updateFromKeys() {
    const keys = this._keys;
    if (!this.gyroEnabled && !this._touchSteerActive) {
      this._keySteer = (keys['arrowright'] || keys['d'] ? 1 : 0) + (keys['arrowleft'] || keys['a'] ? -1 : 0);
    }
    this.accel = !!(keys['arrowup'] || keys['w']);
    this.brake = !!(keys['arrowdown'] || keys['s']);
  },

  _bindTouch() {
    const accelBtn = document.getElementById('ctrl-accel');
    const brakeBtn = document.getElementById('ctrl-brake');
    const itemBtn = document.getElementById('ctrl-item');

    const setBtn = (btn, prop) => {
      if (!btn) return;
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

    if (itemBtn) {
      const itemOn = (e) => {
        e.preventDefault();
        this.useItem = true;
        itemBtn.classList.add('pressed');
        setTimeout(() => itemBtn.classList.remove('pressed'), 150);
      };
      itemBtn.addEventListener('touchstart', itemOn, { passive: false });
      itemBtn.addEventListener('mousedown', itemOn);
    }

    // 後方視点ボタン
    const lookBtn = document.getElementById('ctrl-look');
    if (lookBtn) {
      const on = (e) => { e.preventDefault(); this.lookBack = true; lookBtn.classList.add('pressed'); };
      const off = (e) => { e.preventDefault(); this.lookBack = false; lookBtn.classList.remove('pressed'); };
      lookBtn.addEventListener('touchstart', on, { passive: false });
      lookBtn.addEventListener('touchend', off, { passive: false });
      lookBtn.addEventListener('touchcancel', off, { passive: false });
      lookBtn.addEventListener('mousedown', on);
      lookBtn.addEventListener('mouseup', off);
      lookBtn.addEventListener('mouseleave', off);
    }

    // 復活ボタン
    const respawnBtn = document.getElementById('ctrl-respawn');
    if (respawnBtn) {
      const on = (e) => {
        e.preventDefault();
        if (Game && Game.localCar && !Game.localCar.finished) {
          Game.localCar.respawn();
          if (typeof showToast === 'function') showToast('🔄 復帰！', 800);
        }
      };
      respawnBtn.addEventListener('touchstart', on, { passive: false });
      respawnBtn.addEventListener('mousedown', on);
    }

    this._bindSteerOverlay();
  },

  _bindSteerOverlay() {
    const overlay = document.getElementById('steer-overlay');
    if (!overlay) return;
    let active = false;
    const setSteer = (cx) => {
      const dx = cx - window.innerWidth * 0.5;
      const max = Math.min(260, window.innerWidth * 0.28);
      const raw = Utils.clamp(dx / max, -1, 1);
      const deadzone = 0.06;
      if (Math.abs(raw) <= deadzone) {
        this._touchSteer = 0;
        return;
      }
      const eased = (Math.abs(raw) - deadzone) / (1 - deadzone);
      this._touchSteer = Math.sign(raw) * Math.pow(eased, 0.85);
    };
    const onStart = (e) => {
      const t = e.touches ? e.touches[0] : e;
      active = true;
      this._touchSteerActive = true;
      setSteer(t.clientX);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!active) return;
      const t = e.touches ? e.touches[0] : e;
      setSteer(t.clientX);
      e.preventDefault();
    };
    const onEnd = (e) => {
      active = false;
      this._touchSteer = 0;
      this._touchSteerActive = false;
    };
    overlay.addEventListener('touchstart', onStart, { passive: false });
    overlay.addEventListener('touchmove', onMove, { passive: false });
    overlay.addEventListener('touchend', onEnd);
    overlay.addEventListener('touchcancel', onEnd);
    overlay.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  },

  update(dt) {
    if (this.gyroEnabled) return;
    const target = this._touchSteerActive ? this._touchSteer : this._keySteer;
    // 戻し: 速く中央へ / 切り込み: 適度に追従 (応答性アップ)
    const response = target === 0 ? 22 : 18;
    const alpha = Utils.clamp(dt * response, 0.28, 0.85);
    this.steer = Utils.lerp(this.steer, target, alpha);
    if (Math.abs(this.steer) < 0.001 && target === 0) this.steer = 0;
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
    if (!this._gyroOrientHandler) this._gyroOrientHandler = this._onOrient.bind(this);
    window.removeEventListener('deviceorientation', this._gyroOrientHandler);
    window.addEventListener('deviceorientation', this._gyroOrientHandler);
    this.gyroEnabled = true;
    this.gyroCalibrated = false;
    this.gyroSamples = [];
    this.gyroLastSampleTime = 0;
    this._smoothed = 0;
    this._fallbackLandscapeSign = 1;
    return true;
  },

  _onOrient(e) {
    let g = e.gamma || 0;
    let b = e.beta || 0;

    let angle = 0;
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      angle = screen.orientation.angle;
    } else {
      angle = window.orientation || 0;
    }
    const normAngle = ((angle % 360) + 360) % 360;
    const orientationType = (screen.orientation && screen.orientation.type) ? screen.orientation.type : '';
    const fallbackLandscape = normAngle !== 90 && normAngle !== 270 &&
      ((orientationType && orientationType.startsWith('landscape')) || window.innerWidth > window.innerHeight);

    // 横向き時はbetaが左右ハンドル, 縦向きはgamma
    let val;
    if (normAngle === 90) {
      val = b;
    } else if (normAngle === 270) {
      val = -b;
    } else if (fallbackLandscape) {
      // 一部端末でangleが0固定でも、横向き表示ならbeta系を使う
      // 符号はイベントごとに反転させず、向き推定結果を固定して急反転を防ぐ
      if (orientationType.includes('secondary')) this._fallbackLandscapeSign = -1;
      else if (orientationType.includes('primary')) this._fallbackLandscapeSign = 1;
      else if (Math.abs(g) > 8) this._fallbackLandscapeSign = g >= 0 ? 1 : -1;
      val = b * this._fallbackLandscapeSign;
    } else {
      val = g;
    }

    this.gyroRaw = val;

    // 自動キャリブレーション: 最初の20サンプルを平均して基準にする
    if (!this.gyroCalibrated) {
      this.gyroSamples.push(val);
      if (this.gyroSamples.length >= 20) {
        let avg = 0;
        for (const s of this.gyroSamples) avg += s;
        this.gyroBase = avg / this.gyroSamples.length;
        this.gyroCalibrated = true;
        this.gyroSamples = [];
      } else {
        this.gyroBase = val;
      }
    }

    let diff = val - this.gyroBase;
    // ゆっくり基準を追従して、長時間プレイ時のドリフトを抑える
    if (this.gyroCalibrated && Math.abs(diff) < this.deadzone * 2.5) {
      this.gyroBase = Utils.lerp(this.gyroBase, val, 0.015);
      diff = val - this.gyroBase;
    }
    // デッドゾーン
    if (Math.abs(diff) < this.deadzone) diff = 0;
    else diff -= Math.sign(diff) * this.deadzone;

    // 非線形カーブ
    const norm = Utils.clamp(diff / this.sensitivity, -1.2, 1.2);
    // 中央付近を柔らかく、外側を強力に
    const curved = Math.sign(norm) * Math.pow(Math.min(1, Math.abs(norm)), 1.30);
    let target = -Utils.clamp(curved, -1, 1);
    if (this.invert) target = -target;

    // ローパスフィルタ (スムージング: 過剰反応抑制)
    const now = performance.now();
    const dt = this.gyroLastSampleTime ? (now - this.gyroLastSampleTime) / 1000 : 0.016;
    this.gyroLastSampleTime = now;
    const alpha = Utils.clamp(dt * 18, 0.25, 0.65);  // フレームレート依存だが応答性も保つ
    this._smoothed = Utils.lerp(this._smoothed, target, alpha);
    this.steer = this._smoothed;
  },

  consumeItemUse() {
    const v = this.useItem;
    this.useItem = false;
    return v;
  },

  recalibrate() {
    this.gyroCalibrated = false;
    this.gyroSamples = [];
    this.gyroLastSampleTime = 0;
    this._smoothed = 0;
    this._fallbackLandscapeSign = 1;
  },

  setSensitivity(deg) {
    this.sensitivity = Utils.clamp(deg, 6, 50);
    localStorage.setItem('gyrorush-sensitivity', String(this.sensitivity));
  },

  setInvert(v) {
    this.invert = !!v;
    localStorage.setItem('gyrorush-invert', this.invert ? '1' : '0');
  },
};
