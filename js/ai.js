// ============= AI ドライバー =============
// 経路追従型シンプルAI: 次のチェックポイントを目指して走る
const AIDriver = {
  states: new Map(),

  init(carId) {
    this.states.set(carId, {
      targetIdx: 0,
      itemCooldown: 2 + Math.random() * 3,
      lastSeenObstacle: 0,
      skill: 0.7 + Math.random() * 0.3,    // 0.7..1.0 のスキル係数
      laneOffset: (Math.random() - 0.5) * 0.6, // -0.3..0.3 (内/外寄り)
      lookaheadBase: 3,
      lookaheadSpeedMul: 0.15,
      lookaheadMin: 3,
      lookaheadMax: 10,
      steerGain: 1.8,
      avoidRange: 5,
      avoidStrength: 0.6,
      accelTurnLimit: 1.1,
      brakeTurnLimit: 1.5,
      brakeSpeedMin: 28,
      catchupSpeed: 12,
      itemAggro: 1.0,
      errorChance: 0.02,
    });
  },

  update(car, dt, allCars) {
    if (!this.states.has(car.id)) this.init(car.id);
    const st = this.states.get(car.id);

    const n = Track.pathPoints.length;
    const cur = Track.getProgress(car.x, car.z, car.lastProgressIdx);
    // 速度が高いほど先を見る
    const lookahead = Math.max(
      st.lookaheadMin ?? 3,
      Math.min(
        st.lookaheadMax ?? 10,
        Math.floor(Math.abs(car.speed) * (st.lookaheadSpeedMul ?? 0.15)) + (st.lookaheadBase ?? 3)
      )
    );
    st.targetIdx = (cur.index + lookahead) % n;
    const tgt = Track.pathPoints[st.targetIdx];

    // ライン取り: コース幅の少し内 or 外を狙う
    const { nx, nz } = Track._segNorm[st.targetIdx];
    const lateralOff = st.laneOffset * Track.width;
    const tgtX = tgt.x + nx * lateralOff;
    const tgtZ = tgt.z + nz * lateralOff;

    const dx = tgtX - car.x;
    const dz = tgtZ - car.z;
    const targetAng = Math.atan2(dx, dz);
    let diff = Utils.angDiff(targetAng, car.angle);

    // ステア
    const steer = Utils.clamp(diff * (st.steerGain ?? 1.8), -1, 1);

    // 障害物（バナナや他車）回避
    let avoid = 0;
    for (const o of allCars) {
      if (o.id === car.id) continue;
      const od = Utils.dist2(car.x, car.z, o.x, o.z);
      if (od < (st.avoidRange ?? 5)) {
        const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
        const rx = o.x - car.x, rz = o.z - car.z;
        const fwd = rx * fx + rz * fz;
        if (fwd > 0) {
          const side = rx * fz - rz * fx;
          avoid += side > 0 ? -(st.avoidStrength ?? 0.6) : (st.avoidStrength ?? 0.6);
        }
      }
    }
    const finalSteer = Utils.clamp(steer + avoid, -1, 1);

    // アクセル/ブレーキ
    const turnSharp = Math.abs(diff);
    const accel = turnSharp < (st.accelTurnLimit ?? 1.1) || Math.abs(car.speed) < (st.catchupSpeed ?? 12);
    let brake = turnSharp > (st.brakeTurnLimit ?? 1.5) && car.speed > (st.brakeSpeedMin ?? 28);

    // スキル係数: アクセル抜きで差をつける
    let effAccel = accel;
    if (Math.random() < (st.errorChance ?? 0.02) * dt * 60) effAccel = false;
    if (Math.random() < (st.errorChance ?? 0.02) * 0.5 * dt * 60) brake = false;

    car.applyInput(finalSteer, effAccel, brake, dt);

    // アイテム使用
    st.itemCooldown -= dt;
    if (car.item && st.itemCooldown <= 0) {
      const itm = car.item;
      let use = false;
      const chance = (base) => Math.random() < Math.min(0.98, base * (st.itemAggro ?? 1));
      // 攻撃系/ブースト系は即使用
      if (itm === 'boost' || itm === 'tripleBoost' || itm === 'shield' ||
          itm === 'rocket' || itm === 'tripleRocket' || itm === 'lightning' ||
          itm === 'ghost' || itm === 'magnet' || itm === 'killer' || itm === 'megaShield' ||
          itm === 'mini' || itm === 'boomerang' || itm === 'fog') {
        use = true;
      }
      // 設置系: 後ろから迫られている / 自分より遅い場合に撒く
      else if (itm === 'banana' || itm === 'oil' || itm === 'mine' || itm === 'block') {
        const threat = this._threatBehind(car, allCars);
        use = threat || car.totalProgress < this._leaderProgress(allCars) || chance(0.35);
      }
      // インクは前にライバルがいる時に使う
      else if (itm === 'ink') {
        use = this._hasRivalAhead(car, allCars) || chance(0.4);
      }
      // === 新規アイテムの判断 ===
      // ワープ: 直前で危険(後ろから接近)or前にライバル
      else if (itm === 'teleport') {
        use = this._threatBehind(car, allCars) || this._hasRivalAhead(car, allCars) || chance(0.5);
      }
      // EMPは周囲に敵が複数いる時 (範囲攻撃の効率)
      else if (itm === 'emp') {
        use = this._enemiesNearby(car, allCars, 14) >= 1 || chance(0.4);
      }
      // デコイ: 後ろから狙われている (ロケットの囮になる) or 戦略的設置
      else if (itm === 'decoy') {
        use = this._threatBehind(car, allCars) || chance(0.3);
      }
      // フリーズ: 周囲に複数の敵がいる時 (範囲攻撃)
      else if (itm === 'freeze') {
        use = this._enemiesNearby(car, allCars, 14) >= 1 || chance(0.35);
      }
      // ショックウェーブ: 至近の敵を弾く (混戦時)
      else if (itm === 'shockwave') {
        use = this._enemiesNearby(car, allCars, 10) >= 1 || this._threatBehind(car, allCars) || chance(0.3);
      }
      // スワップ: 前にライバルがいる時 (順位逆転)
      else if (itm === 'swap') {
        use = this._hasRivalAhead(car, allCars) || chance(0.25);
      }
      // フェーズシフト: 後ろから狙われている or 接近時に脱出用
      else if (itm === 'phaseShift') {
        use = this._threatBehind(car, allCars) || this._enemiesNearby(car, allCars, 8) >= 1 || chance(0.4);
      }
      if (use) {
        Game.useItem(car, allCars);
        st.itemCooldown = 2.5 + Math.random() * 2.5;
      }
    }
  },

  _enemiesNearby(car, allCars, r) {
    let n = 0;
    const r2 = r * r;
    for (const o of allCars) {
      if (o.id === car.id) continue;
      if (o.finished) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      if (dx*dx + dz*dz < r2) n++;
    }
    return n;
  },

  // 後方近距離に追跡してくる車がいるか?
  _threatBehind(car, allCars) {
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    for (const o of allCars) {
      if (o.id === car.id) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const fwd = dx * fx + dz * fz; // 負=後方
      const d2 = dx*dx + dz*dz;
      if (fwd < -1 && d2 < 14*14) return true;
    }
    return false;
  },

  // 前方近距離にライバルがいるか?
  _hasRivalAhead(car, allCars) {
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    for (const o of allCars) {
      if (o.id === car.id) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const fwd = dx * fx + dz * fz;
      const d2 = dx*dx + dz*dz;
      if (fwd > 1 && d2 < 22*22) return true;
    }
    return false;
  },

  _leaderProgress(allCars) {
    let m = -Infinity;
    for (const c of allCars) if (c.totalProgress > m) m = c.totalProgress;
    return m;
  },
};
