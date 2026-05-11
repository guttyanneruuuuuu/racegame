// ============= 車（プレイヤー / リモート / AI共通モデル） =============
const CarPhysics = {
  MAX_SPEED: 60,            // m/s 相当
  MAX_SPEED_BOOST: 95,
  ACCEL: 28,
  BRAKE: 50,
  REVERSE_ACCEL: 14,
  FRICTION: 6,              // 自然減速
  OFFTRACK_FRICTION: 22,    // コース外の減速
  STEER_SPEED: 2.4,         // ハンドル回転速度 (rad/s)
  STEER_AT_SPEED: 0.55,     // 高速時の操舵減衰
  LATERAL_GRIP: 9.0,        // 横滑り補正
  SPIN_FRICTION: 4.0,
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
    this.angle = opts.angle || 0;  // y軸まわりの向き(0=+Z向き)
    this.speed = 0;                 // 前進速度(マイナスでバック)
    this.steerAngle = 0;            // 表示用ハンドル角
    this.spinTimer = 0;             // スピン演出
    this.boostTimer = 0;            // ブースト残り秒
    this.invincibleTimer = 0;
    this.squishTimer = 0;           // ぺちゃんこ
    this.lockedTimer = 0;           // 操作不能（バナナ/雷など）

    // アイテム
    this.item = null;               // 'boost' | 'rocket' | 'banana' | 'lightning' | 'shield'
    this.itemReady = false;

    // 進行管理
    this.lap = 0;
    this.checkpointIndex = 0;
    this.lastProgressIdx = 0;
    this.totalProgress = 0;         // 累積進行距離(ラップ込み)
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
      new THREE.BoxGeometry(2.0, 0.6, 3.6),
      new THREE.MeshLambertMaterial({ color: colorHex })
    );
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);

    // ボディ（上 - キャビン）
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.7, 2.0),
      new THREE.MeshLambertMaterial({ color: colorHex })
    );
    cabin.position.set(0, 1.15, -0.1);
    cabin.castShadow = true;
    group.add(cabin);

    // フロントウィンドウ
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.55, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x222a35 })
    );
    win.position.set(0, 1.15, 0.95);
    group.add(win);

    // ヘッドライト
    const lightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffe0 });
    const hl1 = new THREE.Mesh(lightGeo, lightMat); hl1.position.set(-0.6, 0.55, 1.8); group.add(hl1);
    const hl2 = new THREE.Mesh(lightGeo, lightMat); hl2.position.set( 0.6, 0.55, 1.8); group.add(hl2);

    // タイヤ
    const tireGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12);
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const tirePos = [
      [-1.05, 0.45,  1.2],
      [ 1.05, 0.45,  1.2],
      [-1.05, 0.45, -1.2],
      [ 1.05, 0.45, -1.2],
    ];
    this.tires = [];
    tirePos.forEach(p => {
      const t = new THREE.Mesh(tireGeo, tireMat);
      t.position.set(...p);
      t.rotation.z = Math.PI / 2;
      t.castShadow = true;
      group.add(t);
      this.tires.push(t);
    });

    // 名前ラベル
    this.nameSprite = this._buildLabel(this.name);
    this.nameSprite.position.set(0, 2.4, 0);
    group.add(this.nameSprite);

    // ブーストエフェクト（リアの炎）
    const flameGeo = new THREE.ConeGeometry(0.35, 1.4, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7043, transparent: true, opacity: 0.9 });
    const fl1 = new THREE.Mesh(flameGeo, flameMat); fl1.position.set(-0.55, 0.55, -2.0); fl1.rotation.x = Math.PI / 2; fl1.visible = false;
    const fl2 = new THREE.Mesh(flameGeo, flameMat); fl2.position.set( 0.55, 0.55, -2.0); fl2.rotation.x = Math.PI / 2; fl2.visible = false;
    group.add(fl1, fl2);
    this.flames = [fl1, fl2];

    // シールド（オーラ）
    const shieldGeo = new THREE.SphereGeometry(2.0, 16, 12);
    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.25, wireframe: true });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.y = 1.0;
    this.shieldMesh.visible = false;
    group.add(this.shieldMesh);

    return group;
  }

  _buildLabel(name) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    const r = 12;
    ctx.moveTo(r, 0); ctx.lineTo(256 - r, 0); ctx.quadraticCurveTo(256, 0, 256, r);
    ctx.lineTo(256, 64 - r); ctx.quadraticCurveTo(256, 64, 256 - r, 64);
    ctx.lineTo(r, 64); ctx.quadraticCurveTo(0, 64, 0, 64 - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.fill();
    ctx.fillStyle = '#2b1d10';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(3, 0.75, 1);
    return sp;
  }

  setName(name) {
    this.name = name;
    if (this.nameSprite && this.nameSprite.parent) {
      this.nameSprite.parent.remove(this.nameSprite);
    }
    this.nameSprite = this._buildLabel(name);
    this.nameSprite.position.set(0, 2.4, 0);
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

    // 自然減速 (両方押してない時)
    if (!accel && !brake) {
      const sign = Math.sign(this.speed);
      this.speed -= sign * CarPhysics.FRICTION * dt;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }

    // コース外摩擦
    if (Track.isOffTrack(this.x, this.z)) {
      const sign = Math.sign(this.speed);
      this.speed -= sign * CarPhysics.OFFTRACK_FRICTION * dt;
    }

    // 最大速度
    const maxSp = this.boostTimer > 0 ? CarPhysics.MAX_SPEED_BOOST : CarPhysics.MAX_SPEED;
    this.speed = Utils.clamp(this.speed, -CarPhysics.MAX_SPEED * 0.5, maxSp);

    // 操舵: 速度が出ている時のみ効きが良い
    const speedFactor = Math.min(1, Math.abs(this.speed) / 8);
    const turnEffect = CarPhysics.STEER_SPEED * speedFactor *
                       (1 - Math.abs(this.speed) / CarPhysics.MAX_SPEED * CarPhysics.STEER_AT_SPEED);
    const dir = Math.sign(this.speed) || 1;
    this.angle += steer * turnEffect * dt * dir;
    this.steerAngle = Utils.lerp(this.steerAngle, steer * 0.5, 0.2);

    // ブースト/無敵タイマー
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.squishTimer > 0) this.squishTimer -= dt;

    this._integratePos(dt);
  }

  _integratePos(dt) {
    // 前方向 (Three.js: +z向きが「前」とする)
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
  }

  // メッシュ更新
  updateMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;

    // ぺちゃんこ
    if (this.squishTimer > 0) {
      this.mesh.scale.set(1.3, 0.3, 1.3);
    } else {
      this.mesh.scale.set(1, 1, 1);
    }

    // タイヤ回転
    if (this.tires) {
      const rot = this.speed * 0.5;
      for (const t of this.tires) t.rotation.x += rot * 0.05;
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
      f.scale.set(1 + Math.random() * 0.4, 1 + Math.random() * 0.4, 1);
    }

    // シールド
    this.shieldMesh.visible = this.invincibleTimer > 0;
    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.y += 0.05;
    }
  }

  // 進行状況更新 → ラップ判定
  updateProgress(now) {
    if (this.finished) return;
    const prog = Track.getProgress(this.x, this.z);
    const n = Track.pathPoints.length;
    // ラップカウント: インデックスがほぼ最後 → 最初に回り込んだ瞬間
    if (this.lastProgressIdx > n * 0.7 && prog.index < n * 0.2) {
      // ラップ完走
      this.lap++;
      const lapMs = now - this.lapStartTime;
      this.lastLap = lapMs;
      if (lapMs > 2000) this.bestLap = Math.min(this.bestLap, lapMs);
      this.lapStartTime = now;
    } else if (this.lastProgressIdx < n * 0.2 && prog.index > n * 0.7) {
      // 逆走 - 巻き戻し（ただし lap がマイナスにはならない）
      if (this.lap > 0) this.lap--;
    }
    this.lastProgressIdx = prog.index;
    this.totalProgress = this.lap * Track.pathLength + prog.totalDist;
  }

  // 初期化時にスタート位置に応じた lastProgressIdx を設定
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
