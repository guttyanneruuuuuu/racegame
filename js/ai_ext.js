// ============= AI拡張: 難易度 & パーソナリティ =============
// 既存の AIDriver を書き換えず、init をラップしてスキル/性格を上書きする。
const AIExt = {
  installed: false,
  difficulty: 'normal',  // 'easy' | 'normal' | 'hard' | 'extreme'
  personalities: ['balanced', 'aggressive', 'defensive', 'drifter', 'sniper', 'cautious'],

  DIFF_PRESETS: {
    easy:    { skillBase: 0.55, skillRange: 0.20, itemCD: [3.0, 5.0] },
    normal:  { skillBase: 0.72, skillRange: 0.20, itemCD: [2.5, 4.5] },
    hard:    { skillBase: 0.85, skillRange: 0.13, itemCD: [1.8, 3.5] },
    extreme: { skillBase: 0.94, skillRange: 0.06, itemCD: [1.2, 2.8] },
  },

  install() {
    if (this.installed || typeof AIDriver === 'undefined') return;
    this.installed = true;

    // 設定からの読込
    try {
      const saved = localStorage.getItem('gr_ai_difficulty');
      if (saved && this.DIFF_PRESETS[saved]) this.difficulty = saved;
    } catch (_) {}

    const origInit = AIDriver.init.bind(AIDriver);
    AIDriver.init = (carId) => {
      origInit(carId);
      const st = AIDriver.states.get(carId);
      if (!st) return;
      const preset = this.DIFF_PRESETS[this.difficulty];
      st.skill = preset.skillBase + Math.random() * preset.skillRange;
      st.itemCooldown = preset.itemCD[0] + Math.random() * (preset.itemCD[1] - preset.itemCD[0]);
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
    try { localStorage.setItem('gr_ai_difficulty', d); } catch (_) {}
    // 既存AIにも再適用
    for (const [id, st] of AIDriver.states) {
      const preset = this.DIFF_PRESETS[d];
      st.skill = preset.skillBase + Math.random() * preset.skillRange;
    }
  },

  _applyPersonalityTuning(st) {
    switch (st.personality) {
      case 'aggressive':
        st.laneOffset = (Math.random() - 0.5) * 0.2; // インを攻める
        st.skill = Math.min(1.0, st.skill + 0.05);
        st.itemCooldown *= 0.6;
        break;
      case 'defensive':
        st.laneOffset = (Math.random() - 0.5) * 0.8;
        st.skill = Math.max(0.4, st.skill - 0.05);
        st.itemCooldown *= 1.2;
        break;
      case 'drifter':
        st.laneOffset = (Math.random() - 0.5) * 0.9;
        st.driftBias = 0.6;
        break;
      case 'sniper':
        st.itemCooldown *= 0.9;
        st.snipeMode = true;
        break;
      case 'cautious':
        st.skill = Math.max(0.5, st.skill - 0.1);
        st.itemCooldown *= 1.5;
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
