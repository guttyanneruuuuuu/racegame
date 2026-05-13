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
    const newItems = ['fog', 'block', 'mini', 'boomerang', 'megaShield'];
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
        rocket:       Utils.lerp(0.8, 2.2, ratio),
        tripleRocket: Utils.lerp(0.05, 1.2, ratio),
        lightning:    Utils.lerp(0.03, 1.3, ratio),  // やや控えめに
        // 新規アイテム
        fog:          Utils.lerp(0.1, 1.3, ratio),    // 後位ほど出やすい
        block:        Utils.lerp(0.6, 1.2, ratio),    // 中位～下位
        mini:         Utils.lerp(0.1, 1.0, ratio),    // 下位の逃げ用
        boomerang:    Utils.lerp(0.5, 1.6, ratio),    // 自分の前に飛ばす攻撃
        megaShield:   Utils.lerp(0.0, 0.5, ratio),    // 超レア
      };
      if (totalPlayers <= 2) {
        // 2人対戦ではロケット系の抽選率を底上げ
        w.rocket = Math.max(w.rocket, Utils.lerp(2.2, 3.6, ratio));
        w.tripleRocket = Math.max(w.tripleRocket, Utils.lerp(0.45, 1.6, ratio));
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

    // ===== ブロックや衝突判定の拡張 =====
    const origCollect = ItemSystem.projectiles;
    // 既存updateの衝突は items.js 側で kind 文字列で判定するため、
    // block 用の判定をフックする
    // → 既存 update が知らない kind は当たり判定がスキップされてしまう。
    // そのため独自に block/boomerang の衝突を追加する。
    const wrappedUpdate = ItemSystem.update.bind(ItemSystem);
    ItemSystem.update = (dt, allCars) => {
      wrappedUpdate(dt, allCars);
      // 追加: block/boomerang の衝突
      for (let i = ItemSystem.projectiles.length - 1; i >= 0; i--) {
        const p = ItemSystem.projectiles[i];
        if (p.kind !== 'block' && p.kind !== 'boomerang') continue;
        let consumed = false;
        for (const c of allCars) {
          if (c.finished) continue;
          if (p.kind === 'boomerang' && c.id === p.ownerId && !p._returning) continue;
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
            }
            if (consumed) {
              if (p.kind === 'boomerang') ItemSystem._spawnSplash(p.x, p.z, 0xff7043);
              else ItemSystem._spawnSplash(p.x, p.z, 0xa1887f);
              break;
            }
          }
        }
        if (consumed) {
          ItemSystem.scene.remove(p.mesh);
          ItemSystem.projectiles.splice(i, 1);
        } else if (p.life <= 0) {
          ItemSystem.scene.remove(p.mesh);
          ItemSystem.projectiles.splice(i, 1);
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
      const isNew = ['fog', 'block', 'mini', 'boomerang', 'megaShield'].includes(it);
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
      }
      origRemote(action);
    };
  },
};
window.ItemExt = ItemExt;
