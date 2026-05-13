// ============= エントリポイント =============
window.addEventListener('load', () => {
  // 音声初期化（タッチ/クリックで実コンテキスト起動）
  if (window.Audio2) Audio2.init();

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

  // ===== ネットワークイベント =====
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
  Net.on('startRace', async (seed, startTime, settings) => {
    // 設定同期
    if (settings) GameUI.applyRaceSettings(settings);
    const players = Array.from(Net.players.values()).map(p => ({
      id: p.id, name: p.name, color: p.color, carType: p.carType || 'standard', isAI: false,
    }));
    await GameUI._beginRace(players, Net.myId, 'multi', GameUI.raceOpts);
    Game.startCountdown(startTime);
  });
  Net.on('remoteState', (id, state) => {
    Game.applyRemoteState(id, state);
  });
  Net.on('action', (action) => {
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
    const idx = Game.cars.findIndex(c => c.id === id);
    if (idx >= 0) {
      const car = Game.cars[idx];
      if (car.mesh && car.mesh.parent) car.mesh.parent.remove(car.mesh);
      Game.cars.splice(idx, 1);
      showToast(`${car.name} が退出しました`);
    }
  });

  // チャット
  Net.on('chat', (msg) => {
    GameUI.appendChatMessage(msg);
  });

  // レース設定同期（クライアント側）
  Net.on('raceSettings', (s) => {
    GameUI.applyRaceSettings(s);
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
  if (params.get('course')) {
    const c = parseInt(params.get('course'), 10);
    if (!isNaN(c)) {
      GameUI.raceOpts.courseIdx = c;
      const el = document.getElementById('opt-course');
      if (el) el.value = String(c);
    }
  }
});
