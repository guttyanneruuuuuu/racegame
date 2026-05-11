// ============= ゲームコア =============
const Game = {
  // Three.js
  renderer: null,
  scene: null,
  camera: null,
  clock: null,

  // 状態
  cars: [],            // すべての車（ローカル + リモート + AI）
  localCar: null,
  state: 'idle',       // idle | countdown | racing | finished
  raceStartTime: 0,
  totalLaps: 3,
  lastSendTime: 0,
  netSendInterval: 50, // ms (20Hz)

  // ミニマップ
  miniCtx: null,
  miniCanvas: null,

  // モード: 'multi' | 'solo'
  mode: 'multi',

  init() {
    this._initThree();
    this._initMini();
    Input.init();
    window.addEventListener('resize', () => this._onResize());
  },

  _initThree() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 800);
    this.camera.position.set(0, 8, -14);
    this.camera.lookAt(0, 0, 0);

    // 光源
    const hemi = new THREE.HemisphereLight(0xffffff, 0x66aa55, 0.85);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(80, 120, 60);
    this.scene.add(dir);

    this.clock = new THREE.Clock();

    // トラック生成
    Track.generate(this.scene);
    ItemSystem.init(this.scene);
  },

  _initMini() {
    this.miniCanvas = document.createElement('canvas');
    this.miniCanvas.width = 220;
    this.miniCanvas.height = 220;
    this.miniCanvas.style.width = '100%';
    this.miniCanvas.style.height = '100%';
    document.getElementById('hud-minimap').appendChild(this.miniCanvas);
    this.miniCtx = this.miniCanvas.getContext('2d');
  },

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  },

  // ===================== レース準備 =====================
  setupRace(playersList, localId, mode) {
    this.mode = mode || 'multi';
    // 既存の車を削除
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = [];
    ItemSystem.reset();

    // スタート位置取得
    const numCars = playersList.length;
    const positions = Track.getStartPositions(numCars);

    for (let i = 0; i < playersList.length; i++) {
      const p = playersList[i];
      const pos = positions[i];
      const car = new Car({
        id: p.id,
        name: p.name,
        color: p.color,
        isLocal: p.id === localId,
        isAI: !!p.isAI,
        x: pos.x, z: pos.z, angle: pos.angle,
      });
      this.scene.add(car.mesh);
      car.initProgress();
      this.cars.push(car);
      if (p.id === localId) this.localCar = car;
      if (p.isAI) AIDriver.init(p.id);
    }

    // カメラを自車後ろに
    if (this.localCar) {
      this._updateCamera(0, true);
    }

    this.state = 'countdown';
    this.lapTimes = {};
  },

  startCountdown(startTime) {
    // startTime は Date.now() ベース
    const wait = Math.max(0, startTime - Date.now());
    GameUI.runCountdown(wait, () => {
      this.state = 'racing';
      this.raceStartTime = performance.now();
      for (const c of this.cars) c.lapStartTime = this.raceStartTime;
    });
  },

  // ===================== メインループ =====================
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();

    if (this.state === 'racing' || this.state === 'finished') {
      this._updateLocal(dt);
      this._updateAIs(dt);
      this._handleCollisions();
      this._sendNetwork(now);
      ItemSystem.update(dt, this.cars);
      this._checkPickups(now);
      for (const c of this.cars) c.updateMesh();
    } else if (this.state === 'countdown') {
      // カウント中: 入力無視、メッシュ更新のみ
      for (const c of this.cars) c.updateMesh();
    }

    Track.update(dt, now);
    this._updateCamera(dt);
    this._updateHUD(now);
    this._updateMinimap();

    this.renderer.render(this.scene, this.camera);
  },

  _updateLocal(dt) {
    if (!this.localCar) return;
    if (this.localCar.finished) {
      // 慣性で残す
      this.localCar.applyInput(0, false, true, dt);
    } else {
      this.localCar.applyInput(Input.steer, Input.accel, Input.brake, dt);
      this.localCar.updateProgress(performance.now());
      // アイテム使用
      if (Input.consumeItemUse() && this.localCar.item) {
        this.useItem(this.localCar, this.cars);
      }
      // ゴール判定
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

  // 車同士の衝突 - 押し合い
  _handleCollisions() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const minD = 2.6;
        if (d < minD && d > 0.001) {
          const overlap = (minD - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.z += nz * overlap;
          // 速度の交換(軽く)
          const ra = a.speed * 0.7;
          const rb = b.speed * 0.7;
          a.speed = ra * 0.5 + rb * 0.5;
          b.speed = ra * 0.5 + rb * 0.5;
        }
      }
    }
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
      shield: this.localCar.invincibleTimer > 0,
      squish: this.localCar.squishTimer > 0,
    });
  },

  // リモート車の状態を反映
  applyRemoteState(id, state) {
    const car = this.cars.find(c => c.id === id);
    if (!car || car.isLocal) return;
    // 単純補間
    car.x = Utils.lerp(car.x, state.x, 0.5);
    car.z = Utils.lerp(car.z, state.z, 0.5);
    // 角度は最短経路で
    const diff = Utils.angDiff(state.angle, car.angle);
    car.angle += diff * 0.5;
    car.speed = state.speed;
    car.lap = state.lap;
    car.totalProgress = state.totalProgress;
    car.boostTimer = state.boost ? 0.2 : 0;
    car.invincibleTimer = state.shield ? 0.2 : car.invincibleTimer;
    car.squishTimer = state.squish ? 0.2 : 0;
  },

  // リモートのアクション(アイテム使用)
  applyRemoteAction(action) {
    const car = this.cars.find(c => c.id === action.by);
    if (!car) return;
    if (action.kind === 'banana') ItemSystem.spawnBanana(car);
    else if (action.kind === 'rocket') {
      const tgt = this._findRocketTarget(car);
      ItemSystem.spawnRocket(car, tgt);
    } else if (action.kind === 'lightning') {
      // 雷は全車に効果（ローカル含めて適用、発射者は除外）
      for (const c of this.cars) {
        if (c.id === action.by) continue;
        if (c.invincibleTimer > 0) continue;
        c.hitLightning();
      }
      GameUI.flashScreen('#fff', 200);
    } else if (action.kind === 'boost') {
      car.applyBoost(2.5);
    } else if (action.kind === 'shield') {
      car.giveShield(5);
    }
  },

  // ローカルでアイテム使用
  useItem(car, allCars) {
    if (!car.item) return;
    const item = car.consumeItem();
    GameUI.updateItem(null);
    if (item === 'boost') {
      car.applyBoost(2.5);
      Net.sendAction({ kind: 'boost' });
    } else if (item === 'shield') {
      car.giveShield(5);
      Net.sendAction({ kind: 'shield' });
    } else if (item === 'banana') {
      ItemSystem.spawnBanana(car);
      Net.sendAction({ kind: 'banana' });
    } else if (item === 'rocket') {
      const tgt = this._findRocketTarget(car);
      ItemSystem.spawnRocket(car, tgt);
      Net.sendAction({ kind: 'rocket' });
    } else if (item === 'lightning') {
      ItemSystem.triggerLightning(car, allCars);
      Net.sendAction({ kind: 'lightning' });
    }
    showToast(`${ItemSystem.getDisplay(item).emoji} ${ItemSystem.getDisplay(item).label}!`, 1000);
  },

  _findRocketTarget(car) {
    // 自分より前方にいる、最も近い車を探す
    let best = null;
    let bestD = Infinity;
    for (const c of this.cars) {
      if (c.id === car.id) continue;
      if (c.finished) continue;
      // 自分より前進度が高い車のみ
      if (c.totalProgress <= car.totalProgress) continue;
      const d = Utils.dist2(car.x, car.z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    // いなければ近い敵
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

  _checkPickups(now) {
    for (const c of this.cars) {
      if (c.finished) continue;
      if (!c.item) {
        if (Track.collectItemBox(c.x, c.z, 1.8)) {
          // 順位を計算してアイテム決定
          const rank = this._getRank(c);
          const item = ItemSystem.weightedRoll(rank, this.cars.length);
          c.setItem(item);
          if (c.isLocal) {
            GameUI.updateItem(item);
            showToast(`${ItemSystem.getDisplay(item).emoji} ${ItemSystem.getDisplay(item).label} ゲット！`, 1200);
          }
        }
      }
    }
  },

  _getRank(car) {
    const sorted = [...this.cars].sort((a, b) => b.totalProgress - a.totalProgress);
    return sorted.findIndex(c => c.id === car.id) + 1;
  },

  _checkRaceEnd() {
    // 自分がゴール済みかつ全員ゴールなら結果表示
    const allDone = this.cars.every(c => c.finished);
    if (allDone && this.state !== 'finished') {
      this.state = 'finished';
      setTimeout(() => GameUI.showResults(this.cars), 1500);
    } else if (this.localCar && this.localCar.finished && this.state !== 'finished') {
      // ローカルだけ先にゴール→結果を一定時間後表示
      // 他を待つ最大時間
      this._waitTimer = setTimeout(() => {
        this.state = 'finished';
        GameUI.showResults(this.cars);
      }, 15000);
    }
  },

  forceFinish() {
    // 他プレイヤーのfinish通知を受けたとき、全員ゴール確認
    this._checkRaceEnd();
  },

  // ===================== カメラ =====================
  _updateCamera(dt, snap = false) {
    if (!this.localCar) return;
    const c = this.localCar;
    // 後方距離
    const back = 9;
    const up = 4.5;
    const tx = c.x - Math.sin(c.angle) * back;
    const tz = c.z - Math.cos(c.angle) * back;
    const ty = up;
    if (snap) {
      this.camera.position.set(tx, ty, tz);
    } else {
      this.camera.position.x = Utils.lerp(this.camera.position.x, tx, 0.12);
      this.camera.position.y = Utils.lerp(this.camera.position.y, ty, 0.12);
      this.camera.position.z = Utils.lerp(this.camera.position.z, tz, 0.12);
    }
    // 視点は車の前方を見る
    const lx = c.x + Math.sin(c.angle) * 5;
    const lz = c.z + Math.cos(c.angle) * 5;
    this.camera.lookAt(lx, 1.2, lz);

    // FOV: ブースト時は広く、速度に応じて少し動的に
    const baseFov = 70;
    const targetFov = c.boostTimer > 0 ? 90 : baseFov + Math.min(15, Math.abs(c.speed) * 0.18);
    this.camera.fov = Utils.lerp(this.camera.fov, targetFov, 0.08);
    this.camera.updateProjectionMatrix();
  },

  // ===================== HUD =====================
  _updateHUD(now) {
    if (!this.localCar) return;
    const elapsed = (this.state === 'racing' || this.state === 'finished')
      ? (this.localCar.finished ? this.localCar.finishTime : (now - this.raceStartTime))
      : 0;
    document.getElementById('hud-time').textContent = Utils.formatTime(elapsed);
    const lapDisp = this.localCar.finished ? this.totalLaps : Math.min(this.localCar.lap + 1, this.totalLaps);
    document.getElementById('hud-lap').textContent = `${lapDisp}/${this.totalLaps}`;
    const rank = this._getRank(this.localCar);
    document.getElementById('hud-pos').textContent = `${rank}/${this.cars.length}`;
    const sp = Math.abs(this.localCar.speed) * 3.6; // m/s→km/h
    document.getElementById('hud-speed').textContent = Math.floor(sp);

    // ステアインジケーター
    const fill = document.getElementById('steer-fill');
    if (fill) {
      const s = Input.steer;
      const w = Math.abs(s) * 50; // 半幅50%
      fill.style.width = w + '%';
      fill.style.transform = s >= 0 ? 'translateX(0)' : `translateX(-100%)`;
    }

    // スタンディング（順位リスト）
    this._updateStandings();
  },

  _updateStandings() {
    const el = document.getElementById('hud-standings');
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
      html += `<div class="${cls}">`
        + `<span class="standings-rank">${i+1}.</span>`
        + `<span class="standings-chip" style="background:${c.color}"></span>`
        + `<span class="standings-name">${this._escape(c.name)}</span>`
        + `</div>`;
    });
    el.innerHTML = html;
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  },

  // ===================== ミニマップ =====================
  _updateMinimap() {
    if (!this.miniCtx) return;
    const ctx = this.miniCtx;
    const W = this.miniCanvas.width;
    const H = this.miniCanvas.height;
    ctx.clearRect(0, 0, W, H);
    // 全パス点から境界計算
    if (!this._miniBounds) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of Track.pathPoints) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
      const pad = 20;
      this._miniBounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    }
    const b = this._miniBounds;
    const sx = W / (b.maxX - b.minX);
    const sz = H / (b.maxZ - b.minZ);
    const toX = (x) => (x - b.minX) * sx;
    const toZ = (z) => H - (z - b.minZ) * sz;

    // パス
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#bbb';
    ctx.beginPath();
    Track.pathPoints.forEach((p, i) => {
      const x = toX(p.x), y = toZ(p.z);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();

    // 中央線
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // スタート
    const sp = Track.pathPoints[0];
    ctx.fillStyle = '#C62828';
    ctx.beginPath();
    ctx.arc(toX(sp.x), toZ(sp.z), 4, 0, Math.PI * 2);
    ctx.fill();

    // 車
    for (const c of this.cars) {
      ctx.beginPath();
      ctx.fillStyle = c.color;
      ctx.strokeStyle = c.isLocal ? '#000' : '#fff';
      ctx.lineWidth = c.isLocal ? 2 : 1;
      ctx.arc(toX(c.x), toZ(c.z), c.isLocal ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  },
};
