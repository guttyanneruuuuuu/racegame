// ============= サウンドFX (WebAudio合成 - ファイル不要) =============
const SFX = {
  ctx: null,
  enabled: true,
  masterGain: null,
  engineNode: null,
  engineGain: null,
  engineFilter: null,
  _muted: false,
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    // ユーザー操作後に AudioContext を作る (iOS制約)
    const tryStart = () => {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
        this._setupEngine();
      } catch (e) {
        console.warn('audio init failed', e);
      }
    };
    // 最初のクリック/タッチで初期化
    const handler = () => {
      tryStart();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
    window.addEventListener('pointerdown', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler);

    // エンジン音更新ループ
    setInterval(() => this._updateEngine(), 50);
  },

  _setupEngine() {
    if (!this.ctx) return;
    // ノコギリ波でエンジン音 → ローパスで丸め
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 90;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 1.2;

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc2.start();

    this.engineOsc = osc;
    this.engineOsc2 = osc2;
    this.engineGain = gain;
    this.engineFilter = filter;
  },

  _updateEngine() {
    if (!this.ctx || !this.engineGain || this._muted) return;
    const car = window.Game && Game.localCar;
    if (!car || Game.state !== 'racing') {
      this.engineGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
      return;
    }
    const sp = Math.abs(car.speed);
    const t = Math.min(1, sp / 60);
    const boost = car.boostTimer > 0 ? 1 : (car.miniTurboTimer > 0 ? 0.5 : 0);
    const target = 0.06 + t * 0.15 + boost * 0.08;
    this.engineGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.05);
    this.engineOsc.frequency.linearRampToValueAtTime(50 + t * 200 + boost * 60, this.ctx.currentTime + 0.05);
    this.engineOsc2.frequency.linearRampToValueAtTime(80 + t * 300 + boost * 80, this.ctx.currentTime + 0.05);
    this.engineFilter.frequency.linearRampToValueAtTime(400 + t * 1800 + boost * 600, this.ctx.currentTime + 0.05);
  },

  play(name) {
    if (!this.ctx || this._muted) return;
    switch (name) {
      case 'go':       return this._beep([880, 1320, 1760], 0.18, 'triangle');
      case 'countdown':return this._beep([660], 0.12, 'triangle');
      case 'boost':    return this._sweep(220, 880, 0.35, 'sawtooth');
      case 'jump':     return this._sweep(180, 700, 0.4, 'sine');
      case 'pickup':   return this._beep([1320, 1760], 0.12, 'square');
      case 'item':     return this._beep([880, 1180], 0.15, 'triangle');
      case 'wall':     return this._noise(0.15, 200);
      case 'bump':     return this._beep([220], 0.08, 'square');
      case 'lightning':return this._sweep(2000, 200, 0.45, 'sawtooth');
      case 'finish':   return this._beep([880, 1100, 1320, 1760], 0.5, 'triangle');
      // ===== 新規アイテム用 SFX =====
      case 'freeze':   return this._sweep(1800, 320, 0.6, 'sine');      // キーンと冷える音
      case 'shockwave':return this._sweep(120, 800, 0.35, 'square');   // ドーンと低音から拡散
      case 'swap':     return this._beep([1320, 660, 1760, 880], 0.18, 'triangle'); // ヒラリヒラリ
      case 'phase':    return this._sweep(440, 1320, 0.32, 'sine');     // 上昇音
      case 'warp':     return this._sweep(880, 2200, 0.25, 'sine');     // ワープ用
    }
  },

  _beep(freqs, dur = 0.15, wave = 'sine') {
    const t0 = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + i * dur);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + i * dur + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i + 1) * dur);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t0 + i * dur);
      osc.stop(t0 + (i + 1) * dur + 0.05);
    });
  },

  _sweep(from, to, dur = 0.3, wave = 'sawtooth') {
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  },

  _noise(dur = 0.15, cutoff = 400) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(filter); filter.connect(g); g.connect(this.masterGain);
    src.start();
  },

  setMuted(m) {
    this._muted = !!m;
    if (this.masterGain) {
      this.masterGain.gain.value = m ? 0 : 0.5;
    }
  },
};

window.SFX = SFX;
