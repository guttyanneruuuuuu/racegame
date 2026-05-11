// ============= アイテムシステム =============
const ItemSystem = {
  ITEMS: ['boost', 'rocket', 'banana', 'lightning', 'shield'],

  // 順位によって出やすさを変える(1位は弱め、後ろはレア出やすい)
  weightedRoll(rank, totalPlayers) {
    // rank: 1始まり
    const ratio = totalPlayers > 1 ? (rank - 1) / (totalPlayers - 1) : 0.5;
    // ratio 0 (先頭) → boost/banana 多め, ratio 1 (最後尾) → rocket/lightning 多め
    const weights = {
      boost:    Utils.lerp(3, 2, ratio),
      banana:   Utils.lerp(3, 1, ratio),
      shield:   Utils.lerp(2, 1, ratio),
      rocket:   Utils.lerp(1, 3, ratio),
      lightning:Utils.lerp(0.2, 2, ratio),
    };
    let sum = 0;
    for (const k in weights) sum += weights[k];
    let r = Math.random() * sum;
    for (const k in weights) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return 'boost';
  },

  // 文字や色定義
  getDisplay(item) {
    switch (item) {
      case 'boost':     return { emoji: '⚡', label: 'BOOST',  color: '#FF9800' };
      case 'rocket':    return { emoji: '🚀', label: 'ROCKET', color: '#E53935' };
      case 'banana':    return { emoji: '🍌', label: 'BANANA', color: '#FBC02D' };
      case 'lightning': return { emoji: '⛈', label: 'LIGHTNING', color: '#7E57C2' };
      case 'shield':    return { emoji: '🛡', label: 'SHIELD', color: '#29B6F6' };
      default: return { emoji: '?', label: '', color: '#999' };
    }
  },

  // バナナや弾の管理
  projectiles: [],   // {kind, x, z, vx, vz, ownerId, life, mesh}
  scene: null,

  init(scene) {
    this.scene = scene;
    this.projectiles = [];
  },

  spawnBanana(owner) {
    // owner の後ろに落とす
    const angle = owner.angle;
    const bx = owner.x - Math.sin(angle) * 3.5;
    const bz = owner.z - Math.cos(angle) * 3.5;
    const mesh = this._mkBanana();
    mesh.position.set(bx, 0.4, bz);
    this.scene.add(mesh);
    this.projectiles.push({
      kind: 'banana', x: bx, z: bz, vx: 0, vz: 0,
      ownerId: owner.id, life: 25, mesh,
      radius: 1.2,
    });
  },

  spawnRocket(owner, target) {
    const angle = owner.angle;
    const rx = owner.x + Math.sin(angle) * 3.0;
    const rz = owner.z + Math.cos(angle) * 3.0;
    let vx, vz;
    if (target) {
      const dx = target.x - rx;
      const dz = target.z - rz;
      const d = Math.hypot(dx, dz) || 1;
      vx = (dx / d) * 70;
      vz = (dz / d) * 70;
    } else {
      vx = Math.sin(angle) * 80;
      vz = Math.cos(angle) * 80;
    }
    const mesh = this._mkRocket();
    mesh.position.set(rx, 0.8, rz);
    mesh.rotation.y = Math.atan2(vx, vz);
    this.scene.add(mesh);
    this.projectiles.push({
      kind: 'rocket', x: rx, z: rz, vx, vz,
      ownerId: owner.id, life: 4, mesh,
      radius: 1.5, target,
    });
  },

  // 全車に雷
  triggerLightning(owner, allCars) {
    for (const c of allCars) {
      if (c.id === owner.id) continue;
      if (c.finished) continue;
      c.hitLightning();
    }
    // エフェクト (画面フラッシュは UI 側)
    if (window.GameUI) window.GameUI.flashScreen('#fff', 200);
  },

  _mkBanana() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.2, 8, 12, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0xfdd835 })
    );
    body.rotation.x = Math.PI / 2;
    g.add(body);
    return g;
  },
  _mkRocket() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8),
      new THREE.MeshLambertMaterial({ color: 0xc62828 })
    );
    body.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.6, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.0;
    g.add(body, nose);
    return g;
  },

  update(dt, allCars) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.kind === 'rocket') {
        // ホーミング
        if (p.target) {
          const dx = p.target.x - p.x;
          const dz = p.target.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          const sp = Math.hypot(p.vx, p.vz);
          const desVx = (dx / d) * sp;
          const desVz = (dz / d) * sp;
          p.vx = Utils.lerp(p.vx, desVx, 0.06);
          p.vz = Utils.lerp(p.vz, desVz, 0.06);
        }
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.mesh.position.set(p.x, 0.8 + Math.sin(performance.now() * 0.02) * 0.1, p.z);
        p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
      } else if (p.kind === 'banana') {
        p.mesh.rotation.y += dt * 2;
      }

      // 衝突判定
      let consumed = false;
      for (const c of allCars) {
        if (c.id === p.ownerId && p.life > 4.5) continue; // 自分の発射直後は当たらない
        if (c.finished) continue;
        const d = Utils.dist2(p.x, p.z, c.x, c.z);
        if (d < (p.radius + 1.2)) {
          if (p.kind === 'banana') {
            if (c.hitBanana()) consumed = true;
          } else if (p.kind === 'rocket') {
            if (c.hitRocket()) consumed = true;
          }
          if (consumed) break;
        }
      }

      // 寿命/衝突 → 削除
      if (consumed || p.life <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  },

  reset() {
    for (const p of this.projectiles) {
      if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    }
    this.projectiles = [];
  },
};
