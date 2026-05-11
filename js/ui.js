// ============= UI 管理 =============
const GameUI = {
  selectedColor: '#FF3B3B',

  init() {
    // 色選択
    document.querySelectorAll('.car-option').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.car-option').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        this.selectedColor = el.dataset.color;
      });
    });

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
      recBtn.addEventListener('click', () => {
        Input.recalibrate();
        showToast('ジャイロを再設定しました', 1200);
      });
    }

    // 名前入力(初期値)
    const nameEl = document.getElementById('player-name');
    const saved = localStorage.getItem('gyrorush-name');
    if (saved) nameEl.value = saved;
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
    localStorage.setItem('gyrorush-name', name);
    return { name, color: this.selectedColor };
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
    // AI 5体追加
    const aiNames = ['ターボ', 'ジェット', 'ロケット', 'ボルト', 'スピード'];
    const aiColors = ['#2EA8FF', '#FFD23F', '#3DDB7E', '#B265FF', '#FF8AC4'];
    for (let i = 0; i < 5; i++) {
      players.push({ id: 'ai-' + i, name: aiNames[i], color: aiColors[i], isAI: true });
    }
    await this._beginRace(players, localId, 'solo');
  },

  async _beginRace(players, localId, mode) {
    // ジャイロ許可
    if (this._isMobile() && !Input.gyroEnabled) {
      await this._askGyro();
    }
    this.showScreen('screen-game');
    Game.setupRace(players, localId, mode);
    // ローカルカウントダウン
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
    Net.startRace(Math.floor(Math.random() * 1e9));
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

  _copyCode() {
    const code = Net.roomCode;
    if (!code) return;
    try {
      navigator.clipboard.writeText(code);
      showToast('コピーしました', 1200);
    } catch (e) {
      showToast(code, 2000);
    }
  },

  updateLobby(players) {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    document.getElementById('room-code-show').textContent = Net.roomCode || '------';

    // ホストのみ "開始" ボタン
    document.getElementById('btn-start-race').style.display = Net.isHost ? '' : 'none';

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

    // ホストでない場合の表示
    if (!Net.isHost) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = 'ホストの開始を待っています...';
      list.appendChild(note);
    }
  },

  updateItem(item) {
    const slot = document.getElementById('hud-item-slot');
    const box = slot.querySelector('.item-box');
    if (!item) {
      box.textContent = '?';
      box.classList.remove('has-item');
      box.style.background = 'linear-gradient(135deg, #FFEB3B, #FFC107)';
    } else {
      const d = ItemSystem.getDisplay(item);
      box.textContent = d.emoji;
      box.classList.add('has-item');
      box.style.background = `linear-gradient(135deg, ${d.color}, #fff)`;
    }
  },

  runCountdown(waitMs, onFinish) {
    const el = document.getElementById('countdown');
    let count = 3;
    const startCount = () => {
      el.textContent = String(count);
      el.classList.remove('show');
      // reflow
      void el.offsetWidth;
      el.classList.add('show');
      if (count === 0) {
        el.textContent = 'GO!';
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

  showResults(cars) {
    const overlay = document.getElementById('finish-overlay');
    const list = document.getElementById('finish-results');
    list.innerHTML = '';

    // ゴール済みは finishTime 順、未完走は totalProgress の高い順で後ろに
    const finished = cars.filter(c => c.finished).sort((a, b) => a.finishTime - b.finishTime);
    const unfinished = cars.filter(c => !c.finished).sort((a, b) => b.totalProgress - a.totalProgress);
    const ranking = [...finished, ...unfinished];

    ranking.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      if (c.isLocal) row.classList.add('you');
      const rank = document.createElement('div'); rank.className = 'result-rank'; rank.textContent = `${i+1}位`;
      const chip = document.createElement('div'); chip.className = 'player-chip'; chip.style.background = c.color;
      const name = document.createElement('div'); name.className = 'result-name'; name.textContent = c.name;
      const time = document.createElement('div'); time.className = 'result-time';
      time.textContent = c.finished ? Utils.formatTime(c.finishTime) : 'DNF';
      row.appendChild(rank); row.appendChild(chip); row.appendChild(name); row.appendChild(time);
      list.appendChild(row);
    });

    // 自分の順位タイトル
    const myRank = ranking.findIndex(c => c.isLocal) + 1;
    const title = document.getElementById('finish-title');
    if (myRank === 1) title.textContent = '🏆 優勝！';
    else if (myRank === 2) title.textContent = '🥈 2位';
    else if (myRank === 3) title.textContent = '🥉 3位';
    else title.textContent = `${myRank}位でゴール`;

    overlay.classList.add('show');
  },
};

window.GameUI = GameUI;
