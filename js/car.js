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
  GRAVITY: 35,              // ジャンプ用重力
  JUMP_FORCE: 18,           // ジャンプ初速
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
    this.vy = 0;              // Y方向速度
    this.isJumping = false;
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

    // ブーストエフェクト
    const flameGeo = new THREE.ConeGeometry(0.38, 1.6, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.9 });
    const fl1 = new THREE.Mesh(flameGeo, flameMat); fl1.position.set(-0.5, 0.55, -2.1); fl1.rotation.x = -Math.PI / 2; fl1.visible = false;
    const fl2 = new THREE.Mesh(flameGeo, flameMat); fl2.position.set( 0.5, 0.55, -2.1); fl2.rotation.x = -Math.PI / 2; fl2.visible = false;
    group.add(fl1, fl2);
    this.flames = [fl1, fl2];

    // シールド
    const shieldGeo = new THREE.SphereGeometry(2.2, 16, 12);
    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.28, wireframe: true });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.y = 1.0;
    this.shieldMesh.visible = false;
    group.add(this.shieldMesh);

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
    if (this.nameSprite && this.nameSprite.parent) this.nameSprite.parent.remove(this.nameSprite);
    this.nameSprite = this._buildLabel(name, this.color);
    this.nameSprite.position.set(0, 2.5, 0);
    this.mesh.add(this.nameSprite);
  }

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
      this._applyGravity(dt);
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
    if (Track.isOffTrack(this.x, this.z, this.lastProgressIdx) && !this.isJumping) {
      const sign = Math.sign(this.speed);
      this.speed -= sign * CarPhysics.OFFTRACK_FRICTION * dt;
    }

    // 最大速度
    const maxSp = this.boostTimer > 0 ? CarPhysics.MAX_SPEED_BOOST : CarPhysics.MAX_SPEED;
    this.speed = Utils.clamp(this.speed, -CarPhysics.MAX_SPEED * 0.5, maxSp);

    // 操舵
    const absSp = Math.abs(this.speed);
    const speedFactor = Utils.clamp(0.45 + absSp / 18, 0.45, 1.0);
    const highSpeedDamp = 1 - Math.min(1, absSp / CarPhysics.MAX_SPEED) * CarPhysics.STEER_AT_SPEED;
    const turnEffect = CarPhysics.STEER_SPEED * speedFactor * highSpeedDamp;
    const dir = Math.sign(this.speed) || 1;
    this.angle += steer * turnEffect * dt * dir;
    this.steerAngle = Utils.lerp(this.steerAngle, steer * 0.5, 0.25);

    this.driftAmount = Utils.lerp(this.driftAmount, Math.abs(steer) * Math.min(1, absSp / 30), 0.2);

    // タイマー減算
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.squishTimer > 0) this.squishTimer -= dt;
    if (this.wallHitFlash > 0) this.wallHitFlash -= dt;

    this._integratePos(dt);
    this._applyGravity(dt);

    // ギミック判定
    if (!this.isJumping) {
      const gimmick = Track.checkGimmicks(this.x, this.z);
      if (gimmick === 'boost') {
        this.applyBoost(1.2);
      } else if (gimmick === 'jump') {
        this.vy = CarPhysics.JUMP_FORCE;
        this.isJumping = true;
      }
    }

    // 壁衝突処理
    if (!this.isJumping) {
      const wr = Track.resolveWalls(this.x, this.z, CarPhysics.RADIUS, this.lastProgressIdx);
      if (wr.hit) {
        this.x = wr.x; this.z = wr.z;
        this.speed *= 0.6;
        const tangX = -wr.nz, tangZ = wr.nx;
        const fx = Math.sin(this.angle), fz = Math.cos(this.angle);
        const v_t = fx * tangX + fz * tangZ;
        const slideAng = Math.atan2(tangX * Math.sign(v_t || 1), tangZ * Math.sign(v_t || 1));
        const diff = Utils.angDiff(slideAng, this.angle);
        this.angle += diff * 0.18;
        this.wallHitFlash = 0.25;
      }
    }
  }

  _integratePos(dt) {
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
  }

  _applyGravity(dt) {
    if (this.isJumping || this.y > 0) {
      this.vy -= CarPhysics.GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isJumping = false;
      }
    }
  }

  updateMesh(dt) {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;

    const body = this.mesh.children[0];
    const cabin = this.mesh.children[2];
    const roll = -this.steerAngle * 0.25;
    const pitch = (this.isJumping ? -this.vy * 0.02 : 0);
    body.rotation.z = cabin.rotation.z = roll;
    body.rotation.x = pitch;

    const tireRot = this.speed * dt * 0.8;
    this.tires.forEach((t, i) => {
      t.children[0].rotation.x += tireRot;
      if (i < 2) t.rotation.y = this.steerAngle * 0.6;
    });

    const isBoosting = this.boostTimer > 0;
    this.flames.forEach(f => {
      f.visible = isBoosting;
      if (isBoosting) f.scale.setScalar(0.8 + Math.random() * 0.4);
    });

    this.shieldMesh.visible = this.invincibleTimer > 0;
    if (this.shieldMesh.visible) this.shieldMesh.rotation.y += dt * 5;

    if (this.squishTimer > 0) {
      this.mesh.scale.set(1.3, 0.3, 1.3);
    } else {
      this.mesh.scale.set(1, 1, 1);
    }

    this.smokeMeshes.forEach((s, i) => {
      if (this.driftAmount > 0.4 && Math.random() > 0.5 && s.life <= 0) {
        s.life = 0.6;
        s.mesh.visible = true;
        const side = (i % 2 === 0 ? -1 : 1);
        s.mesh.position.set(side * 0.8, 0.2, -1.2);
      }
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.scale.setScalar(1 + (0.6 - s.life) * 3);
        s.mesh.material.opacity = s.life * 1.2;
        s.mesh.position.z -= this.speed * dt * 0.2;
        if (s.life <= 0) { s.mesh.visible = false; s.mesh.material.opacity = 0; }
      }
    });

    if (this.wallHitFlash > 0) {
      const f = Math.floor(performance.now() / 50) % 2 === 0;
      this.mesh.visible = f;
    } else {
      this.mesh.visible = true;
    }
  }

  applyBoost(duration = 1.5) {
    this.boostTimer = Math.max(this.boostTimer, duration);
    if (this.speed < CarPhysics.MAX_SPEED) this.speed = CarPhysics.MAX_SPEED;
    this.speed += 15;
  }

  applySpin() {
    if (this.invincibleTimer > 0) return;
    this.spinTimer = 1.2;
    this.speed *= 0.3;
  }

  applySquish() {
    if (this.invincibleTimer > 0) return;
    this.squishTimer = 4.0;
    this.speed *= 0.5;
  }

  applyShield(duration = 5.0) {
    this.invincibleTimer = Math.max(this.invincibleTimer, duration);
  }

  getState() {
    return {
      x: this.x, z: this.z, y: this.y,
      angle: this.angle, speed: this.speed,
      lap: this.lap, prog: this.totalProgress,
      boost: this.boostTimer > 0,
      shield: this.invincibleTimer > 0,
      squish: this.squishTimer > 0,
      spin: this.spinTimer > 0,
      finished: this.finished
    };
  }

  applyState(st) {
    this.x = st.x; this.z = st.z; this.y = st.y || 0;
    this.angle = st.angle; this.speed = st.speed;
    this.lap = st.lap; this.totalProgress = st.prog;
    this.boostTimer = st.boost ? 1 : 0;
    this.invincibleTimer = st.shield ? 1 : 0;
    this.squishTimer = st.squish ? 1 : 0;
    this.spinTimer = st.spin ? 1 : 0;
    this.finished = st.finished;
  }
}
