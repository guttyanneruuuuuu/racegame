// ============= エントリポイント =============
window.addEventListener('load', () => {
  // UI初期化
  GameUI.init();
  // ゲーム初期化（Three.js含む）
  Game.init();
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
      id: p.id, name: p.name, color: p.color, isAI: false,
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
