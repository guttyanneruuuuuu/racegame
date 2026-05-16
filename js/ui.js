// ============= UI 管理 =============
const GameUI = {
  selectedColor: '#E53935',
  selectedCarType: 'balanced',
  selectedMap: 'grand',
  _safeStorage: null,
  _speedLineTimerId: null,

  init() {
    this._safeStorage = this._getStorage();
    // 色選択
    document.querySelectorAll('.car-option').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.car-option').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        this.selectedColor = el.dataset.color;
      });
    });

    // マシンタイプ選択
    document.querySelectorAll('.cartype-option').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.cartype-option').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        this.selectedCarType = el.dataset.type;
        const lab = document.getElementById('cartype-label-name');
        if (lab) lab.textContent = el.querySelector('.ctt-name').textContent;
      });
    });
    // localStorage から復元
    try {
      const savedType = this._storageGet('gr_carType');
      if (savedType) {
        const el = document.querySelector(`.cartype-option[data-type="${savedType}"]`);
        if (el) el.click();
      }
    } catch (_) {}

    // マップ選択
    document.querySelectorAll('.map-option').forEach(el => {
      el.addEventListener('click', () => {
        this.setSelectedMap(el.dataset.map);
      });
    });
    try {
      const savedMap = this._storageGet('gr_mapId');
      if (savedMap) this.setSelectedMap(savedMap, false);
    } catch (_) {}

    // タイトル画面ボタン
    document.getElementById('btn-create-room').addEventListener('click', () => this._onCreateRoom());
    document.getElementById('btn-join-room').addEventListener('click', () => this.showScreen('screen-join'));
    document.getElementById('btn-solo').addEventListener('click', () => this._onSolo());

    // ジョイン画面
    document.getElementById('btn-do-join').addEventListener('click', () => this._onDoJoin());
    document.getElementById('btn-join-back').addEventListener('click', () => this.showScreen('screen-title'));
    document.getElementById('room-code-input').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    // ロビー
    document.getElementById('btn-start-race').addEventListener('click', () => this._onStartRace());
    document.getElementById('btn-leave-room').addEventListener('click', () => this._onLeaveRoom());
    document.getElementById('btn-copy-code').addEventListener('click', () => this._copyCode());

    // フィニッシュ
    document.getElementById('btn-back-lobby').addEventListener('click', () => this._onBackToLobby());

    // ジャイロ許可
    document.getElementById('btn-enable-gyro').addEventListener('click', () => this._onEnableGyro());
    document.getElementById('btn-skip-gyro').addEventListener('click', () => this._onSkipGyro());

    // 再キャリブレーション
    const recBtn = document.getElementById('btn-recalibrate');
    if (recBtn) {
      const fire = (e) => {
        e.preventDefault();
        Input.recalibrate();
        showToast('ジャイロを再設定しました', 1000);
      };
      recBtn.addEventListener('touchstart', fire, { passive: false });
      recBtn.addEventListener('mousedown', fire);
    }
    // 感度トグル
    const sensBtn = document.getElementById('btn-toggle-sens');
    if (sensBtn) {
      const tg = (e) => {
        e.preventDefault();
        const sc = document.getElementById('sensitivity-ctrl');
        if (sc) sc.classList.toggle('show');
      };
      sensBtn.addEventListener('touchstart', tg, { passive: false });
      sensBtn.addEventListener('mousedown', tg);
    }

    // 感度スライダー
    const sensSlider = document.getElementById('sens-slider');
    const sensVal = document.getElementById('sens-val');
    if (sensSlider) {
      sensSlider.value = Input.sensitivity;
      sensVal.textContent = Input.sensitivity + '°';
      sensSlider.addEventListener('input', () => {
        const v = parseFloat(sensSlider.value);
        Input.setSensitivity(v);
        sensVal.textContent = v + '°';
      });
    }

    // 反転チェックボックス
    const invertChk = document.getElementById('sens-invert');
    if (invertChk) {
      invertChk.checked = Input.invert;
      invertChk.addEventListener('change', () => {
        Input.setInvert(invertChk.checked);
      });
    }

    // ミュートボタン
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) {
      let muted = this._storageGet('gyrorush-muted') === '1';
      const apply = () => {
        if (window.SFX) SFX.setMuted(muted);
        muteBtn.textContent = muted ? '🔇' : '🔊';
        this._storageSet('gyrorush-muted', muted ? '1' : '0');
      };
      apply();
      const fire = (e) => {
        e.preventDefault();
        muted = !muted;
        apply();
      };
      muteBtn.addEventListener('touchstart', fire, { passive: false });
      muteBtn.addEventListener('mousedown', fire);
    }

    // 名前入力
    const nameEl = document.getElementById('player-name');
    const saved = this._storageGet('gyrorush-name');
    if (saved) nameEl.value = saved;

    // スピードライン更新ループ
    this._startSpeedLineLoop();
  },

  _startSpeedLineLoop() {
    const lines = document.getElementById('speed-lines');
    if (this._speedLineTimerId) clearInterval(this._speedLineTimerId);
    this._speedLineTimerId = setInterval(() => {
      if (!lines) return;
      const c = Game.localCar;
      if (!c) { lines.classList.remove('show'); return; }
      const sp = Math.abs(c.speed);
      if (sp > 45 || c.boostTimer > 0 || c.miniTurboTimer > 0) {
        lines.classList.add('show');
        if (c.boostTimer > 0) lines.classList.add('boost');
        else lines.classList.remove('boost');
      } else {
        lines.classList.remove('show');
        lines.classList.remove('boost');
      }
    }, 100);
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    if (id === 'screen-game') {
      document.body.classList.add('in-game');
    } else {
      document.body.classList.remove('in-game');
    }
  },

  getMyInfo() {
    let name = document.getElementById('player-name').value.trim();
    if (!name) name = 'プレイヤー' + Math.floor(Math.random() * 100);
    if (name.length > 10) name = name.slice(0, 10);
    this._storageSet('gyrorush-name', name);
    this._storageSet('gr_carType', this.selectedCarType);
    return { name, color: this.selectedColor, carType: this.selectedCarType };
  },

  setSelectedMap(mapId, persist = true) {
    const normalized = (window.Track && Track.normalizeMapId) ? Track.normalizeMapId(mapId) : (mapId || 'grand');
    this.selectedMap = normalized;
    document.querySelectorAll('.map-option').forEach(el => {
      el.classList.toggle('active', el.dataset.map === normalized);
    });
    if (persist) {
      this._storageSet('gr_mapId', normalized);
    }
  },

  getSelectedMap() {
    return this.selectedMap || 'grand';
  },

  async _onCreateRoom() {
    const info = this.getMyInfo();
    showToast('部屋を作成中...');
    try {
      await Net.createRoom(info);
      this.showScreen('screen-lobby');
    } catch (e) {
      showToast('部屋作成失敗: ' + e.message, 3000);
    }
  },

  _onDoJoin() {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    const errEl = document.getElementById('join-error');
    errEl.textContent = '';
    if (code.length !== 6) {
      errEl.textContent = '6文字のコードを入力してね';
      return;
    }
    const info = this.getMyInfo();
    showToast('接続中...');
    Net.joinRoom(code, info).then(() => {
      this.showScreen('screen-lobby');
      document.getElementById('btn-start-race').style.display = 'none';
    }).catch(e => {
      errEl.textContent = '接続失敗: ' + (e.message || '部屋が見つかりません');
    });
  },

  async _onSolo() {
    const info = this.getMyInfo();
    const localId = 'local-player';
    const players = [
      { id: localId, name: info.name, color: info.color, isAI: false },
    ];
    const aiNames = ['ターボ', 'ジェット', 'ロケット', 'ボルト', 'スピード'];
    const palette = ['#1E88E5', '#FDD835', '#43A047', '#8E24AA', '#FB8C00', '#E53935', '#26C6DA'];
    const aiColors = palette.filter(c => c !== info.color).slice(0, 5);
    for (let i = 0; i < 5; i++) {
      players.push({ id: 'ai-' + i, name: aiNames[i], color: aiColors[i] || '#888', isAI: true });
    }
    await this._beginRace(players, localId, 'solo', this.getSelectedMap());
  },

  async _beginRace(players, localId, mode, mapId) {
    if (this._isMobile() && !Input.gyroEnabled) {
      await this._askGyro();
    }
    if (mapId) this.setSelectedMap(mapId, mode !== 'multi');
    this.showScreen('screen-game');
    Input.autoCalibrateOnStart();
    Game.setupRace(players, localId, mode, this.getSelectedMap());
    Game.startCountdown(Date.now() + 3500);
  },

  _isMobile() {
    return /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ||
      ('ontouchstart' in window && window.innerWidth < 1024);
  },

  _askGyro() {
    return new Promise((resolve) => {
      this._gyroResolve = resolve;
      document.getElementById('gyro-permission').classList.add('show');
    });
  },
  async _onEnableGyro() {
    const ok = await Input.enableGyro();
    document.getElementById('gyro-permission').classList.remove('show');
    if (!ok) showToast('ジャイロ許可されませんでした。タッチで操作してね。', 2500);
    if (this._gyroResolve) { this._gyroResolve(); this._gyroResolve = null; }
  },
  _onSkipGyro() {
    document.getElementById('gyro-permission').classList.remove('show');
    if (this._gyroResolve) { this._gyroResolve(); this._gyroResolve = null; }
  },

  _onStartRace() {
    const players = Array.from(Net.players.values());
    if (players.length < 1) return;
    Net.startRace(Math.floor(Math.random() * 1e9), this.getSelectedMap());
  },

  _onLeaveRoom() {
    Net.leave();
    this.showScreen('screen-title');
  },

  _onBackToLobby() {
    document.getElementById('finish-overlay').classList.remove('show');
    if (Net.roomCode) {
      this.showScreen('screen-lobby');
      this.updateLobby(Array.from(Net.players.values()));
    } else {
      this.showScreen('screen-title');
    }
  },

  async _copyCode() {
    const code = Net.roomCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast('コピーしました', 1200);
    } catch (e) {
      showToast(code, 2000);
    }
  },

  _getStorage() {
    try { return window.localStorage; } catch (_) { return null; }
  },
  _storageGet(key) {
    try { return this._safeStorage ? this._safeStorage.getItem(key) : null; } catch (_) { return null; }
  },
  _storageSet(key, value) {
    try { if (this._safeStorage) this._safeStorage.setItem(key, value); } catch (_) {}
  },

  updateLobby(players) {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    document.getElementById('room-code-show').textContent = Net.roomCode || '------';

    document.getElementById('btn-start-race').style.display = Net.isHost ? '' : 'none';

    // プレイヤー数表示
    const countEl = document.getElementById('player-count');
    const maxPlayers = (window.Net && Number.isInteger(Net.MAX_PLAYERS) && Net.MAX_PLAYERS > 0) ? Net.MAX_PLAYERS : 6;
    if (countEl) countEl.textContent = `${players.length} / ${maxPlayers}`;

    for (const p of players) {
      const row = document.createElement('div');
      row.className = 'player-row';
      if (p.id === Net.myId) row.classList.add('you');
      if (p.isHost) row.classList.add('host');
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      chip.style.background = p.color;
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = p.name + (p.id === Net.myId ? '(あなた)' : '');
      row.appendChild(chip);
      row.appendChild(name);
      list.appendChild(row);
    }

    if (!Net.isHost) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = 'ホストの開始を待っています...';
      list.appendChild(note);
    }
  },

  updateItem(itemOrItems) {
    const slot = document.getElementById('hud-item-slot');
    if (!slot) return;
    const MAX_ITEM_SLOTS = 2;
    const items = Array.isArray(itemOrItems)
      ? itemOrItems.filter(Boolean).slice(0, MAX_ITEM_SLOTS)
      : (itemOrItems ? [itemOrItems] : []);

    if (items.length === 0) {
      slot.innerHTML = '<div class="item-stack"><div class="item-box">?</div></div>';
      return;
    }

    const boxes = items.map((item, idx) => {
      const d = ItemSystem.getDisplay(item);
      const subClass = idx > 0 ? ' item-box-sub' : '';
      return `<div class="item-box has-item${subClass}" style="background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.7), transparent 55%), linear-gradient(135deg, ${d.color}, #fff)">${d.emoji}</div>`;
    }).join('');
    slot.innerHTML = `<div class="item-stack${items.length > 1 ? ' dual' : ''}">${boxes}</div>`;

    // 取得時にアイテムロール演出
    slot.classList.add('rolling');
    setTimeout(() => slot.classList.remove('rolling'), 600);
  },

  // コイン枚数表示更新 (10枚で最大、speedボーナス % も表示)
  updateCoins(count) {
    let el = document.getElementById('hud-coins');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hud-coins';
      el.className = 'hud-coins';
      const hud = document.getElementById('hud') || document.body;
      hud.appendChild(el);
    }
    const c = Math.max(0, Math.min(10, count || 0));
    const pct = c * 2;
    el.innerHTML = `<span class="coin-icon">🪙</span><span class="coin-num">${c}/10</span><span class="coin-bonus">+${pct}%</span>`;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    if (c >= 10) el.classList.add('max'); else el.classList.remove('max');
  },

  runCountdown(waitMs, onFinish) {
    const el = document.getElementById('countdown');
    let count = 3;
    const startCount = () => {
      el.textContent = String(count);
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
      if (window.SFX) SFX.play('countdown');
      if (count === 0) {
        el.textContent = 'GO!';
        if (window.SFX) SFX.play('go');
        setTimeout(() => {
          el.classList.remove('show');
          onFinish && onFinish();
        }, 800);
        return;
      }
      count--;
      setTimeout(startCount, 1000);
    };
    setTimeout(() => {
      count = 3;
      startCount();
    }, waitMs);
  },

  flashScreen(color = '#fff', duration = 200) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; inset: 0; background: ${color};
      opacity: 0.7; z-index: 99; pointer-events: none;
      transition: opacity ${duration}ms;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '0');
    setTimeout(() => el.remove(), duration + 50);
  },

  // 墨スプラッシュ (大幅弱体化版: 角の小さい汚れだけ、視野ほぼ確保)
  flashInk() {
    // 既存の墨があれば差し替え (重ね掛け防止)
    const old = document.querySelector('.ink-splat');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'ink-splat';
    // 4隅のさらに小さな汚れ + 中央~周辺はほぼ透過
    el.innerHTML = `<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id="ink-blur"><feGaussianBlur stdDeviation="8"/></filter>
        <radialGradient id="ink-grad" cx="50%" cy="55%" r="60%">
          <stop offset="0%"  stop-color="#000" stop-opacity="0"/>
          <stop offset="70%" stop-color="#000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000" stop-opacity="1"/>
        </radialGradient>
        <mask id="ink-mask"><rect width="800" height="600" fill="url(#ink-grad)"/></mask>
      </defs>
      <g filter="url(#ink-blur)" fill="#1a1a2e" mask="url(#ink-mask)">
        <circle cx="70"  cy="80"  r="65"/>
        <circle cx="730" cy="90"  r="70"/>
        <circle cx="60"  cy="510" r="60"/>
        <circle cx="740" cy="510" r="65"/>
      </g>
    </svg>`;
    document.body.appendChild(el);
    // さらに短く: 0.5sでフェード開始、合計1.2sで完全消去
    setTimeout(() => el.classList.add('fade'), 500);
    setTimeout(() => el.remove(), 1200);
  },

  showResults(cars) {
    if (window.SFX) SFX.play('finish');
    const overlay = document.getElementById('finish-overlay');
    const list = document.getElementById('finish-results');
    list.innerHTML = '';

    const finished = cars.filter(c => c.finished).sort((a, b) => a.finishTime - b.finishTime);
    const unfinished = cars.filter(c => !c.finished).sort((a, b) => b.totalProgress - a.totalProgress);
    const ranking = [...finished, ...unfinished];

    ranking.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      if (c.isLocal) row.classList.add('you');
      const rank = document.createElement('div'); rank.className = 'result-rank';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}位`;
      rank.textContent = medal;
      const chip = document.createElement('div'); chip.className = 'player-chip'; chip.style.background = c.color;
      const name = document.createElement('div'); name.className = 'result-name'; name.textContent = c.name;
      const time = document.createElement('div'); time.className = 'result-time';
      time.textContent = c.finished ? Utils.formatTime(c.finishTime) : 'DNF';
      const best = document.createElement('div'); best.className = 'result-best';
      best.textContent = isFinite(c.bestLap) ? ('BEST ' + Utils.formatTime(c.bestLap)) : '';
      row.appendChild(rank); row.appendChild(chip); row.appendChild(name); row.appendChild(time); row.appendChild(best);
      list.appendChild(row);
    });

    const myRank = ranking.findIndex(c => c.isLocal) + 1;
    const title = document.getElementById('finish-title');
    if (myRank === 1) title.textContent = '🏆 優勝！';
    else if (myRank === 2) title.textContent = '🥈 2位！';
    else if (myRank === 3) title.textContent = '🥉 3位！';
    else title.textContent = `${myRank}位 でゴール`;

    overlay.classList.add('show');
  },
};

window.GameUI = GameUI;
