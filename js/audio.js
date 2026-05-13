// ============= 効果音(WebAudio合成) =============
// 軽量化のため、ファイル無しで合成音だけで効果音を鳴らす
const Audio2 = {
  ctx: null,
  vol: 0.7,
  enabled: true,

  init() {
    try { this.vol = parseFloat(localStorage.getItem('gr-sfx') || '0.7'); } catch(_){}
    // ユーザー操作後に初期化（モバイル対策）
    const start = () => {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(_) {}
      }
      window.removeEventListener('touchstart', start);
      window.removeEventListener('click', start);
    };
    window.addEventListener('touchstart', start, { once: true });
    window.addEventListener('click', start, { once: true });
  },

  setVolume(v) {
    this.vol = Utils.clamp(v, 0, 1);
    try { localStorage.setItem('gr-sfx', String(this.vol)); } catch(_){}
  },

  _osc(freq, dur, type = 'square', vol = 0.3) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol * this.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  },

  _sweep(f0, f1, dur, type = 'sawtooth', vol = 0.3) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol * this.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  },

  _noise(dur, vol = 0.2, freq = 800) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol * this.vol;
    src.connect(filter); filter.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + dur);
  },

  // ----- 効果音バリエーション -----
  beep() { this._osc(880, 0.08, 'square', 0.3); },
  go() { this._osc(1320, 0.25, 'square', 0.4); },
  boost() { this._sweep(300, 900, 0.35, 'sawtooth', 0.35); },
  miniTurbo(lv) {
    const f = [0, 600, 800, 1100][lv] || 600;
    this._sweep(f, f * 2, 0.35, 'square', 0.32);
  },
  coin() { this._osc(1200, 0.06, 'square', 0.25); setTimeout(() => this._osc(1600, 0.08, 'square', 0.25), 60); },
  item() { this._sweep(400, 900, 0.18, 'square', 0.3); },
  rocket() { this._sweep(600, 200, 0.5, 'sawtooth', 0.3); },
  banana() { this._osc(140, 0.4, 'sine', 0.3); },
  lightning() { this._noise(0.3, 0.3, 2000); },
  shield() { this._sweep(800, 1600, 0.25, 'triangle', 0.3); },
  hit() { this._noise(0.2, 0.35, 300); },
  lap() { this._osc(1320, 0.1, 'square', 0.3); setTimeout(() => this._osc(1760, 0.15, 'square', 0.3), 100); },
  finish() {
    this._osc(880, 0.12, 'square', 0.3);
    setTimeout(() => this._osc(1100, 0.12, 'square', 0.3), 130);
    setTimeout(() => this._osc(1320, 0.12, 'square', 0.3), 260);
    setTimeout(() => this._osc(1760, 0.25, 'square', 0.35), 390);
  },
  jump() { this._sweep(400, 800, 0.18, 'sine', 0.3); },
  land() { this._noise(0.12, 0.25, 200); },
};
