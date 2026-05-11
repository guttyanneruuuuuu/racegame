// ============= AI ドライバー =============
// 経路追従型シンプルAI: 次のチェックポイントを目指して走る
const AIDriver = {
  // 各AIごとの状態を持たせる
  states: new Map(),

  init(carId) {
    this.states.set(carId, {
      targetIdx: 0,
      itemCooldown: 2 + Math.random() * 3,
      lastSeenObstacle: 0,
    });
  },

  update(car, dt, allCars) {
    if (!this.states.has(car.id)) this.init(car.id);
    const st = this.states.get(car.id);

    // 現在地点に最も近いパス上の点を見つけて、その先 lookahead 個先を目標とする
    const n = Track.pathPoints.length;
    const cur = Track.getProgress(car.x, car.z);
    const lookahead = 4;
    st.targetIdx = (cur.index + lookahead) % n;
    const tgt = Track.pathPoints[st.targetIdx];

    // ターゲット方向への角度
    const dx = tgt.x - car.x;
    const dz = tgt.z - car.z;
    const targetAng = Math.atan2(dx, dz);
    let diff = Utils.angDiff(targetAng, car.angle);

    // ステア
    const steer = Utils.clamp(diff * 1.6, -1, 1);

    // 障害物（バナナや他車）回避: 前方近くに敵がいたら少し避ける
    let avoid = 0;
    for (const o of allCars) {
      if (o.id === car.id) continue;
      const od = Utils.dist2(car.x, car.z, o.x, o.z);
      if (od < 4.5) {
        // 自分の前方判定
        const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
        const rx = o.x - car.x, rz = o.z - car.z;
        const fwd = rx * fx + rz * fz;
        if (fwd > 0) {
          // 左右どちらが近いか
          const side = rx * fz - rz * fx; // 外積
          avoid += side > 0 ? -0.6 : 0.6;
        }
      }
    }
    const finalSteer = Utils.clamp(steer + avoid, -1, 1);

    // アクセル/ブレーキ: 曲がりがきつい時はブレーキ
    const accel = Math.abs(diff) < 1.0;
    const brake = Math.abs(diff) > 1.6 && car.speed > 25;

    car.applyInput(finalSteer, accel, brake, dt);

    // アイテム使用
    st.itemCooldown -= dt;
    if (car.item && st.itemCooldown <= 0) {
      // 先頭でなければ前方の敵に攻撃, シールド/バナナは適宜
      const itm = car.item;
      let use = false;
      if (itm === 'boost' || itm === 'shield') use = true;
      else if (itm === 'banana') use = car.totalProgress < this._leaderProgress(allCars) || Math.random() < 0.4;
      else if (itm === 'rocket' || itm === 'lightning') use = true;
      if (use) {
        // 実際の効果適用は Game側で
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
