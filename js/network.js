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
  ROOM_PREFIX: 'gyrorush-v1-',
  MAX_PLAYERS: 6,

  on(event, fn) { (this.callbacks[event] ||= []).push(fn); },
  _emit(event, ...args) { (this.callbacks[event] || []).forEach(fn => fn(...args)); },
  _off(event, fn) {
    const list = this.callbacks[event];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  },

  _newPeer(id) {
    return new Peer(id, {
      // 公開された PeerJS のクラウドサーバを使用（GitHub Pages からも使える）
      debug: 1,
    });
  },

  createRoom(myInfo) {
    return new Promise((resolve, reject) => {
      this._resetSessionState();
      this.isHost = true;
      this.roomCode = Utils.genRoomCode();
      const peerId = this.ROOM_PREFIX + this.roomCode;
      this.peer = this._newPeer(peerId);
      this.myId = peerId;

      const timeout = setTimeout(() => {
        try { if (this.peer) this.peer.destroy(); } catch (_) {}
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
      this._resetSessionState();
      this.isHost = false;
      this.roomCode = code.toUpperCase();
      this.peer = this._newPeer();
      let onWelcome = null;
      const cleanup = () => {
        if (onWelcome) {
          this._off('welcome', onWelcome);
          onWelcome = null;
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        try { if (this.peer) this.peer.destroy(); } catch (_) {}
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
          cleanup();
          this._emit('disconnected', 'host left');
        });
        conn.on('error', (err) => {
          cleanup();
          clearTimeout(timeout);
          reject(err);
        });

        // helloに対するwelcomeを待つ（1回だけ）
        onWelcome = () => {
          cleanup();
          clearTimeout(timeout);
          resolve();
        };
        this.on('welcome', onWelcome);
      });

      this.peer.on('error', (err) => {
        cleanup();
        clearTimeout(timeout);
        console.error(err);
        reject(err);
      });
    });
  },

  leave() {
    this._resetSessionState();
  },

  // ====== ホスト処理 ======
  _onHostReceive(conn, data) {
    if (!data || !data.type) return;
    switch (data.type) {
      case 'hello': {
        const info = data.info;
        if (!info || !info.id) return;
        if (!this.players.has(info.id) && this.players.size >= this.MAX_PLAYERS) {
          try { conn.send({ type: 'reject', reason: 'full' }); } catch (_) {}
          return;
        }
        const alreadyJoined = this.players.has(info.id);
        this.players.set(info.id, { ...info, isHost: false });
        // welcome: 全員のプレイヤー情報を送る
        conn.send({ type: 'welcome', players: this._playerList(), yourId: info.id });
        if (!alreadyJoined) {
          // 既存メンバーに参加通知
          this._broadcast({ type: 'playerJoined', player: this.players.get(info.id) }, info.id);
          this._emit('playersChanged', this._playerList());
        }
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
        this._emit('startRace', data.seed, data.startTime, data.mapId);
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
    }
  },

  // ====== 公開API ======
  startRace(seed, mapId) {
    if (!this.isHost) return;
    const startTime = Date.now() + 3500;
    this._broadcast({ type: 'startRace', seed, startTime, mapId });
    this._emit('startRace', seed, startTime, mapId);
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

  _resetSessionState() {
    try { if (this.hostConn) this.hostConn.close(); } catch (_) {}
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
    this.peer = null;
    this.conns.clear();
    this.hostConn = null;
    this.players.clear();
    this.isHost = false;
    this.roomCode = null;
    this.myId = null;
  },
};
