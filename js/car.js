// ============= 車（プレイヤー / リモート / AI共通モデル） =============
const CarPhysics = {
  MAX_SPEED: 54,            // m/s (約195km/h)
  MAX_SPEED_BOOST: 88,
  MAX_SPEED_MINI: 68,       // ミニターボ時
  KILLER_SPEED: 102,        // キラー中の最低巡航速度
  ACCEL: 38,                // 加速向上 (より楽しく)
  BRAKE: 58,
  REVERSE_ACCEL: 18,
  FRICTION: 4.2,            // 自然減速をやや弱く
  OFFTRACK_FRICTION: 22,
  STEER_SPEED: 3.9,         // ハンドリング向上
  STEER_AT_SPEED: 0.26,     // 高速時の効き低下を緩和
  LATERAL_GRIP: 10.5,
  SPIN_FRICTION: 4.0,
  WALL_BOUNCE: 0.50,        // 壁反発 (高め: ハマり防止)
  WALL_FRICTION: 0.50,      // 壁衝突時の減速率
  RADIUS: 1.2,
  STUCK_TIME: 2.2,          // 自動復帰を少し早く
  STUCK_SPEED: 1.5,
};

// ===== 車種ごとの統計値 (デフォルト=balanced からの乗数) =====
const CarTypeStats = {
  balanced:  { maxSpeed: 1.00, accel: 1.00, steer: 1.00, weight: 1.00, friction: 1.00 },
  speed:     { maxSpeed: 1.15, accel: 0.82, steer: 0.85, weight: 1.10, friction: 0.95 },
  accel:     { maxSpeed: 0.92, accel: 1.40, steer: 1.05, weight: 0.85, friction: 1.10 },
  handling:  { maxSpeed: 0.98, accel: 0.95, steer: 1.30, weight: 0.90, friction: 1.05 },
  heavy:     { maxSpeed: 1.08, accel: 0.78, steer: 0.78, weight: 1.50, friction: 0.90 },
  // === 新規追加 ===
  drift:     { maxSpeed: 1.02, accel: 0.92, steer: 1.18, weight: 0.92, friction: 0.78, driftBonus: 1.35 },  // ドリフト特化 (低摩擦 + ミニターボ強化)
  stunt:     { maxSpeed: 1.00, accel: 1.10, steer: 1.10, weight: 0.80, friction: 1.00, airBonus: 1.30 },    // 空中ボーナス + 軽量で着地強い
  offroad:   { maxSpeed: 0.95, accel: 1.05, steer: 1.00, weight: 1.20, friction: 1.20, offBonus: 1.50 },    // オフロード/ラフ路で減速少
  turbo:     { maxSpeed: 1.10, accel: 1.20, steer: 0.92, weight: 0.95, friction: 0.92, boostBonus: 1.40 },  // ブースト効果増大
};
const LAP_CHECKPOINT_RATIOS = Object.freeze([0.25, 0.5, 0.75]);
const WrongWayRescue = Object.freeze({
  TRIGGER_TIME: 1.6,
  EFFECT_DURATION: 1.2,
  RESPAWN_PHASE: 0.55,
  COOLDOWN_MS: 4000,
  SPIN_TURNS: 4.5,
  LIFT_HEIGHT: 3.2,
});

class Car {
  constructor(opts = {}) {
    this.id = opts.id || 'p';
    this.name = opts.name || 'Player';
    this.color = opts.color || '#FF3B3B';
    this.isLocal = !!opts.isLocal;
    this.isAI = !!opts.isAI;
    this.carType = opts.carType || 'balanced';
    this.stats = CarTypeStats[this.carType] || CarTypeStats.balanced;

    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.y = (window.Track && Track.getSurfaceHeight) ? Track.getSurfaceHeight(this.x, this.z) : 0;
    this.vy = 0;
    this.airTime = 0;
    this.angle = opts.angle || 0;
    this.speed = 0;
    this.steerAngle = 0;
    this.spinTimer = 0;
    this.boostTimer = 0;
    this.miniTurboTimer = 0;     // ミニターボブースト
    this.invincibleTimer = 0;
    this.squishTimer = 0;
    this.lockedTimer = 0;
    this.wallHitFlash = 0;
    this.driftAmount = 0;
    this.driftDir = 0;            // -1/0/+1 ドリフト方向 (Bホールド + ステア)
    this.driftCharge = 0;         // 0..3 ミニターボチャージ
    this.driftActive = false;
    this.slowTimer = 0;           // オイル等の減速デバフ
    this.slowMul = 1.0;
    this.confuseTimer = 0;        // 逆操作デバフ (墨)
    this.inkScrambleTimer = 0;    // HUD/ミニマップスクランブル (新墨効果)
    this.magnetTimer = 0;         // 引き寄せ無効化など使わないが拡張用
    this.ghostTimer = 0;          // ゴースト(車衝突無効・半透明)
    this.killerTimer = 0;         // キラー(自動高速走行)

    // コイン (1枚で+2%最高速, 上限10枚)
    this.coins = 0;
    this.coinFlashTimer = 0;

    // グライダー (空中で展開、ゆっくり滑空)
    this.glider = false;
    this.gliderTimer = 0;
    this.gliderMesh = null;
    this.smallJumpActive = false;
    this.smallJumpTrickDone = false;
    this.smallJumpTrickSuccess = false;
    this.smallJumpFlipTimer = 0;
    this.smallJumpFlipDuration = 0.42;

    // 時間巻き戻し (ユニーク機能: マリオカートには無い)
    // 過去 3秒の状態をリングバッファに保存しておき、ボタン押下で巻き戻す
    this.rewindBuffer = [];     // [{t, x, z, y, angle, speed, lap, totalProgress}, ...]
    this.rewindBufferDur = 3.0; // 最大3秒
    this.rewindUsed = false;    // 1レース1回のみ
    this.rewinding = false;     // 巻き戻し演出中

    // アイテム
    this.item = null;
    this.itemExtra = null;
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
    this.lapCountReady = false;
    this.lapCheckpointStep = 0;
    this._lapCheckpointMarks = [];
    this._lapCheckpointPathLen = 0;
    this.lastProgressTime = 0;
    this.maxProgress = 0;       // ハイウォーターマーク (逆走検知用)
    this.wrongWayTimer = 0;     // 逆走時間累積
    this.stuckTimer = 0;        // 停滞時間累積
    this.lastRespawnTime = 0;
    this.wrongWayRescueTimer = 0;
    this.wrongWayRescueDuration = WrongWayRescue.EFFECT_DURATION;
    this.wrongWayRescueRespawned = false;

    this.lastWallHit = 0;        // 壁ヒット時刻
    this.consecutiveWallHits = 0; // 連続壁ヒット数
    this.wallRecoverTimer = 0;
    this.wallRecoverSteer = 0;
    this.wallImpactStrength = 0;

    this.mesh = this._buildMesh();
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
  }

  _buildMesh() {
    const group = new THREE.Group();
    const colorHex = parseInt(this.color.replace('#',''), 16);
    this._baseCarMeshes = [];
    const markBaseMesh = (m) => { this._baseCarMeshes.push(m); return m; };

    // ボディ（下）
    const body = markBaseMesh(new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.55, 3.4),
      new THREE.MeshLambertMaterial({ color: colorHex })
    ));
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);
    this._bodyMesh = body;

    // ボディ前部（テーパー）
    const nose = markBaseMesh(new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.4, 0.8),
      new THREE.MeshLambertMaterial({ color: colorHex })
    ));
    nose.position.set(0, 0.45, 1.85);
    group.add(nose);

    // ボディ（上 - キャビン）
    const cabin = markBaseMesh(new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.65, 1.7),
      new THREE.MeshLambertMaterial({ color: 0xfafafa })
    ));
    cabin.position.set(0, 1.1, -0.15);
    cabin.castShadow = true;
    group.add(cabin);

    // フロントウィンドウ
    const win = markBaseMesh(new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.5, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x29384a })
    ));
    win.position.set(0, 1.1, 0.75);
    group.add(win);
    const winR = markBaseMesh(win.clone());
    winR.position.set(0, 1.1, -1.05);
    group.add(winR);

    // スポイラー
    const spoiler = markBaseMesh(new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.12, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    ));
    spoiler.position.set(0, 1.2, -1.65);
    group.add(spoiler);
    const spStandL = markBaseMesh(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15),
      new THREE.MeshLambertMaterial({ color: 0x222222 })));
    spStandL.position.set(-0.7, 1.0, -1.55);
    const spStandR = markBaseMesh(spStandL.clone()); spStandR.position.x = 0.7;
    group.add(spStandL, spStandR);

    // ヘッドライト
    const lightGeo = new THREE.BoxGeometry(0.32, 0.22, 0.1);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffae6 });
    const hl1 = markBaseMesh(new THREE.Mesh(lightGeo, lightMat)); hl1.position.set(-0.55, 0.52, 2.22); group.add(hl1);
    const hl2 = markBaseMesh(new THREE.Mesh(lightGeo, lightMat)); hl2.position.set( 0.55, 0.52, 2.22); group.add(hl2);

    // テールライト
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xd32f2f });
    const tl1 = markBaseMesh(new THREE.Mesh(lightGeo, tlMat)); tl1.position.set(-0.55, 0.52, -1.78); group.add(tl1);
    const tl2 = markBaseMesh(new THREE.Mesh(lightGeo, tlMat)); tl2.position.set( 0.55, 0.52, -1.78); group.add(tl2);

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
      const tg = markBaseMesh(new THREE.Group());
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

    // ドリフトチャージ用スパーク (タイヤ周辺の火花)
    this.sparkMeshes = [];
    for (let i = 0; i < 8; i++) {
      const sk = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 5, 5),
        new THREE.MeshBasicMaterial({ color: 0x40C4FF, transparent: true, opacity: 0 })
      );
      sk.visible = false;
      group.add(sk);
      this.sparkMeshes.push({ mesh: sk, life: 0 });
    }

    // ドリフトスモーク
    this.smokeMeshes = [];
    for (let i = 0; i < 8; i++) {
      const sm = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
      );
      sm.visible = false;
      group.add(sm);
      this.smokeMeshes.push({ mesh: sm, life: 0 });
    }

    // 墨スプラッシュ(コンフューズ時に視界に出す用): スプライト
    this.confuseSprite = null;

    // ===== グライダー翼 (空中で展開) =====
    const wingGrp = new THREE.Group();
    const wingMat = new THREE.MeshLambertMaterial({
      color: colorHex, side: THREE.DoubleSide,
      transparent: true, opacity: 0.85,
    });
    // 左翼
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 1.2), wingMat);
    wingL.position.set(-2.0, 0, 0);
    wingL.rotation.z = 0.08;
    wingGrp.add(wingL);
    // 右翼
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 1.2), wingMat);
    wingR.position.set(2.0, 0, 0);
    wingR.rotation.z = -0.08;
    wingGrp.add(wingR);
    // 中央フレーム
    const wingC = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xfafafa }));
    wingGrp.add(wingC);
    // ストラップ
    const strapMat = new THREE.MeshBasicMaterial({ color: 0x424242 });
    const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), strapMat);
    strapL.position.set(-0.6, -0.7, 0);
    const strapR = strapL.clone(); strapR.position.x = 0.6;
    wingGrp.add(strapL, strapR);

    wingGrp.position.set(0, 2.6, 0);
    wingGrp.visible = false;
    group.add(wingGrp);
    this.gliderMesh = wingGrp;
    this._baseCarMeshes.push(wingGrp);

    // ===== キラー時の大砲モデル =====
    const cannon = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.85, 4.2, 18),
      new THREE.MeshLambertMaterial({ color: 0x212121, emissive: 0xffb300, emissiveIntensity: 0.22 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.y = 0.9;
    cannon.add(barrel);
    const muzzle = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.1, 10, 22),
      new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.85 })
    );
    muzzle.position.set(0, 0.9, 2.08);
    cannon.add(muzzle);
    const rear = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.9, 16),
      new THREE.MeshLambertMaterial({ color: colorHex, emissive: 0x330000, emissiveIntensity: 0.35 })
    );
    rear.rotation.x = Math.PI / 2;
    rear.position.set(0, 0.9, -2.0);
    cannon.add(rear);
    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.7, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.95 })
    );
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(0, 0.9, -3.0);
    cannon.add(trail);
    cannon.visible = false;
    group.add(cannon);
    this.killerCannonMesh = cannon;
    this.killerTrailMesh = trail;
    this.killerMuzzleMesh = muzzle;

    // ===== コインカウンター表示 (車の上に小さく) =====
    this.coinIcon = null;

    return group;
  }

  _buildLabel(name, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(name, 128, 33);
    ctx.fillText(name, 128, 33);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(2.8, 0.65, 1);
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

  _groundHeight(hintIdx = this.lastProgressIdx) {
    return (window.Track && Track.getSurfaceHeight) ? Track.getSurfaceHeight(this.x, this.z, hintIdx, this.y) : 0;
  }

  isAirborne(margin = undefined) {
    const MIN_HEIGHT_MARGIN = 0.35;
    const MIN_UPWARD_VELOCITY = 0.15;
    const MIN_AIR_TIME = 0.05;
    const heightMargin = Number.isFinite(margin) ? margin : MIN_HEIGHT_MARGIN;
    const groundY = this._groundHeight();
    return this.y > groundY + heightMargin
      || this.vy > MIN_UPWARD_VELOCITY
      || this.airTime > MIN_AIR_TIME
      || (this.glider && this.gliderTimer > 0);
  }

  // 入力からの操作 (steer: -1..+1, accel, brake bool)
  applyInput(steer, accel, brake, dt) {
    this.wallImpactStrength = 0;
    if (this.wrongWayRescueTimer > 0) {
      this.wrongWayRescueTimer = Math.max(0, this.wrongWayRescueTimer - dt);
      const respawnRemain = this.wrongWayRescueDuration * (1 - WrongWayRescue.RESPAWN_PHASE);
      if (!this.wrongWayRescueRespawned && this.wrongWayRescueTimer <= respawnRemain) {
        this.respawn({ preserveWrongWayRescue: true });
        this.wrongWayRescueRespawned = true;
      }
      if (this.wrongWayRescueTimer <= 0) {
        this.wrongWayRescueRespawned = false;
      }
      this.speed = 0;
      this.vy = 0;
      this._tickEffects(dt);
      return;
    }
    // ロック中(雷など)
    if (this.lockedTimer > 0) {
      this.lockedTimer -= dt;
      steer = 0; accel = false; brake = false;
    }
    const killerActive = this.killerTimer > 0;
    if (killerActive) {
      this.killerTimer = Math.max(0, this.killerTimer - dt);
      // キラー中は操作不能 + 自動操舵
      accel = true;
      brake = false;
      this.lockedTimer = 0;
      this.spinTimer = 0;
      this.confuseTimer = 0;
      this.slowTimer = 0;
      this.slowMul = 1.0;
      this.driftActive = false;
      this.driftCharge = 0;
      this.invincibleTimer = Math.max(this.invincibleTimer, 0.25);
      this.boostTimer = Math.max(this.boostTimer, 0.2);
      let idx = this.lastProgressIdx;
      if (window.Track && Track.getProgress) {
        const p = Track.getProgress(this.x, this.z, this.lastProgressIdx, this.y);
        if (p && Number.isFinite(p.index)) idx = p.index;
      }
      const n = Track.pathPoints.length;
      if (n > 2) {
        const tgt = Track.pathPoints[(idx + 6) % n];
        const targetAng = Math.atan2(tgt.x - this.x, tgt.z - this.z);
        const diff = Utils.angDiff(targetAng, this.angle);
        steer = Utils.clamp(diff * 2.0, -1, 1);
      } else {
        steer = 0;
      }
      this.speed = Math.max(this.speed, CarPhysics.KILLER_SPEED * 0.96);
    }
    // スピン中
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.angle += dt * 12;
      this.speed *= Math.pow(0.2, dt);
      this._integratePos(dt);
      this._tickEffects(dt);
      return;
    }

    // コンフューズ(墨): 弱体化 - 反転ではなく舵が鈍るのみ
    if (this.confuseTimer > 0) {
      this.confuseTimer -= dt;
      steer *= 0.55; // 操作半減のみ (完全反転は廃止)
    }

    if (this.wallRecoverTimer > 0) {
      this.wallRecoverTimer = Math.max(0, this.wallRecoverTimer - dt);
      const assist = Utils.clamp(0.35 + this.wallRecoverTimer * 2.4, 0.35, 0.8);
      steer = Utils.lerp(steer, this.wallRecoverSteer, assist);
    }

    // 加速 (コインボーナス: 1枚で+2%加速 + 車種別 accel 倍率)
    const accelMul = (1 + Math.min(10, this.coins) * 0.02) * (this.stats.accel || 1);
    if (accel) this.speed += CarPhysics.ACCEL * accelMul * dt;
    if (brake) {
      if (this.speed > 0.2) this.speed -= CarPhysics.BRAKE * dt;
      else this.speed -= CarPhysics.REVERSE_ACCEL * dt;
    }

    // 自然減速 (車種別 friction 倍率)
    if (!accel && !brake) {
      const sign = Math.sign(this.speed);
      this.speed -= sign * CarPhysics.FRICTION * (this.stats.friction || 1) * dt;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }

    // コース外摩擦 (オフロード車種は減速ペナルティを軽減)
    if (Track.isOffTrack(this.x, this.z, this.lastProgressIdx, this.y)) {
      const sign = Math.sign(this.speed);
      const offMul = this.stats.offBonus ? (1 / this.stats.offBonus) : 1;
      this.speed -= sign * CarPhysics.OFFTRACK_FRICTION * dt * offMul;
    }

    // スロー(オイル)デバフ
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      this.speed *= Math.pow(this.slowMul, dt);
    } else {
      this.slowMul = 1.0;
    }

    // 最大速度（ブースト＞ミニターボ＞通常）
    let maxSp = CarPhysics.MAX_SPEED;
    if (this.boostTimer > 0) maxSp = CarPhysics.MAX_SPEED_BOOST;
    else if (this.miniTurboTimer > 0) maxSp = CarPhysics.MAX_SPEED_MINI;
    if (killerActive) maxSp = Math.max(maxSp, CarPhysics.KILLER_SPEED);
    // コインボーナス: 1枚で+2% (最大10枚 = +20%) + 車種別 maxSpeed 倍率
    const coinMul = 1 + Math.min(10, this.coins) * 0.02;
    maxSp *= coinMul * (this.stats.maxSpeed || 1);
    this.speed = Utils.clamp(this.speed, -CarPhysics.MAX_SPEED * 0.5, maxSp);
    if (killerActive) {
      this.speed = Math.max(this.speed, Math.min(maxSp, CarPhysics.KILLER_SPEED * 0.96));
    }

    // === ドリフト処理 ===
    // ブレーキ + 移動中 + ある程度の速度 = ドリフト発動
    const wantDrift = brake && this.speed > 22 && Math.abs(steer) > 0.25;
    if (wantDrift && !this.driftActive) {
      this.driftActive = true;
      this.driftDir = Math.sign(steer);
    }
    if (this.driftActive) {
      // ドリフト中は摩擦が小さくブレーキとしては効きにくい
      if (this.speed < 18) {
        this._releaseDrift();
      } else if (!brake) {
        this._releaseDrift();
      } else {
        // ドリフト中はチャージ蓄積 (ドリフター車種はチャージ率増加)
        const dBonus = this.stats.driftBonus || 1.0;
        this.driftCharge = Math.min(3, this.driftCharge + dt * (0.85 + Math.abs(steer) * 0.6) * dBonus);
      }
    }

    // 操舵: 一定速度以上で効きが良くなる
    steer = Math.sign(steer) * Math.pow(Math.min(1, Math.abs(steer)), 1.15);
    const absSp = Math.abs(this.speed);
    const speedFactor = Utils.clamp(0.55 + absSp / 22, 0.55, 1.0);
    const highSpeedDamp = 1 - Math.min(1, absSp / CarPhysics.MAX_SPEED) * CarPhysics.STEER_AT_SPEED;
    // ドリフト時は片方向に強く曲がる (車種別 steer 倍率)
    let turnEffect = CarPhysics.STEER_SPEED * speedFactor * highSpeedDamp * (this.stats.steer || 1);
    if (this.driftActive) turnEffect *= 1.35;
    const dir = Math.sign(this.speed) || 1;
    this.angle += steer * turnEffect * dt * dir;
    this.steerAngle = Utils.lerp(this.steerAngle, steer * 0.5, 0.35);

    // ドリフト演出量
    const targetDrift = this.driftActive ? 1.0 : Math.abs(steer) * Math.min(1, absSp / 30);
    this.driftAmount = Utils.lerp(this.driftAmount, targetDrift, 0.25);

    this._tickEffects(dt);

    const groundY = this._groundHeight();

    // 重力 & ジャンプ
    if (this.y > groundY || this.vy > 0) {
      // 空中で一定以上の高さがあり、かつ落下中ならグライダーを自動展開
      if (this.y > groundY + 1.8 && this.vy < 0 && !this.glider && this.airTime > 0.25) {
        this.deployGlider(3.0);
      }
      // グライダー有効中は重力が弱く前進推進が付く
      const gravity = (this.glider && this.gliderTimer > 0) ? 8 : 30;
      this.vy -= gravity * dt;
      // グライダー中は落下速度の下限を制限 (ゆっくり)
      if (this.glider && this.gliderTimer > 0 && this.vy < -6) this.vy = -6;
      this.y += this.vy * dt;
      this.airTime += dt;
      // グライダー中は推進力 (空中加速)
      if (this.glider && this.gliderTimer > 0) {
        this.gliderTimer -= dt;
        this.speed = Math.min(this.speed + 14 * dt, CarPhysics.MAX_SPEED * 1.05);
      }
      if (this.y <= groundY) {
        this.y = groundY; this.vy = 0;
        // 着地時にミニトリックボーナス (空中時間に応じて少しブースト)
        // スタント車種は空中ボーナス増加
        const airBonus = this.stats.airBonus || 1.0;
        if (this.smallJumpActive) {
          if (this.smallJumpTrickSuccess) {
            this.applyMiniTurbo(1.05 * airBonus);
            if (this.isLocal && typeof showToast === 'function') showToast('🌀 TRICK BOOST!', 800);
          }
        } else if (this.airTime > 0.5 && !this.driftActive) {
          this.applyMiniTurbo((0.5 + Math.min(0.8, this.airTime * 0.35)) * airBonus);
        }
        // 長時間滞空時のグライダーボーナス
        if (!this.smallJumpActive && this.glider && this.airTime > 1.5) {
          this.applyBoost(0.8 * airBonus);
          if (this.isLocal && typeof showToast === 'function') showToast('🪂 GLIDE BOOST!', 800);
        }
        this.glider = false;
        this.gliderTimer = 0;
        this.airTime = 0;
        this._resetSmallJump();
      }
    } else {
      // 地上ではグライダー解除
      this.y = groundY;
      if (this.glider) {
        this.glider = false;
        this.gliderTimer = 0;
      }
      if (this.smallJumpActive) this._resetSmallJump();
    }

    this._integratePos(dt);

    // 空中時は壁チェックを緩和
    if (this.y > groundY + 0.3) {
      return;
    }

    // 壁衝突処理 (ハマり対策: 法線方向に押し戻し+接線方向にスライド)
    // サブステップ中に既に検出された衝突情報があればそれを優先
    let wr = this._pendingWallHit;
    this._pendingWallHit = null;
    if (!wr || !wr.hit) {
      wr = Track.resolveWalls(this.x, this.z, CarPhysics.RADIUS, this.lastProgressIdx, this.y);
    } else {
      // 念のためもう一度押し戻し (まだめり込んでいる可能性)
      const wr2 = Track.resolveWalls(this.x, this.z, CarPhysics.RADIUS, this.lastProgressIdx, this.y);
      if (wr2.hit) { this.x = wr2.x; this.z = wr2.z; }
    }
    if (wr.hit) {
      this.x = wr.x; this.z = wr.z;
      const fx = Math.sin(this.angle), fz = Math.cos(this.angle);
      const dotN = Math.max(0, fx * (-wr.nx) + fz * (-wr.nz));
      const segDir = Track._segDir[wr.index] || { ux: -wr.nz, uz: wr.nx };
      let slideUx = segDir.ux;
      let slideUz = segDir.uz;
      if (fx * slideUx + fz * slideUz < 0) {
        slideUx = -slideUx;
        slideUz = -slideUz;
      }

      const slideAng = Math.atan2(slideUx, slideUz);
      const aDiff = Utils.angDiff(slideAng, this.angle);
      const entrySpeed = Math.abs(this.speed);
      const keepSpeed = entrySpeed * Utils.clamp(0.84 - dotN * 0.22, 0.48, 0.84);
      const wantsReverseSlide = this.speed < -0.5 || (brake && !accel && this.speed < 0);
      let slideSpeed = wantsReverseSlide ? -keepSpeed : keepSpeed;
      if (!wantsReverseSlide) {
        if (accel) slideSpeed = Math.max(slideSpeed, 8.5 + dotN * 4.5);
        else if (!brake) slideSpeed = Math.max(slideSpeed, 4.5);
      } else {
        slideSpeed = -Math.max(Math.abs(slideSpeed), 5.5);
      }
      this.speed = Utils.clamp(slideSpeed, -CarPhysics.MAX_SPEED * 0.35, CarPhysics.MAX_SPEED * 0.6);

      const inwardPush = 0.16 + Math.min(0.32, entrySpeed * 0.01) + dotN * 0.08;
      this.x += wr.nx * inwardPush;
      this.z += wr.nz * inwardPush;

      const turnFix = Utils.clamp(0.22 + dotN * 0.32, 0.22, 0.48);
      this.angle += aDiff * turnFix;
      this.wallRecoverTimer = 0.12;
      this.wallRecoverSteer = Utils.clamp(Math.sign(aDiff || 1) * 0.4, -0.4, 0.4);

      // 壁ヒット演出
      this.wallHitFlash = 0.28;
      const now = performance.now();
      if (now - this.lastWallHit > 120 || dotN > 0.55) {
        this.wallImpactStrength = Math.max(
          this.wallImpactStrength,
          Utils.clamp(0.08 + dotN * 0.24 + entrySpeed * 0.003, 0.08, 0.22)
        );
      }
      if (now - this.lastWallHit < 600) {
        this.consecutiveWallHits++;
        // 連続ヒット → 壁から内側へさらに押し戻す (ハマり脱出補助)
        const push = 0.4 + this.consecutiveWallHits * 0.3;
        this.x += wr.nx * push;
        this.z += wr.nz * push;
        if (this.consecutiveWallHits >= 3) {
          // 自動で車体を路面中央方向へ向ける
          const cur = Track.pathPoints[this.lastProgressIdx];
          const nextIdx = (this.lastProgressIdx + 4) % Track.pathPoints.length;
          const nxt = Track.pathPoints[nextIdx];
          const desired = Math.atan2(nxt.x - cur.x, nxt.z - cur.z);
          const d2 = Utils.angDiff(desired, this.angle);
          this.angle += d2 * 0.35;
          this.consecutiveWallHits = 0;
        }
      } else {
        this.consecutiveWallHits = 1;
      }
      this.lastWallHit = now;
    } else if (performance.now() - this.lastWallHit > 800) {
      this.consecutiveWallHits = 0;
    }
  }

  consumeWallImpact() {
    const impact = this.wallImpactStrength;
    this.wallImpactStrength = 0;
    return impact;
  }

  _tickEffects(dt) {
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (this.miniTurboTimer > 0) this.miniTurboTimer -= dt;
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.squishTimer > 0) this.squishTimer -= dt;
    if (this.wallHitFlash > 0) this.wallHitFlash -= dt;
    if (this.ghostTimer > 0) this.ghostTimer -= dt;
    if (this.inkScrambleTimer > 0) this.inkScrambleTimer -= dt;
    if (this.smallJumpFlipTimer > 0) this.smallJumpFlipTimer = Math.max(0, this.smallJumpFlipTimer - dt);
    // 巻き戻しバッファに状態を保存 (ローカルのみで十分だが全車保存しても軽量)
    this._recordRewindSnapshot(dt);
  }

  _recordRewindSnapshot(dt) {
    if (this.rewinding) return;
    this._rewindAccum = (this._rewindAccum || 0) + dt;
    // 0.08秒ごとにサンプル (約12fps相当、3秒で~37サンプル)
    if (this._rewindAccum < 0.08) return;
    this._rewindAccum = 0;
    const t = performance.now() / 1000;
    this.rewindBuffer.push({
      t, x: this.x, z: this.z, y: this.y,
      angle: this.angle, speed: this.speed,
      lap: this.lap, totalProgress: this.totalProgress,
      lastProgressIdx: this.lastProgressIdx,
    });
    // 古いサンプルを捨てる
    const cutoff = t - this.rewindBufferDur;
    while (this.rewindBuffer.length > 0 && this.rewindBuffer[0].t < cutoff) {
      this.rewindBuffer.shift();
    }
  }

  // 巻き戻し実行 (3秒前の状態へ瞬間移動)
  doRewind() {
    if (this.rewindUsed) return false;
    if (this.rewindBuffer.length < 3) return false;
    // 一番古い (=3秒前) サンプルへ
    const snap = this.rewindBuffer[0];
    this.x = snap.x; this.z = snap.z; this.y = snap.y;
    this.angle = snap.angle;
    this.speed = Math.max(snap.speed * 0.7, 8); // 少し落とす (連打防止)
    this.lastProgressIdx = snap.lastProgressIdx;
    // 状態リセット (悪い状態から逃れるため)
    this.spinTimer = 0; this.confuseTimer = 0; this.slowTimer = 0; this.inkScrambleTimer = 0;
    this.lockedTimer = 0; this.driftActive = false; this.driftCharge = 0;
    this.wallRecoverTimer = 0; this.consecutiveWallHits = 0;
    this.vy = 0; this.airTime = 0; this.glider = false; this.gliderTimer = 0;
    this._resetSmallJump();
    // 拡張デバフもリセット
    this.freezeTimer = 0; this.fogTimer = 0; this.slowMul = 1.0;
    // 短時間の無敵 (連続ダメージ防止)
    this.invincibleTimer = Math.max(this.invincibleTimer, 1.5);
    this.rewindBuffer = [];
    this.rewindUsed = true;
    this.rewinding = true;
    setTimeout(() => { this.rewinding = false; }, 350);
    return true;
  }

  _releaseDrift() {
    if (!this.driftActive) return;
    this.driftActive = false;
    // チャージに応じてミニターボ
    if (this.driftCharge >= 1.0 && this.driftCharge < 2.0) {
      this.applyMiniTurbo(0.7); // 青チャージ
      if (this.isLocal && typeof showToast === 'function') showToast('💨 MINI TURBO!', 700);
    } else if (this.driftCharge >= 2.0 && this.driftCharge < 3.0) {
      this.applyMiniTurbo(1.2); // 黄チャージ
      if (this.isLocal && typeof showToast === 'function') showToast('💨💨 SUPER TURBO!', 800);
    } else if (this.driftCharge >= 3.0) {
      this.applyBoost(1.8); // 紫: フルブースト
      if (this.isLocal && typeof showToast === 'function') showToast('🔥 ULTRA TURBO!', 900);
    }
    this.driftCharge = 0;
    this.driftDir = 0;
  }

  _integratePos(dt) {
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);
    const dx = fx * this.speed * dt;
    const dz = fz * this.speed * dt;
    // 1ステップの移動量が大きすぎる場合 (高速 + 大きなdt) は壁すり抜けを防ぐため、
    // サブステップに分割しつつ壁チェックを挟む
    const moveLen = Math.hypot(dx, dz);
    const maxStep = CarPhysics.RADIUS * 0.55; // 半径の半分以下のステップで壁を確実に検出
    const groundY = this._groundHeight();
    if (this.y <= groundY + 0.3 && moveLen > maxStep) {
      const n = Math.min(6, Math.ceil(moveLen / maxStep));
      const stepX = dx / n, stepZ = dz / n;
      for (let i = 0; i < n; i++) {
        this.x += stepX;
        this.z += stepZ;
        // サブステップごとに壁にめり込んだら押し戻す
        const wr = Track.resolveWalls(this.x, this.z, CarPhysics.RADIUS, this.lastProgressIdx, this.y);
        if (wr.hit) {
          this.x = wr.x; this.z = wr.z;
          this._pendingWallHit = wr;
          // 残ステップは速度方向を反射させて続行 (ループ脱出のため抜ける)
          break;
        }
      }
    } else {
      this.x += dx;
      this.z += dz;
    }
  }

  // メッシュ更新
  updateMesh() {
    const killerActive = this.killerTimer > 0;
    const now = performance.now();
    const rescueActive = this.wrongWayRescueTimer > 0;
    const rescueProgress = rescueActive
      ? Utils.clamp(1 - (this.wrongWayRescueTimer / this.wrongWayRescueDuration), 0, 1)
      : 0;
    const rescueLift = rescueActive
      ? Math.sin(rescueProgress * Math.PI) * WrongWayRescue.LIFT_HEIGHT
      : 0;

    this.mesh.position.set(this.x, this.y + rescueLift, this.z);
    if (rescueActive) {
      this.mesh.rotation.y = this.angle + rescueProgress * Math.PI * 2 * WrongWayRescue.SPIN_TURNS;
      this.mesh.rotation.z = Math.sin(rescueProgress * Math.PI * 4) * 0.16;
      this.mesh.rotation.x = Math.cos(rescueProgress * Math.PI * 2) * 0.06;
    } else {
      this.mesh.rotation.y = this.angle;
      // ロール(ステアに応じて少し傾ける)
      let rollExtra = 0;
      if (this.driftActive) rollExtra = -this.driftDir * 0.18;
      this.mesh.rotation.z = -this.steerAngle * 0.18 * Math.min(1, Math.abs(this.speed) / 30) + rollExtra;
      // 空中時はピッチ
      if (this.y > this._groundHeight() + 0.05) {
        const pitchAmt = Utils.clamp(this.vy * 0.04, -0.4, 0.4);
        let trickSpin = 0;
        if (this.smallJumpTrickDone && this.smallJumpFlipDuration > 0) {
          const done = 1 - (this.smallJumpFlipTimer / this.smallJumpFlipDuration);
          trickSpin = Utils.clamp(done, 0, 1) * Math.PI * 2;
        }
        this.mesh.rotation.x = pitchAmt + trickSpin;
      } else {
        this.mesh.rotation.x = 0;
      }
    }

    // 壁ヒット時に赤フラッシュ
    if (this._bodyMesh) {
      if (killerActive) {
        this._bodyMesh.material.emissive = new THREE.Color(0.2, 0.1, 0);
        this._bodyMesh.material.emissiveIntensity = 0.35;
      } else if (this.wallHitFlash > 0) {
        const intensity = this.wallHitFlash / 0.28;
        this._bodyMesh.material.emissive = new THREE.Color(intensity * 0.85, 0, 0);
        this._bodyMesh.material.emissiveIntensity = intensity;
      } else {
        this._bodyMesh.material.emissiveIntensity = 0;
      }
    }

    // ぺちゃんこ
    if (this.squishTimer > 0) {
      this.mesh.scale.set(1.3, 0.3, 1.3);
    } else if (this.ghostTimer > 0) {
      this.mesh.scale.set(1, 1, 1);
      // 半透明
      this.mesh.traverse(o => {
        if (o.material && o.material.transparent !== undefined && o !== this.shieldMesh) {
          o.material.transparent = true;
          o.material.opacity = 0.45;
        }
      });
    } else {
      this.mesh.scale.set(1, 1, 1);
      // 半透明解除
      this.mesh.traverse(o => {
        if (o.material && o.material.opacity !== undefined && o !== this.shieldMesh && o !== this.nameSprite && !(o.material.map && o.material.map.image && o.material.map.image.tagName === 'CANVAS')) {
          // シールドや名前ラベル以外は不透明に戻す
        }
      });
      if (this._bodyMesh) this._bodyMesh.material.opacity = 1.0;
    }

    // タイヤ回転
    if (this.tires) {
      const rot = this.speed * 0.5;
      for (const t of this.tires) {
        if (t.children[0]) t.children[0].rotation.x += rot * 0.05;
        if (t.children[1]) t.children[1].rotation.x += rot * 0.05;
      }
      if (this.tires[0] && this.tires[1]) {
        this.tires[0].rotation.y = this.steerAngle;
        this.tires[1].rotation.y = this.steerAngle;
      }
    }

    // 炎エフェクト (ブースト/ミニターボ時)
    const boostShow = this.boostTimer > 0;
    const miniShow = this.miniTurboTimer > 0;
    const showFlame = (boostShow || miniShow) && !killerActive;
    for (const f of this.flames) {
      f.visible = showFlame;
      if (showFlame) {
        f.scale.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.5, 1);
        if (boostShow) {
          f.material.color.setHSL(0.08 + Math.random() * 0.05, 1, 0.55);
        } else {
          // ミニターボ: 青〜紫
          f.material.color.setHSL(0.6 + Math.random() * 0.1, 0.9, 0.6);
        }
      }
    }

    // グライダー翼の表示
    if (this.gliderMesh) {
      const showG = !killerActive && this.glider && this.gliderTimer > 0 && this.y > this._groundHeight() + 0.5;
      this.gliderMesh.visible = showG;
      if (showG) {
        // 軽く揺れる
        this.gliderMesh.rotation.x = Math.sin(now * 0.006) * 0.08;
      }
    }
    if (this.coinFlashTimer > 0) this.coinFlashTimer -= 0.016;

    // シールド
    this.shieldMesh.visible = this.invincibleTimer > 0;
    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.y += 0.08;
      this.shieldMesh.rotation.x += 0.03;
      this.shieldMesh.material.opacity = 0.25 + Math.sin(now * 0.01) * 0.1;
    }

    this._updateSmoke();
    this._updateSparks();

    if (this._baseCarMeshes) {
      for (const m of this._baseCarMeshes) {
        if (m === this.gliderMesh) continue;
        m.visible = !killerActive;
      }
    }
    if (this.killerCannonMesh) {
      this.killerCannonMesh.visible = killerActive;
      if (killerActive) {
        const t = now * 0.01;
        this.killerCannonMesh.position.y = Math.sin(t) * 0.08;
        this.killerCannonMesh.rotation.z = Math.sin(t * 0.45) * 0.03;
        this.killerCannonMesh.scale.set(1.02 + Math.sin(t * 0.7) * 0.03, 1, 1.02);
        if (this.killerTrailMesh) {
          const sx = 1 + (Math.sin(t * 4.0) * 0.5 + 0.5) * 0.28;
          const sy = 1 + (Math.sin(t * 5.8 + 1.2) * 0.5 + 0.5) * 0.18;
          this.killerTrailMesh.scale.set(sx, sy, 1);
          this.killerTrailMesh.material.opacity = 0.7 + (Math.sin(t * 6.2 + 0.8) * 0.5 + 0.5) * 0.3;
        }
        if (this.killerMuzzleMesh) {
          this.killerMuzzleMesh.material.opacity = 0.5 + Math.sin(t * 1.3) * 0.25;
        }
      } else {
        this.killerCannonMesh.position.y = 0;
        this.killerCannonMesh.rotation.z = 0;
        this.killerCannonMesh.scale.set(1, 1, 1);
      }
    }
  }

  _updateSmoke() {
    const drifting = this.driftActive || (this.driftAmount > 0.55 && Math.abs(this.speed) > 22);
    if (drifting) {
      const free = this.smokeMeshes.find(s => s.life <= 0);
      if (free) {
        free.life = 0.6;
        free.mesh.visible = true;
        const side = Math.random() < 0.5 ? -1 : 1;
        free.mesh.position.set(side * 0.95, 0.4, -1.2);
        free.mesh.material.opacity = 0.8;
        // チャージ色: 1未満は白, 1+は青, 2+は黄, 3+は紫
        let color = 0xffffff;
        if (this.driftCharge >= 3) color = 0xab47bc;
        else if (this.driftCharge >= 2) color = 0xffeb3b;
        else if (this.driftCharge >= 1) color = 0x40C4FF;
        free.mesh.material.color.setHex(color);
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

  _updateSparks() {
    if (!this.driftActive || this.driftCharge < 0.6) {
      for (const s of this.sparkMeshes) {
        if (s.life > 0) {
          s.life -= 0.03;
          s.mesh.material.opacity = Math.max(0, s.life);
          if (s.life <= 0) s.mesh.visible = false;
        }
      }
      return;
    }
    const free = this.sparkMeshes.find(s => s.life <= 0);
    if (free) {
      free.life = 0.4;
      free.mesh.visible = true;
      const side = this.driftDir;
      free.mesh.position.set(side * 1.0 + (Math.random()-0.5) * 0.4, 0.45 + Math.random() * 0.6, -1.1 + (Math.random()-0.5) * 0.5);
      // 色: チャージレベル別
      let col = 0x40C4FF;
      if (this.driftCharge >= 3) col = 0xE040FB;
      else if (this.driftCharge >= 2) col = 0xFFEB3B;
      free.mesh.material.color.setHex(col);
      free.mesh.material.opacity = 1.0;
      free.mesh.scale.set(1, 1, 1);
    }
    for (const s of this.sparkMeshes) {
      if (s.life > 0) {
        s.life -= 0.04;
        s.mesh.position.y += 0.05;
        s.mesh.material.opacity = Math.max(0, s.life * 2.5);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
  }

  // 進行状況更新 → ラップ判定 + 逆走/スタック検知
  updateProgress(now) {
    if (this.finished) return;
    const prog = Track.getProgress(this.x, this.z, this.lastProgressIdx, this.y);
    const n = Track.pathPoints.length;
    if (this._lapCheckpointPathLen !== n) {
      const marks = LAP_CHECKPOINT_RATIOS
        .map(r => Math.floor(n * r))
        // スタート/ゴール線(0近傍)は周回判定と重なるため、チェックポイント対象から除外
        .filter((idx) => idx > 0 && idx < n);
      this._lapCheckpointMarks = [...new Set(marks)].sort((a, b) => a - b);
      this._lapCheckpointPathLen = n;
      this.lapCheckpointStep = 0;
    }
    if (!this.lapCountReady && prog.index > n * 0.2 && prog.index < n * 0.8) {
      this.lapCountReady = true;
    }

    const from = this.lastProgressIdx;
    const to = prog.index;
    const forwardStep = (to - from + n) % n;
    const backwardStep = (from - to + n) % n;
    const movedForward = forwardStep <= backwardStep;
    const didCrossMarker = (start, end, mark) => {
      if (start === end) return false;
      if (start < end) return start < mark && mark <= end;
      return mark > start || mark <= end;
    };
    if (movedForward && this.lapCheckpointStep < this._lapCheckpointMarks.length) {
      while (
        this.lapCheckpointStep < this._lapCheckpointMarks.length &&
        didCrossMarker(from, to, this._lapCheckpointMarks[this.lapCheckpointStep])
      ) {
        this.lapCheckpointStep++;
      }
    }

    // ラップ判定 (前→後 越境) - コース大型化に伴い境界をやや緩く
    if (
      this.lapCountReady &&
      this.lapCheckpointStep >= this._lapCheckpointMarks.length &&
      this.lastProgressIdx > n * 0.75 &&
      prog.index < n * 0.15
    ) {
      this.lap++;
      this.lapCheckpointStep = 0;
      const lapMs = now - this.lapStartTime;
      this.lastLap = lapMs;
      if (lapMs > 2000) this.bestLap = Math.min(this.bestLap, lapMs);
      this.lapStartTime = now;
      if (this.isLocal && typeof showToast === 'function' && this.lap < (Game.totalLaps || 3)) {
        const remaining = (Game.totalLaps || 3) - this.lap;
        if (remaining === 1) {
          showToast(`🏁 FINAL LAP!`, 1600);
        } else {
          showToast(`LAP ${this.lap + 1} / ${Game.totalLaps}`, 1200);
        }
      }
    } else if (this.lastProgressIdx < n * 0.15 && prog.index > n * 0.75) {
      if (this.lap > 0) this.lap--;
      this.lapCheckpointStep = 0;
    }
    this.lastProgressIdx = prog.index;
    this.totalProgress = this.lap * Track.pathLength + prog.totalDist;

    // 逆走検知 (進行度の揺れではなく「車速 + 向き」で判定)
    if (this.totalProgress > this.maxProgress) this.maxProgress = this.totalProgress;
    const TRACK_POINT_OFFSET = 2;
    const REVERSE_SPEED_THRESHOLD = -2;
    const FORWARD_SPEED_THRESHOLD = 4;
    const WRONG_WAY_HEADING_THRESHOLD = -0.35;
    const WRONG_WAY_DECAY_RATE = 1.2;
    const dtSec = this.lastProgressTime > 0
      ? Utils.clamp((now - this.lastProgressTime) / 1000, 0.001, 0.05)
      : 0.016;
    this.lastProgressTime = now;

    let headingDot = 1;
    if (n > 2) {
      const prev = Track.pathPoints[(prog.index - TRACK_POINT_OFFSET + n) % n];
      const next = Track.pathPoints[(prog.index + TRACK_POINT_OFFSET) % n];
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const tLen = Math.hypot(tx, tz) || 1;
      const ux = tx / tLen;
      const uz = tz / tLen;
      const fx = Math.sin(this.angle);
      const fz = Math.cos(this.angle);
      headingDot = fx * ux + fz * uz;
    }
    const goingBackwardBySpeed = this.speed < REVERSE_SPEED_THRESHOLD;
    const goingBackwardByHeading = this.speed > FORWARD_SPEED_THRESHOLD && headingDot < WRONG_WAY_HEADING_THRESHOLD;
    if (goingBackwardBySpeed || goingBackwardByHeading) {
      this.wrongWayTimer += dtSec;
    } else {
      this.wrongWayTimer = Math.max(0, this.wrongWayTimer - dtSec * WRONG_WAY_DECAY_RATE);
    }
    if (
      this.wrongWayTimer > WrongWayRescue.TRIGGER_TIME &&
      this.wrongWayRescueTimer <= 0 &&
      now - this.lastRespawnTime > WrongWayRescue.COOLDOWN_MS
    ) {
      this._startWrongWayRescue();
    }

    // スタック検知 (動いてないのに時間経過)
    if (Math.abs(this.speed) < CarPhysics.STUCK_SPEED) {
      this.stuckTimer += 0.016;
    } else {
      this.stuckTimer = 0;
    }
    if (this.stuckTimer > CarPhysics.STUCK_TIME && now - this.lastRespawnTime > 4000) {
      this.respawn();
      if (this.isLocal && typeof showToast === 'function') showToast('🔄 自動復帰！', 1200);
    }
  }

  // 路上の中央へ復活 (進行方向を向ける)
  respawn(opts = {}) {
    const idx = this.lastProgressIdx;
    const p = Track.pathPoints[idx];
    const next = Track.pathPoints[(idx + 2) % Track.pathPoints.length];
    this.x = p.x;
    this.z = p.z;
    this.y = this._groundHeight(idx);
    this.vy = 0;
    this.speed = 0;
    this.angle = Math.atan2(next.x - p.x, next.z - p.z);
    this.driftActive = false;
    this.driftCharge = 0;
    this.stuckTimer = 0;
    this.wrongWayTimer = 0;
    this.consecutiveWallHits = 0;
    this.lastRespawnTime = performance.now();
    if (!opts.preserveWrongWayRescue) {
      this.wrongWayRescueTimer = 0;
      this.wrongWayRescueRespawned = false;
    }
    // 拡張系のデバフタイマーもまとめてリセット (フリーズ/フォグ/ミニ等)
    this.freezeTimer = 0;
    this.fogTimer = 0;
    this.lockedTimer = 0;
    this.confuseTimer = 0;
    this.inkScrambleTimer = 0;
    this.slowTimer = 0;
    this.slowMul = 1.0;
    this.spinTimer = 0;
    this._resetSmallJump();
    this.giveShield(1.5); // 短時間の無敵で連鎖事故防止
  }

  _startWrongWayRescue() {
    this.wrongWayRescueTimer = this.wrongWayRescueDuration;
    this.wrongWayRescueRespawned = false;
    this.speed = 0;
    this.vy = 0;
    this.driftActive = false;
    this.driftCharge = 0;
    this._resetSmallJump();
    this.stuckTimer = 0;
    if (this.isLocal && typeof showToast === 'function') {
      showToast('🛟 逆走補正中…', 900);
    }
  }

  initProgress() {
    const prog = Track.getProgress(this.x, this.z, -1, this.y);
    this.lastProgressIdx = prog.index;
    this.totalProgress = 0;
    this.lap = 0;
    this.lapCountReady = false;
    this.lapCheckpointStep = 0;
    this._lapCheckpointMarks = [];
    this._lapCheckpointPathLen = 0;
    this.maxProgress = 0;
    this.lastProgressTime = performance.now();
    this.stuckTimer = 0;
    this.wrongWayTimer = 0;
    this.wrongWayRescueTimer = 0;
    this.wrongWayRescueRespawned = false;
  }

  applyBoost(seconds = 2.5) {
    // ターボ車種はブースト時間が伸びる
    const bMul = this.stats.boostBonus || 1.0;
    this.boostTimer = Math.max(this.boostTimer, seconds * bMul);
    this.speed = Math.max(this.speed, CarPhysics.MAX_SPEED * 1.05);
  }
  applyMiniTurbo(seconds = 0.7) {
    const bMul = this.stats.boostBonus || 1.0;
    this.miniTurboTimer = Math.max(this.miniTurboTimer, seconds * bMul);
    this.speed = Math.max(this.speed, CarPhysics.MAX_SPEED_MINI * 0.92);
  }

  applyJump(power = 12) {
    const groundY = this._groundHeight();
    if (this.y <= groundY + 0.1) {
      this.vy = power;
      this.y = groundY + 0.1;
    }
  }

  beginSmallJump(power = 9.5) {
    this.smallJumpActive = true;
    this.smallJumpTrickDone = false;
    this.smallJumpTrickSuccess = false;
    this.smallJumpFlipTimer = 0;
    this.applyJump(power);
  }

  trySmallJumpTrick() {
    if (!this.smallJumpActive || this.smallJumpTrickDone) return false;
    if (!this.isAirborne(0.08)) return false;
    this.smallJumpTrickDone = true;
    this.smallJumpTrickSuccess = true;
    this.smallJumpFlipTimer = this.smallJumpFlipDuration;
    return true;
  }

  _resetSmallJump() {
    this.smallJumpActive = false;
    this.smallJumpTrickDone = false;
    this.smallJumpTrickSuccess = false;
    this.smallJumpFlipTimer = 0;
  }

  applySlow(seconds, mul) {
    if (this.invincibleTimer > 0) return false;
    this.slowTimer = Math.max(this.slowTimer, seconds);
    this.slowMul = Math.min(this.slowMul, mul);
    return true;
  }
  applyConfuse(seconds) {
    if (this.invincibleTimer > 0) return false;
    this.confuseTimer = Math.max(this.confuseTimer, seconds);
    return true;
  }
  applyGhost(seconds) {
    this.ghostTimer = Math.max(this.ghostTimer, seconds);
  }

  hitBanana() {
    if (this.invincibleTimer > 0 || this.ghostTimer > 0 || this.killerTimer > 0) return false;
    this.spinTimer = 1.2;
    this.driftActive = false; this.driftCharge = 0;
    this.dropCoins(2);
    return true;
  }
  hitRocket() {
    if (this.invincibleTimer > 0 || this.ghostTimer > 0 || this.killerTimer > 0) return false;
    this.squishTimer = 1.6;
    this.lockedTimer = 1.6;
    this.speed = 0;
    this.dropCoins(3);
    return true;
  }
  hitLightning() {
    if (this.invincibleTimer > 0 || this.ghostTimer > 0 || this.killerTimer > 0) return false;
    this.squishTimer = 2.0;
    this.lockedTimer = 1.0;
    this.speed *= 0.3;
    return true;
  }
  hitOilSplash() {
    if (this.invincibleTimer > 0 || this.ghostTimer > 0 || this.killerTimer > 0) return false;
    this.spinTimer = Math.max(this.spinTimer, 0.6);
    this.applySlow(2.5, 0.5);
    return true;
  }
  hitInkSplash() {
    if (this.invincibleTimer > 0 || this.ghostTimer > 0 || this.killerTimer > 0) return false;
    // 新仕様: 操作妨害ではなく『HUD/ミニマップを乱す』効果に変更
    // - confuseTimer は短めに残す (僅かな操作鈍化はキャラ的演出)
    // - inkScrambleTimer でミニマップ/順位/スピード表示をスクランブル
    this.applyConfuse(0.6);
    this.inkScrambleTimer = Math.max(this.inkScrambleTimer || 0, 4.5);
    return true;
  }
  hitMine() {
    if (this.invincibleTimer > 0 || this.ghostTimer > 0 || this.killerTimer > 0) return false;
    this.squishTimer = 1.4;
    this.lockedTimer = 1.0;
    this.speed = 0;
    this.vy = 8;
    this.y = this._groundHeight() + 0.1;
    this.dropCoins(3);
    return true;
  }
  hitBananaCoinDrop() {
    this.dropCoins(2);
  }

  giveShield(seconds = 5) {
    this.invincibleTimer = Math.max(this.invincibleTimer, seconds);
  }

  activateKiller(seconds = 4.5) {
    this.killerTimer = Math.max(this.killerTimer, seconds);
    this.boostTimer = Math.max(this.boostTimer, seconds);
    this.invincibleTimer = Math.max(this.invincibleTimer, seconds);
    this.lockedTimer = 0;
    this.spinTimer = 0;
    this.confuseTimer = 0;
    this.slowTimer = 0;
    this.slowMul = 1.0;
    this.driftActive = false;
    this.driftCharge = 0;
    this.speed = Math.max(this.speed, CarPhysics.KILLER_SPEED * 0.96);
  }

  // コイン取得 (上限10枚)
  addCoin(n = 1) {
    const before = this.coins;
    this.coins = Math.min(10, this.coins + n);
    if (this.coins !== before) {
      this.coinFlashTimer = 0.5;
      // 取得時に少しだけ加速を上乗せ (取った感を出す)
      this.speed = Math.min(this.speed + 1.6, CarPhysics.MAX_SPEED_BOOST * 1.1);
      return true;
    }
    return false;
  }

  // 衝突や攻撃を受けた時にコインを少し落とす
  dropCoins(amount = 3) {
    const drop = Math.min(amount, this.coins);
    this.coins = Math.max(0, this.coins - drop);
    return drop;
  }

  // グライダー展開 (一定時間, 滞空)
  deployGlider(seconds = 2.5) {
    this.glider = true;
    this.gliderTimer = Math.max(this.gliderTimer, seconds);
  }

  setItem(item) {
    this.item = item || null;
    this.itemExtra = null;
    this._normalizeItemSlots();
  }
  setDoubleItems(itemA, itemB) {
    this.item = itemA || null;
    this.itemExtra = itemB || null;
    this._normalizeItemSlots();
  }
  getHeldItems() {
    const items = [];
    if (this.item) items.push(this.item);
    if (this.itemExtra) items.push(this.itemExtra);
    return items;
  }
  _normalizeItemSlots() {
    if (!this.item && this.itemExtra) {
      this.item = this.itemExtra;
      this.itemExtra = null;
    }
    this.itemReady = !!this.item;
  }
  consumeItem() {
    const it = this.item;
    this.item = this.itemExtra;
    this.itemExtra = null;
    this._normalizeItemSlots();
    return it;
  }
}
