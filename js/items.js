// ============= アイテムシステム (拡張版: 12種類) =============
const ItemSystem = {
  ITEMS: [
    'boost', 'tripleBoost', 'rocket', 'tripleRocket', 'banana', 'lightning',
    'shield', 'oil', 'ink', 'mine', 'ghost', 'magnet', 'killer'
  ],

  // 順位によって出やすさを変える(1位は弱め、後ろはレア出やすい)
  weightedRoll(rank, totalPlayers) {
    const ratio = totalPlayers > 1 ? (rank - 1) / (totalPlayers - 1) : 0.5;
    // ratio 0 (先頭) → boost/banana/oil/shield 多め
    // ratio 1 (最後尾) → tripleRocket / lightning / tripleBoost / ghost / magnet 多め
    const weights = {
      boost:        Utils.lerp(3.0, 1.5, ratio),
      tripleBoost:  Utils.lerp(0.2, 2.0, ratio),
      banana:       Utils.lerp(2.5, 0.8, ratio),
      oil:          Utils.lerp(2.0, 0.8, ratio),
      mine:         Utils.lerp(1.0, 1.0, ratio),
      ink:          Utils.lerp(0.6, 1.8, ratio),
      shield:       Utils.lerp(2.0, 1.0, ratio),
      ghost:        Utils.lerp(0.2, 1.6, ratio),
      magnet:       Utils.lerp(0.4, 1.6, ratio),
      rocket:       Utils.lerp(0.8, 2.4, ratio),
      tripleRocket: Utils.lerp(0.05, 1.4, ratio),
      lightning:    Utils.lerp(0.05, 1.6, ratio),
      killer:       Utils.lerp(0.02, 2.2, ratio),
    };
    if (totalPlayers <= 2) {
      // 2人対戦ではロケット系を出しやすくする
      weights.rocket = Math.max(weights.rocket, Utils.lerp(2.2, 3.8, ratio));
      weights.tripleRocket = Math.max(weights.tripleRocket, Utils.lerp(0.45, 1.8, ratio));
    }
    let sum = 0;
    for (const k in weights) sum += weights[k];
    let r = Math.random() * sum;
    for (const k in weights) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return 'boost';
  },

  getDisplay(item) {
    switch (item) {
      case 'boost':        return { emoji: '⚡', label: 'BOOST',       color: '#FF9800' };
      case 'tripleBoost':  return { emoji: '⚡⚡⚡', label: 'TRIPLE BOOST', color: '#FF5722' };
      case 'rocket':       return { emoji: '🚀', label: 'ROCKET',      color: '#E53935' };
      case 'tripleRocket': return { emoji: '🚀×3', label: 'TRIPLE ROCKET', color: '#B71C1C' };
      case 'banana':       return { emoji: '🍌', label: 'BANANA',      color: '#FBC02D' };
      case 'lightning':    return { emoji: '⛈', label: 'LIGHTNING',   color: '#7E57C2' };
      case 'shield':       return { emoji: '🛡', label: 'SHIELD',      color: '#29B6F6' };
      case 'oil':          return { emoji: '🛢', label: 'OIL',         color: '#424242' };
      case 'ink':          return { emoji: '🦑', label: 'INK',         color: '#1A237E' };
      case 'mine':         return { emoji: '💣', label: 'MINE',        color: '#37474F' };
      case 'ghost':        return { emoji: '👻', label: 'GHOST',       color: '#B0BEC5' };
      case 'magnet':       return { emoji: '🧲', label: 'MAGNET',      color: '#EF5350' };
      case 'killer':       return { emoji: '💥', label: 'KILLER',      color: '#FFC107' };
      default: return { emoji: '?', label: '', color: '#999' };
    }
  },

  // 投射物・設置物
  projectiles: [],
  scene: null,
  _explosions: [],
  _splashes: [],
  _shockwaves: [],

  init(scene) {
    this.scene = scene;
    this.projectiles = [];
    this._explosions = [];
    this._splashes = [];
    this._shockwaves = [];
  },

  // ===== バナナ設置 =====
  spawnBanana(owner) {
    const angle = owner.angle;
    const bx = owner.x - Math.sin(angle) * 3.8;
    const bz = owner.z - Math.cos(angle) * 3.8;
    const mesh = this._mkBanana();
    mesh.position.set(bx, 0.55, bz);
    this.scene.add(mesh);
    this.projectiles.push({
      kind: 'banana', x: bx, z: bz, vx: 0, vz: 0,
      ownerId: owner.id, life: 30, mesh,
      radius: 1.55,
    });
  },

  // ===== ロケット (ホーミング) =====
  spawnRocket(owner, target) {
    const angle = owner.angle;
    const rx = owner.x + Math.sin(angle) * 3.0;
    const rz = owner.z + Math.cos(angle) * 3.0;
    let vx, vz;
    const rocketSpeed = 98;
    if (target) {
      const dx = target.x - rx;
      const dz = target.z - rz;
      const d = Math.hypot(dx, dz) || 1;
      vx = (dx / d) * rocketSpeed;
      vz = (dz / d) * rocketSpeed;
    } else {
      vx = Math.sin(angle) * rocketSpeed;
      vz = Math.cos(angle) * rocketSpeed;
    }
    const mesh = this._mkRocket();
    mesh.position.set(rx, 0.8, rz);
    mesh.rotation.y = Math.atan2(vx, vz);
    this.scene.add(mesh);
    this.projectiles.push({
      kind: 'rocket', x: rx, z: rz, vx, vz,
      ownerId: owner.id, life: 4.5, mesh,
      radius: 1.6, target,
    });
  },

  // ===== トリプルロケット (3発) =====
  spawnTripleRocket(owner, targets) {
    for (let i = 0; i < 3; i++) {
      const tgt = targets[i] || targets[0] || null;
      // 連続発射: 少しずらして3発
      setTimeout(() => {
        if (this.scene) this.spawnRocket(owner, tgt);
      }, i * 250);
    }
  },

  // ===== トリプルブースト (3回連続のブースト) =====
  applyTripleBoost(owner) {
    // 3.5秒のブーストに加え、連続加速
    owner.applyBoost(4.0);
  },

  // ===== オイル設置 (踏むとスピン+スロー) =====
  spawnOil(owner) {
    const angle = owner.angle;
    const ox = owner.x - Math.sin(angle) * 4.0;
    const oz = owner.z - Math.cos(angle) * 4.0;
    const mesh = this._mkOil();
    mesh.position.set(ox, 0.05, oz);
    this.scene.add(mesh);
    this.projectiles.push({
      kind: 'oil', x: ox, z: oz, vx: 0, vz: 0,
      ownerId: owner.id, life: 30, mesh,
      radius: 1.8,
    });
  },

  // ===== 地雷 (前方に設置, 接近で爆発) =====
  spawnMine(owner) {
    const angle = owner.angle;
    const mx = owner.x - Math.sin(angle) * 3.0;
    const mz = owner.z - Math.cos(angle) * 3.0;
    const mesh = this._mkMine();
    mesh.position.set(mx, 0.5, mz);
    this.scene.add(mesh);
    this.projectiles.push({
      kind: 'mine', x: mx, z: mz, vx: 0, vz: 0,
      ownerId: owner.id, life: 35, mesh,
      radius: 2.0,
      armTime: 0.8,
    });
  },

  // ===== イカ墨 (全員視界に墨 + 操作反転) =====
  triggerInk(owner, allCars) {
    for (const c of allCars) {
      if (c.id === owner.id) continue;
      if (c.finished) continue;
      c.hitInkSplash();
      this._notifyItemHitByCar(owner, 'ink', c);
    }
    if (window.GameUI) window.GameUI.flashInk();
  },

  // ===== 雷 (全員) =====
  triggerLightning(owner, allCars) {
    for (const c of allCars) {
      if (c.id === owner.id) continue;
      if (c.finished) continue;
      c.hitLightning();
      this._notifyItemHitByCar(owner, 'lightning', c);
    }
    if (window.GameUI) window.GameUI.flashScreen('#fff', 250);
    // ショックウェーブ
    this._spawnShockwave(owner.x, owner.z, 60, 0xFFEB3B);
  },

  _notifyItemHit(ownerId, itemKind, targetCar, allCars) {
    if (!targetCar || !allCars || !itemKind) return;
    const owner = allCars.find(c => c.id === ownerId);
    if (!owner) return;
    this._notifyItemHitByCar(owner, itemKind, targetCar);
  },

  _notifyItemHitByCar(ownerCar, itemKind, targetCar) {
    if (!ownerCar || !targetCar || ownerCar.id === targetCar.id || !itemKind) return;
    if (window.GameUI && typeof GameUI.reportItemHit === 'function') {
      GameUI.reportItemHit(ownerCar.name || 'プレイヤー', itemKind, targetCar.name || 'プレイヤー');
    }
  },

  // ===== ゴースト (5秒間半透明 + 衝突無効) =====
  applyGhost(owner) {
    owner.applyGhost(5.0);
    owner.giveShield(0.4); // ほんの少しの無敵 (アイテム使用時の保険)
  },

  // ===== マグネット (5秒間: 周囲のアイテムボックスを引き寄せる) =====
  applyMagnet(owner) {
    // 5秒間マグネット効果は車側のフラグで管理
    owner.magnetTimer = 5.0;
  },

  // ===== キラー (大砲演出 + 一定時間の自動爆速走行) =====
  applyKiller(owner) {
    if (!owner || !owner.activateKiller) return;
    owner.activateKiller(4.5);
    this._spawnShockwave(owner.x, owner.z, 12, 0xffc107);
  },

  _mkBanana() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.32, 10, 18, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0xfdd835, emissive: 0x664400, emissiveIntensity: 0.45 })
    );
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const tipMat = new THREE.MeshLambertMaterial({ color: 0x3e2723 });
    const tip1 = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 7), tipMat);
    tip1.position.set(-0.78, 0, 0);
    const tip2 = tip1.clone();
    tip2.position.set(0.78, 0, 0);
    g.add(tip1, tip2);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.45, 18),
      new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.25;
    g.add(halo);
    return g;
  },

  _mkRocket() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.28, 1.6, 12),
      new THREE.MeshLambertMaterial({ color: 0xd32f2f, emissive: 0x500000, emissiveIntensity: 0.5 })
    );
    body.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.36, 0.7, 12),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.05;
    const finMat = new THREE.MeshLambertMaterial({ color: 0x424242 });
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), finMat);
      const ang = (i / 3) * Math.PI * 2;
      fin.position.set(Math.cos(ang) * 0.32, Math.sin(ang) * 0.32, -0.7);
      fin.rotation.z = ang;
      g.add(fin);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.9 })
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.z = -1.0;
    g.add(body, nose, flame);
    g._flame = flame;
    return g;
  },

  _mkOil() {
    const g = new THREE.Group();
    // 黒い円盤
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 18),
      new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = 0.01;
    g.add(disk);
    // 虹色光沢 (オイル感)
    const sheen = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 18),
      new THREE.MeshBasicMaterial({ color: 0x9C27B0, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.y = 0.02;
    g.add(sheen);
    g._sheen = sheen;
    // 小さな樽
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.7, 12),
      new THREE.MeshLambertMaterial({ color: 0x1B5E20 })
    );
    can.position.y = 0.4;
    g.add(can);
    return g;
  },

  _mkMine() {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x263238, emissive: 0xff0000, emissiveIntensity: 0.4 })
    );
    g.add(ball);
    // スパイク
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0x37474F });
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 5), spikeMat);
      const a = (i / 8) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      sp.rotation.z = -a + Math.PI / 2;
      g.add(sp);
    }
    // 上下スパイク
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 5), spikeMat);
    top.position.set(0, 0.55, 0);
    g.add(top);
    const bot = top.clone(); bot.position.set(0, -0.45, 0); bot.rotation.x = Math.PI;
    g.add(bot);
    // 赤い点滅ライト
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff1744 })
    );
    light.position.set(0, 0.35, 0);
    g.add(light);
    g._light = light;
    g._ball = ball;
    return g;
  },

  update(dt, allCars) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.armTime !== undefined) p.armTime -= dt;

      if (p.kind === 'rocket') {
        // ホーミング
        if (p.target) {
          const dx = p.target.x - p.x;
          const dz = p.target.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          const sp = Math.hypot(p.vx, p.vz);
          const desVx = (dx / d) * sp;
          const desVz = (dz / d) * sp;
          p.vx = Utils.lerp(p.vx, desVx, 0.08);
          p.vz = Utils.lerp(p.vz, desVz, 0.08);
        }
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.mesh.position.set(p.x, 0.8 + Math.sin(performance.now() * 0.02) * 0.1, p.z);
        p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
        if (p.mesh._flame) {
          const s = 0.8 + Math.random() * 0.5;
          p.mesh._flame.scale.set(s, 1 + Math.random() * 0.4, s);
        }
      } else if (p.kind === 'banana') {
        p.mesh.rotation.y += dt * 2;
        p.mesh.position.y = 0.55 + Math.sin(performance.now() * 0.004) * 0.13;
      } else if (p.kind === 'oil') {
        p.mesh.rotation.y += dt * 0.3;
        if (p.mesh._sheen) {
          p.mesh._sheen.material.color.setHSL((performance.now() * 0.0005) % 1, 0.8, 0.5);
        }
      } else if (p.kind === 'mine') {
        // 点滅
        if (p.mesh._light) {
          const phase = Math.sin(performance.now() * 0.012);
          p.mesh._light.material.color.setRGB(1, phase > 0 ? 0 : 0.6, phase > 0 ? 0 : 0.6);
        }
        if (p.mesh._ball) {
          p.mesh._ball.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(performance.now() * 0.012)) * 0.6;
        }
        p.mesh.rotation.y += dt * 0.5;
      }

      // 衝突判定
      let consumed = false;
      for (const c of allCars) {
        if (c.finished) continue;
        // 自分の発射直後は当たらない
        if (p.kind === 'rocket' && c.id === p.ownerId && p.life > 4.2) continue;
        if (p.kind === 'mine' && c.id === p.ownerId && p.armTime > 0) continue;
        if ((p.kind === 'banana' || p.kind === 'oil') && c.id === p.ownerId && p.life > 29.5) continue;

        if (p.kind === 'oil' && c.isAirborne && c.isAirborne()) continue;

        const d = Utils.dist2(p.x, p.z, c.x, c.z);
        const hitDist = p.radius + 1.2;
        if (d < hitDist) {
          if (p.kind === 'banana') {
            if (c.hitBanana()) consumed = true;
          } else if (p.kind === 'rocket') {
            if (c.hitRocket()) consumed = true;
          } else if (p.kind === 'oil') {
            if (c.hitOilSplash()) consumed = true;
          } else if (p.kind === 'mine') {
            if (c.hitMine()) consumed = true;
          }
          if (consumed) {
            this._notifyItemHit(p.ownerId, p.kind, c, allCars);
            if (p.kind === 'rocket') this._spawnExplosion(p.x, p.z, 0xffa726, 1.2, 0.5);
            else if (p.kind === 'mine') this._spawnExplosion(p.x, p.z, 0xff5722, 2.2, 0.7);
            else if (p.kind === 'oil') this._spawnSplash(p.x, p.z, 0x111111);
            else if (p.kind === 'banana') this._spawnSplash(p.x, p.z, 0xfdd835);
            break;
          }
        }
      }

      if (consumed || p.life <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // 爆発更新
    for (let i = this._explosions.length - 1; i >= 0; i--) {
      const ex = this._explosions[i];
      ex.life -= dt;
      const t = 1 - (ex.life / ex.dur);
      ex.mesh.scale.setScalar((ex.startScale || 0.5) + t * (ex.maxScale || 4));
      ex.mesh.material.opacity = Math.max(0, 1 - t);
      if (ex.life <= 0) {
        this.scene.remove(ex.mesh);
        this._explosions.splice(i, 1);
      }
    }
    // スプラッシュ更新
    for (let i = this._splashes.length - 1; i >= 0; i--) {
      const sp = this._splashes[i];
      sp.life -= dt;
      const t = 1 - (sp.life / sp.dur);
      sp.mesh.scale.setScalar(0.4 + t * 2.6);
      sp.mesh.material.opacity = Math.max(0, 0.9 - t * 0.9);
      sp.mesh.rotation.y += dt * 4;
      if (sp.life <= 0) {
        this.scene.remove(sp.mesh);
        this._splashes.splice(i, 1);
      }
    }
    // ショックウェーブ更新
    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      const sw = this._shockwaves[i];
      sw.life -= dt;
      const t = 1 - (sw.life / sw.dur);
      sw.mesh.scale.setScalar(0.3 + t * sw.maxScale);
      sw.mesh.material.opacity = Math.max(0, 0.7 - t * 0.7);
      if (sw.life <= 0) {
        this.scene.remove(sw.mesh);
        this._shockwaves.splice(i, 1);
      }
    }
  },

  _spawnExplosion(x, z, color = 0xffa726, startScale = 0.5, maxScale = 0.5) {
    const geo = new THREE.SphereGeometry(1.2, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1, z);
    this.scene.add(mesh);
    this._explosions.push({ mesh, life: 0.55, dur: 0.55, startScale, maxScale: 4 });
    // ショックウェーブ追加 (リング)
    this._spawnShockwave(x, z, 6, color);
  },

  _spawnSplash(x, z, color = 0x111111) {
    const geo = new THREE.RingGeometry(0.6, 1.2, 16);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.1, z);
    this.scene.add(mesh);
    this._splashes.push({ mesh, life: 0.5, dur: 0.5 });
  },

  _spawnShockwave(x, z, maxScale = 6, color = 0xffeb3b) {
    const geo = new THREE.RingGeometry(0.6, 0.9, 24);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.15, z);
    this.scene.add(mesh);
    this._shockwaves.push({ mesh, life: 0.6, dur: 0.6, maxScale });
  },

  reset() {
    for (const p of this.projectiles) {
      if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    }
    this.projectiles = [];
    for (const ex of this._explosions) {
      if (ex.mesh && ex.mesh.parent) ex.mesh.parent.remove(ex.mesh);
    }
    this._explosions = [];
    for (const sp of this._splashes) {
      if (sp.mesh && sp.mesh.parent) sp.mesh.parent.remove(sp.mesh);
    }
    this._splashes = [];
    for (const sw of this._shockwaves) {
      if (sw.mesh && sw.mesh.parent) sw.mesh.parent.remove(sw.mesh);
    }
    this._shockwaves = [];
  },
};
