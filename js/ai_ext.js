// ============= AI拡張: 難易度 & パーソナリティ =============
// 既存の AIDriver を書き換えず、init をラップしてスキル/性格を上書きする。
const AIExt = {
  installed: false,
  difficulty: 'normal',  // 'easy' | 'normal' | 'hard' | 'pro'
  personalities: ['balanced', 'aggressive', 'defensive', 'drifter', 'sniper', 'cautious'],

  DIFF_PRESETS: {
    easy:   { skillBase: 0.52, skillRange: 0.18, itemCD: [3.4, 5.2], lookaheadBase: 3, lookaheadMax: 9,  steerGain: 1.55, accelTurnLimit: 0.98, brakeTurnLimit: 1.18, brakeSpeedMin: 21, catchupSpeed: 18, avoidRange: 6.2, avoidStrength: 0.72, itemAggro: 0.9,  errorChance: 0.06 },
    normal: { skillBase: 0.72, skillRange: 0.16, itemCD: [2.4, 4.0], lookaheadBase: 4, lookaheadMax: 11, steerGain: 1.85, accelTurnLimit: 1.08, brakeTurnLimit: 1.36, brakeSpeedMin: 26, catchupSpeed: 13, avoidRange: 5.5, avoidStrength: 0.6,  itemAggro: 1.0,  errorChance: 0.025 },
    hard:   { skillBase: 0.87, skillRange: 0.08, itemCD: [1.7, 3.0], lookaheadBase: 5, lookaheadMax: 13, steerGain: 2.1,  accelTurnLimit: 1.24, brakeTurnLimit: 1.58, brakeSpeedMin: 31, catchupSpeed: 10, avoidRange: 4.8, avoidStrength: 0.52, itemAggro: 1.12, errorChance: 0.008 },
    pro:    { skillBase: 0.96, skillRange: 0.03, itemCD: [1.0, 1.9], lookaheadBase: 6, lookaheadMax: 15, steerGain: 2.4,  accelTurnLimit: 1.34, brakeTurnLimit: 1.72, brakeSpeedMin: 34, catchupSpeed: 8,  avoidRange: 4.1, avoidStrength: 0.42, itemAggro: 1.25, errorChance: 0.0015 },
  },

  install() {
    if (this.installed || typeof AIDriver === 'undefined') return;
    this.installed = true;

    // 設定からの読込
    try {
      const saved = localStorage.getItem('gr_ai_difficulty') || localStorage.getItem('gyrorush-difficulty');
      if (saved && this.DIFF_PRESETS[saved]) this.difficulty = saved;
    } catch (_) {}

    const origInit = AIDriver.init.bind(AIDriver);
    AIDriver.init = (carId) => {
      origInit(carId);
      const st = AIDriver.states.get(carId);
      if (!st) return;
      const preset = this.DIFF_PRESETS[this.difficulty];
      this._applyPreset(st, preset);
      // ランダムにパーソナリティ
      st.personality = this.personalities[Math.floor(Math.random() * this.personalities.length)];
      // 性格による微調整
      this._applyPersonalityTuning(st);
    };

    // update をラップ: パーソナリティに応じてラインオフセットを動的に変化
    const origUpdate = AIDriver.update.bind(AIDriver);
    AIDriver.update = (car, dt, allCars) => {
      const st = AIDriver.states.get(car.id);
      if (st && st.personality) {
        this._pulsePersonality(st, car, dt, allCars);
      }
      return origUpdate(car, dt, allCars);
    };
  },

  setDifficulty(d) {
    if (!this.DIFF_PRESETS[d]) return;
    this.difficulty = d;
    try {
      localStorage.setItem('gr_ai_difficulty', d);
      localStorage.setItem('gyrorush-difficulty', d);
    } catch (_) {}
    // 既存AIにも再適用
    for (const [id, st] of AIDriver.states) {
      const preset = this.DIFF_PRESETS[d];
      this._applyPreset(st, preset);
    }
  },

  _applyPreset(st, preset) {
    st.skill = preset.skillBase + Math.random() * preset.skillRange;
    st.itemCooldown = preset.itemCD[0] + Math.random() * (preset.itemCD[1] - preset.itemCD[0]);
    st.lookaheadBase = preset.lookaheadBase;
    st.lookaheadMax = preset.lookaheadMax;
    st.steerGain = preset.steerGain;
    st.accelTurnLimit = preset.accelTurnLimit;
    st.brakeTurnLimit = preset.brakeTurnLimit;
    st.brakeSpeedMin = preset.brakeSpeedMin;
    st.catchupSpeed = preset.catchupSpeed;
    st.avoidRange = preset.avoidRange;
    st.avoidStrength = preset.avoidStrength;
    st.itemAggro = preset.itemAggro;
    st.errorChance = preset.errorChance;
  },

  _applyPersonalityTuning(st) {
    switch (st.personality) {
      case 'aggressive':
        st.laneOffset = (Math.random() - 0.5) * 0.2; // インを攻める
        st.skill = Math.min(1.0, st.skill + 0.05);
        st.itemCooldown *= 0.6;
        st.itemAggro *= 1.12;
        break;
      case 'defensive':
        st.laneOffset = (Math.random() - 0.5) * 0.8;
        st.skill = Math.max(0.4, st.skill - 0.05);
        st.itemCooldown *= 1.2;
        st.brakeTurnLimit = Math.max(1.0, st.brakeTurnLimit - 0.1);
        break;
      case 'drifter':
        st.laneOffset = (Math.random() - 0.5) * 0.9;
        st.driftBias = 0.6;
        st.steerGain += 0.1;
        break;
      case 'sniper':
        st.itemCooldown *= 0.9;
        st.snipeMode = true;
        st.itemAggro *= 1.08;
        break;
      case 'cautious':
        st.skill = Math.max(0.5, st.skill - 0.1);
        st.itemCooldown *= 1.5;
        st.errorChance *= 0.8;
        break;
      default:
        break;
    }
  },

  _pulsePersonality(st, car, dt, allCars) {
    // 走行中の微妙な行動変化
    st._pulse = (st._pulse || 0) + dt;
    if (st._pulse > 4 + Math.random() * 4) {
      st._pulse = 0;
      // ラインを若干変える(キャラ性を出す)
      const amp = st.personality === 'drifter' ? 0.9 : 0.6;
      st.laneOffset = Utils.clamp(st.laneOffset + (Math.random() - 0.5) * 0.4, -amp/2, amp/2);
    }
  },
};
