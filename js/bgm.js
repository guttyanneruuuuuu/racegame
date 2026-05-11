// ============= BGM システム (WebAudio合成によるループ音楽) =============
// 既存の SFX.js を補完: 複数トラックのBGM、音量分離、環境音
const BGM = {
  ctx: null,
  gain: null,
  envGain: null,         // 環境音ゲイン
  bgmGain: null,         // BGM ゲイン
  current: null,         // 現在再生中のBGM ID
  nodes: [],             // 現在のBGMが生成したノード一覧 (停止用)
  envNodes: [],          // 環境音ノード
  _started: false,
  bgmVolume: 0.35,
  envVolume: 0.25,
  sfxVolume: 0.5,        // SFXに渡す音量(参照のみ)
  muted: false,

  // 利用可能なBGM
  TRACKS: ['menu', 'race', 'finalLap', 'victory'],

  init(sfxCtx) {
    // SFXと同じAudioContextを共有 (iOS制約対策)
    this.ctx = sfxCtx;
    if (!this.ctx) return;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.muted ? 0 : 1;
    this.gain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmVolume;
    this.bgmGain.connect(this.gain);

    this.envGain = this.ctx.createGain();
    this.envGain.gain.value = this.envVolume;
    this.envGain.connect(this.gain);

    // 設定の読み込み
    const bv = parseFloat(localStorage.getItem('gyrorush-bgm-vol'));
    if (!isNaN(bv)) this.setBgmVolume(bv);
    const ev = parseFloat(localStorage.getItem('gyrorush-env-vol'));
    if (!isNaN(ev)) this.setEnvVolume(ev);

    this._started = true;
  },

  setMuted(m) {
    this.muted = !!m;
    if (this.gain) this.gain.gain.value = m ? 0 : 1;
  },

  setBgmVolume(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmGain) this.bgmGain.gain.value = this.bgmVolume;
    localStorage.setItem('gyrorush-bgm-vol', String(this.bgmVolume));
  },

  setEnvVolume(v) {
    this.envVolume = Math.max(0, Math.min(1, v));
    if (this.envGain) this.envGain.gain.value = this.envVolume;
    localStorage.setItem('gyrorush-env-vol', String(this.envVolume));
  },

  // === BGM 再生 ===
  play(id) {
    if (!this._started || !this.ctx) return;
    if (this.current === id) return;
    this.stop();
    this.current = id;
    switch (id) {
      case 'menu': this._playMenu(); break;
      case 'race': this._playRace(); break;
      case 'finalLap': this._playFinalLap(); break;
      case 'victory': this._playVictory(); break;
    }
  },

  stop() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    for (const n of this.nodes) {
      try {
        if (n.gain) n.gain.gain.cancelScheduledValues(now);
        if (n.gain) n.gain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
        if (n.osc && n.osc.stop) n.osc.stop(now + 0.5);
      } catch (_) {}
    }
    setTimeout(() => { this.nodes = []; }, 600);
    this.current = null;
  },

  // メニュー BGM: 軽快なシンセループ
  _playMenu() {
    const ctx = this.ctx;
    // 三和音とベース
    const melody = [
      [523, 0.25], [659, 0.25], [784, 0.25], [1046, 0.25],
      [784, 0.25], [659, 0.25], [523, 0.5],
      [659, 0.25], [784, 0.25], [880, 0.25], [1046, 0.25],
      [880, 0.5], [659, 0.5],
    ];
    this._loopMelody(melody, 'triangle', 0.18);
    this._loopBass([130, 130, 196, 130, 165, 165, 196, 165], 0.15);
  },

  // レース BGM: アップテンポでロック調
  _playRace() {
    const melody = [
      [392, 0.2], [523, 0.2], [659, 0.2], [523, 0.2],
      [587, 0.2], [698, 0.2], [880, 0.4],
      [784, 0.2], [659, 0.2], [523, 0.2], [659, 0.2],
      [587, 0.2], [523, 0.2], [392, 0.4],
    ];
    this._loopMelody(melody, 'square', 0.14);
    this._loopBass([98, 98, 130, 98, 110, 110, 147, 130], 0.18);
    this._loopDrums();
  },

  // ファイナルラップ: 緊迫感のあるテンポアップ
  _playFinalLap() {
    const melody = [
      [880, 0.15], [1046, 0.15], [1175, 0.15], [1046, 0.15],
      [880, 0.15], [988, 0.15], [880, 0.3],
      [784, 0.15], [880, 0.15], [988, 0.15], [880, 0.15],
      [1046, 0.3], [880, 0.3],
    ];
    this._loopMelody(melody, 'sawtooth', 0.12);
    this._loopBass([130, 165, 196, 165, 147, 175, 220, 196], 0.16);
    this._loopDrums(true);
  },

  // 勝利ファンファーレ (1回再生)
  _playVictory() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const notes = [
      [523, 0, 0.2], [659, 0.2, 0.2], [784, 0.4, 0.2], [1046, 0.6, 0.4],
      [988, 1.0, 0.2], [1046, 1.2, 0.6],
      [1318, 1.85, 0.8],
    ];
    for (const [f, t, d] of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.exponentialRampToValueAtTime(0.32, t0 + t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + d);
      osc.connect(g);
      g.connect(this.bgmGain);
      osc.start(t0 + t);
      osc.stop(t0 + t + d + 0.05);
      this.nodes.push({ osc, gain: g });
    }
  },

  _loopMelody(melody, wave, vol) {
    const ctx = this.ctx;
    if (!ctx) return;
    // ループ長を計算
    let total = 0;
    for (const [, d] of melody) total += d;
    let t = ctx.currentTime + 0.1;
    const playOnce = (startT) => {
      let tt = startT;
      for (const [f, d] of melody) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(vol, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + d * 0.9);
        osc.connect(g);
        g.connect(this.bgmGain);
        osc.start(tt);
        osc.stop(tt + d + 0.02);
        this.nodes.push({ osc, gain: g });
        tt += d;
      }
    };
    // 8回分先までスケジュール; 周期的に補充
    for (let i = 0; i < 4; i++) playOnce(t + total * i);
    const restart = setInterval(() => {
      if (this.current !== this._scheduledId) {
        clearInterval(restart);
        return;
      }
      playOnce(this.ctx.currentTime + 0.05);
    }, total * 1000);
    this._scheduledId = this.current;
    this._intervals = this._intervals || [];
    this._intervals.push(restart);
  },

  _loopBass(notes, vol) {
    const ctx = this.ctx;
    if (!ctx) return;
    const noteDur = 0.25;
    const total = notes.length * noteDur;
    const playOnce = (startT) => {
      let tt = startT;
      for (const f of notes) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(vol, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + noteDur * 0.85);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.bgmGain);
        osc.start(tt);
        osc.stop(tt + noteDur + 0.02);
        this.nodes.push({ osc, gain: g });
        tt += noteDur;
      }
    };
    for (let i = 0; i < 4; i++) playOnce(ctx.currentTime + 0.1 + total * i);
    const restart = setInterval(() => {
      if (!this.current) { clearInterval(restart); return; }
      playOnce(this.ctx.currentTime + 0.05);
    }, total * 1000);
    this._intervals = this._intervals || [];
    this._intervals.push(restart);
  },

  _loopDrums(fast = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    const pattern = fast ?
      [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,1,1,1] :
      [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,1];
    const dur = fast ? 0.12 : 0.16;
    const total = pattern.length * dur;
    const playOnce = (startT) => {
      let tt = startT;
      for (const hit of pattern) {
        if (hit) {
          // キック (ノイズ + 短いサイン)
          const sr = ctx.sampleRate;
          const buf = ctx.createBuffer(1, Math.floor(sr * 0.04), sr);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const filt = ctx.createBiquadFilter();
          filt.type = 'lowpass';
          filt.frequency.value = 180;
          const g = ctx.createGain();
          g.gain.value = 0.18;
          src.connect(filt); filt.connect(g); g.connect(this.bgmGain);
          src.start(tt);
          this.nodes.push({ osc: src, gain: g });
        }
        tt += dur;
      }
    };
    for (let i = 0; i < 4; i++) playOnce(ctx.currentTime + 0.1 + total * i);
    const restart = setInterval(() => {
      if (!this.current) { clearInterval(restart); return; }
      playOnce(this.ctx.currentTime + 0.05);
    }, total * 1000);
    this._intervals = this._intervals || [];
    this._intervals.push(restart);
  },

  stopAll() {
    if (this._intervals) {
      for (const i of this._intervals) clearInterval(i);
      this._intervals = [];
    }
    this.stop();
  },

  // === 環境音: 観客の歓声(レース中持続) ===
  startCrowd() {
    if (!this.ctx || !this.envGain) return;
    if (this._crowdSrc) return;
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 4, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // ピンクノイズ風: ゆらぎ追加
      const env = 0.5 + 0.5 * Math.sin(i * 0.0003) + 0.2 * Math.sin(i * 0.0021);
      data[i] = (Math.random() * 2 - 1) * 0.25 * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 800;
    filt.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(filt); filt.connect(g); g.connect(this.envGain);
    src.start();
    this._crowdSrc = src;
    this._crowdGain = g;
    this.envNodes.push(src);
  },

  // 大歓声(逆転やゴール時)
  cheer() {
    if (!this._crowdGain) return;
    const now = this.ctx.currentTime;
    this._crowdGain.gain.cancelScheduledValues(now);
    this._crowdGain.gain.linearRampToValueAtTime(1.5, now + 0.1);
    this._crowdGain.gain.linearRampToValueAtTime(0.5, now + 1.8);
  },

  stopCrowd() {
    for (const n of this.envNodes) {
      try { n.stop(); } catch (_) {}
    }
    this.envNodes = [];
    this._crowdSrc = null;
    this._crowdGain = null;
  },
};
window.BGM = BGM;
