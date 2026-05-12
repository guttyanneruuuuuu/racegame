// ============= ゲート向き補正 (Track.generate 前に実行) =============
// track.js 内のゲートはローカルX軸がゲートの横幅なので、rotation.y は
// 進行方向 angle そのものにする。angle - PI/2 だと道路と平行に立つ。
(function fixGateOrientationBeforeInit() {
  if (!window.Track || Track._gateOrientationFixed) return;
  Track._gateOrientationFixed = true;

  if (typeof Track._buildArch === 'function') {
    const originalBuildArch = Track._buildArch.bind(Track);
    Track._buildArch = function (x, z, angle, w) {
      originalBuildArch(x, z, angle, w);
      const grp = this.group && this.group.children[this.group.children.length - 1];
      if (grp && grp.isGroup) grp.rotation.y = angle;
    };
  }

  if (typeof Track._buildGates === 'function') {
    const originalBuildGates = Track._buildGates.bind(Track);
    Track._buildGates = function () {
      const before = this.group ? this.group.children.length : 0;
      originalBuildGates();
      if (!this.group || !this.pathPoints || !this._segDir) return;

      const positions = [0.14, 0.32, 0.50, 0.68, 0.85];
      for (let k = 0; k < positions.length; k++) {
        const gate = this.group.children[before + k];
        if (!gate || !gate.isGroup) continue;
        const i = Math.floor(positions[k] * this.pathPoints.length);
        const dir = this._segDir[i];
        if (dir) gate.rotation.y = Math.atan2(dir.ux, dir.uz);
      }
    };
  }
})();

// ============= エントリポイント =============
window.addEventListener('load', () => {
  // UI初期化
  GameUI.init();
  // ゲーム初期化（Three.js含む）
  Game.init();

  // ===== 拡張モジュールの導入 (既存を破壊せず monkey-patch) =====
  try {
    if (typeof Awards !== 'undefined' && Awards.init) Awards.init();
    if (typeof ItemExt !== 'undefined' && ItemExt.install) ItemExt.install();
    if (typeof AIExt !== 'undefined' && AIExt.install) AIExt.install();
    if (typeof CameraExt !== 'undefined' && CameraExt.install) CameraExt.install();
    if (typeof NetExt !== 'undefined' && NetExt.install) NetExt.install();
    if (typeof GameExt !== 'undefined' && GameExt.install) GameExt.install();
    if (typeof UIExt !== 'undefined' && UIExt.install) UIExt.install();
    if (typeof ItemExt !== 'undefined' && ItemExt.hookGameUseItem) ItemExt.hookGameUseItem();

    // PartyExt は後付けファイルとして読み込み、6人プレイ向けの
    // パーティゲート/追加アイテム/エモート/ジャイロ補助HUDを差し込む。
    const installPartyExt = () => {
      if (typeof PartyExt !== 'undefined' && PartyExt.install) PartyExt.install();
    };
    if (typeof PartyExt !== 'undefined') {
      installPartyExt();
    } else {
      const partyScript = document.createElement('script');
      partyScript.src = 'js/party_ext.js';
      partyScript.onload = installPartyExt;
      partyScript.onerror = () => console.warn('party_ext.js load failed');
      document.body.appendChild(partyScript);
    }

    // BGM は SFX の AudioContext が初期化されるのを待つ
    const initBgm = () => {
      if (typeof BGM !== 'undefined' && BGM.init && SFX && SFX.ctx) {
        BGM.init(SFX.ctx);
        BGM.play('menu');
      } else {
        setTimeout(initBgm, 400);
      }
    };
    setTimeout(initBgm, 800);
  } catch (e) { console.warn('extension install error', e); }

  // メインループ開始
  Game.loop();

  // ネットワークイベント
  Net.on('playersChanged', (players) => {
    GameUI.updateLobby(players);
  });
  Net.on('welcome', (myId) => {
    GameUI.updateLobby(Array.from(Net.players.values()));
  });
  Net.on('rejected', (reason) => {
    showToast(reason === 'full' ? '部屋が満員です' : '入室拒否されました', 2500);
    Net.leave();
    GameUI.showScreen('screen-title');
  });
  Net.on('disconnected', () => {
    showToast('ホストとの接続が切れました', 2500);
    Net.leave();
    GameUI.showScreen('screen-title');
  });
  Net.on('startRace', async (seed, startTime) => {
    const players = Array.from(Net.players.values()).map(p => ({
      id: p.id, name: p.name, color: p.color, carType: p.carType, isAI: false,
    }));
    await GameUI._beginRace(players, Net.myId, 'multi');
    // ネットワーク同期カウントダウン
    Game.startCountdown(startTime);
  });
  Net.on('remoteState', (id, state) => {
    Game.applyRemoteState(id, state);
  });
  Net.on('action', (action) => {
    // 自分が発したアクションは除外（既に処理済み）
    if (action.by === Net.myId) return;
    Game.applyRemoteAction(action);
  });
  Net.on('finished', (id, time) => {
    const car = Game.cars.find(c => c.id === id);
    if (car && !car.finished) {
      car.finished = true;
      car.finishTime = time;
    }
    Game.forceFinish();
  });
  // チャット受信 (NetExt) → UI に表示
  if (typeof NetExt !== 'undefined' && NetExt.onChat) {
    NetExt.onChat((msg) => {
      if (msg.from === Net.myId) return; // 自分のメッセージは既に表示済み
      if (typeof UIExt !== 'undefined' && UIExt.appendChat) {
        if (msg.sys) UIExt.appendChat('system', msg.text, false);
        else UIExt.appendChat(msg.name || 'guest', msg.text, false);
      }
    });
  }
  Net.on('playerLeft', (id) => {
    // ゲーム中ならその車を消す
    const idx = Game.cars.findIndex(c => c.id === id);
    if (idx >= 0) {
      const car = Game.cars[idx];
      if (car.mesh && car.mesh.parent) car.mesh.parent.remove(car.mesh);
      Game.cars.splice(idx, 1);
      showToast(`${car.name} が退出しました`);
    }
  });

  // 初期画面
  GameUI.showScreen('screen-title');

  // URLパラメータで自動テスト
  const params = new URLSearchParams(location.search);
  if (params.get('autosolo') === '1') {
    setTimeout(() => {
      document.getElementById('btn-solo').click();
    }, 500);
  }
});
