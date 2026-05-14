// ============= Game / Car / UI への薄い追加パッチ =============
// 既存メソッドはラップして、新機能の効果(フォグ/ブロック/ミニ/メガシールド) と
// VFX/Awards/BGM のライフサイクルを差し込む。
const GameExt = {
  installed: false,
  _lastSpeedRecord: 0,
  _lastFinalLapAnnounce: -1,
  _weatherForRace: 'clear',

  install() {
    if (this.installed) return;
    this.installed = true;
    this._patchCar();
    this._patchUI();
    this._patchGame();
  },

  // ----- Car への追加 -----
  _patchCar() {
    if (typeof Car === 'undefined') return;

    // hitBlock: ブロック設置アイテム命中 -> 短いスピン
    Car.prototype.hitBlock = function () {
      if (this.invincibleTimer > 0 || this.ghostTimer > 0) return false;
      this.spinTimer = Math.max(this.spinTimer, 0.9);
      this.applySlow(1.0, 0.6);
      this.driftActive = false; this.driftCharge = 0;
      return true;
    };

    // applyFog: 視界妨害
    Car.prototype.applyFog = function (seconds) {
      this.fogTimer = Math.max(this.fogTimer || 0, seconds);
      return true;
    };
    // applyMiniSize: 小さくなる
    Car.prototype.applyMiniSize = function (seconds) {
      if (this.invincibleTimer > 0) return false;
      this.miniSizeTimer = Math.max(this.miniSizeTimer || 0, seconds);
      this.applySlow(seconds, 0.85);
      return true;
    };
    // giveMegaShield: 強化シールド (体当たり可)
    Car.prototype.giveMegaShield = function (seconds = 6) {
      this.megaShieldTimer = Math.max(this.megaShieldTimer || 0, seconds);
      this.invincibleTimer = Math.max(this.invincibleTimer, seconds);
    };

    // updateMesh をラップ: 視覚効果 + Awardsの最高速記録
    const origUpdateMesh = Car.prototype.updateMesh;
    Car.prototype.updateMesh = function () {
      // タイマー減衰 (Game.loopのdtに依存しないように簡易減衰)
      const dt = 1 / 60;
      if (this.fogTimer > 0) this.fogTimer = Math.max(0, this.fogTimer - dt);
      if (this.miniSizeTimer > 0) this.miniSizeTimer = Math.max(0, this.miniSizeTimer - dt);
      if (this.megaShieldTimer > 0) this.megaShieldTimer = Math.max(0, this.megaShieldTimer - dt);
      if (this.freezeTimer > 0) this.freezeTimer = Math.max(0, this.freezeTimer - dt);

      origUpdateMesh.call(this);

      // ミニ化スケール
      if (this.miniSizeTimer > 0) {
        const s = 0.55;
        this.mesh.scale.set(s, s, s);
      }

      // フリーズ視覚: 青っぽい色合いとアイス感のため、bodyを覆う氷オーラを表示
      if (this.freezeTimer > 0) {
        if (!this._iceAura) {
          const g = new THREE.SphereGeometry(1.6, 8, 6);
          const m = new THREE.MeshBasicMaterial({
            color: 0x81D4FA, transparent: true, opacity: 0.45, wireframe: true, depthWrite: false,
          });
          this._iceAura = new THREE.Mesh(g, m);
          this._iceAura.position.y = 0.9;
          this.mesh.add(this._iceAura);
        }
        this._iceAura.visible = true;
        this._iceAura.rotation.y += 0.03;
        this._iceAura.material.opacity = 0.35 + Math.abs(Math.sin(performance.now() * 0.006)) * 0.25;
      } else if (this._iceAura) {
        this._iceAura.visible = false;
      }

      // メガシールドのオーラ色
      if (this.megaShieldTimer > 0 && this.shieldMesh) {
        this.shieldMesh.visible = true;
        if (this.shieldMesh.material) {
          this.shieldMesh.material.color = new THREE.Color(1.0, 0.6, 0.1);
          this.shieldMesh.material.opacity = 0.7;
          this.shieldMesh.material.transparent = true;
        }
        this.shieldMesh.scale.set(1.2, 1.2, 1.2);
      } else if (this.shieldMesh && this.invincibleTimer > 0) {
        // 元色に戻す(通常シールド)
        if (this.shieldMesh.material) {
          this.shieldMesh.material.color = new THREE.Color(0.4, 0.85, 1.0);
        }
      }

      // ローカル視点フォグ表示
      if (this.isLocal && typeof GameUI !== 'undefined' && typeof GameUI.flashFog === 'function') {
        if (this.fogTimer > 0) GameUI.flashFog(this.fogTimer);
        else GameUI.flashFog(0);
      }

      // ローカル車の最高速度 Awards 記録
      if (this.isLocal && typeof Awards !== 'undefined') {
        const kmh = Math.abs(this.speed) * 3.6;
        if (kmh > GameExt._lastSpeedRecord) {
          GameExt._lastSpeedRecord = kmh;
          if (typeof Awards.recordSpeed === 'function') Awards.recordSpeed(kmh);
        }
        // スピン/壁ヒット
        if (this.spinTimer > 1.0 && !this._countedSpin) {
          this._countedSpin = true;
          if (typeof Awards.countSpin === 'function') Awards.countSpin();
        } else if (this.spinTimer === 0) {
          this._countedSpin = false;
        }
        if (this.wallHitFlash > 0.25 && !this._countedWall) {
          this._countedWall = true;
          if (typeof Awards.countWallHit === 'function') Awards.countWallHit();
        } else if (this.wallHitFlash === 0) {
          this._countedWall = false;
        }
      }
    };

    // applyInput をラップしてミニターボ発動回数を Awards で計上
    const origApplyInput = Car.prototype.applyInput;
    Car.prototype.applyInput = function (steer, accel, brake, dt) {
      const prev = this.miniTurboTimer || 0;
      origApplyInput.call(this, steer, accel, brake, dt);
      const now = this.miniTurboTimer || 0;
      if (this.isLocal && now > prev + 0.1 && typeof Awards !== 'undefined' && Awards.countMiniTurbo) {
        Awards.countMiniTurbo();
      }
    };

    // hitBanana / hitRocket / hitMine / hitOil / hitInk をラップ: ヒット受け回数
    ['hitBanana','hitRocket','hitMine','hitOilSplash','hitInkSplash','hitLightning'].forEach(method => {
      const orig = Car.prototype[method];
      if (!orig) return;
      Car.prototype[method] = function () {
        const r = orig.apply(this, arguments);
        if (this.isLocal && r && typeof Awards !== 'undefined' && Awards.countHitReceived) {
          Awards.countHitReceived();
        }
        return r;
      };
    });
  },

  // ----- GameUI への追加 -----
  _patchUI() {
    if (typeof GameUI === 'undefined') return;

    // フォグオーバーレイ DOM
    if (!document.getElementById('fog-overlay')) {
      const fog = document.createElement('div');
      fog.id = 'fog-overlay';
      fog.className = 'fog-overlay';
      const screen = document.getElementById('screen-game') || document.body;
      screen.appendChild(fog);
    }

    GameUI.flashFog = function (intensity) {
      const fog = document.getElementById('fog-overlay');
      if (!fog) return;
      if (intensity > 0) {
        const a = Math.min(0.85, intensity * 0.18 + 0.4);
        fog.style.opacity = a;
        fog.classList.add('show');
      } else {
        fog.style.opacity = 0;
        fog.classList.remove('show');
      }
    };
  },

  // ----- Game への追加 -----
  _patchGame() {
    if (typeof Game === 'undefined') return;

    // setupRace をラップ: VFX install + Awards.beginRace + BGM 開始
    const origSetup = Game.setupRace.bind(Game);
    Game.setupRace = (playersList, localId, mode) => {
      origSetup(playersList, localId, mode);

      // VFX (シーンに天候)
      if (typeof VFX !== 'undefined') {
        try {
          VFX.install(Game.scene);
          // 設定から天候 / ランダム
          let weather = 'clear';
          try { weather = localStorage.getItem('gr_weather') || 'clear'; } catch (_) {}
          if (weather === 'random') {
            const opts = ['clear','rain','snow','sunset','night'];
            weather = opts[Math.floor(Math.random() * opts.length)];
          }
          GameExt._weatherForRace = weather;
          VFX.setWeather(weather);
        } catch (e) { console.warn('VFX install error', e); }
      }

      // Awards: 開始時の順位(ローカル) は不明なので 0 で開始
      if (typeof Awards !== 'undefined' && Awards.beginRace) {
        Awards.beginRace(playersList.length);
      }
      GameExt._lastSpeedRecord = 0;
      GameExt._lastFinalLapAnnounce = -1;
    };

    // startCountdown 後に BGM をレース用に
    const origStartCountdown = Game.startCountdown.bind(Game);
    Game.startCountdown = (startTime) => {
      origStartCountdown(startTime);
      if (typeof BGM !== 'undefined') {
        try { BGM.play('race'); BGM.startCrowd && BGM.startCrowd(); } catch (e) {}
      }
    };

    // loop をラップ: VFX.update + ファイナルラップ検出
    const origLoop = Game.loop.bind(Game);
    Game.loop = () => {
      origLoop();
      const dt = Game.clock ? Math.min(Game.clock.getDelta ? 0.016 : 0.016, 0.05) : 0.016;
      // VFX 更新
      if (typeof VFX !== 'undefined' && VFX.update && Game.camera) {
        try { VFX.update(0.016, Game.camera.position); } catch (e) {}
      }
      // ファイナルラップ検出
      if (Game.state === 'racing' && Game.localCar) {
        const lap = Game.localCar.lap;
        if (lap === (Game.totalLaps - 1) && GameExt._lastFinalLapAnnounce !== lap) {
          GameExt._lastFinalLapAnnounce = lap;
          if (typeof BGM !== 'undefined') { try { BGM.play('finalLap'); } catch (_) {} }
          if (typeof showToast === 'function') showToast('🏁 ファイナルラップ！', 1800);
          if (typeof BGM !== 'undefined' && BGM.cheer) BGM.cheer();
        }
      }
    };

    // useItem をラップ: Awards.countItemUse
    const origUseItem = Game.useItem.bind(Game);
    Game.useItem = (car, allCars) => {
      const itemBefore = car && car.item;
      const r = origUseItem(car, allCars);
      if (car && car.isLocal && itemBefore && typeof Awards !== 'undefined' && Awards.countItemUse) {
        Awards.countItemUse(itemBefore);
      }
      return r;
    };

    // forceFinish をラップ: BGM victory + Awards.endRace
    const origForceFinish = Game.forceFinish.bind(Game);
    Game.forceFinish = () => {
      origForceFinish();
      // 状態は forceFinish で 'finished' に遷移している想定
      if (Game.state === 'finished') {
        if (typeof BGM !== 'undefined') {
          try { BGM.play('victory'); BGM.stopCrowd && BGM.stopCrowd(); } catch (_) {}
        }
        // Awards.endRace は ui_ext の showResults フックで呼び出す
      }
    };
  },
};
