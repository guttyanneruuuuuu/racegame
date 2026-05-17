// ============= アイテム拡張パック =============
// 既存の ItemSystem に新規アイテム (霧/ブロック/ミニ/ブーメラン/ヒーローシールド) を追加。
// items.js は変更せず、ここで動的に拡張する。
const TOP_RANK_BLOCKED_ITEMS = ['killer', 'lightning', 'tripleRocket', 'swap'];
const STORM_CLOUD_HEIGHT = 6.5;
const STORM_CLOUD_FLOAT_AMPLITUDE = 0.35;
const STORM_CLOUD_OPACITY = 0.88;
const STORM_CLOUD_COLOR = 0x5C6BC0;
const MANAGED_PROJECTILE_KINDS = new Set(['block', 'boomerang', 'decoy', 'stormCloud']);
const ItemExt = {
  installed: false,

  install() {
    if (this.installed) return;
    if (!window.ItemSystem) return;
    this.installed = true;

    // 既存配列に追加
    const newItems = ['fog', 'block', 'mini', 'boomerang', 'megaShield', 'teleport', 'emp', 'decoy', 'killer',
                      'freeze', 'shockwave', 'swap', 'phaseShift', 'stormCloud', 'repairKit'];
    for (const it of newItems) {
      if (!ItemSystem.ITEMS.includes(it)) ItemSystem.ITEMS.push(it);
    }

    // 表示情報を拡張
    const origDisp = ItemSystem.getDisplay.bind(ItemSystem);
    ItemSystem.getDisplay = (item) => {
      switch (item) {
        case 'fog':        return { emoji: '🌫', label: 'FOG',         color: '#90A4AE' };
        case 'block':      return { emoji: '🧱', label: 'BLOCK',       color: '#8D6E63' };
        case 'mini':       return { emoji: '🐭', label: 'MINI',        color: '#80CBC4' };
        case 'boomerang':  return { emoji: '🪃', label: 'BOOMERANG',   color: '#FFA726' };
        case 'megaShield': return { emoji: '⭐', label: 'MEGA SHIELD',  color: '#FFD54F' };
        case 'teleport':   return { emoji: '🌀', label: 'WARP',        color: '#7C4DFF' };
        case 'emp':        return { emoji: '📡', label: 'EMP JAM',     color: '#00E5FF' };
        case 'decoy':      return { emoji: '👥', label: 'DECOY',       color: '#B388FF' };
        case 'killer':     return { emoji: '💥', label: 'KILLER',      color: '#FFC107' };
        case 'freeze':     return { emoji: '❄️', label: 'FREEZE',      color: '#81D4FA' };
        case 'shockwave':  return { emoji: '🌊', label: 'SHOCKWAVE',   color: '#26C6DA' };
        case 'swap':       return { emoji: '🔀', label: 'SWAP',        color: '#F06292' };
        case 'phaseShift': return { emoji: '👻', label: 'PHASE',       color: '#CE93D8' };
        case 'stormCloud': return { emoji: '🌩', label: 'STORM CLOUD', color: '#5C6BC0' };
        case 'repairKit':  return { emoji: '🛠️', label: 'PIT BOOST',   color: '#66BB6A' };
      }
      return origDisp(item);
    };

    // 重み付け抽選: 既存の関数を差し替えてバランスをとる
    const origRoll = ItemSystem.weightedRoll.bind(ItemSystem);
    ItemSystem.weightedRoll = (rank, totalPlayers) => {
      const ratio = totalPlayers > 1 ? (rank - 1) / (totalPlayers - 1) : 0.5;
      // 既存ベース重み(items.js のロジックに新規分を追加)
      const w = {
        boost:        Utils.lerp(2.6, 1.6, ratio),
        tripleBoost:  Utils.lerp(0.7, 2.1, ratio),
        banana:       Utils.lerp(2.0, 1.1, ratio),
        oil:          Utils.lerp(1.6, 0.9, ratio),
        mine:         Utils.lerp(1.0, 1.1, ratio),
        ink:          Utils.lerp(0.8, 1.5, ratio),
        shield:       Utils.lerp(2.2, 1.4, ratio),
        ghost:        Utils.lerp(0.7, 1.5, ratio),
        magnet:       Utils.lerp(0.8, 1.6, ratio),
        rocket:       Utils.lerp(1.0, 2.2, ratio),
        tripleRocket: Utils.lerp(0.35, 1.5, ratio),
        lightning:    Utils.lerp(0.18, 1.25, ratio),
        // 既存追加アイテム
        fog:          Utils.lerp(0.45, 1.1, ratio),
        block:        Utils.lerp(0.9, 1.2, ratio),
        mini:         Utils.lerp(0.55, 1.0, ratio),
        boomerang:    Utils.lerp(0.9, 1.5, ratio),
        megaShield:   Utils.lerp(0.28, 0.85, ratio),
        // === 新規ユニークアイテム ===
        teleport:     Utils.lerp(0.55, 1.7, ratio),
        emp:          Utils.lerp(0.65, 1.25, ratio),
        decoy:        Utils.lerp(0.85, 1.15, ratio),
        killer:       Utils.lerp(0.12, 1.9, ratio),
        repairKit:    Utils.lerp(1.7, 1.55, ratio),
      };
      // === 新規追加アイテム重み ===
      // freeze: 周囲を凍結 (中位救済)
      w.freeze     = Utils.lerp(0.45, 1.2, ratio);
      // shockwave: 周囲を強力に弾く防御兼攻撃 (中位)
      w.shockwave  = Utils.lerp(0.75, 1.35, ratio);
      // swap: 前方のライバルと順位交換 (下位救済)
      w.swap       = Utils.lerp(0.18, 1.45, ratio);
      // phaseShift: 短時間の透過 + 速度ブースト (中下位)
      w.phaseShift = Utils.lerp(0.7, 1.45, ratio);
      // stormCloud: 狙った地点に落雷 (中下位)
      w.stormCloud = Utils.lerp(0.4, 1.35, ratio);
      // 強アイテムは先頭だけ厳しめに制限し、2位以下はバリエーションを増やす
      if (rank === 1) {
        for (const k of TOP_RANK_BLOCKED_ITEMS) w[k] = 0;
      }
      if (totalPlayers <= 2) {
        // 2人対戦ではロケット系の抽選率を底上げ
        w.rocket = Math.max(w.rocket, Utils.lerp(2.2, 3.8, ratio));
        w.tripleRocket = Math.max(w.tripleRocket, Utils.lerp(0.45, 1.8, ratio));
      }
      let sum = 0;
      for (const k in w) sum += w[k];
      let r = Math.random() * sum;
      for (const k in w) {
        r -= w[k];
        if (r <= 0) return k;
      }
      return 'boost';
    };

    // 投射物更新の差し込み (ブーメラン挙動)
    const origUpdate = ItemSystem.update.bind(ItemSystem);
    ItemSystem.update = (dt, allCars) => {
      // ブーメランは特別な挙動(オーナーへ戻る)
      for (const p of ItemSystem.projectiles) {
        if (p.kind === 'boomerang') this._updateBoomerang(p, dt, allCars);
      }
      origUpdate(dt, allCars);
    };

    // ===== ブロック設置 =====
    ItemSystem.spawnBlock = function(owner) {
      const angle = owner.angle;
      const bx = owner.x - Math.sin(angle) * 5.0;
      const bz = owner.z - Math.cos(angle) * 5.0;
      const g = new THREE.Group();
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.6, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x8d6e63 })
      );
      cube.position.y = 0.8;
      g.add(cube);
      // 上面のシマシマ
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.1, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xffeb3b })
      );
      stripe.position.y = 1.65;
      g.add(stripe);
      g.position.set(bx, 0, bz);
      g.rotation.y = angle;
      this.scene.add(g);
      this.projectiles.push({
        kind: 'block', x: bx, z: bz, vx: 0, vz: 0,
        ownerId: owner.id, life: 12, mesh: g,
        radius: 1.6,
      });
    };

    // ===== 霧 (全プレイヤーの視界に靄をかける) =====
    ItemSystem.triggerFog = function(owner, allCars) {
      for (const c of allCars) {
        if (c.id === owner.id) continue;
        if (c.invincibleTimer > 0) continue;
        c.fogTimer = Math.max(c.fogTimer || 0, 5.0);
      }
      if (window.GameUI && Game.localCar && Game.localCar.id !== owner.id && (Game.localCar.fogTimer || 0) > 0) {
        GameUI.flashFog();
      }
    };

    // ===== ミニ化 (自分を小さく+ハンドリング上昇) =====
    ItemSystem.applyMini = function(owner) {
      owner.miniSizeTimer = Math.max(owner.miniSizeTimer || 0, 7.0);
    };

    // ===== ブーメラン (前方に飛んで戻ってくる) =====
    ItemSystem.spawnBoomerang = function(owner) {
      const angle = owner.angle;
      const bx = owner.x + Math.sin(angle) * 2.5;
      const bz = owner.z + Math.cos(angle) * 2.5;
      const sp = 55;
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.18, 6, 8, Math.PI * 1.5),
        new THREE.MeshLambertMaterial({ color: 0xff7043, emissive: 0x661100, emissiveIntensity: 0.3 })
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(bx, 1.0, bz);
      this.scene.add(mesh);
      this.projectiles.push({
        kind: 'boomerang', x: bx, z: bz,
        vx: Math.sin(angle) * sp, vz: Math.cos(angle) * sp,
        ownerId: owner.id, life: 4.0, mesh,
        radius: 1.3,
        _phase: 0, _returning: false, _maxRange: 35,
        _startX: owner.x, _startZ: owner.z,
      });
    };

    // ===== メガシールド (10秒 + 周囲ダメージ) =====
    ItemSystem.applyMegaShield = function(owner) {
      owner.giveShield(10);
      owner.megaShieldTimer = Math.max(owner.megaShieldTimer || 0, 10);
    };

    // ===== 🛠️ ピットブースト (状態異常をリフレッシュして加速) =====
    ItemSystem.applyRepairKit = function(owner) {
      owner.spinTimer = 0;
      owner.lockedTimer = 0;
      owner.squishTimer = 0;
      owner.freezeTimer = 0;
      owner.fogTimer = 0;
      owner.confuseTimer = 0;
      owner.inkScrambleTimer = 0;
      owner.slowTimer = 0;
      owner.slowMul = 1.0;
      owner.wallRecoverTimer = 0;
      owner.wallRecoverSteer = 0;
      owner.driftActive = false;
      owner.driftCharge = 0;
      if (typeof owner.addCoin === 'function') owner.addCoin(2);
      owner.giveShield(1.8);
      owner.applyBoost(1.6);
      owner.speed = Math.max(owner.speed, 28);
      this._spawnShockwave(owner.x, owner.z, 4.8, 0x66BB6A);
    };

    // ===== 🌀 ワープ (短距離テレポート: 前方28m + 短い無敵) =====
    // 他レースゲームには無い: 衝突予測 / レイキャストなしで一気に前へ
    ItemSystem.applyTeleport = function(owner) {
      // 直線で前方28m。トラック外に行かないようガード (Track.getProgress があればそれを利用)
      const dist = 28;
      const tx = owner.x + Math.sin(owner.angle) * dist;
      const tz = owner.z + Math.cos(owner.angle) * dist;
      // 開始地点にエフェクト
      ItemSystem._spawnTeleportFX(owner.x, owner.z, 0x7C4DFF);
      owner.x = tx;
      owner.z = tz;
      owner.speed = Math.max(owner.speed, 40);
      owner.giveShield(0.8);     // 着地直後の無敵
      owner.boostTimer = Math.max(owner.boostTimer || 0, 0.6); // 抜けた感を演出
      // 到着地点にエフェクト
      ItemSystem._spawnTeleportFX(tx, tz, 0xE040FB);
      // 進行度を再計算
      if (window.Track && Track.getProgress) {
        try {
          const prog = Track.getProgress(tx, tz, owner.lastProgressIdx);
          if (prog && typeof prog.index === 'number') owner.lastProgressIdx = prog.index;
        } catch (_) {}
      }
    };
    ItemSystem._spawnTeleportFX = function(x, z, color) {
      const geo = new THREE.RingGeometry(0.3, 2.4, 18);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.3, z);
      this.scene.add(m);
      // 縦の柱
      const pillarGeo = new THREE.CylinderGeometry(0.9, 0.9, 6, 12, 1, true);
      const pillarMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(x, 3, z);
      this.scene.add(pillar);
      this._splashes.push({ mesh: m, life: 0.55, dur: 0.55 });
      this._splashes.push({ mesh: pillar, life: 0.55, dur: 0.55 });
    };

    // ===== 📡 EMP ジャマー (周囲16m以内の敵車のHUDを乱す + 短い操作鈍化) =====
    // 他レースゲームに無いユニーク要素: 範囲攻撃 + 情報妨害 + 短スタンのハイブリッド
    ItemSystem.triggerEMP = function(owner, allCars) {
      const R = 16;
      let hit = 0;
      for (const c of allCars) {
        if (c.id === owner.id) continue;
        if (c.finished) continue;
        if (c.invincibleTimer > 0 || c.ghostTimer > 0) continue;
        const d = Utils.dist2(c.x, c.z, owner.x, owner.z);
        if (d < R) {
          c.inkScrambleTimer = Math.max(c.inkScrambleTimer || 0, 3.5); // HUD乱れ
          c.applyConfuse && c.applyConfuse(0.5);                       // 軽い操作鈍化
          c.slowTimer = Math.max(c.slowTimer || 0, 1.2);
          c.slowMul = Math.min(c.slowMul || 1, 0.7);
          if (this._notifyItemHitByCar) this._notifyItemHitByCar(owner, 'emp', c);
          hit++;
        }
      }
      // ショックウェーブ演出
      this._spawnShockwave(owner.x, owner.z, R * 1.0, 0x00E5FF);
      this._spawnShockwave(owner.x, owner.z, R * 0.7, 0x80DEEA);
      return hit;
    };

    // ===== ❄️ フリーズ (周囲14m以内の敵車を 1.4秒凍結 + 強減速) =====
    ItemSystem.triggerFreeze = function(owner, allCars) {
      const R = 14;
      let hit = 0;
      for (const c of allCars) {
        if (c.id === owner.id) continue;
        if (c.finished) continue;
        if (c.invincibleTimer > 0 || c.ghostTimer > 0) continue;
        const d = Utils.dist2(c.x, c.z, owner.x, owner.z);
        if (d < R) {
          c.spinTimer = 0;            // フリーズはスピンを上書き(動けないだけ)
          c.lockedTimer = Math.max(c.lockedTimer || 0, 1.4);
          c.slowTimer = Math.max(c.slowTimer || 0, 2.5);
          c.slowMul = Math.min(c.slowMul || 1, 0.55);
          c.driftActive = false; c.driftCharge = 0;
          c.speed *= 0.25;
          c.freezeTimer = Math.max(c.freezeTimer || 0, 1.4);
          if (this._notifyItemHitByCar) this._notifyItemHitByCar(owner, 'freeze', c);
          hit++;
        }
      }
      this._spawnShockwave(owner.x, owner.z, R * 1.0, 0x81D4FA);
      this._spawnShockwave(owner.x, owner.z, R * 0.6, 0xB3E5FC);
      return hit;
    };

    // ===== 🌊 ショックウェーブ (周囲10mを強烈に弾き飛ばす + 短スピン) =====
    ItemSystem.triggerShockwave = function(owner, allCars) {
      const R = 10;
      let hit = 0;
      for (const c of allCars) {
        if (c.id === owner.id) continue;
        if (c.finished) continue;
        if (c.invincibleTimer > 0 || c.ghostTimer > 0) continue;
        const dx = c.x - owner.x;
        const dz = c.z - owner.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < R) {
          const nx = dx / d, nz = dz / d;
          // 強力な押し出し
          c.x += nx * 4.5; c.z += nz * 4.5;
          c.speed *= 0.4;
          c.spinTimer = Math.max(c.spinTimer || 0, 0.8);
          c.driftActive = false; c.driftCharge = 0;
          if (this._notifyItemHitByCar) this._notifyItemHitByCar(owner, 'shockwave', c);
          hit++;
        }
      }
      this._spawnShockwave(owner.x, owner.z, R * 1.3, 0x26C6DA);
      this._spawnShockwave(owner.x, owner.z, R * 0.9, 0x80DEEA);
      this._spawnShockwave(owner.x, owner.z, R * 0.5, 0xB2EBF2);
      // 自分にも軽くブーストご褒美
      owner.applyBoost(0.7);
      return hit;
    };

    // ===== 🔀 スワップ (前方の最も近い敵車と位置を交換) =====
    // 他レースゲームに無い: 駆け引き要素満点
    // 順位判定は車側で集計された `totalProgress` (= lap * pathLength + 区間内距離) を正本とする
    ItemSystem.applySwap = function(owner, allCars) {
      const myTotal = (typeof owner.totalProgress === 'number') ? owner.totalProgress : 0;
      let target = null;
      let bestGap = Infinity;
      for (const c of allCars) {
        if (c.id === owner.id) continue;
        if (c.finished) continue;
        if (c.invincibleTimer > 0 || c.ghostTimer > 0) continue;
        if (c.killerTimer > 0) continue;       // キラー中の車は対象外 (相手はチートに近い状態)
        const cTotal = (typeof c.totalProgress === 'number') ? c.totalProgress : 0;
        if (cTotal <= myTotal) continue;
        const diff = cTotal - myTotal;
        if (diff < bestGap) { bestGap = diff; target = c; }
      }
      if (!target) {
        // 前方にいなければ自分に小ブースト返却
        owner.applyBoost(1.2);
        return null;
      }
      // 位置/進行度を完全交換 (lap, totalProgress, lastProgressIdx, maxProgress)
      this._spawnTeleportFX(owner.x, owner.z, 0xF06292);
      this._spawnTeleportFX(target.x, target.z, 0xEC407A);
      const snap = {
        x: owner.x, z: owner.z, y: owner.y, angle: owner.angle,
        lap: owner.lap, totalProgress: owner.totalProgress,
        lastProgressIdx: owner.lastProgressIdx, maxProgress: owner.maxProgress,
      };
      owner.x = target.x; owner.z = target.z; owner.y = target.y; owner.angle = target.angle;
      owner.lap = target.lap; owner.totalProgress = target.totalProgress;
      owner.lastProgressIdx = target.lastProgressIdx; owner.maxProgress = target.maxProgress;
      target.x = snap.x; target.z = snap.z; target.y = snap.y; target.angle = snap.angle;
      target.lap = snap.lap; target.totalProgress = snap.totalProgress;
      target.lastProgressIdx = snap.lastProgressIdx; target.maxProgress = snap.maxProgress;
      // 相手にはスピンペナルティ + 自分には短い無敵
      target.spinTimer = Math.max(target.spinTimer || 0, 0.6);
      target.speed *= 0.5;
      target.driftActive = false; target.driftCharge = 0;
      owner.giveShield(1.2);
      owner.speed = Math.max(owner.speed, 30);
      return target;
    };

    // ===== 👻 フェーズシフト (短時間ゴースト化 + ブースト) =====
    // 通常のゴーストとは違い、より短いが圧倒的に速い
    ItemSystem.applyPhaseShift = function(owner) {
      owner.ghostTimer = Math.max(owner.ghostTimer || 0, 2.5);
      owner.applyBoost(2.5);
      owner.invincibleTimer = Math.max(owner.invincibleTimer || 0, 0.5);
      // 紫煙演出
      this._spawnShockwave(owner.x, owner.z, 4, 0xCE93D8);
    };

    // ===== 🌩 ストームクラウド (狙った相手の頭上に雲を作り落雷) =====
    /**
     * 狙った相手の頭上に雲を生成し、少し遅れて落雷させる。
     * @param {object} owner - 発動した車
     * @param {Array<object>} allCars - レース中の全車
     * @param {string|null} preferredTargetId - 同期時に優先する対象ID
     * @returns {object|null} 選ばれた対象車。対象がいない時は null
     */
    ItemSystem.triggerStormCloud = function(owner, allCars, preferredTargetId = null) {
      let target = null;
      if (preferredTargetId) {
        target = allCars.find(c => c.id === preferredTargetId) || null;
      }
      if (!target) {
        const myTotal = (typeof owner.totalProgress === 'number') ? owner.totalProgress : 0;
        let bestAhead = null;
        let bestAheadGap = Infinity;
        let bestAny = null;
        let bestAnyD = Infinity;
        for (const c of allCars) {
          if (c.id === owner.id) continue;
          if (c.finished) continue;
          const cTotal = (typeof c.totalProgress === 'number') ? c.totalProgress : 0;
          const d = Utils.dist2(owner.x, owner.z, c.x, c.z);
          if (d < bestAnyD) { bestAnyD = d; bestAny = c; }
          if (cTotal > myTotal) {
            const gap = cTotal - myTotal;
            if (gap < bestAheadGap) { bestAheadGap = gap; bestAhead = c; }
          }
        }
        target = bestAhead || bestAny;
      }
      if (!target) {
        // 対象がいない状況で空撃ちになるのを避けるため、小ブーストを返却
        owner.applyBoost(1.0);
        return null;
      }

      const cloud = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: STORM_CLOUD_COLOR, transparent: true, opacity: STORM_CLOUD_OPACITY });
      const p1 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), mat);
      const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), mat);
      const p3 = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), mat);
      p1.position.set(0, 0, 0);
      p2.position.set(0.9, 0.1, 0.1);
      p3.position.set(-0.8, -0.05, 0.15);
      cloud.add(p1, p2, p3);
      cloud.position.set(target.x, STORM_CLOUD_HEIGHT, target.z);
      this.scene.add(cloud);

      const marker = new THREE.Mesh(
        new THREE.RingGeometry(1.1, 1.8, 20),
        new THREE.MeshBasicMaterial({ color: 0xB3E5FC, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(target.x, 0.15, target.z);
      this.scene.add(marker);

      this.projectiles.push({
        kind: 'stormCloud',
        x: target.x,
        z: target.z,
        vx: 0,
        vz: 0,
        ownerId: owner.id,
        targetId: target.id,
        life: 1.4,
        strikeAt: 0.7,
        struck: false,
        radius: 3.8,
        mesh: cloud,
        marker,
      });
      return target;
    };

    // ===== 👥 デコイ (停車した自分のクローンを残す。ロケット/ブーメランの囮になる) =====
    ItemSystem.spawnDecoy = function(owner) {
      const angle = owner.angle;
      const dx = owner.x - Math.sin(angle) * 2.0;
      const dz = owner.z - Math.cos(angle) * 2.0;
      const g = new THREE.Group();
      const colorHex = parseInt((owner.color || '#888').replace('#',''), 16);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.55, 3.4),
        new THREE.MeshLambertMaterial({ color: colorHex, transparent: true, opacity: 0.7 })
      );
      body.position.y = 0.5;
      g.add(body);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.65, 1.7),
        new THREE.MeshLambertMaterial({ color: 0xfafafa, transparent: true, opacity: 0.55 })
      );
      cabin.position.set(0, 1.1, -0.15);
      g.add(cabin);
      // 紫オーラ
      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(2.0, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xB388FF, transparent: true, opacity: 0.25, wireframe: true })
      );
      aura.position.y = 1.0;
      g.add(aura);
      g._aura = aura;
      g.position.set(dx, 0, dz);
      g.rotation.y = angle;
      this.scene.add(g);
      this.projectiles.push({
        kind: 'decoy', x: dx, z: dz, vx: 0, vz: 0,
        ownerId: owner.id, life: 9, mesh: g,
        radius: 1.4, isDecoy: true,
      });
    };

    // ===== ブロックや衝突判定の拡張 =====
    const origCollect = ItemSystem.projectiles;
    // 既存updateの衝突は items.js 側で kind 文字列で判定するため、
    // block 用の判定をフックする
    // → 既存 update が知らない kind は当たり判定がスキップされてしまう。
    // そのため独自に block/boomerang の衝突を追加する。
    const wrappedUpdate = ItemSystem.update.bind(ItemSystem);
    ItemSystem.update = (dt, allCars) => {
      wrappedUpdate(dt, allCars);
      // 追加: block/boomerang/decoy の衝突
      for (let i = ItemSystem.projectiles.length - 1; i >= 0; i--) {
        const p = ItemSystem.projectiles[i];
        if (!MANAGED_PROJECTILE_KINDS.has(p.kind)) continue;
        if (p.kind === 'stormCloud') {
          const tgt = allCars.find(c => c.id === p.targetId && !c.finished) || null;
          if (tgt) {
            p.x = tgt.x;
            p.z = tgt.z;
          }
          if (p.mesh) {
            const t = performance.now() * 0.005;
            p.mesh.position.set(p.x, STORM_CLOUD_HEIGHT + Math.sin(t) * STORM_CLOUD_FLOAT_AMPLITUDE, p.z);
            p.mesh.rotation.y += dt * 0.7;
          }
          if (p.marker) {
            p.marker.position.set(p.x, 0.15, p.z);
            p.marker.material.opacity = 0.45 + Math.abs(Math.sin(performance.now() * 0.012)) * 0.45;
          }
          // life が strikeAt を下回った瞬間に一度だけ落雷を発生させる
          if (!p.struck && p.life <= p.strikeAt) {
            p.struck = true;
            ItemSystem._spawnShockwave(p.x, p.z, 4.5, 0x90CAF9);
            ItemSystem._spawnShockwave(p.x, p.z, 2.8, 0xE3F2FD);
            if (window.SFX) SFX.play('lightning');
            if (window.GameUI) GameUI.flashScreen('#cfe8ff', 180);
            for (const c of allCars) {
              if (c.id === p.ownerId) continue;
              if (c.finished) continue;
              if (c.invincibleTimer > 0 || c.ghostTimer > 0 || c.killerTimer > 0) continue;
              const d = Utils.dist2(p.x, p.z, c.x, c.z);
              if (d < p.radius) {
                c.hitLightning();
                if (ItemSystem._notifyItemHit) ItemSystem._notifyItemHit(p.ownerId, 'stormCloud', c, allCars);
              }
            }
          }
          continue;
        }
        // デコイのオーラ点滅
        if (p.kind === 'decoy' && p.mesh && p.mesh._aura) {
          const ph = performance.now() * 0.004;
          p.mesh._aura.material.opacity = 0.18 + Math.abs(Math.sin(ph)) * 0.18;
          p.mesh.rotation.y += dt * 0.4;
        }
        let consumed = false;
        for (const c of allCars) {
          if (c.finished) continue;
          if (p.kind === 'boomerang' && c.id === p.ownerId && !p._returning) continue;
          if (p.kind === 'decoy' && c.id === p.ownerId) continue;
          const d = Utils.dist2(p.x, p.z, c.x, c.z);
          const hitDist = p.radius + 1.2;
          if (d < hitDist) {
            if (p.kind === 'block') {
              // ブロックは固体扱い: 軽くバウンス + 短いスタン
              if (c.invincibleTimer > 0 || c.ghostTimer > 0) {
                // すり抜け
              } else {
                c.hitBlock && c.hitBlock();
                c.speed *= 0.35;
                // 法線方向に弾く
                const nx = (c.x - p.x) / (d || 1);
                const nz = (c.z - p.z) / (d || 1);
                c.x += nx * 1.2; c.z += nz * 1.2;
                consumed = true;
              }
            } else if (p.kind === 'boomerang') {
              if (c.invincibleTimer > 0 || c.ghostTimer > 0) continue;
              // バナナ相当のスピン
              c.spinTimer = 1.1;
              c.driftActive = false; c.driftCharge = 0;
              consumed = true;
            } else if (p.kind === 'decoy') {
              // デコイは敵車が触れると短いスピン + 紫煙
              if (c.invincibleTimer > 0 || c.ghostTimer > 0) continue;
              c.spinTimer = Math.max(c.spinTimer, 0.7);
              c.speed *= 0.5;
              consumed = true;
            }
            if (consumed) {
              if (ItemSystem._notifyItemHit) ItemSystem._notifyItemHit(p.ownerId, p.kind, c, allCars);
              if (p.kind === 'boomerang') ItemSystem._spawnSplash(p.x, p.z, 0xff7043);
              else if (p.kind === 'decoy') ItemSystem._spawnSplash(p.x, p.z, 0xB388FF);
              else ItemSystem._spawnSplash(p.x, p.z, 0xa1887f);
              break;
            }
          }
        }
        // デコイ寿命切れの紫色フェードアウト
        if (consumed) {
          if (p.marker) ItemSystem.scene.remove(p.marker);
          ItemSystem.scene.remove(p.mesh);
          ItemSystem.projectiles.splice(i, 1);
        } else if (p.life <= 0) {
          if (p.kind === 'decoy') ItemSystem._spawnSplash(p.x, p.z, 0xB388FF);
          if (p.marker) ItemSystem.scene.remove(p.marker);
          ItemSystem.scene.remove(p.mesh);
          ItemSystem.projectiles.splice(i, 1);
        }
      }

      // 追加: ロケットがデコイに引き寄せられる (駆け引きアイテム)
      // 最適化: デコイ/ロケットが共に存在するときだけ二重ループを実行 (アロケーション無し)
      let hasRocket = false, hasDecoy = false;
      const pl = ItemSystem.projectiles;
      for (let i = 0; i < pl.length; i++) {
        const k = pl[i].kind;
        if (k === 'rocket') hasRocket = true;
        else if (k === 'decoy') hasDecoy = true;
        if (hasRocket && hasDecoy) break;
      }
      if (hasRocket && hasDecoy) {
        for (let i = 0; i < pl.length; i++) {
          const p = pl[i];
          if (p.kind !== 'rocket') continue;
          for (let j = 0; j < pl.length; j++) {
            const d = pl[j];
            if (d.kind !== 'decoy') continue;
            if (d.ownerId === p.ownerId) continue;
            const dist = Utils.dist2(p.x, p.z, d.x, d.z);
            if (dist < 20) {
              p._fakeTarget = { x: d.x, z: d.z };
              if (p.target) {
                const td = Utils.dist2(p.x, p.z, p.target.x, p.target.z);
                if (dist < td) {
                  p.target = { x: d.x, z: d.z, _isDecoy: true };
                }
              } else {
                p.target = { x: d.x, z: d.z, _isDecoy: true };
              }
            }
          }
        }
      }

      // 追加: メガシールド持ちが触れたら通常車にダメージ
      // (注: megaShieldTimer の減算は game_ext.js の updateMesh ラッパー側で行うため、ここでは減算しない)
      for (const c of allCars) {
        if (!c.megaShieldTimer || c.megaShieldTimer <= 0) continue;
        for (const o of allCars) {
          if (o.id === c.id) continue;
          if (o.invincibleTimer > 0 || o.ghostTimer > 0) continue;
          const d = Utils.dist2(c.x, c.z, o.x, o.z);
          if (d < 3.0) {
            o.spinTimer = Math.max(o.spinTimer, 0.8);
            o.speed *= 0.4;
          }
        }
      }
    };
  },

  _updateBoomerang(p, dt, allCars) {
    p._phase = (p._phase || 0) + dt * 18;
    p.mesh.rotation.z = p._phase;
    // オーナー
    const owner = allCars.find(c => c.id === p.ownerId);
    const reachDist = Utils.dist2(p.x, p.z, p._startX, p._startZ);
    if (!p._returning && reachDist > p._maxRange) {
      p._returning = true;
    }
    if (p._returning && owner) {
      const dx = owner.x - p.x;
      const dz = owner.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const sp = 60;
      p.vx = (dx / d) * sp;
      p.vz = (dz / d) * sp;
      if (d < 2.0) {
        // 回収完了 → 消す
        p.life = -1;
      }
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.mesh.position.set(p.x, 1.0 + Math.sin(p._phase * 0.3) * 0.2, p.z);
  },

  // useItem 拡張: 既存の Game.useItem は switch 文ではなく if-else チェーンなので、
  // game.js の useItem 内に新規ケースを追加できる。代わりに Game.useItem をラップする。
  hookGameUseItem() {
    if (this._gameHooked) return;
    if (!window.Game) return;
    this._gameHooked = true;
    const origUse = Game.useItem.bind(Game);
    Game.useItem = (car, allCars) => {
      // 新規アイテムの処理を先取り
      if (!car.item) return;
      const it = car.item;
      const isNew = ['fog', 'block', 'mini', 'boomerang', 'megaShield', 'teleport', 'emp', 'decoy',
                     'freeze', 'shockwave', 'swap', 'phaseShift', 'stormCloud', 'repairKit'].includes(it);
      if (!isNew) {
        return origUse(car, allCars);
      }
      const item = car.consumeItem();
      if (window.SFX) SFX.play('item');

      if (item === 'fog') {
        ItemSystem.triggerFog(car, allCars);
        if (window.Net) Net.sendAction({ kind: 'fog' });
      } else if (item === 'block') {
        ItemSystem.spawnBlock(car);
        if (window.Net) Net.sendAction({ kind: 'block' });
      } else if (item === 'mini') {
        ItemSystem.applyMini(car);
        if (window.Net) Net.sendAction({ kind: 'mini' });
      } else if (item === 'boomerang') {
        ItemSystem.spawnBoomerang(car);
        if (window.Net) Net.sendAction({ kind: 'boomerang' });
      } else if (item === 'megaShield') {
        ItemSystem.applyMegaShield(car);
        if (window.Net) Net.sendAction({ kind: 'megaShield' });
      } else if (item === 'teleport') {
        ItemSystem.applyTeleport(car);
        if (window.SFX) SFX.play('warp');
        if (window.Net) Net.sendAction({ kind: 'teleport', x: car.x, z: car.z });
      } else if (item === 'emp') {
        const n = ItemSystem.triggerEMP(car, allCars);
        if (car.isLocal && typeof showToast === 'function' && n > 0) {
          // n体ジャム成功演出はトーストで
        }
        if (window.Net) Net.sendAction({ kind: 'emp' });
      } else if (item === 'decoy') {
        ItemSystem.spawnDecoy(car);
        if (window.Net) Net.sendAction({ kind: 'decoy' });
      } else if (item === 'freeze') {
        ItemSystem.triggerFreeze(car, allCars);
        if (window.SFX) SFX.play('freeze');
        if (window.Net) Net.sendAction({ kind: 'freeze' });
      } else if (item === 'shockwave') {
        ItemSystem.triggerShockwave(car, allCars);
        if (window.SFX) SFX.play('shockwave');
        if (window.Net) Net.sendAction({ kind: 'shockwave' });
      } else if (item === 'swap') {
        const target = ItemSystem.applySwap(car, allCars);
        if (window.SFX) SFX.play('swap');
        if (window.Net) Net.sendAction({ kind: 'swap', targetId: target ? target.id : null });
      } else if (item === 'phaseShift') {
        ItemSystem.applyPhaseShift(car);
        if (window.SFX) SFX.play('phase');
        if (window.Net) Net.sendAction({ kind: 'phaseShift' });
      } else if (item === 'stormCloud') {
        const target = ItemSystem.triggerStormCloud(car, allCars);
        if (window.Net) Net.sendAction({ kind: 'stormCloud', targetId: target ? target.id : null });
      } else if (item === 'repairKit') {
        ItemSystem.applyRepairKit(car);
        if (window.Net) Net.sendAction({ kind: 'repairKit' });
      }
      if (car.isLocal) {
        if (window.GameUI) {
          const held = (typeof car.getHeldItems === 'function') ? car.getHeldItems() : (car.item ? [car.item] : []);
          GameUI.updateItem(held.length ? held : null);
        }
        const d = ItemSystem.getDisplay(item);
        if (typeof showToast === 'function') showToast(`${d.emoji} ${d.label}!`, 1000);
      }
    };

    // applyRemoteAction の拡張
    const origRemote = Game.applyRemoteAction.bind(Game);
    Game.applyRemoteAction = (action) => {
      const car = Game.cars.find(c => c.id === action.by);
      if (car) {
        if (action.kind === 'fog')        { ItemSystem.triggerFog(car, Game.cars); return; }
        if (action.kind === 'block')      { ItemSystem.spawnBlock(car); return; }
        if (action.kind === 'mini')       { ItemSystem.applyMini(car); return; }
        if (action.kind === 'boomerang')  { ItemSystem.spawnBoomerang(car); return; }
        if (action.kind === 'megaShield') { ItemSystem.applyMegaShield(car); return; }
        if (action.kind === 'teleport')   {
          // リモートは座標を直接同期 (デッドレコニングで自然に補正)
          if (typeof action.x === 'number' && typeof action.z === 'number') {
            ItemSystem._spawnTeleportFX(car.x, car.z, 0x7C4DFF);
            car.x = action.x; car.z = action.z;
            ItemSystem._spawnTeleportFX(action.x, action.z, 0xE040FB);
          } else {
            ItemSystem.applyTeleport(car);
          }
          return;
        }
        if (action.kind === 'emp')        { ItemSystem.triggerEMP(car, Game.cars); return; }
        if (action.kind === 'decoy')      { ItemSystem.spawnDecoy(car); return; }
        if (action.kind === 'freeze')     { ItemSystem.triggerFreeze(car, Game.cars); return; }
        if (action.kind === 'shockwave')  { ItemSystem.triggerShockwave(car, Game.cars); return; }
        if (action.kind === 'swap')       {
          // ターゲットIDが提供されていればその車と進行度ごと交換、なければローカル計算
          if (action.targetId) {
            const tgt = Game.cars.find(c => c.id === action.targetId);
            if (tgt) {
              ItemSystem._spawnTeleportFX(car.x, car.z, 0xF06292);
              ItemSystem._spawnTeleportFX(tgt.x, tgt.z, 0xEC407A);
              const snap = {
                x: car.x, z: car.z, y: car.y, angle: car.angle,
                lap: car.lap, totalProgress: car.totalProgress,
                lastProgressIdx: car.lastProgressIdx, maxProgress: car.maxProgress,
              };
              car.x = tgt.x; car.z = tgt.z; car.y = tgt.y; car.angle = tgt.angle;
              car.lap = tgt.lap; car.totalProgress = tgt.totalProgress;
              car.lastProgressIdx = tgt.lastProgressIdx; car.maxProgress = tgt.maxProgress;
              tgt.x = snap.x; tgt.z = snap.z; tgt.y = snap.y; tgt.angle = snap.angle;
              tgt.lap = snap.lap; tgt.totalProgress = snap.totalProgress;
              tgt.lastProgressIdx = snap.lastProgressIdx; tgt.maxProgress = snap.maxProgress;
              tgt.spinTimer = Math.max(tgt.spinTimer || 0, 0.6);
              tgt.driftActive = false; tgt.driftCharge = 0;
            }
          } else {
            ItemSystem.applySwap(car, Game.cars);
          }
          return;
        }
        if (action.kind === 'phaseShift') { ItemSystem.applyPhaseShift(car); return; }
        if (action.kind === 'stormCloud') { ItemSystem.triggerStormCloud(car, Game.cars, action.targetId); return; }
        if (action.kind === 'repairKit') { ItemSystem.applyRepairKit(car); return; }
      }
      origRemote(action);
    };
  },
};
window.ItemExt = ItemExt;
