// ============= 車（プレイヤー / リモート / AI共通モデル） =============
const CarPhysics = {
  MAX_SPEED: 52,            // m/s 相当 (約190km/h)
  MAX_SPEED_BOOST: 82,
  ACCEL: 32,
  BRAKE: 55,
  REVERSE_ACCEL: 16,
  FRICTION: 5,              // 自然減速
  OFFTRACK_FRICTION: 24,    // コース外の減速
  STEER_SPEED: 3.2,         // ハンドル回転速度 (rad/s) - 強めに
  STEER_AT_SPEED: 0.45,     // 高速時の操舵減衰
  LATERAL_GRIP: 9.0,
  SPIN_FRICTION: 4.0,
  WALL_BOUNCE: 0.35,        // 壁反発係数
  RADIUS: 1.2,              // 車衝突半径
};

class Car {
  constructor(opts = {}) {
    this.id = opts.id || 'p';
    this.name = opts.name || 'Player';
    this.color = opts.color || '#FF3B3B';
    this.isLocal = !!opts.isLocal;
    this.isAI = !!opts.isAI;

    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.y = 0;
    this.angle = opts.angle || 0;
    this.speed = 0;
    this.steerAngle = 0;
    this.spinTimer = 0;
    this.boostTimer = 0;
    this.invincibleTimer = 0;
    this.squishTimer = 0;
    this.lockedTimer = 0;
    this.wallHitFlash = 0;
    this.driftAmount = 0;     // ドリフトの量（横スリップ）

    // アイテム
    this.item = null;
    this.itemReady = false;

    // 進行管理
    this.lap = 0;
    this.checkpointIndex = 0;
    this.lastProgressIdx = 0;
    this.totalProgress = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lapStartTime = 0;
    this.bestLap = Infinity;
    this.lastLap = 0;

    this.mesh = this._buildMesh();
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
  }

  _buildMesh() {
    const group = new THREE.Group();
    const colorHex = parseInt(this.color.replace('#',''), 16);

    // ボディ（下）
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.55, 3.4),
      new THREE.MeshLambertMaterial({ color: colorHex })
    );
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);

    // ボディ前部（テーパー）
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.4, 0.8),
      new THREE.MeshLambertMaterial({ color: colorHex })
    );
    nose.position.set(0, 0.45, 1.85);
    group.add(nose);

    // ボディ（上 - キャビン）
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.65, 1.7),
      new THREE.MeshLambertMaterial({ color: 0xfafafa })
    );
    cabin.position.set(0, 1.1, -0.15);
    cabin.castShadow = true;
    group.add(cabin);

    // フロントウィンドウ
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.5, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x29384a })
    );
    win.position.set(0, 1.1, 0.75);
    group.add(win);
    // リアウィンドウ
    const winR = win.clone();
    winR.position.set(0, 1.1, -1.05);
    group.add(winR);

    // スポイラー
    const spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.12, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    spoiler.position.set(0, 1.2, -1.65);
    group.add(spoiler);
    const spStandL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    spStandL.position.set(-0.7, 1.0, -1.55);
    const spStandR = spStandL.clone(); spStandR.position.x = 0.7;
    group.add(spStandL, spStandR);

    // ヘッドライト
    const lightGeo = new THREE.BoxGeometry(0.32, 0.22, 0.1);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffae6 });
    const hl1 = new THREE.Mesh(lightGeo, lightMat); hl1.position.set(-0.55, 0.52, 2.22); group.add(hl1);
    const hl2 = new THREE.Mesh(lightGeo, lightMat); hl2.position.set( 0.55, 0.52, 2.22); group.add(hl2);

    // テールライト
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xd32f2f });
    const tl1 = new THREE.Mesh(lightGeo, tlMat); tl1.position.set(-0.55, 0.52, -1.78); group.add(tl1);
    const tl2 = new THREE.Mesh(lightGeo, tlMat); tl2.position.set( 0.55, 0.52, -1.78); group.add(tl2);

    // タイヤ
    const tireGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 14);
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    // ホイール(中央)
    const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.44, 8);
    const rimMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const tirePos = [
      [-0.98, 0.46,  1.15],
      [ 0.98, 0.46,  1.15],
      [-0.98, 0.46, -1.15],
      [ 0.98, 0.46, -1.15],
    ];
    this.tires = [];
    tirePos.forEach(p => {
      const tg = new THREE.Group();
      const t = new THREE.Mesh(tireGeo, tireMat);
      t.rotation.z = Math.PI / 2;
      t.castShadow = true;
      const r = new THREE.Mesh(rimGeo, rimMat);
      r.rotation.z = Math.PI / 2;
      tg.add(t, r);
      tg.position.set(...p);
      group.add(tg);
      this.tires.push(tg);
    });

    // 名前ラベル
    this.nameSprite = this._buildLabel(this.name, this.color);
    this.nameSprite.position.set(0, 2.5, 0);
    group.add(this.nameSprite);

    // ブーストエフェクト（リアの炎）
    const flameGeo = new THREE.ConeGeometry(0.38, 1.6, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.9 });
    const fl1 = new THREE.Mesh(flameGeo, flameMat); fl1.position.set(-0.5, 0.55, -2.1); fl1.rotation.x = -Math.PI / 2; fl1.visible = false;
    const fl2 = new THREE.Mesh(flameGeo, flameMat); fl2.position.set( 0.5, 0.55, -2.1); fl2.rotation.x = -Math.PI / 2; fl2.visible = false;
    group.add(fl1, fl2);
    this.flames = [fl1, fl2];

    // シールド（オーラ）
    const shieldGeo = new THREE.SphereGeometry(2.2, 16, 12);
    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.28, wireframe: true });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.y = 1.0;
    this.shieldMesh.visible = false;
    group.add(this.shieldMesh);

    // ドリフトスモーク用 (簡易)
    this.smokeMeshes = [];
    for (let i = 0; i < 6; i++) {
      const sm = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
      );
      sm.visible = false;
      group.add(sm);
      this.smokeMeshes.push({ mesh: sm, life: 0 });
    }

    return group;
  }

  _buildLabel(name, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    // ベース白＋色付き枠
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const r = 14;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(256 - r, 0); ctx.quadraticCurveTo(256, 0, 256, r);
    ctx.lineTo(256, 64 - r); ctx.quadraticCurveTo(256, 64, 256 - r, 64);
    ctx.lineTo(r, 64); ctx.quadraticCurveTo(0, 64, 0, 64 - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#2b1d10';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 33);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(3.2, 0.8, 1);
    sp.renderOrder = 999;
    return sp;
  }

  setName(name) {
    this.name = name;
    if (this.nameSprite && this.nameSprite.parent) {
      this.nameSprite.parent.remove(this.nameSprite);
    }
    this.nameSprite = this._buildLabel(name, this.color);
    this.nameSprite.position.set(0, 2.5, 0);
    this.mesh.add(this.nameSprite);
  }

  // 入力からの操作 (steer: -1..+1, accel, brake bool)
  applyInput(steer, accel, brake, dt) {
    if (this.lockedTimer > 0) {
      this.lockedTimer -= dt;
      steer = 0; accel = false; brake = false;
    }
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.angle += dt * 12;
      this.speed *= Math.pow(0.2, dt);
      this._integratePos(dt);
      return;
    }

    // 加速
    if (accel) this.speed += CarPhysics.ACCEL * dt;
    if (brake) {
      if (this.speed > 0.2) this.speed -= CarPhysics.BRAKE * dt;
      else this.speed -= CarPhysics.REVERSE_ACCEL * dt;
    }

    // 自然減速
    if (!accel && !brake) {
      const sign = Math.sign(this.speed);
      this.speed -= sign * CarPhysics.FRICTION * dt;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }

    // コース外摩擦
    if (Track.isOffTrack(this.x, this.z, this.lastProgressIdx)) {
      const sign = Math.sign(this.speed);
      this.speed -= sign * CarPhysics.OFFTRACK_FRICTION * dt;
    }

    // 最大速度
    const maxSp = this.boostTimer > 0 ? CarPhysics.MAX_SPEED_BOOST : CarPhysics.MAX_SPEED;
    this.speed = Utils.clamp(this.speed, -CarPhysics.MAX_SPEED * 0.5, maxSp);

    // 操舵: 一定速度以上で効きが良くなる
    // 低速時も最低限ハンドル効くように
    const absSp = Math.abs(this.speed);
    const speedFactor = Utils.clamp(0.45 + absSp / 18, 0.45, 1.0);
    const highSpeedDamp = 1 - Math.min(1, absSp / CarPhysics.MAX_SPEED) * CarPhysics.STEER_AT_SPEED;
    const turnEffect = CarPhysics.STEER_SPEED * speedFactor * highSpeedDamp;
    const dir = Math.sign(this.speed) || 1;
    this.angle += steer * turnEffect * dt * dir;
    this.steerAngle = Utils.lerp(this.steerAngle, steer * 0.5, 0.25);

    // ドリフト演出量(高速で大きく切るほど)
    this.driftAmount = Utils.lerp(this.driftAmount, Math.abs(steer) * Math.min(1, absSp / 30), 0.2);

    // タイマー減算
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.squishTimer > 0) this.squishTimer -= dt;
    if (this.wallHitFlash > 0) this.wallHitFlash -= dt;

    this._integratePos(dt);

    // 壁衝突処理
    const wr = Track.resolveWalls(this.x, this.z, CarPhysics.RADIUS, this.lastProgressIdx);
    if (wr.hit) {
      this.x = wr.x; this.z = wr.z;
      // 速度の壁法線方向成分を反転(減衰付き)、接線方向は保持
      const fx = Math.sin(this.angle), fz = Math.cos(this.angle);
      // 進行ベクトル → 接線成分 / 法線成分に分解
      const tangX = -wr.nz, tangZ = wr.nx; // 壁の沿い方向(便宜的)
      const v_t = fx * tangX + fz * tangZ;
      // 速度の方向は車体角度由来。接線方向にスライドさせる(壁ずり) + 減速
      this.speed *= 0.6;
      // 車体を壁の沿い方向に少し向き直す（ゴリ押し回避）
      const slideAng = Math.atan2(tangX * Math.sign(v_t || 1), tangZ * Math.sign(v_t || 1));
      // 角度を少しずらす
      const diff = Utils.angDiff(slideAng, this.angle);
      this.angle += diff * 0.18;
      this.wallHitFlash = 0.25;
    }
  }

  _integratePos(dt) {
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
  }

  // メッシュ更新
  updateMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;
    // ロール(ステアに応じて少し傾ける) - 視覚演出
    this.mesh.rotation.z = -this.steerAngle * 0.18 * Math.min(1, Math.abs(this.speed) / 30);

    // 壁ヒット時に赤くフラッシュ
    if (this.wallHitFlash > 0 && this.mesh.children[0]) {
      const intensity = this.wallHitFlash / 0.25;
      this.mesh.children[0].material.emissive = new THREE.Color(intensity * 0.8, 0, 0);
      this.mesh.children[0].material.emissiveIntensity = intensity;
    } else if (this.mesh.children[0]) {
      this.mesh.children[0].material.emissiveIntensity = 0;
    }

    // ぺちゃんこ
    if (this.squishTimer > 0) {
      this.mesh.scale.set(1.3, 0.3, 1.3);
    } else {
      this.mesh.scale.set(1, 1, 1);
    }

    // タイヤ回転
    if (this.tires) {
      const rot = this.speed * 0.5;
      for (const t of this.tires) {
        // 子の最初(タイヤメッシュ)を回転
        if (t.children[0]) t.children[0].rotation.x += rot * 0.05;
        if (t.children[1]) t.children[1].rotation.x += rot * 0.05;
      }
      // 前輪ステア
      if (this.tires[0] && this.tires[1]) {
        this.tires[0].rotation.y = this.steerAngle;
        this.tires[1].rotation.y = this.steerAngle;
      }
    }

    // 炎エフェクト
    const showFlame = this.boostTimer > 0;
    for (const f of this.flames) {
      f.visible = showFlame;
      if (showFlame) {
        f.scale.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.5, 1);
        f.material.color.setHSL(0.08 + Math.random() * 0.05, 1, 0.55);
      }
    }

    // シールド
    this.shieldMesh.visible = this.invincibleTimer > 0;
    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.y += 0.08;
      this.shieldMesh.rotation.x += 0.03;
    }

    // ドリフトスモーク
    this._updateSmoke();
  }

  _updateSmoke() {
    const drifting = this.driftAmount > 0.45 && Math.abs(this.speed) > 18;
    if (drifting) {
      // 余ってる(life<=0)を1つ取得
      const free = this.smokeMeshes.find(s => s.life <= 0);
      if (free) {
        free.life = 0.6;
        free.mesh.visible = true;
        // ローカル座標で後輪付近にスポーン
        const side = Math.random() < 0.5 ? -1 : 1;
        free.mesh.position.set(side * 0.95, 0.4, -1.2);
        free.mesh.material.opacity = 0.8;
        free.mesh.scale.set(1, 1, 1);
      }
    }
    for (const s of this.smokeMeshes) {
      if (s.life > 0) {
        s.life -= 0.016;
        s.mesh.position.y += 0.015;
        const sc = 1 + (0.6 - s.life) * 2;
        s.mesh.scale.set(sc, sc, sc);
        s.mesh.material.opacity = Math.max(0, s.life / 0.6 * 0.7);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
  }

  // 進行状況更新 → ラップ判定
  updateProgress(now) {
    if (this.finished) return;
    const prog = Track.getProgress(this.x, this.z, this.lastProgressIdx);
    const n = Track.pathPoints.length;
    if (this.lastProgressIdx > n * 0.7 && prog.index < n * 0.2) {
      this.lap++;
      const lapMs = now - this.lapStartTime;
      this.lastLap = lapMs;
      if (lapMs > 2000) this.bestLap = Math.min(this.bestLap, lapMs);
      this.lapStartTime = now;
      if (this.isLocal && typeof showToast === 'function' && this.lap < (Game.totalLaps || 3)) {
        showToast(`LAP ${this.lap + 1} / ${Game.totalLaps}`, 1200);
      }
    } else if (this.lastProgressIdx < n * 0.2 && prog.index > n * 0.7) {
      if (this.lap > 0) this.lap--;
    }
    this.lastProgressIdx = prog.index;
    this.totalProgress = this.lap * Track.pathLength + prog.totalDist;
  }

  initProgress() {
    const prog = Track.getProgress(this.x, this.z);
    this.lastProgressIdx = prog.index;
    this.totalProgress = 0;
    this.lap = 0;
  }

  applyBoost(seconds = 2.5) {
    this.boostTimer = Math.max(this.boostTimer, seconds);
    this.speed = Math.max(this.speed, CarPhysics.MAX_SPEED * 1.05);
  }

  hitBanana() {
    if (this.invincibleTimer > 0) return false;
    this.spinTimer = 1.2;
    return true;
  }
  hitRocket() {
    if (this.invincibleTimer > 0) return false;
    this.squishTimer = 1.6;
    this.lockedTimer = 1.6;
    this.speed = 0;
    return true;
  }
  hitLightning() {
    if (this.invincibleTimer > 0) return false;
    this.squishTimer = 2.0;
    this.lockedTimer = 1.0;
    this.speed *= 0.3;
    return true;
  }
  giveShield(seconds = 5) {
    this.invincibleTimer = Math.max(this.invincibleTimer, seconds);
  }

  setItem(item) {
    this.item = item;
    this.itemReady = true;
  }
  consumeItem() {
    const it = this.item;
    this.item = null;
    this.itemReady = false;
    return it;
  }
}
