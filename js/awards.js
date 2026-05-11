// ============= アワード/プログレッション システム =============
// レース中の行動を記録し、終了時にアワードを授与。経験値/レベルアップで車種・カラーをアンロック。
const Awards = {
  // 進行管理 (ローカル保存)
  level: 1,
  xp: 0,
  totalRaces: 0,
  wins: 0,
  bestLapEver: Infinity,
  unlocks: { colors: [], titles: [] },

  // レース中スタッツ (毎レースリセット)
  stats: null,

  AWARD_DEFS: [
    { id: 'noMiss',     name: '🎯 ノーミスドライバー',    cond: s => s.spinCount === 0 && s.finished, xp: 80 },
    { id: 'turboKing',  name: '💨 ターボキング',          cond: s => s.miniTurboCount >= 5,       xp: 60 },
    { id: 'itemMaster', name: '🎁 アイテムマスター',      cond: s => s.itemUsed >= 6,             xp: 50 },
    { id: 'sniper',     name: '🎯 スナイパー',             cond: s => s.hitsLanded >= 3,           xp: 70 },
    { id: 'comeback',   name: '🔥 大逆転！',               cond: s => s.startRank >= 4 && s.finishRank === 1, xp: 120 },
    { id: 'victory',    name: '🏆 優勝',                   cond: s => s.finishRank === 1,          xp: 100 },
    { id: 'podium',     name: '🥈 表彰台',                 cond: s => s.finishRank >= 2 && s.finishRank <= 3, xp: 50 },
    { id: 'pacifist',   name: '🕊 ピースフル',             cond: s => s.itemUsed === 0 && s.finished, xp: 40 },
    { id: 'bestLap',    name: '⏱ ベストラップ更新！',     cond: s => s.bestLapImproved,           xp: 60 },
    { id: 'speedDemon', name: '🚀 マッハスピード',         cond: s => s.maxSpeedKmh >= 320,         xp: 50 },
  ],

  init() {
    try {
      const saved = JSON.parse(localStorage.getItem('gyrorush-prog') || '{}');
      this.level = saved.level || 1;
      this.xp = saved.xp || 0;
      this.totalRaces = saved.totalRaces || 0;
      this.wins = saved.wins || 0;
      this.bestLapEver = saved.bestLapEver || Infinity;
      this.unlocks = saved.unlocks || { colors: [], titles: [] };
    } catch (_) {}
  },

  save() {
    localStorage.setItem('gyrorush-prog', JSON.stringify({
      level: this.level, xp: this.xp,
      totalRaces: this.totalRaces, wins: this.wins,
      bestLapEver: this.bestLapEver,
      unlocks: this.unlocks,
    }));
  },

  // === レース開始時に呼ぶ ===
  beginRace(startRank) {
    this.stats = {
      startRank: startRank || 1,
      finishRank: 99,
      spinCount: 0,
      miniTurboCount: 0,
      itemUsed: 0,
      hitsLanded: 0,
      wallHits: 0,
      maxSpeedKmh: 0,
      bestLapImproved: false,
      finished: false,
      collisions: 0,
    };
  },

  // === 各種カウント ===
  countMiniTurbo() { if (this.stats) this.stats.miniTurboCount++; },
  countItemUse()   { if (this.stats) this.stats.itemUsed++; },
  countHit()       { if (this.stats) this.stats.hitsLanded++; },
  countSpin()      { if (this.stats) this.stats.spinCount++; },
  countWallHit()   { if (this.stats) this.stats.wallHits++; },
  countCollision() { if (this.stats) this.stats.collisions++; },
  recordSpeed(kmh) { if (this.stats && kmh > this.stats.maxSpeedKmh) this.stats.maxSpeedKmh = kmh; },

  // === レース終了時 ===
  endRace(finishRank, finished, bestLap) {
    if (!this.stats) this.beginRace(1);
    this.stats.finishRank = finishRank;
    this.stats.finished = !!finished;
    if (isFinite(bestLap) && bestLap < this.bestLapEver) {
      this.stats.bestLapImproved = true;
      this.bestLapEver = bestLap;
    }
    const earned = [];
    let totalXp = 5; // 参加賞
    for (const def of this.AWARD_DEFS) {
      try {
        if (def.cond(this.stats)) {
          earned.push(def);
          totalXp += def.xp;
        }
      } catch (_) {}
    }
    this.totalRaces++;
    if (finishRank === 1) this.wins++;
    this.xp += totalXp;
    const newLevel = this._calcLevel(this.xp);
    const leveledUp = newLevel > this.level;
    this.level = newLevel;

    // レベルアップでカラー解禁
    const extraColors = ['#26C6DA', '#FF7043', '#9CCC65', '#7E57C2', '#EC407A', '#FFEE58'];
    while (this.unlocks.colors.length < Math.min(extraColors.length, Math.floor(this.level / 2))) {
      const next = extraColors[this.unlocks.colors.length];
      if (next) this.unlocks.colors.push(next);
    }

    this.save();
    return { awards: earned, gainedXp: totalXp, leveledUp, newLevel: this.level };
  },

  _calcLevel(xp) {
    // 100, 250, 450, 700, 1000, ...
    let lvl = 1, need = 100, cur = xp;
    while (cur >= need) {
      cur -= need;
      lvl++;
      need += 50 + lvl * 25;
    }
    return lvl;
  },

  xpForNext() {
    let need = 100, lvl = 1;
    while (lvl < this.level) {
      need += 50 + (lvl + 1) * 25;
      lvl++;
    }
    return need;
  },
};
window.Awards = Awards;
