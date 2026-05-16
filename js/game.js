// ============= ゲームコア =============
const Game = {
  renderer: null,
  scene: null,
  camera: null,
  clock: null,

  cars: [],
  localCar: null,
  state: 'idle',
  raceStartTime: 0,
  totalLaps: 3,
  lastSendTime: 0,
  netSendInterval: 50,

  miniCtx: null,
  miniCanvas: null,
  miniStaticCanvas: null,
  wrongWayEl: null,
  _miniNeedsStaticRedraw: true,
  _miniNextAt: 0,
  _hudStandingsNextAt: 0,
  hudEls: null,

  mode: 'multi',
  currentMapId: 'grand',

  _camShakeTime: 0,
  _camShakeAmp: 0,

  // 順位変動通知用
  _prevRanks: new Map(),
  doubleItemBoxChance: 0.18,

  init() {
    this._initThree();
    this._initMini();
    this._cacheHudEls();
    this.wrongWayEl = document.getElementById('wrong-way');
    Input.init();
    if (window.SFX) SFX.init();
    window.addEventListener('resize', () => this._onResize());
  },

  _initThree() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.3, 900);
    this.camera.position.set(0, 2, -5);
    this.camera.lookAt(0, 1, 0);

    this.clock = new THREE.Clock();
    const initialMap = (window.GameUI && GameUI.getSelectedMap) ? GameUI.getSelectedMap() : 'grand';
    this._buildScene(initialMap);
  },

  _buildScene(mapId) {
    this.currentMapId = (window.Track && Track.normalizeMapId) ? Track.normalizeMapId(mapId) : (mapId || 'grand');
    this.scene = new THREE.Scene();

    if (this.currentMapId === 'volcano') {
      const hemi = new THREE.HemisphereLight(0xff8866, 0x3a1a14, 0.9);
      this.scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffd0a0, 0.8);
      dir.position.set(100, 150, 80);
      this.scene.add(dir);
      const fill = new THREE.DirectionalLight(0xff5522, 0.35);
      fill.position.set(-80, 30, -50);
      this.scene.add(fill);
    } else {
      const hemi = new THREE.HemisphereLight(0xf5fbff, 0x67a55c, 1.0);
      this.scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 0.85);
      dir.position.set(120, 150, 90);
      this.scene.add(dir);
      const fill = new THREE.DirectionalLight(0x90caf9, 0.18);
      fill.position.set(-90, 45, -40);
      this.scene.add(fill);
    }

    Track.generate(this.scene, this.currentMapId);
    ItemSystem.init(this.scene);
    this._miniBounds = null;
    this._miniNeedsStaticRedraw = true;
  },

  _initMini() {
    this.miniCanvas = document.createElement('canvas');
    this.miniCanvas.width = 220;
    this.miniCanvas.height = 220;
    this.miniCanvas.style.width = '100%';
    this.miniCanvas.style.height = '100%';
    document.getElementById('hud-minimap').appendChild(this.miniCanvas);
    this.miniCtx = this.miniCanvas.getContext('2d');
    this.miniStaticCanvas = document.createElement('canvas');
    this.miniStaticCanvas.width = this.miniCanvas.width;
    this.miniStaticCanvas.height = this.miniCanvas.height;
  },

  _cacheHudEls() {
    this.hudEls = {
      time: document.getElementById('hud-time'),
      lap: document.getElementById('hud-lap'),
      pos: document.getElementById('hud-pos'),
      speed: document.getElementById('hud-speed'),
      best: document.getElementById('hud-best'),
      steerFill: document.getElementById('steer-fill'),
      driftCharge: document.getElementById('drift-charge'),
      standings: document.getElementById('hud-standings'),
    };
  },

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  },

  setupRace(playersList, localId, mode, mapId) {
    this.mode = mode || 'multi';
    ItemSystem.reset();
    this._buildScene(mapId || this.currentMapId);
    this.cars = [];
    this.localCar = null;

    const numCars = playersList.length;
    const positions = Track.getStartPositions(numCars);

    for (let i = 0; i < playersList.length; i++) {
      const p = playersList[i];
      const pos = positions[i];
      let cType = p.carType;
      if (!cType && p.isAI) {
        const types = ['balanced', 'speed', 'accel', 'handling', 'heavy', 'drift', 'stunt', 'offroad', 'turbo'];
        cType = types[Math.floor(Math.random() * types.length)];
      }
      const car = new Car({
        id: p.id,
        name: p.name,
        color: p.color,
        isLocal: p.id === localId,
        isAI: !!p.isAI,
        carType: cType,
        x: pos.x, z: pos.z, angle: pos.angle,
      });
      this.scene.add(car.mesh);
      car.initProgress();
      this.cars.push(car);
      if (p.id === localId) this.localCar = car;
      if (p.isAI) AIDriver.init(p.id);
    }

    if (this.localCar) {
      this._updateCamera(0, true);
      if (GameUI.updateCoins) GameUI.updateCoins(this.localCar.coins || 0);
    }
    if (this.wrongWayEl) {
      this.wrongWayEl.classList.remove('show', 'rescue');
      this.wrongWayEl.dataset.mode = 'off';
      this.wrongWayEl.textContent = '⚠ 逆走中！';
    }

    this.state = 'countdown';
    this.lapTimes = {};
    this._prevRanks.clear();
  },

  startCountdown(startTime) {
    const wait = Math.max(0, startTime - Date.now());
    GameUI.runCountdown(wait, () => {
      this.state = 'racing';
      this.raceStartTime = performance.now();
      for (const c of this.cars) c.lapStartTime = this.raceStartTime;
      if (window.SFX) SFX.play('go');
    });
  },

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();

    if (this.state === 'racing' || this.state === 'finished') {
      this._updateLocal(dt);
      this._updateAIs(dt);
      this._handleCollisions();
      this._sendNetwork(now);
      this._updateMagnet(dt);
      ItemSystem.update(dt, this.cars);
      this._checkPickups(now);
      this._checkPads(now);
      this._detectRankChanges();
      for (const c of this.cars) c.updateMesh();
    } else if (this.state === 'countdown') {
      for (const c of this.cars) c.updateMesh();
    }

    Track.update(dt, now);
    this._updateCamera(dt);
    this._updateHUD(now);
    this._updateMinimap(now);

    this.renderer.render(this.scene, this.camera);
  },

  _updateLocal(dt) {
    if (!this.localCar) return;
    if (this.localCar.finished) {
      this.localCar.applyInput(0, false, true, dt);
    } else {
      this.localCar.applyInput(Input.steer, Input.accel, Input.brake, dt);
      this.localCar.updateProgress(performance.now());
      if (Input.consumeItemUse() && this.localCar.item) {
        this.useItem(this.localCar, this.cars);
      }
      // 壁ヒットでカメラ揺れ
      if (this.localCar.wallHitFlash > 0.2) {
        this._camShakeTime = 0.3;
        this._camShakeAmp = 0.4;
        if (window.SFX) SFX.play('wall');
      }
      // 逆走警告
      if (this.wrongWayEl) {
        const mode = this.localCar.wrongWayRescueTimer > 0
          ? 'rescue'
          : (this.localCar.wrongWayTimer > 1.0 ? 'warn' : 'off');
        if (this.wrongWayEl.dataset.mode !== mode) {
          this.wrongWayEl.dataset.mode = mode;
          if (mode === 'rescue') {
            this.wrongWayEl.classList.add('show', 'rescue');
            this.wrongWayEl.textContent = '🛟 方向修正中…';
          } else if (mode === 'warn') {
            this.wrongWayEl.classList.add('show');
            this.wrongWayEl.classList.remove('rescue');
            this.wrongWayEl.textContent = '⚠ 逆走中！';
          } else {
            this.wrongWayEl.classList.remove('show', 'rescue');
            this.wrongWayEl.textContent = '⚠ 逆走中！';
          }
        }
      }
      if (this.localCar.lap >= this.totalLaps && !this.localCar.finished) {
        this.localCar.finished = true;
        this.localCar.finishTime = performance.now() - this.raceStartTime;
        Net.sendFinished(this.localCar.finishTime);
        this._checkRaceEnd();
      }
    }
  },

  _updateAIs(dt) {
    if (this.mode !== 'solo') return;
    for (const c of this.cars) {
      if (!c.isAI) continue;
      if (c.finished) { c.applyInput(0, false, true, dt); continue; }
      AIDriver.update(c, dt, this.cars);
      c.updateProgress(performance.now());
      if (c.lap >= this.totalLaps && !c.finished) {
        c.finished = true;
        c.finishTime = performance.now() - this.raceStartTime;
        this._checkRaceEnd();
      }
    }
  },

  // マグネット効果: 範囲内のアイテムボックスを吸引
  _updateMagnet(dt) {
    for (const c of this.cars) {
      if (!c.magnetTimer || c.magnetTimer <= 0) continue;
      c.magnetTimer -= dt;
      const range = 9;
      for (const b of Track.itemBoxes) {
        if (!b.active) continue;
        const d = Utils.dist2(b.x, b.z, c.x, c.z);
        if (d < range && d > 0.5) {
          // ゆっくり吸い寄せる (ボックスメッシュの見た目とコリジョン位置を移動)
          const t = 1 - Math.min(1, d / range);
          const dx = c.x - b.x, dz = c.z - b.z;
          b.x += (dx / d) * t * 22 * dt;
          b.z += (dz / d) * t * 22 * dt;
          b.mesh.position.x = b.x;
          b.mesh.position.z = b.z;
          if (b.ring) { b.ring.position.x = b.x; b.ring.position.z = b.z; }
          if (b.beam) { b.beam.position.x = b.x; b.beam.position.z = b.z; }
        }
      }
    }
  },

  // 車同士の衝突 (ゴースト中は無効)
  _handleCollisions() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        if (a.ghostTimer > 0 || b.ghostTimer > 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const minD = 2.5;
        if (d < minD && d > 0.001) {
          const overlap = (minD - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.z += nz * overlap;
          const ra = a.speed * 0.7;
          const rb = b.speed * 0.7;
          a.speed = ra * 0.55 + rb * 0.45;
          b.speed = ra * 0.45 + rb * 0.55;
          // 衝撃音
          if ((a.isLocal || b.isLocal) && window.SFX && Math.abs(ra - rb) > 6) SFX.play('bump');
        }
      }
    }
  },

  _detectRankChanges() {
    if (!this.localCar) return;
    const sorted = [...this.cars].sort((a, b) => b.totalProgress - a.totalProgress);
    sorted.forEach((c, idx) => {
      const newRank = idx + 1;
      const old = this._prevRanks.get(c.id);
      this._prevRanks.set(c.id, newRank);
      if (c.id === this.localCar.id && old !== undefined && old !== newRank) {
        if (newRank < old) {
          // 順位上昇
          showToast(`▲ ${newRank}位 にアップ！`, 900);
        } else if (newRank > old && newRank <= this.cars.length) {
          showToast(`▼ ${newRank}位 に...`, 900);
        }
      }
    });
  },

  _sendNetwork(now) {
    if (this.mode !== 'multi') return;
    if (!this.localCar) return;
    if (now - this.lastSendTime < this.netSendInterval) return;
    this.lastSendTime = now;
    Net.sendState({
      x: this.localCar.x, z: this.localCar.z, angle: this.localCar.angle,
      speed: this.localCar.speed,
      lap: this.localCar.lap,
      totalProgress: this.localCar.totalProgress,
      boost: this.localCar.boostTimer > 0,
      mini: this.localCar.miniTurboTimer > 0,
      shield: this.localCar.invincibleTimer > 0,
      squish: this.localCar.squishTimer > 0,
      ghost: this.localCar.ghostTimer > 0,
      y: this.localCar.y,
    });
  },

  applyRemoteState(id, state) {
    const car = this.cars.find(c => c.id === id);
    if (!car || car.isLocal) return;
    car.x = Utils.lerp(car.x, state.x, 0.55);
    car.z = Utils.lerp(car.z, state.z, 0.55);
    if (state.y !== undefined) car.y = Utils.lerp(car.y, state.y, 0.5);
    const diff = Utils.angDiff(state.angle, car.angle);
    car.angle += diff * 0.5;
    car.speed = state.speed;
    car.lap = state.lap;
    car.totalProgress = state.totalProgress;
    car.boostTimer = state.boost ? 0.2 : 0;
    car.miniTurboTimer = state.mini ? 0.2 : 0;
    car.invincibleTimer = state.shield ? 0.2 : car.invincibleTimer;
    car.squishTimer = state.squish ? 0.2 : 0;
    car.ghostTimer = state.ghost ? 0.2 : 0;
  },

  applyRemoteAction(action) {
    const car = this.cars.find(c => c.id === action.by);
    if (!car) return;
    if (action.kind === 'banana') ItemSystem.spawnBanana(car);
    else if (action.kind === 'oil') ItemSystem.spawnOil(car);
    else if (action.kind === 'mine') ItemSystem.spawnMine(car);
    else if (action.kind === 'rocket') {
      const tgt = this._findRocketTarget(car);
      ItemSystem.spawnRocket(car, tgt);
    } else if (action.kind === 'tripleRocket') {
      const targets = this._findRocketTargets(car, 3);
      ItemSystem.spawnTripleRocket(car, targets);
    } else if (action.kind === 'lightning') {
      for (const c of this.cars) {
        if (c.id === action.by) continue;
        if (c.invincibleTimer > 0) continue;
        c.hitLightning();
      }
      GameUI.flashScreen('#fff', 250);
    } else if (action.kind === 'ink') {
      for (const c of this.cars) {
        if (c.id === action.by) continue;
        c.hitInkSplash();
      }
      if (action.by !== Net.myId) GameUI.flashInk();
    } else if (action.kind === 'boost') {
      car.applyBoost(2.5);
    } else if (action.kind === 'tripleBoost') {
      ItemSystem.applyTripleBoost(car);
    } else if (action.kind === 'shield') {
      car.giveShield(5);
    } else if (action.kind === 'ghost') {
      ItemSystem.applyGhost(car);
    } else if (action.kind === 'magnet') {
      ItemSystem.applyMagnet(car);
    } else if (action.kind === 'killer') {
      ItemSystem.applyKiller(car);
    }
  },

  useItem(car, allCars) {
    if (!car.item) return;
    const item = car.consumeItem();
    if (!item) return;

    if (window.SFX) SFX.play('item');

    if (item === 'boost') {
      car.applyBoost(2.5);
      Net.sendAction({ kind: 'boost' });
    } else if (item === 'tripleBoost') {
      ItemSystem.applyTripleBoost(car);
      Net.sendAction({ kind: 'tripleBoost' });
    } else if (item === 'shield') {
      car.giveShield(5);
      Net.sendAction({ kind: 'shield' });
    } else if (item === 'banana') {
      ItemSystem.spawnBanana(car);
      Net.sendAction({ kind: 'banana' });
    } else if (item === 'oil') {
      ItemSystem.spawnOil(car);
      Net.sendAction({ kind: 'oil' });
    } else if (item === 'mine') {
      ItemSystem.spawnMine(car);
      Net.sendAction({ kind: 'mine' });
    } else if (item === 'rocket') {
      const tgt = this._findRocketTarget(car);
      ItemSystem.spawnRocket(car, tgt);
      Net.sendAction({ kind: 'rocket' });
    } else if (item === 'tripleRocket') {
      const targets = this._findRocketTargets(car, 3);
      ItemSystem.spawnTripleRocket(car, targets);
      Net.sendAction({ kind: 'tripleRocket' });
    } else if (item === 'lightning') {
      ItemSystem.triggerLightning(car, allCars);
      Net.sendAction({ kind: 'lightning' });
    } else if (item === 'ink') {
      ItemSystem.triggerInk(car, allCars);
      Net.sendAction({ kind: 'ink' });
    } else if (item === 'ghost') {
      ItemSystem.applyGhost(car);
      Net.sendAction({ kind: 'ghost' });
    } else if (item === 'magnet') {
      ItemSystem.applyMagnet(car);
      Net.sendAction({ kind: 'magnet' });
    } else if (item === 'killer') {
      ItemSystem.applyKiller(car);
      Net.sendAction({ kind: 'killer' });
    }
    if (car.isLocal) {
      const held = (typeof car.getHeldItems === 'function') ? car.getHeldItems() : (car.item ? [car.item] : []);
      GameUI.updateItem(held.length ? held : null);
      const d = ItemSystem.getDisplay(item);
      showToast(`${d.emoji} ${d.label}!`, 1000);
    }
  },

  _findRocketTarget(car) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.cars) {
      if (c.id === car.id) continue;
      if (c.finished) continue;
      if (c.totalProgress <= car.totalProgress) continue;
      const d = Utils.dist2(car.x, car.z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) {
      for (const c of this.cars) {
        if (c.id === car.id) continue;
        if (c.finished) continue;
        const d = Utils.dist2(car.x, car.z, c.x, c.z);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    return best;
  },

  _findRocketTargets(car, count = 3) {
    // 前方のプレイヤーを進行度順にソートして count 個取得
    const candidates = this.cars
      .filter(c => c.id !== car.id && !c.finished)
      .sort((a, b) => a.totalProgress - b.totalProgress);
    // 自分より前方を優先
    const front = candidates.filter(c => c.totalProgress > car.totalProgress);
    const others = candidates.filter(c => c.totalProgress <= car.totalProgress);
    const list = [...front, ...others];
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(list[i % list.length] || null);
    }
    return out;
  },

  _checkPads(now) {
    for (const c of this.cars) {
      if (c.finished) continue;
      const r = Track.checkPads(c, now);
      if (r.boost) {
        c.applyBoost(1.6);
        if (c.isLocal) {
          this._camShakeTime = 0.18;
          this._camShakeAmp = 0.25;
          showToast('⚡ BOOST PAD!', 700);
          if (window.SFX) SFX.play('boost');
        }
      }
      if (r.jump) {
        c.applyJump(18);
        c.deployGlider(3.5);
        if (c.isLocal) {
          showToast('💨 GEYSER!', 700);
          if (window.SFX) SFX.play('jump');
        }
      }
      if (r.lava) {
        // 溶岩プール: スリップ + 軽い炎上ダメージ
        if (c.hitOilSplash) c.hitOilSplash();
        c.speed *= 0.55;
        if (c.isLocal) {
          this._camShakeTime = 0.25;
          this._camShakeAmp = 0.35;
          showToast('🔥 LAVA!', 700);
          if (window.SFX) SFX.play('wall');
          GameUI.flashScreen && GameUI.flashScreen('#ff3300', 220);
        }
      }
      // 転がる溶岩岩との衝突
      if (Track.checkBoulderHit) {
        const bh = Track.checkBoulderHit(c, now);
        if (bh.hit) {
          // 跳ね返し
          c.speed *= 0.45;
          c.x += bh.nx * 0.8;
          c.z += bh.nz * 0.8;
          c.wallHitFlash = 0.6;
          if (c.isLocal) {
            this._camShakeTime = 0.35;
            this._camShakeAmp = 0.5;
            showToast('🪨 BOULDER!', 700);
            if (window.SFX) SFX.play('bump');
          }
        }
      }
    }
  },

  _checkPickups(now) {
    for (const c of this.cars) {
      if (c.finished) continue;
      if (!c.item) {
        if (Track.collectItemBox(c.x, c.z, 2.4)) {
          const rank = this._getRank(c);
          const firstItem = ItemSystem.weightedRoll(rank, this.cars.length);
          const isDouble = Math.random() < this.doubleItemBoxChance;
          let secondItem = null;
          if (isDouble) {
            secondItem = ItemSystem.weightedRoll(rank, this.cars.length);
            if (typeof c.setDoubleItems === 'function') c.setDoubleItems(firstItem, secondItem);
            else c.setItem(firstItem);
          } else {
            c.setItem(firstItem);
          }
          if (c.isLocal) {
            const held = (typeof c.getHeldItems === 'function') ? c.getHeldItems() : (c.item ? [c.item] : []);
            GameUI.updateItem(held.length ? held : null);
            if (isDouble && secondItem) {
              const d1 = ItemSystem.getDisplay(firstItem);
              const d2 = ItemSystem.getDisplay(secondItem);
              showToast(`🎁 ダブル！ ${d1.emoji}${d2.emoji} アイテム2個ゲット！`, 1200);
            } else {
              showToast(`${ItemSystem.getDisplay(firstItem).emoji} ${ItemSystem.getDisplay(firstItem).label} ゲット！`, 1200);
            }
            if (window.SFX) SFX.play('pickup');
          }
        }
      }
      if (Track.collectCoin && Track.collectCoin(c.x, c.z, 2.0)) {
        const gained = c.addCoin ? c.addCoin(1) : false;
        if (c.isLocal && gained && GameUI.updateCoins) {
          GameUI.updateCoins(c.coins);
          if (window.SFX) SFX.play('pickup');
        }
      }
    }
  },

  _getRank(car) {
    const sorted = [...this.cars].sort((a, b) => b.totalProgress - a.totalProgress);
    return sorted.findIndex(c => c.id === car.id) + 1;
  },

  _checkRaceEnd() {
    const allDone = this.cars.every(c => c.finished);
    if (allDone && this.state !== 'finished') {
      this.state = 'finished';
      setTimeout(() => GameUI.showResults(this.cars), 1500);
    } else if (this.localCar && this.localCar.finished && this.state !== 'finished') {
      this._waitTimer = setTimeout(() => {
        this.state = 'finished';
        GameUI.showResults(this.cars);
      }, 15000);
    }
  },

  forceFinish() {
    this._checkRaceEnd();
  },

  _updateCamera(dt, snap = false) {
    if (!this.localCar) return;
    const c = this.localCar;
    const absSpeed = Math.abs(c.speed);

    const speedT = Utils.clamp(absSpeed / CarPhysics.MAX_SPEED, 0, 1);
    const back = Utils.lerp(4.9, 6.2, speedT);
    const up   = Utils.lerp(3.6, 3.2, speedT);
    const lookFwd = Utils.lerp(7, 16, speedT);

    let backDir = 1;
    if (c.speed < -1) backDir = -1;

    const yOff = c.y * 0.7;

    const tx = c.x - Math.sin(c.angle) * back * backDir;
    const tz = c.z - Math.cos(c.angle) * back * backDir;
    const ty = up + yOff;

    if (snap) {
      this.camera.position.set(tx, ty, tz);
    } else {
      const followStrength = Utils.lerp(0.22, 0.32, speedT);
      this.camera.position.x = Utils.lerp(this.camera.position.x, tx, followStrength);
      this.camera.position.y = Utils.lerp(this.camera.position.y, ty, 0.25);
      this.camera.position.z = Utils.lerp(this.camera.position.z, tz, followStrength);
    }

    const lx = c.x + Math.sin(c.angle) * lookFwd * backDir;
    const lz = c.z + Math.cos(c.angle) * lookFwd * backDir;
    const ly = 1.1 + c.y * 0.5;

    let shakeX = 0, shakeY = 0;
    if (this._camShakeTime > 0) {
      this._camShakeTime -= dt;
      const amp = this._camShakeAmp * (this._camShakeTime / 0.3);
      shakeX = (Math.random() - 0.5) * amp;
      shakeY = (Math.random() - 0.5) * amp;
    }
    if (c.boostTimer > 0) {
      shakeX += (Math.random() - 0.5) * 0.1;
      shakeY += (Math.random() - 0.5) * 0.1;
    }

    this.camera.position.x += shakeX;
    this.camera.position.y += shakeY;

    this.camera.lookAt(lx, ly, lz);

    const baseFov = 52;
    const speedFovAdd = Math.min(14, absSpeed * 0.22);
    let targetFov = baseFov + speedFovAdd;
    if (c.boostTimer > 0) targetFov = 76;
    else if (c.miniTurboTimer > 0) targetFov = 66;
    this.camera.fov = Utils.lerp(this.camera.fov, targetFov, 0.1);
    this.camera.updateProjectionMatrix();
  },

  _updateHUD(now) {
    if (!this.localCar) return;
    const hud = this.hudEls || {};
    const elapsed = (this.state === 'racing' || this.state === 'finished')
      ? (this.localCar.finished ? this.localCar.finishTime : (now - this.raceStartTime))
      : 0;
    if (hud.time) hud.time.textContent = Utils.formatTime(elapsed);
    const lapDisp = this.localCar.finished ? this.totalLaps : Math.min(this.localCar.lap + 1, this.totalLaps);
    if (hud.lap) hud.lap.textContent = `${lapDisp}/${this.totalLaps}`;
    const rank = this._getRank(this.localCar);
    if (hud.pos) hud.pos.textContent = `${rank}/${this.cars.length}`;
    const sp = Math.abs(this.localCar.speed) * 3.6;
    if (hud.speed) hud.speed.textContent = Math.floor(sp);

    const bestEl = hud.best;
    if (bestEl) {
      if (isFinite(this.localCar.bestLap)) {
        bestEl.textContent = 'BEST ' + Utils.formatTime(this.localCar.bestLap);
        bestEl.style.display = '';
      } else {
        bestEl.style.display = 'none';
      }
    }

    // ステアインジケーター
    const fill = hud.steerFill;
    if (fill) {
      const s = Input.steer;
      const w = Math.abs(s) * 50;
      fill.style.width = w + '%';
      fill.style.transform = s >= 0 ? 'translateX(0)' : `translateX(-100%)`;
    }

    // ドリフトチャージ表示
    const dc = hud.driftCharge;
    if (dc) {
      const ch = this.localCar.driftCharge;
      if (this.localCar.driftActive && ch > 0) {
        dc.classList.add('show');
        let col = '#ffffff', lvl = 'CHARGE';
        if (ch >= 3) { col = '#E040FB'; lvl = 'ULTRA!'; }
        else if (ch >= 2) { col = '#FFEB3B'; lvl = 'SUPER'; }
        else if (ch >= 1) { col = '#40C4FF'; lvl = 'MINI'; }
        dc.style.color = col;
        dc.textContent = lvl;
      } else {
        dc.classList.remove('show');
      }
    }

    // 最終ラップ装飾
    const hudLap = hud.lap;
    if (hudLap) {
      if (this.localCar.lap === this.totalLaps - 1 && !this.localCar.finished) {
        hudLap.parentElement.classList.add('final-lap');
      } else {
        hudLap.parentElement.classList.remove('final-lap');
      }
    }

    if (now >= this._hudStandingsNextAt) {
      this._hudStandingsNextAt = now + 180;
      this._updateStandings();
    }
  },

  _updateStandings() {
    const el = this.hudEls ? this.hudEls.standings : document.getElementById('hud-standings');
    if (!el) return;
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });
    let html = '';
    sorted.forEach((c, i) => {
      const cls = c.isLocal ? 'standings-row you' : 'standings-row';
      const lapInfo = c.finished ? '✓' : (c.lap + 1);
      html += `<div class="${cls}">`
        + `<span class="standings-rank">${i+1}.</span>`
        + `<span class="standings-chip" style="background:${c.color}"></span>`
        + `<span class="standings-name">${this._escape(c.name)}</span>`
        + `<span class="standings-lap">L${lapInfo}</span>`
        + `</div>`;
    });
    el.innerHTML = html;
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  },

  _updateMinimap(now = performance.now()) {
    if (!this.miniCtx) return;
    if (now < this._miniNextAt) return;
    this._miniNextAt = now + 50;
    const ctx = this.miniCtx;
    const W = this.miniCanvas.width;
    const H = this.miniCanvas.height;
    if (!this._miniBounds) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of Track.pathPoints) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
      const pad = 30;
      this._miniBounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    }
    const b = this._miniBounds;
    const sx = W / (b.maxX - b.minX);
    const sz = H / (b.maxZ - b.minZ);
    const toX = (x) => (x - b.minX) * sx;
    const toZ = (z) => H - (z - b.minZ) * sz;

    if (this._miniNeedsStaticRedraw && this.miniStaticCanvas) {
      const sctx = this.miniStaticCanvas.getContext('2d');
      sctx.clearRect(0, 0, W, H);
      sctx.lineWidth = 11;
      sctx.strokeStyle = '#666';
      sctx.beginPath();
      Track.pathPoints.forEach((p, i) => {
        const x = toX(p.x), y = toZ(p.z);
        if (i === 0) sctx.moveTo(x, y); else sctx.lineTo(x, y);
      });
      sctx.closePath();
      sctx.stroke();
      sctx.lineWidth = 8;
      sctx.strokeStyle = '#bbb';
      sctx.stroke();
      sctx.lineWidth = 1.2;
      sctx.strokeStyle = '#fff';
      sctx.setLineDash([4, 4]);
      sctx.stroke();
      sctx.setLineDash([]);

      const sp = Track.pathPoints[0];
      sctx.fillStyle = '#C62828';
      sctx.beginPath();
      sctx.arc(toX(sp.x), toZ(sp.z), 5, 0, Math.PI * 2);
      sctx.fill();

      if (Track.boostPads) {
        sctx.fillStyle = '#FF9800';
        for (const p of Track.boostPads) {
          sctx.beginPath();
          sctx.arc(toX(p.x), toZ(p.z), 2.2, 0, Math.PI * 2);
          sctx.fill();
        }
      }
      if (Track.jumpPads) {
        sctx.fillStyle = '#FFAB40';
        for (const p of Track.jumpPads) {
          sctx.beginPath();
          sctx.arc(toX(p.x), toZ(p.z), 3.2, 0, Math.PI * 2);
          sctx.fill();
        }
      }
      if (Track.lavaPools) {
        sctx.fillStyle = '#FF3D00';
        for (const lp of Track.lavaPools) {
          sctx.beginPath();
          sctx.arc(toX(lp.x), toZ(lp.z), 2.8, 0, Math.PI * 2);
          sctx.fill();
        }
      }
      if (Track.coins) {
        sctx.fillStyle = '#FFD54F';
        for (const coin of Track.coins) {
          sctx.beginPath();
          sctx.arc(toX(coin.x), toZ(coin.z), 1.8, 0, Math.PI * 2);
          sctx.fill();
        }
      }
      this._miniNeedsStaticRedraw = false;
    }
    ctx.clearRect(0, 0, W, H);
    if (this.miniStaticCanvas) ctx.drawImage(this.miniStaticCanvas, 0, 0);

    // 転がる岩 (動的位置)
    if (Track.boulders) {
      ctx.fillStyle = '#5D4037';
      ctx.strokeStyle = '#FF6F00';
      ctx.lineWidth = 1.2;
      for (const b of Track.boulders) {
        ctx.beginPath();
        ctx.arc(toX(b.mesh.position.x), toZ(b.mesh.position.z), 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 投射物 (バナナ・地雷・オイル) をミニマップに
    if (ItemSystem.projectiles) {
      for (const p of ItemSystem.projectiles) {
        let col = null;
        if (p.kind === 'banana') col = '#FFEB3B';
        else if (p.kind === 'oil') col = '#212121';
        else if (p.kind === 'mine') col = '#FF1744';
        if (col) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(toX(p.x), toZ(p.z), 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (const c of this.cars) {
      ctx.beginPath();
      ctx.fillStyle = c.color;
      ctx.strokeStyle = c.isLocal ? '#000' : '#fff';
      ctx.lineWidth = c.isLocal ? 2 : 1;
      ctx.arc(toX(c.x), toZ(c.z), c.isLocal ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 進行方向の三角
      const fx = Math.sin(c.angle), fz = Math.cos(c.angle);
      ctx.strokeStyle = c.isLocal ? '#000' : '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(toX(c.x), toZ(c.z));
      ctx.lineTo(toX(c.x + fx * 6), toZ(c.z + fz * 6));
      ctx.stroke();
    }
  },
};
