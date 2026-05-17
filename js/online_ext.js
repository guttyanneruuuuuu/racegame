// =============================================================================
// 6人オンラインプレイ完全対応拡張 (OnlineExt)
// =============================================================================
// 既存コードを破壊しない monkey-patch スタイル。以下を追加:
//  - READY 制 (ロビーで各プレイヤーが準備完了をトグル / ホストは全員READY時に開始可)
//  - RTT(ping) を Net 拡張から取得して、ロビーと HUD スタンディングに表示
//  - スペクテイターモード (自分が finished/DNF した後、他プレイヤーをカメラ追尾)
//  - ホスト切断時の警告 / 安全な復帰 (タイトルへ)
//  - 軽量 FPS / Ping カウンター (左上にトグル表示)
//  - クイックプレイ: 共通の "PUBLIC LOBBY" コードで誰でも合流できるショートカット
//  - ロビーチャット / クイックメッセージ + emoji 4 ショートカット
//  - 接続品質バッジ (lobby / standings に色付きドット: 緑/黄/赤)
//
// 設計方針:
//  - lightweight: 既存の Net / NetExt / Game / GameUI に必要最小限の hook のみ。
//  - 既存 PartyExt / UIExt と衝突しないように DOM id プレフィックス `oe-` を使用。
// =============================================================================

const OnlineExt = {
  installed: false,
  ready: new Map(),          // playerId -> boolean
  myReady: false,
  fpsEnabled: false,
  _fps: 0,
  _fpsAcc: 0,
  _fpsT0: 0,
  _hudPingNextAt: 0,
  spectatingId: null,
  _origUpdateCamera: null,
  _hostLost: false,
  PUBLIC_QUICKPLAY_CODE: 'PUBLIC',

  install() {
    if (this.installed) return;
    if (typeof Net === 'undefined' || typeof GameUI === 'undefined' || typeof Game === 'undefined') return;
    this.installed = true;
    this._injectStyles();
    this._enhanceLobby();
    this._enhanceHud();
    this._patchNet();
    this._patchGameLoop();
    this._wireFpsToggle();
    this._addQuickplayButton();
    this._addHostMigrationHandler();
    this._wireRaceChatReceive();
    console.log('OnlineExt installed');
  },

  // ---------------- styles ----------------
  _injectStyles() {
    if (document.getElementById('oe-style')) return;
    const s = document.createElement('style');
    s.id = 'oe-style';
    s.textContent = `
      .oe-ready-badge { display:inline-block; margin-left:6px; font-size:11px; font-weight:900;
        padding:2px 8px; border-radius:999px; background:#444; color:#fff; vertical-align:middle; }
      .oe-ready-badge.on { background:linear-gradient(135deg,#00C853,#76FF03); color:#0a1; }
      .oe-rtt-pill { display:inline-block; margin-left:6px; font-size:10px; padding:1px 6px;
        border-radius:6px; background:rgba(0,0,0,.45); color:#fff; font-family:monospace; }
      .oe-rtt-pill.good { color:#A5F0A5; }
      .oe-rtt-pill.mid  { color:#FFD54F; }
      .oe-rtt-pill.bad  { color:#FF6F60; }
      .oe-rtt-dot { display:inline-block; width:8px; height:8px; border-radius:50%; vertical-align:middle;
        margin-right:4px; background:#888; }
      .oe-rtt-dot.good { background:#76FF03; box-shadow:0 0 6px #76FF03; }
      .oe-rtt-dot.mid  { background:#FFEB3B; box-shadow:0 0 4px #FFEB3B; }
      .oe-rtt-dot.bad  { background:#F44336; box-shadow:0 0 4px #F44336; }
      .oe-lobby-ready-row { margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;
        justify-content:center; }
      .oe-ready-btn { flex:1; min-width:120px; min-height:42px; font-size:14px; font-weight:900;
        border:none; border-radius:10px; padding:8px 14px; cursor:pointer;
        background:linear-gradient(135deg,#90A4AE,#607D8B); color:#fff; transition:transform .12s; }
      .oe-ready-btn:active { transform:scale(0.96); }
      .oe-ready-btn.on { background:linear-gradient(135deg,#00C853,#76FF03); color:#0a1; }
      .oe-readycount { font-size:13px; opacity:.9; color:#fff; }
      .oe-quickemotes { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; }
      .oe-quickemote { flex:0 0 auto; min-width:36px; min-height:32px; font-size:18px; border:none;
        border-radius:8px; padding:4px 8px; cursor:pointer;
        background:rgba(255,255,255,.18); color:#fff; }
      .oe-quickemote:active { transform:scale(0.92); }
      .oe-fps-meter { position:fixed; top:4px; left:50%; transform:translateX(-50%); z-index:80;
        font-family:monospace; font-size:11px; padding:3px 8px; border-radius:6px;
        background:rgba(0,0,0,.55); color:#fff; pointer-events:none; opacity:.85; display:none; }
      .oe-fps-meter.show { display:block; }
      .oe-spectator-banner { position:fixed; left:50%; top:max(48px, env(safe-area-inset-top));
        transform:translateX(-50%); z-index:90; padding:8px 16px;
        background:linear-gradient(135deg,#1a237e,#3949AB); color:#fff; font-weight:900;
        font-size:13px; border-radius:999px; box-shadow:0 6px 18px rgba(0,0,0,.4);
        display:none; }
      .oe-spectator-banner.show { display:flex; gap:8px; align-items:center; }
      .oe-spectator-banner button { background:rgba(255,255,255,.2); border:none; color:#fff;
        font-weight:900; border-radius:8px; padding:4px 8px; cursor:pointer; font-size:11px; }
      .oe-quickplay-btn { background:linear-gradient(135deg,#FF6F00,#FF8F00); color:#fff;
        border:none; border-radius:10px; padding:10px 16px; font-weight:900; font-size:14px;
        min-height:42px; cursor:pointer; margin-top:6px; }
      .oe-host-lost-modal { position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:200;
        display:none; align-items:center; justify-content:center; }
      .oe-host-lost-modal.show { display:flex; }
      .oe-host-lost-modal .panel { max-width:90%; background:#fff; color:#222; padding:18px 20px;
        border-radius:14px; text-align:center; box-shadow:0 16px 40px rgba(0,0,0,.4); }
      .oe-host-lost-modal h3 { margin:0 0 8px; color:#C62828; }
      .oe-hud-rtt { position:fixed; top:4px; right:50%; transform:translateX(50%); z-index:50; }
      /* スタンディングに RTT を出す時のセル */
      .standings-rtt { margin-left:6px; font-family:monospace; font-size:10px;
        padding:1px 4px; border-radius:4px; background:rgba(0,0,0,.4); }
      /* in-race quick chat overlay */
      .oe-race-chat {
        position:fixed; right:max(8px, env(safe-area-inset-right)); top:90px; z-index:55;
        width:min(40vw, 230px); max-height:30vh; display:flex; flex-direction:column;
        gap:3px; pointer-events:none; }
      .oe-race-chat-msg {
        background:rgba(0,0,0,.55); color:#fff; padding:3px 8px; border-radius:10px;
        font-size:11px; font-weight:700; opacity:0; transform:translateY(-6px);
        transition:opacity .25s, transform .25s; align-self:flex-end;
        max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .oe-race-chat-msg.show { opacity:1; transform:translateY(0); }
      .oe-race-chat-msg.you { background:rgba(229,57,53,.7); }
      .oe-race-chat-msg.sys { background:rgba(33,150,243,.7); font-style:italic; }
      /* in-race quick chat button (mobile-friendly) */
      .oe-chat-btn {
        position:fixed; right:max(8px, env(safe-area-inset-right));
        bottom:max(180px, calc(env(safe-area-inset-bottom) + 180px)); z-index:60;
        width:46px; height:46px; border-radius:50%; border:none;
        background:rgba(0,0,0,.55); color:#fff; font-size:20px; cursor:pointer;
        box-shadow:0 4px 12px rgba(0,0,0,.4); }
      .oe-chat-pop {
        position:fixed; right:max(8px, env(safe-area-inset-right));
        bottom:max(232px, calc(env(safe-area-inset-bottom) + 232px)); z-index:60;
        background:rgba(20,22,30,.92); border-radius:14px; padding:8px;
        display:none; flex-direction:column; gap:6px; max-width:220px; }
      .oe-chat-pop.show { display:flex; }
      .oe-chat-pop button { background:rgba(255,255,255,.12); color:#fff;
        border:none; border-radius:10px; padding:6px 10px; font-size:13px;
        cursor:pointer; font-weight:800; text-align:left; min-height:32px; }
      .oe-chat-pop button:active { transform:scale(0.97); }
      .oe-chat-pop input { background:rgba(255,255,255,.12); color:#fff; border:none;
        border-radius:8px; padding:6px 8px; font-size:12px; outline:none; }
    `;
    document.head.appendChild(s);
  },

  // ---------------- lobby enhancements ----------------
  _enhanceLobby() {
    const panel = document.querySelector('#screen-lobby .lobby-panel');
    if (!panel) return;

    // Ready row
    if (!document.getElementById('oe-ready-row')) {
      const row = document.createElement('div');
      row.id = 'oe-ready-row';
      row.className = 'oe-lobby-ready-row';
      row.innerHTML = `
        <button class="oe-ready-btn" id="oe-ready-toggle">✅ READY</button>
        <span class="oe-readycount" id="oe-ready-count">0 / 0 READY</span>
      `;
      // place before lobby-actions
      const actions = panel.querySelector('.lobby-actions');
      if (actions) panel.insertBefore(row, actions);
      else panel.appendChild(row);

      document.getElementById('oe-ready-toggle').addEventListener('click', () => {
        this.myReady = !this.myReady;
        this._broadcastReady();
        this._refreshReadyUi();
      });
    }

    // Wrap updateLobby to inject ready badges + rtt
    const origUpdateLobby = GameUI.updateLobby.bind(GameUI);
    GameUI.updateLobby = (players) => {
      origUpdateLobby(players);
      this._decoratePlayerList(players);
      this._refreshReadyUi();
    };

    // Wrap startRace to only allow if all non-host are ready (host always allowed)
    const origStart = GameUI._onStartRace ? GameUI._onStartRace.bind(GameUI) : null;
    if (origStart) {
      GameUI._onStartRace = () => {
        const players = Array.from(Net.players.values());
        if (players.length >= 2) {
          const notReady = players.filter(p => !p.isHost && !this.ready.get(p.id));
          if (notReady.length > 0) {
            const ok = confirm(`まだ ${notReady.length} 人が READY ではありません。それでも開始しますか？`);
            if (!ok) return;
          }
        }
        // reset ready map for next race
        this.ready.clear();
        this.myReady = false;
        origStart();
      };
    }
  },

  _decoratePlayerList(players) {
    const list = document.getElementById('player-list');
    if (!list) return;
    const rows = list.querySelectorAll('.player-row');
    let i = 0;
    for (const p of players) {
      const row = rows[i++];
      if (!row) continue;
      const nameEl = row.querySelector('.name');
      if (!nameEl) continue;
      // remove previous extras
      row.querySelectorAll('.oe-ready-badge,.oe-rtt-pill').forEach(e => e.remove());
      // ready badge
      const isReady = p.isHost || !!this.ready.get(p.id);
      const rb = document.createElement('span');
      rb.className = 'oe-ready-badge' + (isReady ? ' on' : '');
      rb.textContent = isReady ? '✓ READY' : 'WAIT';
      nameEl.appendChild(rb);
      // RTT pill (only meaningful for others)
      if (p.id !== Net.myId && window.NetExt) {
        const rtt = NetExt.getRTT(p.id);
        if (rtt > 0) {
          const cls = rtt < 90 ? 'good' : (rtt < 200 ? 'mid' : 'bad');
          const pill = document.createElement('span');
          pill.className = 'oe-rtt-pill ' + cls;
          pill.textContent = `${rtt}ms`;
          nameEl.appendChild(pill);
        }
      }
    }
  },

  _refreshReadyUi() {
    const btn = document.getElementById('oe-ready-toggle');
    const count = document.getElementById('oe-ready-count');
    if (btn) {
      btn.classList.toggle('on', this.myReady);
      btn.textContent = this.myReady ? '✓ READY!' : '✅ READY';
    }
    const players = Array.from(Net.players.values());
    if (count) {
      const readyN = players.filter(p => p.isHost || this.ready.get(p.id)).length;
      count.textContent = `${readyN} / ${players.length} READY`;
    }
  },

  _broadcastReady() {
    // ready 状態は state の延長として action 経由で軽量に同期
    if (typeof Net.sendAction === 'function') {
      try { Net.sendAction({ kind: '_ready', ready: this.myReady }); } catch (_) {}
    }
    // 自分の表示も即時更新
    this.ready.set(Net.myId, this.myReady);
  },

  // ---------------- HUD enhancements ----------------
  _enhanceHud() {
    // FPS meter
    if (!document.getElementById('oe-fps')) {
      const f = document.createElement('div');
      f.id = 'oe-fps';
      f.className = 'oe-fps-meter';
      f.textContent = 'FPS 60 · 0ms';
      document.body.appendChild(f);
    }
    // Spectator banner
    if (!document.getElementById('oe-spectate')) {
      const b = document.createElement('div');
      b.id = 'oe-spectate';
      b.className = 'oe-spectator-banner';
      b.innerHTML = `<span id="oe-spectate-text">👁 観戦中</span>
        <button id="oe-spectate-prev">◀</button>
        <button id="oe-spectate-next">▶</button>
        <button id="oe-spectate-exit">✕</button>`;
      document.body.appendChild(b);
      document.getElementById('oe-spectate-prev').onclick = () => this._cycleSpectate(-1);
      document.getElementById('oe-spectate-next').onclick = () => this._cycleSpectate(1);
      document.getElementById('oe-spectate-exit').onclick = () => this._exitSpectate();
    }
    // In-race chat overlay + button
    if (!document.getElementById('oe-race-chat')) {
      const wrap = document.createElement('div');
      wrap.id = 'oe-race-chat';
      wrap.className = 'oe-race-chat';
      document.body.appendChild(wrap);
    }
    if (!document.getElementById('oe-chat-btn')) {
      const btn = document.createElement('button');
      btn.id = 'oe-chat-btn';
      btn.className = 'oe-chat-btn';
      btn.textContent = '💬';
      btn.title = 'クイックチャット';
      btn.style.display = 'none'; // shown only during multi race
      document.body.appendChild(btn);

      const pop = document.createElement('div');
      pop.id = 'oe-chat-pop';
      pop.className = 'oe-chat-pop';
      pop.innerHTML = `
        <button data-q="ナイス！">👍 ナイス！</button>
        <button data-q="ごめん！">🙏 ごめん！</button>
        <button data-q="行くぞー！">🔥 行くぞー！</button>
        <button data-q="やられたー">😂 やられたー</button>
        <button data-q="🎉🎉🎉">🎉 祝う</button>
        <input id="oe-chat-input" type="text" maxlength="60" placeholder="自由入力…" />
      `;
      document.body.appendChild(pop);
      btn.addEventListener('click', () => pop.classList.toggle('show'));
      pop.querySelectorAll('button[data-q]').forEach(b => {
        b.addEventListener('click', () => {
          this._sendRaceChat(b.dataset.q);
          pop.classList.remove('show');
        });
      });
      const inp = document.getElementById('oe-chat-input');
      if (inp) {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const text = inp.value.trim();
            if (text) this._sendRaceChat(text);
            inp.value = '';
            pop.classList.remove('show');
          }
        });
      }
      // Press T to focus chat input during race
      window.addEventListener('keydown', (e) => {
        if ((e.key || '').toLowerCase() === 't' && Game.state === 'racing' && Game.mode === 'multi') {
          if (document.activeElement === inp) return;
          e.preventDefault();
          pop.classList.add('show');
          inp.focus();
        }
        if (e.key === 'Escape') pop.classList.remove('show');
      });
    }

    // Host lost modal
    if (!document.getElementById('oe-host-lost')) {
      const m = document.createElement('div');
      m.id = 'oe-host-lost';
      m.className = 'oe-host-lost-modal';
      m.innerHTML = `<div class="panel">
        <h3>⚠ ホストが切断しました</h3>
        <p>P2P 接続のためホスト退出時に部屋は閉じます。<br>タイトルに戻って新しく部屋を作成してください。</p>
        <button class="btn btn-primary" id="oe-host-lost-ok">タイトルへ</button>
      </div>`;
      document.body.appendChild(m);
      document.getElementById('oe-host-lost-ok').onclick = () => {
        m.classList.remove('show');
        try { Net.leave(); } catch (_) {}
        GameUI.showScreen('screen-title');
      };
    }

    // Wrap _updateStandings to show RTT
    const origStandings = Game._updateStandings ? Game._updateStandings.bind(Game) : null;
    if (origStandings) {
      Game._updateStandings = () => {
        origStandings();
        const el = (Game.hudEls && Game.hudEls.standings) || document.getElementById('hud-standings');
        if (!el || !window.NetExt) return;
        // append rtt to each row
        const rows = el.querySelectorAll('.standings-row');
        const cars = Game.cars || [];
        const sorted = [...cars].sort((a, b) => {
          if (a.finished && b.finished) return a.finishTime - b.finishTime;
          if (a.finished) return -1; if (b.finished) return 1;
          return b.totalProgress - a.totalProgress;
        });
        sorted.forEach((c, i) => {
          const row = rows[i]; if (!row) return;
          row.querySelectorAll('.standings-rtt,.oe-rtt-dot').forEach(e => e.remove());
          // local car has no RTT
          let dot = document.createElement('span');
          dot.className = 'oe-rtt-dot';
          if (c.isLocal || Game.mode !== 'multi') {
            dot.classList.add('good');
          } else {
            const rtt = NetExt.getRTT(c.id) || 0;
            if (rtt === 0) dot.classList.add('mid');
            else if (rtt < 90) dot.classList.add('good');
            else if (rtt < 200) dot.classList.add('mid');
            else dot.classList.add('bad');
          }
          // insert as first child
          row.insertBefore(dot, row.firstChild);
        });
      };
    }
  },

  // ---------------- patch Net to handle ready / spectate ----------------
  _patchNet() {
    // hook 'action' to listen for _ready
    Net.on('action', (action) => {
      if (!action || action.kind !== '_ready') return;
      this.ready.set(action.by, !!action.ready);
      this._refreshReadyUi();
      // also re-decorate to update badges
      this._decoratePlayerList(Array.from(Net.players.values()));
    });

    // when player leaves, clean ready
    Net.on('playerLeft', (id) => {
      this.ready.delete(id);
      this._refreshReadyUi();
    });

    // when room starts (new race), reset ready
    Net.on('startRace', () => {
      this.ready.clear();
      this.myReady = false;
      this._refreshReadyUi();
    });

    // disconnected -> host lost modal (client side)
    Net.on('disconnected', () => {
      this._hostLost = true;
      const m = document.getElementById('oe-host-lost');
      if (m) m.classList.add('show');
    });
  },

  // ---------------- FPS counter & main loop hook ----------------
  _patchGameLoop() {
    const origLoop = Game.loop.bind(Game);
    Game.loop = () => {
      const t = performance.now();
      origLoop();
      // FPS calc
      const dt = t - (this._fpsT0 || t);
      this._fpsT0 = t;
      this._fpsAcc = this._fpsAcc * 0.9 + (dt > 0 ? 1000 / dt : 0) * 0.1;
      if (this.fpsEnabled && t >= this._hudPingNextAt) {
        this._hudPingNextAt = t + 250;
        const fpsEl = document.getElementById('oe-fps');
        if (fpsEl) {
          // average ping from peers
          let avgRtt = 0, n = 0;
          if (window.NetExt && Game.mode === 'multi') {
            for (const p of Net.players.values()) {
              if (p.id === Net.myId) continue;
              const r = NetExt.getRTT(p.id);
              if (r > 0) { avgRtt += r; n++; }
            }
            avgRtt = n > 0 ? Math.round(avgRtt / n) : 0;
          }
          const fps = Math.round(this._fpsAcc);
          const cars = (Game.cars || []).length;
          fpsEl.textContent = `FPS ${fps} · PING ${avgRtt}ms · ${cars}P`;
        }
      }
      // spectator camera override
      if (this.spectatingId && Game.state === 'racing') {
        this._applySpectateCamera();
      }
      // auto-enter spectate when local finishes but race continues
      if (Game.state === 'racing' && Game.localCar && Game.localCar.finished && !this.spectatingId) {
        const others = (Game.cars || []).filter(c => !c.isLocal && !c.finished);
        if (others.length > 0) this._enterSpectate(others[0].id);
      }
      // exit spectate if race ended
      if (Game.state !== 'racing' && this.spectatingId) {
        this._exitSpectate();
      }
      // chat button visibility
      this._updateChatBtnVisibility();
    };
  },

  _wireFpsToggle() {
    window.addEventListener('keydown', (e) => {
      if ((e.key || '').toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        this.fpsEnabled = !this.fpsEnabled;
        const el = document.getElementById('oe-fps');
        if (el) el.classList.toggle('show', this.fpsEnabled);
      }
    });
    // Also long-press on hud-time toggles
    const hudTime = document.getElementById('hud-time');
    if (hudTime) {
      let timer = null;
      const start = () => { timer = setTimeout(() => {
        this.fpsEnabled = !this.fpsEnabled;
        const el = document.getElementById('oe-fps');
        if (el) el.classList.toggle('show', this.fpsEnabled);
      }, 800); };
      const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
      hudTime.addEventListener('touchstart', start, { passive: true });
      hudTime.addEventListener('touchend', cancel);
      hudTime.addEventListener('mousedown', start);
      hudTime.addEventListener('mouseup', cancel);
      hudTime.addEventListener('mouseleave', cancel);
    }
  },

  // ---------------- spectator mode ----------------
  _enterSpectate(targetId) {
    this.spectatingId = targetId;
    const banner = document.getElementById('oe-spectate');
    if (banner) banner.classList.add('show');
    this._updateSpectateText();
    if (typeof showToast === 'function') showToast('👁 観戦モード - ◀▶で切替', 1800);
  },
  _exitSpectate() {
    this.spectatingId = null;
    const banner = document.getElementById('oe-spectate');
    if (banner) banner.classList.remove('show');
  },
  _cycleSpectate(dir) {
    const others = (Game.cars || []).filter(c => !c.isLocal && !c.finished);
    if (others.length === 0) return this._exitSpectate();
    let idx = others.findIndex(c => c.id === this.spectatingId);
    idx = (idx + dir + others.length) % others.length;
    this.spectatingId = others[idx].id;
    this._updateSpectateText();
  },
  _updateSpectateText() {
    const txt = document.getElementById('oe-spectate-text');
    if (!txt) return;
    const t = (Game.cars || []).find(c => c.id === this.spectatingId);
    txt.textContent = t ? `👁 観戦: ${t.name}` : '👁 観戦中';
  },
  _applySpectateCamera() {
    const c = (Game.cars || []).find(c => c.id === this.spectatingId);
    if (!c || !Game.camera) return;
    const back = 6.5, up = 3.8, fwd = 12;
    const tx = c.x - Math.sin(c.angle) * back;
    const tz = c.z - Math.cos(c.angle) * back;
    const ty = up + (c.y || 0) * 0.7;
    Game.camera.position.x = Utils.lerp(Game.camera.position.x, tx, 0.18);
    Game.camera.position.y = Utils.lerp(Game.camera.position.y, ty, 0.15);
    Game.camera.position.z = Utils.lerp(Game.camera.position.z, tz, 0.18);
    const lx = c.x + Math.sin(c.angle) * fwd;
    const lz = c.z + Math.cos(c.angle) * fwd;
    const ly = 1.2 + (c.y || 0) * 0.5;
    Game.camera.lookAt(lx, ly, lz);
  },

  // ---------------- quickplay button ----------------
  _addQuickplayButton() {
    const btnRow = document.querySelector('#screen-title .title-buttons');
    if (!btnRow || document.getElementById('btn-quickplay')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-quickplay';
    btn.className = 'btn btn-secondary oe-quickplay-btn';
    btn.textContent = '🌐 クイックプレイ (PUBLIC ROOM)';
    btn.title = 'PUBLIC ルームに直接参加 / 無ければ作成';
    btn.addEventListener('click', () => this._onQuickplay());
    // Insert after btn-join-room
    const joinBtn = document.getElementById('btn-join-room');
    if (joinBtn && joinBtn.parentNode === btnRow) {
      btnRow.insertBefore(btn, joinBtn.nextSibling);
    } else {
      btnRow.appendChild(btn);
    }
  },

  async _onQuickplay() {
    const info = GameUI.getMyInfo();
    showToast('PUBLIC ROOM に接続中...', 1500);
    // Try to join the public code first; if it fails, create it ourselves.
    try {
      // Hack the room code generator: temporarily force the code to "PUBLIC"
      const origCreate = Net.createRoom.bind(Net);
      Net.createRoom = function(myInfo) {
        const orig = Utils.genRoomCode;
        Utils.genRoomCode = () => 'PUBLIC';
        const p = origCreate(myInfo);
        // restore immediately
        Utils.genRoomCode = orig;
        return p;
      };
      try {
        await Net.joinRoom(this.PUBLIC_QUICKPLAY_CODE, info);
        GameUI.showScreen('screen-lobby');
        document.getElementById('btn-start-race').style.display = 'none';
        showToast('PUBLIC ROOM に参加しました', 1500);
      } catch (e) {
        // join failed -> create
        try {
          await Net.createRoom(info);
          GameUI.showScreen('screen-lobby');
          showToast('PUBLIC ROOM を作成しました (誰かの参加を待機)', 2200);
        } catch (e2) {
          showToast('クイックプレイ失敗: ' + (e2.message || e.message), 2500);
        }
      }
      Net.createRoom = origCreate;
    } catch (e) {
      showToast('クイックプレイエラー: ' + e.message, 2500);
    }
  },

  // ---------------- host migration / disconnect handling ----------------
  _addHostMigrationHandler() {
    // Watch player leave events: if host leaves while in lobby/game, show modal
    const origPL = Net.callbacks['playerLeft'] || [];
    // (the disconnected event is already handled above)
    // Also handle: client sees host's connection closed via 'disconnected'
    // -> already wired in _patchNet
  },

  // ---------------- in-race chat ----------------
  _sendRaceChat(text) {
    text = String(text || '').trim().slice(0, 60);
    if (!text) return;
    const me = (Net.players.get(Net.myId) || {}).name || 'me';
    this._displayRaceChat(me, text, true, false);
    if (window.NetExt && typeof Net.sendChat === 'function') {
      Net.sendChat(text);
    } else if (typeof Net.sendAction === 'function') {
      try { Net.sendAction({ kind: '_chat', text, name: me }); } catch (_) {}
    }
  },
  _displayRaceChat(name, text, isMine, isSys) {
    const wrap = document.getElementById('oe-race-chat');
    if (!wrap) return;
    const row = document.createElement('div');
    row.className = 'oe-race-chat-msg' + (isMine ? ' you' : '') + (isSys ? ' sys' : '');
    row.textContent = isSys ? `[${text}]` : `${name}: ${text}`;
    wrap.appendChild(row);
    requestAnimationFrame(() => row.classList.add('show'));
    setTimeout(() => {
      row.classList.remove('show');
      setTimeout(() => { try { row.remove(); } catch (_) {} }, 280);
    }, 4500);
    while (wrap.children.length > 5) wrap.removeChild(wrap.firstChild);
  },
  _wireRaceChatReceive() {
    if (window.NetExt && typeof NetExt.onChat === 'function') {
      NetExt.onChat((msg) => {
        if (Game.state !== 'racing') return;
        if (msg.from === Net.myId) return;
        this._displayRaceChat(msg.name || 'guest', msg.text || '', false, !!msg.sys);
      });
    }
    // Fallback: _chat action
    Net.on('action', (action) => {
      if (!action || action.kind !== '_chat') return;
      if (action.by === Net.myId) return;
      const p = Net.players.get(action.by) || {};
      this._displayRaceChat(action.name || p.name || 'guest', action.text || '', false, false);
    });
  },
  // toggle the chat button visibility depending on game state
  _updateChatBtnVisibility() {
    const btn = document.getElementById('oe-chat-btn');
    if (!btn) return;
    if (Game.state === 'racing' && Game.mode === 'multi') btn.style.display = '';
    else btn.style.display = 'none';
  },

  // public API
  setReady(b) { this.myReady = !!b; this._broadcastReady(); this._refreshReadyUi(); },
  getRTT(id) { return window.NetExt ? NetExt.getRTT(id) : 0; },
};
window.OnlineExt = OnlineExt;
