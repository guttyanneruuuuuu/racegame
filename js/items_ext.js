// ============= アイテム拡張パック =============
// 既存の ItemSystem に新規アイテム (霧/ブロック/ミニ/ブーメラン/ヒーローシールド) を追加。
// items.js は変更せず、ここで動的に拡張する。
const ItemExt = {
  installed: false,

  install() {
    if (this.installed) return;
    if (!window.ItemSystem) return;
    this.installed = true;

    // 既存配列に追加
    const newItems = ['fog', 'block', 'mini', 'boomerang', 'megaShield', 'teleport', 'emp', 'decoy', 'killer',
                      'freeze', 'shockwave', 'swap', 'phaseShift'];
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
      }
      return origDisp(item);
    };

    // 重み付け抽選: 既存の関数を差し替えてバランスをとる
    const origRoll = ItemSystem.weightedRoll.bind(ItemSystem);
    ItemSystem.weightedRoll = (rank, totalPlayers) => {
      const ratio = totalPlayers > 1 ? (rank - 1) / (totalPlayers - 1) : 0.5;
      // 既存ベース重み(items.js のロジックに新規分を追加)
      const w = {
        boost:        Utils.lerp(3.0, 1.5, ratio),
        tripleBoost:  Utils.lerp(0.2, 1.8, ratio),
        banana:       Utils.lerp(2.5, 0.8, ratio),
        oil:          Utils.lerp(1.8, 0.7, ratio),
        mine:         Utils.lerp(0.9, 0.9, ratio),
        ink:          Utils.lerp(0.6, 1.6, ratio),
        shield:       Utils.lerp(2.0, 1.0, ratio),
        ghost:        Utils.lerp(0.2, 1.4, ratio),
        magnet:       Utils.lerp(0.4, 1.4, ratio),
        rocket:       Utils.lerp(0.8, 2.0, ratio),
        tripleRocket: Utils.lerp(0.05, 1.1, ratio),
        lightning:    Utils.lerp(0.03, 1.2, ratio),
        // 既存追加アイテム
        fog:          Utils.lerp(0.1, 1.2, ratio),
        block:        Utils.lerp(0.6, 1.1, ratio),
        mini:         Utils.lerp(0.1, 0.9, ratio),
        boomerang:    Utils.lerp(0.5, 1.4, ratio),
        megaShield:   Utils.lerp(0.0, 0.5, ratio),
        // === 新規ユニークアイテム ===
        teleport:     Utils.lerp(0.05, 1.6, ratio),  // 下位救済: 前方ワープ
        emp:          Utils.lerp(0.2, 1.4, ratio),   // HUDジャミング + 短い制御不能
        decoy:        Utils.lerp(0.5, 1.0, ratio),   // ロケット囮: 駆け引きアイテム
        killer:       Utils.lerp(0.01, 2.8, ratio),  // 下位専用の超加速アイテム
      };
      // === 新規追加アイテム重み ===
      // freeze: 周囲を凍結 (中位救済)
      w.freeze     = Utils.lerp(0.0, 1.0, ratio);
      // shockwave: 周囲を強力に弾く防御兼攻撃 (中位)
      w.shockwave  = Utils.lerp(0.2, 1.2, ratio);
      // swap: 前方のライバルと順位交換 (下位救済)
      w.swap       = Utils.lerp(0.0, 1.3, ratio);
      // phaseShift: 短時間の透過 + 速度ブースト (中下位)
      w.phaseShift = Utils.lerp(0.1, 1.4, ratio);
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
    ItemSystem.applySwap = function(owner, allCars) {
      // 進行度が自分より前で、かつ最も近い敵車を探す
      let target = null;
      let bestProg = Infinity;
      for (const c of allCars) {
        if (c.id === owner.id) continue;
        if (c.finished) continue;
        if (c.invincibleTimer > 0 || c.ghostTimer > 0) continue;
        // 自分より前 (進行度がより進んでいる)
        const myTotal = (owner.lap || 0) * 1000 + (owner.lastProgressIdx || 0);
        const cTotal = (c.lap || 0) * 1000 + (c.lastProgressIdx || 0);
        if (cTotal <= myTotal) continue;
        const diff = cTotal - myTotal;
        if (diff < bestProg) { bestProg = diff; target = c; }
      }
      if (!target) {
        // 前方にいなければ自分にスマイル: 軽いブースト返却
        owner.applyBoost(1.2);
        return null;
      }
      // 位置交換 (高度も)
      const ox = owner.x, oz = owner.z, oy = owner.y, oa = owner.angle, op = owner.lastProgressIdx, ol = owner.lap;
      this._spawnTeleportFX(owner.x, owner.z, 0xF06292);
      this._spawnTeleportFX(target.x, target.z, 0xEC407A);
      owner.x = target.x; owner.z = target.z; owner.y = target.y; owner.angle = target.angle;
      owner.lastProgressIdx = target.lastProgressIdx; owner.lap = target.lap;
      target.x = ox; target.z = oz; target.y = oy; target.angle = oa;
      target.lastProgressIdx = op; target.lap = ol;
      // ターゲットには短いスピンペナルティ
      target.spinTimer = Math.max(target.spinTimer || 0, 0.6);
      target.speed *= 0.5;
      // 自分には短い無敵
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
        if (p.kind !== 'block' && p.kind !== 'boomerang' && p.kind !== 'decoy') continue;
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
              if (p.kind === 'boomerang') ItemSystem._spawnSplash(p.x, p.z, 0xff7043);
              else if (p.kind === 'decoy') ItemSystem._spawnSplash(p.x, p.z, 0xB388FF);
              else ItemSystem._spawnSplash(p.x, p.z, 0xa1887f);
              break;
            }
          }
        }
        // デコイ寿命切れの紫色フェードアウト
        if (consumed) {
          ItemSystem.scene.remove(p.mesh);
          ItemSystem.projectiles.splice(i, 1);
        } else if (p.life <= 0) {
          if (p.kind === 'decoy') ItemSystem._spawnSplash(p.x, p.z, 0xB388FF);
          ItemSystem.scene.remove(p.mesh);
          ItemSystem.projectiles.splice(i, 1);
        }
      }

      // 追加: ロケットがデコイに引き寄せられる (駆け引きアイテム)
      for (const p of ItemSystem.projectiles) {
        if (p.kind !== 'rocket') continue;
        // ロケットの target が敵プレイヤー & 近くに敵のデコイがあればロックオン切替
        for (const d of ItemSystem.projectiles) {
          if (d.kind !== 'decoy') continue;
          if (d.ownerId === p.ownerId) continue; // 自分のデコイには釣られない
          const dist = Utils.dist2(p.x, p.z, d.x, d.z);
          if (dist < 20) {
            // 偽ターゲットへ
            p._fakeTarget = { x: d.x, z: d.z };
            if (p.target) {
              // 既存ターゲットより近ければ差し替え
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

      // 追加: メガシールド持ちが触れたら通常車にダメージ
      for (const c of allCars) {
        if (!c.megaShieldTimer || c.megaShieldTimer <= 0) continue;
        c.megaShieldTimer -= dt;
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
                     'freeze', 'shockwave', 'swap', 'phaseShift'].includes(it);
      if (!isNew) {
        return origUse(car, allCars);
      }
      const item = car.consumeItem();
      if (car.isLocal && window.GameUI) GameUI.updateItem(null);
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
        if (window.Net) Net.sendAction({ kind: 'freeze' });
      } else if (item === 'shockwave') {
        ItemSystem.triggerShockwave(car, allCars);
        if (window.Net) Net.sendAction({ kind: 'shockwave' });
      } else if (item === 'swap') {
        const target = ItemSystem.applySwap(car, allCars);
        if (window.Net) Net.sendAction({ kind: 'swap', targetId: target ? target.id : null });
      } else if (item === 'phaseShift') {
        ItemSystem.applyPhaseShift(car);
        if (window.Net) Net.sendAction({ kind: 'phaseShift' });
      }
      if (car.isLocal) {
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
          // ターゲットIDが提供されていればその車と交換、なければローカル計算
          if (action.targetId) {
            const tgt = Game.cars.find(c => c.id === action.targetId);
            if (tgt) {
              const ox = car.x, oz = car.z, oy = car.y, oa = car.angle;
              ItemSystem._spawnTeleportFX(car.x, car.z, 0xF06292);
              ItemSystem._spawnTeleportFX(tgt.x, tgt.z, 0xEC407A);
              car.x = tgt.x; car.z = tgt.z; car.y = tgt.y; car.angle = tgt.angle;
              tgt.x = ox; tgt.z = oz; tgt.y = oy; tgt.angle = oa;
              tgt.spinTimer = Math.max(tgt.spinTimer || 0, 0.6);
            }
          } else {
            ItemSystem.applySwap(car, Game.cars);
          }
          return;
        }
        if (action.kind === 'phaseShift') { ItemSystem.applyPhaseShift(car); return; }
      }
      origRemote(action);
    };
  },
};
window.ItemExt = ItemExt;
