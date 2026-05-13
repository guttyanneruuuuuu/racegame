// ============= ネットワーク（PeerJS による P2P マルチプレイヤー） =============
// 部屋を作った人がホスト。クライアントはホストにのみ繋ぎ、ホストが全員に中継する。
const Net = {
  peer: null,
  isHost: false,
  myId: null,
  roomCode: null,         // ホストはこれが自分のPeerID(プレフィックス無し)
  conns: new Map(),       // ホスト側: clientId -> DataConnection
  hostConn: null,         // クライアント側: ホストへの接続
  players: new Map(),     // すべてのプレイヤー情報: id -> {id, name, color, ...}
  callbacks: {},
  ROOM_PREFIX: 'gyrorush-v2-',
  MAX_PLAYERS: 6,

  on(event, fn) { (this.callbacks[event] ||= []).push(fn); },
  _emit(event, ...args) { (this.callbacks[event] || []).forEach(fn => fn(...args)); },

  _newPeer(id) {
    return new Peer(id, {
      // 公開された PeerJS のクラウドサーバを使用（GitHub Pages からも使える）
      debug: 1,
    });
  },

  createRoom(myInfo) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.roomCode = Utils.genRoomCode();
      const peerId = this.ROOM_PREFIX + this.roomCode;
      this.peer = this._newPeer(peerId);
      this.myId = peerId;

      const timeout = setTimeout(() => {
        reject(new Error('接続タイムアウト'));
      }, 15000);

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        this.players.set(id, { ...myInfo, id, isHost: true });
        this._emit('roomReady', this.roomCode);
        this._emit('playersChanged', this._playerList());
        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        if (this.players.size >= this.MAX_PLAYERS) {
          conn.on('open', () => {
            conn.send({ type: 'reject', reason: 'full' });
            setTimeout(() => conn.close(), 300);
          });
          return;
        }
        this.conns.set(conn.peer, conn);
        conn.on('open', () => {
          // peer接続オープン後にイベント設定
        });
        conn.on('data', (data) => this._onHostReceive(conn, data));
        conn.on('close', () => this._onClientLeave(conn.peer));
        conn.on('error', () => this._onClientLeave(conn.peer));
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        console.error('peer error', err);
        if (err.type === 'unavailable-id') {
          // 衝突: 再試行
          this.peer.destroy();
          this.createRoom(myInfo).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  },

  joinRoom(code, myInfo) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.roomCode = code.toUpperCase();
      this.peer = this._newPeer();

      const timeout = setTimeout(() => {
        reject(new Error('部屋に接続できませんでした'));
      }, 15000);

      this.peer.on('open', (myId) => {
        this.myId = myId;
        const hostId = this.ROOM_PREFIX + this.roomCode;
        const conn = this.peer.connect(hostId, { reliable: true });
        this.hostConn = conn;

        conn.on('open', () => {
          conn.send({ type: 'hello', info: { ...myInfo, id: myId } });
        });
        conn.on('data', (data) => this._onClientReceive(data));
        conn.on('close', () => {
          this._emit('disconnected', 'host left');
        });
        conn.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        // helloに対するwelcomeを待つ
        this.on('welcome', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        console.error(err);
        reject(err);
      });
    });
  },

  leave() {
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
    this.peer = null;
    this.conns.clear();
    this.hostConn = null;
    this.players.clear();
    this.isHost = false;
    this.roomCode = null;
    this.myId = null;
  },

  // ====== ホスト処理 ======
  _onHostReceive(conn, data) {
    if (!data || !data.type) return;
    switch (data.type) {
      case 'hello': {
        const info = data.info;
        if (!info || !info.id) return;
        this.players.set(info.id, { ...info, isHost: false });
        // welcome: 全員のプレイヤー情報を送る
        conn.send({ type: 'welcome', players: this._playerList(), yourId: info.id });
        // 既存メンバーに参加通知
        this._broadcast({ type: 'playerJoined', player: this.players.get(info.id) }, info.id);
        this._emit('playersChanged', this._playerList());
        break;
      }
      case 'state': {
        // クライアントの状態をホストが受信 → 全員(送信者以外)にブロードキャスト
        this._broadcast({ type: 'state', id: conn.peer, state: data.state }, conn.peer);
        this._emit('remoteState', conn.peer, data.state);
        break;
      }
      case 'action': {
        // アイテム使用などのアクション
        const act = { ...data.action, by: conn.peer };
        this._broadcast({ type: 'action', action: act }, null);
        this._emit('action', act);
        break;
      }
      case 'finished': {
        this._broadcast({ type: 'finished', id: conn.peer, time: data.time }, null);
        this._emit('finished', conn.peer, data.time);
        break;
      }
      case 'chat': {
        // チャット/スタンプ: ホストが受け取って全員にブロードキャスト
        const msg = { type: 'chat', from: conn.peer, text: data.text, stamp: data.stamp };
        this._broadcast(msg, null);
        this._emit('chat', { from: conn.peer, text: data.text, stamp: data.stamp });
        break;
      }
      case 'raceSettings': {
        // クライアントは通常変更しないが、念のためホストにのみ反映 (普通はホスト発信)
        this._emit('raceSettings', data.settings);
        break;
      }
      case 'updateInfo': {
        // 車種・色・名前変更などの更新
        const cur = this.players.get(conn.peer);
        if (cur) {
          this.players.set(conn.peer, { ...cur, ...data.info });
          this._broadcast({ type: 'playerUpdated', id: conn.peer, info: data.info }, null);
          this._emit('playersChanged', this._playerList());
        }
        break;
      }
    }
  },
  _onClientLeave(id) {
    if (this.conns.has(id)) {
      this.conns.delete(id);
    }
    if (this.players.has(id)) {
      this.players.delete(id);
      this._broadcast({ type: 'playerLeft', id });
      this._emit('playersChanged', this._playerList());
      this._emit('playerLeft', id);
    }
  },
  _broadcast(msg, exceptId = null) {
    for (const [id, c] of this.conns) {
      if (id === exceptId) continue;
      try { c.send(msg); } catch (e) {}
    }
  },

  // ====== クライアント処理 ======
  _onClientReceive(data) {
    if (!data || !data.type) return;
    switch (data.type) {
      case 'reject': {
        this._emit('rejected', data.reason);
        break;
      }
      case 'welcome': {
        this.players.clear();
        for (const p of data.players) this.players.set(p.id, p);
        this._emit('welcome', data.yourId);
        this._emit('playersChanged', this._playerList());
        break;
      }
      case 'playerJoined': {
        this.players.set(data.player.id, data.player);
        this._emit('playersChanged', this._playerList());
        break;
      }
      case 'playerLeft': {
        this.players.delete(data.id);
        this._emit('playersChanged', this._playerList());
        this._emit('playerLeft', data.id);
        break;
      }
      case 'startRace': {
        this._emit('startRace', data.seed, data.startTime, data.settings);
        break;
      }
      case 'state': {
        this._emit('remoteState', data.id, data.state);
        break;
      }
      case 'action': {
        this._emit('action', data.action);
        break;
      }
      case 'finished': {
        this._emit('finished', data.id, data.time);
        break;
      }
      case 'chat': {
        this._emit('chat', { from: data.from, text: data.text, stamp: data.stamp });
        break;
      }
      case 'raceSettings': {
        this._emit('raceSettings', data.settings);
        break;
      }
      case 'playerUpdated': {
        const cur = this.players.get(data.id);
        if (cur) this.players.set(data.id, { ...cur, ...data.info });
        this._emit('playersChanged', this._playerList());
        break;
      }
    }
  },

  // ====== 公開API ======
  startRace(seed, settings) {
    if (!this.isHost) return;
    const startTime = Date.now() + 3500;
    this._broadcast({ type: 'startRace', seed, startTime, settings });
    this._emit('startRace', seed, startTime, settings);
  },

  sendChat(text, stamp) {
    if (this.isHost) {
      const msg = { type: 'chat', from: this.myId, text, stamp };
      this._broadcast(msg, null);
      this._emit('chat', { from: this.myId, text, stamp });
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send({ type: 'chat', text, stamp }); } catch (_) {}
      // 自分のチャットは即時ローカル表示
      this._emit('chat', { from: this.myId, text, stamp });
    }
  },

  sendRaceSettings(settings) {
    if (!this.isHost) return;
    this._broadcast({ type: 'raceSettings', settings }, null);
    this._emit('raceSettings', settings);
  },

  updateMyInfo(info) {
    // 名前・色・車種の変更などを反映
    if (this.isHost) {
      const cur = this.players.get(this.myId);
      if (cur) {
        this.players.set(this.myId, { ...cur, ...info });
        this._broadcast({ type: 'playerUpdated', id: this.myId, info }, null);
        this._emit('playersChanged', this._playerList());
      }
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send({ type: 'updateInfo', info }); } catch (_) {}
    }
  },

  sendState(state) {
    const msg = { type: 'state', state };
    if (this.isHost) {
      this._broadcast({ type: 'state', id: this.myId, state }, null);
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); } catch (_) {}
    }
  },

  sendAction(action) {
    if (this.isHost) {
      const act = { ...action, by: this.myId };
      this._broadcast({ type: 'action', action: act }, null);
      this._emit('action', act);
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send({ type: 'action', action }); } catch (_) {}
    }
  },

  sendFinished(time) {
    if (this.isHost) {
      this._broadcast({ type: 'finished', id: this.myId, time }, null);
      this._emit('finished', this.myId, time);
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send({ type: 'finished', time }); } catch (_) {}
    }
  },

  _playerList() {
    return Array.from(this.players.values());
  },
};
