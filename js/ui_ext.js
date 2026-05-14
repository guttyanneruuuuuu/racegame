// ============= UI 拡張: チュートリアル/アイテム図鑑/拡張設定/チャット/アワード表示 =============
const UIExt = {
  installed: false,

  install() {
    if (this.installed) return;
    this.installed = true;
    this._buildExtraScreens();
    this._wireButtons();
    this._hookResults();
    this._wireKeyboardShortcuts();
  },

  _buildExtraScreens() {
    const root = document.body;
    // === タイトル画面の右下に追加ボタン群 ===
    const titleEl = document.querySelector('#screen-title .title-content');
    if (titleEl && !document.getElementById('title-extra-buttons')) {
      const extra = document.createElement('div');
      extra.id = 'title-extra-buttons';
      extra.className = 'title-extras';
      extra.innerHTML = `
        <button class="ext-btn" id="btn-tutorial">📚 操作チュートリアル</button>
        <button class="ext-btn" id="btn-itemdex">🎁 アイテム図鑑</button>
        <button class="ext-btn" id="btn-settings">⚙ 設定</button>
        <button class="ext-btn" id="btn-profile">👤 プロフィール</button>
      `;
      titleEl.appendChild(extra);
    }

    // === チュートリアル オーバーレイ ===
    if (!document.getElementById('overlay-tutorial')) {
      const ov = document.createElement('div');
      ov.id = 'overlay-tutorial';
      ov.className = 'ext-overlay';
      ov.innerHTML = `
        <div class="ext-panel">
          <h2>📚 操作チュートリアル</h2>
          <div class="tut-pages">
            <div class="tut-page active" data-page="0">
              <h3>1. ハンドル操作</h3>
              <p>スマホを <b>横向き</b> に持って、左右に傾けるとハンドルを切れます。<br>
              PCでは ← / → キー、または画面中央をドラッグでも操作できます。</p>
              <p class="tut-tip">💡 感度は ⚙ ボタンで調整可能</p>
            </div>
            <div class="tut-page" data-page="1">
              <h3>2. アクセル / ブレーキ</h3>
              <p>右の <b>ACCEL</b> ボタンで加速、左の <b>BRAKE</b> ボタンで減速・バック。<br>
              PCでは ↑ / ↓ キーで操作。</p>
            </div>
            <div class="tut-page" data-page="2">
              <h3>3. ドリフト & ミニターボ</h3>
              <p>ハンドルを切りながらブレーキを押すと <b>ドリフト</b> 開始。<br>
              長く続けるほどチャージが溜まり、青→黄→紫の順に強力な <b>ミニターボ</b> が発動！</p>
              <p class="tut-tip">💡 紫チャージ(ULTRA!) は最強の加速</p>
            </div>
            <div class="tut-page" data-page="3">
              <h3>4. アイテムを使おう</h3>
              <p>コース上の <b>?ボックス</b> に触れるとアイテム入手。<br>
              右の <b>★USE</b> ボタン (PCは Space / X) で発動！</p>
              <p class="tut-tip">💡 順位が下位ほど強力なアイテムが出やすい</p>
            </div>
            <div class="tut-page" data-page="4">
              <h3>5. 復活 & 視点切替</h3>
              <p>壁に挟まったら 🔄 ボタン (PCは R) で復活。<br>
              👀 ボタンで後方視点。📷 ボタンで視点モードを切替できます。</p>
            </div>
          </div>
          <div class="tut-nav">
            <button class="btn btn-ghost" id="tut-prev">← 前へ</button>
            <span id="tut-indicator">1 / 5</span>
            <button class="btn btn-secondary" id="tut-next">次へ →</button>
          </div>
          <button class="btn btn-primary ext-close" id="tut-close">閉じる</button>
        </div>`;
      root.appendChild(ov);
    }

    // === アイテム図鑑 ===
    if (!document.getElementById('overlay-itemdex')) {
      const ov = document.createElement('div');
      ov.id = 'overlay-itemdex';
      ov.className = 'ext-overlay';
      ov.innerHTML = `
        <div class="ext-panel">
          <h2>🎁 アイテム図鑑</h2>
          <div id="itemdex-list" class="itemdex-list"></div>
          <button class="btn btn-primary ext-close" id="itemdex-close">閉じる</button>
        </div>`;
      root.appendChild(ov);
    }

    // === 拡張設定 ===
    if (!document.getElementById('overlay-settings')) {
      const ov = document.createElement('div');
      ov.id = 'overlay-settings';
      ov.className = 'ext-overlay';
      ov.innerHTML = `
        <div class="ext-panel">
          <h2>⚙ 設定</h2>
          <div class="settings-group">
            <h3>🎵 オーディオ</h3>
            <label>BGM 音量 <input type="range" id="set-bgm" min="0" max="1" step="0.05" value="0.35"></label>
            <label>環境音 音量 <input type="range" id="set-env" min="0" max="1" step="0.05" value="0.25"></label>
          </div>
          <div class="settings-group">
            <h3>🎨 グラフィック</h3>
            <label>描画品質
              <select id="set-quality">
                <option value="low">低 (軽量)</option>
                <option value="med" selected>中 (推奨)</option>
                <option value="high">高 (重め)</option>
              </select>
            </label>
            <label>パーティクル
              <select id="set-particles">
                <option value="off">OFF</option>
                <option value="low">少なめ</option>
                <option value="normal" selected>標準</option>
                <option value="high">多め</option>
              </select>
            </label>
            <label>天候プリセット
              <select id="set-weather">
                <option value="clear" selected>晴れ</option>
                <option value="rain">雨</option>
                <option value="snow">雪</option>
                <option value="sunset">夕焼け</option>
                <option value="night">夜</option>
                <option value="random">毎レースランダム</option>
              </select>
            </label>
          </div>
          <div class="settings-group">
            <h3>🤖 AI 難易度</h3>
            <label>ソロモードの強さ
              <select id="set-difficulty">
                <option value="easy">イージー</option>
                <option value="normal" selected>ノーマル</option>
                <option value="hard">ハード</option>
                <option value="pro">プロ</option>
              </select>
            </label>
            <label>AI 人数
              <input type="number" id="set-ai-count" min="1" max="7" value="5">
            </label>
          </div>
          <div class="settings-group">
            <h3>🏁 レース</h3>
            <label>周回数
              <select id="set-laps">
                <option value="1">1周</option>
                <option value="2">2周</option>
                <option value="3" selected>3周</option>
                <option value="5">5周</option>
              </select>
            </label>
            <label>ドリフト感度
              <input type="range" id="set-drift" min="0.5" max="1.5" step="0.05" value="1.0">
            </label>
          </div>
          <button class="btn btn-primary ext-close" id="settings-close">保存して閉じる</button>
        </div>`;
      root.appendChild(ov);
    }

    // === プロフィール ===
    if (!document.getElementById('overlay-profile')) {
      const ov = document.createElement('div');
      ov.id = 'overlay-profile';
      ov.className = 'ext-overlay';
      ov.innerHTML = `
        <div class="ext-panel">
          <h2>👤 プロフィール</h2>
          <div id="profile-content"></div>
          <button class="btn btn-ghost" id="profile-reset">記録をリセット</button>
          <button class="btn btn-primary ext-close" id="profile-close">閉じる</button>
        </div>`;
      root.appendChild(ov);
    }

    // === ロビーにチャット欄を追加 ===
    const lobbyPanel = document.querySelector('#screen-lobby .lobby-panel');
    if (lobbyPanel && !document.getElementById('lobby-chat')) {
      const chat = document.createElement('div');
      chat.id = 'lobby-chat';
      chat.className = 'lobby-chat';
      chat.innerHTML = `
        <div class="chat-title">💬 ロビーチャット</div>
        <div class="chat-log" id="chat-log"></div>
        <div class="chat-input-row">
          <input type="text" id="chat-input" placeholder="メッセージを入力" maxlength="80">
          <button class="btn-mini" id="chat-send">送信</button>
        </div>`;
      lobbyPanel.appendChild(chat);
    }

    // === ゲーム中: 視点切替ボタン ===
    const settingsStack = document.querySelector('.settings-stack');
    if (settingsStack && !document.getElementById('btn-camera-mode')) {
      const camBtn = document.createElement('button');
      camBtn.id = 'btn-camera-mode';
      camBtn.className = 'btn-icon';
      camBtn.title = '視点切替';
      camBtn.textContent = '📷';
      const fire = (e) => {
        e.preventDefault();
        if (window.CameraExt) CameraExt.cycle();
      };
      camBtn.addEventListener('touchstart', fire, { passive: false });
      camBtn.addEventListener('mousedown', fire);
      settingsStack.appendChild(camBtn);
    }

    // === HUD: ミニ操作説明 ===
    const hud = document.getElementById('hud');
    if (hud && !document.getElementById('hud-help')) {
      const help = document.createElement('div');
      help.id = 'hud-help';
      help.className = 'hud-help hidden';
      help.innerHTML = `
        <div class="hud-help-row"><b>↑</b> アクセル</div>
        <div class="hud-help-row"><b>↓</b> ブレーキ/バック</div>
        <div class="hud-help-row"><b>←→</b> ハンドル</div>
        <div class="hud-help-row"><b>Space</b> アイテム</div>
        <div class="hud-help-row"><b>R</b> リスポーン</div>
        <div class="hud-help-row"><b>C</b> 視点</div>`;
      hud.appendChild(help);
    }

    // === 霧オーバーレイ ===
    if (!document.getElementById('fog-overlay')) {
      const fog = document.createElement('div');
      fog.id = 'fog-overlay';
      fog.className = 'fog-overlay';
      document.body.appendChild(fog);
    }
  },

  _wireButtons() {
    const open = (id) => () => {
      const el = document.getElementById(id);
      if (el) el.classList.add('show');
      if (id === 'overlay-itemdex') this._renderItemDex();
      if (id === 'overlay-profile') this._renderProfile();
      if (id === 'overlay-settings') this._loadSettingsValues();
    };
    const close = (id) => () => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('show');
    };
    const link = (btnId, cb) => {
      const el = document.getElementById(btnId);
      if (el) el.addEventListener('click', cb);
    };

    link('btn-tutorial', open('overlay-tutorial'));
    link('btn-itemdex',  open('overlay-itemdex'));
    link('btn-settings', open('overlay-settings'));
    link('btn-profile',  open('overlay-profile'));

    link('tut-close',     close('overlay-tutorial'));
    link('itemdex-close', close('overlay-itemdex'));
    link('settings-close', () => { this._saveSettings(); close('overlay-settings')(); });
    link('profile-close', close('overlay-profile'));

    // チュートリアルページめくり
    let tutPage = 0;
    const totalPages = document.querySelectorAll('#overlay-tutorial .tut-page').length;
    const updateTut = () => {
      document.querySelectorAll('#overlay-tutorial .tut-page').forEach((p, i) => {
        p.classList.toggle('active', i === tutPage);
      });
      const ind = document.getElementById('tut-indicator');
      if (ind) ind.textContent = `${tutPage + 1} / ${totalPages}`;
    };
    link('tut-prev', () => { tutPage = Math.max(0, tutPage - 1); updateTut(); });
    link('tut-next', () => {
      if (tutPage < totalPages - 1) { tutPage++; updateTut(); }
      else close('overlay-tutorial')();
    });

    // プロフィールリセット
    link('profile-reset', () => {
      if (confirm('記録をすべてリセットしますか？')) {
        localStorage.removeItem('gyrorush-prog');
        if (window.Awards) {
          Awards.level = 1; Awards.xp = 0; Awards.totalRaces = 0;
          Awards.wins = 0; Awards.bestLapEver = Infinity;
          Awards.unlocks = { colors: [], titles: [] };
        }
        this._renderProfile();
      }
    });

    // チャット送信
    const send = () => {
      const inp = document.getElementById('chat-input');
      if (!inp) return;
      const msg = inp.value.trim();
      if (!msg) return;
      this.appendChat(GameUI.getMyInfo().name, msg, true);
      if (window.NetExt) NetExt.sendChat(msg);
      else if (window.Net && Net.sendAction) {
        try { Net.sendAction({ kind: '_chat', text: msg }); } catch (_) {}
      }
      inp.value = '';
    };
    link('chat-send', send);
    const chatInp = document.getElementById('chat-input');
    if (chatInp) {
      chatInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') send();
      });
    }
  },

  _wireKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'h') {
        const help = document.getElementById('hud-help');
        if (help) help.classList.toggle('hidden');
      }
      // V キーで視点を切り替え
      if (key === 'v') {
        if (window.CameraExt) CameraExt.cycle();
      }
    });
  },

  _renderItemDex() {
    const list = document.getElementById('itemdex-list');
    if (!list || !window.ItemSystem) return;
    list.innerHTML = '';
    const descs = {
      boost:        { rarity: '共通', desc: '2.5秒間の加速ブースト' },
      tripleBoost:  { rarity: 'レア', desc: '4秒の超ブースト' },
      rocket:       { rarity: '共通', desc: '前方の敵にホーミング攻撃' },
      tripleRocket: { rarity: '超レア', desc: '上位3台に同時ロケット' },
      banana:       { rarity: '共通', desc: '後方に設置。踏むとスピン' },
      oil:          { rarity: '中',  desc: 'オイル設置。踏むと大スリップ' },
      ink:          { rarity: '中',  desc: '全員の視界に墨 + 操作反転' },
      mine:         { rarity: 'レア', desc: '地雷設置。爆発+吹き飛ばし' },
      lightning:    { rarity: 'レア', desc: '全員を一時操作不能+縮小' },
      shield:       { rarity: '共通', desc: '5秒の無敵バリア' },
      ghost:        { rarity: 'レア', desc: '5秒間 透明化+すり抜け' },
      magnet:       { rarity: 'レア', desc: '?ボックスを引き寄せる' },
      fog:          { rarity: 'レア', desc: '相手の視界を霧で覆う' },
      block:        { rarity: '中',  desc: '通路にブロックを設置' },
      mini:         { rarity: '中',  desc: '自分を小さく+ハンドリング上昇' },
      boomerang:    { rarity: 'レア', desc: '前方に飛び、戻ってくる飛び道具' },
      megaShield:   { rarity: '超レア', desc: '10秒間 周囲全員を弾き飛ばす' },
      killer:       { rarity: '超レア', desc: '大砲に入り、4.5秒間 自動で爆速前進' },
      teleport:     { rarity: 'レア', desc: '前方28mへ瞬間ワープ + 短い無敵' },
      emp:          { rarity: 'レア', desc: '半径16m以内のHUDをジャム + 操作鈍化' },
      decoy:        { rarity: '中',  desc: '停車中のクローンを残置。ロケットの囮' },
      freeze:       { rarity: 'レア', desc: '周囲14mを1.4秒凍結 + 強減速' },
      shockwave:    { rarity: 'レア', desc: '周囲10mを強烈に弾き飛ばす + 自分ブースト' },
      swap:         { rarity: '超レア', desc: '前方の最も近いライバルと位置交換！' },
      phaseShift:   { rarity: '超レア', desc: '2.5秒透過 + ブースト + 短無敵' },
    };
    for (const it of ItemSystem.ITEMS) {
      const d = ItemSystem.getDisplay(it);
      const meta = descs[it] || { rarity: '?', desc: '?' };
      const row = document.createElement('div');
      row.className = 'itemdex-row';
      row.innerHTML = `
        <div class="itemdex-icon" style="background:linear-gradient(135deg, ${d.color}, #fff)">${d.emoji}</div>
        <div class="itemdex-info">
          <div class="itemdex-name">${d.label}</div>
          <div class="itemdex-desc">${meta.desc}</div>
        </div>
        <div class="itemdex-rarity">${meta.rarity}</div>`;
      list.appendChild(row);
    }
  },

  _renderProfile() {
    const el = document.getElementById('profile-content');
    if (!el || !window.Awards) return;
    const A = Awards;
    const winRate = A.totalRaces > 0 ? Math.round((A.wins / A.totalRaces) * 100) : 0;
    el.innerHTML = `
      <div class="prof-row"><span>レベル</span><b>${A.level}</b></div>
      <div class="prof-row"><span>XP</span><b>${A.xp}</b></div>
      <div class="prof-row"><span>総レース数</span><b>${A.totalRaces}</b></div>
      <div class="prof-row"><span>1位回数</span><b>${A.wins} (${winRate}%)</b></div>
      <div class="prof-row"><span>歴代ベストラップ</span><b>${isFinite(A.bestLapEver) ? Utils.formatTime(A.bestLapEver) : '--'}</b></div>
      <div class="prof-unlocks">
        <h4>🎨 アンロック済みカラー</h4>
        <div class="prof-colors">
          ${A.unlocks.colors.length === 0 ? '<span class="prof-empty">まだありません</span>' : A.unlocks.colors.map(c => `<div class="prof-color" style="background:${c}"></div>`).join('')}
        </div>
      </div>`;

    // タイトル画面のカラー選択にアンロック分を反映
    this._injectUnlockedColors();
  },

  _injectUnlockedColors() {
    const wrap = document.getElementById('car-options');
    if (!wrap || !window.Awards) return;
    for (const c of Awards.unlocks.colors) {
      if (wrap.querySelector(`[data-color="${c}"]`)) continue;
      const div = document.createElement('div');
      div.className = 'car-option';
      div.dataset.color = c;
      div.style.setProperty('--c', c);
      div.addEventListener('click', () => {
        wrap.querySelectorAll('.car-option').forEach(e => e.classList.remove('active'));
        div.classList.add('active');
        if (window.GameUI) GameUI.selectedColor = c;
      });
      wrap.appendChild(div);
    }
  },

  _loadSettingsValues() {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('set-bgm',        localStorage.getItem('gyrorush-bgm-vol') || '0.35');
    set('set-env',        localStorage.getItem('gyrorush-env-vol') || '0.25');
    set('set-quality',    localStorage.getItem('gyrorush-quality') || 'med');
    set('set-particles',  localStorage.getItem('gyrorush-particles') || 'normal');
    set('set-weather',    localStorage.getItem('gyrorush-weather') || 'clear');
    set('set-difficulty', localStorage.getItem('gyrorush-difficulty') || 'normal');
    set('set-ai-count',   localStorage.getItem('gyrorush-ai-count') || '5');
    set('set-laps',       localStorage.getItem('gyrorush-laps') || '3');
    set('set-drift',      localStorage.getItem('gyrorush-drift') || '1.0');
  },

  _saveSettings() {
    const get = (id) => document.getElementById(id) ? document.getElementById(id).value : null;
    const save = (id, key) => {
      const v = get(id);
      if (v !== null) localStorage.setItem(key, v);
    };
    save('set-bgm',        'gyrorush-bgm-vol');
    save('set-env',        'gyrorush-env-vol');
    save('set-quality',    'gyrorush-quality');
    save('set-particles',  'gyrorush-particles');
    save('set-weather',    'gyrorush-weather');
    save('set-difficulty', 'gyrorush-difficulty');
    save('set-ai-count',   'gyrorush-ai-count');
    save('set-laps',       'gyrorush-laps');
    save('set-drift',      'gyrorush-drift');

    if (window.BGM) {
      BGM.setBgmVolume(parseFloat(get('set-bgm')));
      BGM.setEnvVolume(parseFloat(get('set-env')));
    }
    if (window.Game) {
      Game.totalLaps = parseInt(get('set-laps') || '3', 10);
    }
    if (window.VFX) {
      const w = get('set-weather');
      if (w && w !== 'random') VFX.setWeather(w);
    }
    if (window.AIExt) AIExt.setDifficulty(get('set-difficulty'));
    showToast('設定を保存しました', 1000);
  },

  // === チャット ===
  appendChat(name, message, you = false) {
    const log = document.getElementById('chat-log');
    if (!log) return;
    const row = document.createElement('div');
    row.className = 'chat-row' + (you ? ' you' : '');
    row.innerHTML = `<span class="chat-name">${this._escape(name)}</span>: <span class="chat-msg">${this._escape(message)}</span>`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    // ログが多くなったら古いものを削除
    while (log.children.length > 50) log.removeChild(log.firstChild);
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  },

  // === 結果画面にアワード/XP表示を追加 ===
  _hookResults() {
    if (!window.GameUI) return;
    const orig = GameUI.showResults.bind(GameUI);
    GameUI.showResults = (cars) => {
      orig(cars);
      // 自分の順位とベストラップから Awards に結果を反映
      const me = cars.find(c => c.isLocal);
      if (!me || !window.Awards) return;
      const sorted = [...cars].sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.totalProgress - a.totalProgress;
      });
      const rank = sorted.findIndex(c => c.id === me.id) + 1;
      const result = Awards.endRace(rank, me.finished, me.bestLap);
      this._renderAwardSection(result, me);

      // 勝利BGMをトリガー
      if (window.BGM && rank === 1) {
        BGM.play('victory');
        if (BGM.cheer) BGM.cheer();
      }
    };
  },

  _renderAwardSection(result, me) {
    const card = document.querySelector('.finish-card');
    if (!card) return;
    let extra = document.getElementById('finish-extra');
    if (!extra) {
      extra = document.createElement('div');
      extra.id = 'finish-extra';
      extra.className = 'finish-extra';
      const btn = card.querySelector('#btn-back-lobby');
      if (btn) card.insertBefore(extra, btn);
      else card.appendChild(extra);
    }
    const awardsHtml = result.awards.length
      ? result.awards.map(a => `<div class="award-row">${a.name} <span class="xp-tag">+${a.xp} XP</span></div>`).join('')
      : '<div class="award-empty">獲得アワードなし</div>';
    extra.innerHTML = `
      <div class="award-section">
        <h3>🏅 アワード</h3>
        ${awardsHtml}
        <div class="xp-total">獲得XP: <b>+${result.gainedXp}</b> ${result.leveledUp ? `<span class="lvl-up">🎉 LV ${result.newLevel} にアップ！</span>` : ''}</div>
      </div>
      <div class="award-section stats-section">
        <h3>📊 統計</h3>
        <div class="stats-grid">
          <div>ベスト: <b>${isFinite(me.bestLap) ? Utils.formatTime(me.bestLap) : '--'}</b></div>
          <div>最高速: <b>${Math.round(Awards.stats.maxSpeedKmh)} km/h</b></div>
          <div>アイテム使用: <b>${Awards.stats.itemUsed}</b></div>
          <div>命中: <b>${Awards.stats.hitsLanded}</b></div>
          <div>ミニターボ: <b>${Awards.stats.miniTurboCount}</b></div>
          <div>スピン: <b>${Awards.stats.spinCount}</b></div>
        </div>
      </div>`;
  },
};
window.UIExt = UIExt;
