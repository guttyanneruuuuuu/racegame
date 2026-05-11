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
    });
  },

  update(car, dt, allCars) {
    if (!this.states.has(car.id)) this.init(car.id);
    const st = this.states.get(car.id);

    const n = Track.pathPoints.length;
    const cur = Track.getProgress(car.x, car.z, car.lastProgressIdx);
    // 速度が高いほど先を見る
    const lookahead = Math.max(3, Math.min(10, Math.floor(Math.abs(car.speed) * 0.15) + 3));
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
    const steer = Utils.clamp(diff * 1.8, -1, 1);

    // 障害物（バナナや他車）回避
    let avoid = 0;
    for (const o of allCars) {
      if (o.id === car.id) continue;
      const od = Utils.dist2(car.x, car.z, o.x, o.z);
      if (od < 5) {
        const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
        const rx = o.x - car.x, rz = o.z - car.z;
        const fwd = rx * fx + rz * fz;
        if (fwd > 0) {
          const side = rx * fz - rz * fx;
          avoid += side > 0 ? -0.6 : 0.6;
        }
      }
    }
    const finalSteer = Utils.clamp(steer + avoid, -1, 1);

    // アクセル/ブレーキ
    const turnSharp = Math.abs(diff);
    const accel = turnSharp < 1.1;
    const brake = turnSharp > 1.5 && car.speed > 28;

    // スキル係数: アクセル抜きで差をつける
    let effAccel = accel;
    if (Math.random() > st.skill * 0.99) effAccel = false; // ごくたまにミス

    car.applyInput(finalSteer, effAccel, brake, dt);

    // アイテム使用
    st.itemCooldown -= dt;
    if (car.item && st.itemCooldown <= 0) {
      const itm = car.item;
      let use = false;
      if (itm === 'boost' || itm === 'shield') use = true;
      else if (itm === 'banana') use = car.totalProgress < this._leaderProgress(allCars) || Math.random() < 0.4;
      else if (itm === 'rocket' || itm === 'lightning') use = true;
      if (use) {
        Game.useItem(car, allCars);
        st.itemCooldown = 3 + Math.random() * 3;
      }
    }
  },

  _leaderProgress(allCars) {
    let m = -Infinity;
    for (const c of allCars) if (c.totalProgress > m) m = c.totalProgress;
    return m;
  },
};
