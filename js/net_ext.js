// ============= ネットワーク拡張: チャット & 再接続支援 =============
// 既存の Net モジュールを書き換えず、メッセージ種類を増設するための薄いラッパー。
// chat / ping / reconnectReq などの拡張メッセージを扱う。
const NetExt = {
  installed: false,
  chatCallbacks: [],
  pingCallbacks: [],
  rttMap: new Map(),       // peerId -> 直近RTT(ms)
  lastSeen: new Map(),     // peerId -> last data timestamp
  reconnectAttempts: 0,

  install() {
    if (this.installed || typeof Net === 'undefined') return;
    this.installed = true;

    // --- ホスト受信フックを追加 ---
    const origHostRecv = Net._onHostReceive.bind(Net);
    Net._onHostReceive = (conn, data) => {
      // 拡張メッセージのみ処理
      if (data && data.type) {
        this.lastSeen.set(conn.peer, Date.now());
        if (this._handleExtMessage(data, conn.peer, true, conn)) return;
      }
      return origHostRecv(conn, data);
    };

    // --- クライアント受信フック ---
    const origCliRecv = Net._onClientReceive.bind(Net);
    Net._onClientReceive = (data) => {
      if (data && data.type) {
        this.lastSeen.set('host', Date.now());
        if (this._handleExtMessage(data, data.from || 'host', false)) return;
      }
      return origCliRecv(data);
    };

    // --- 公開API: sendChat ---
    Net.sendChat = (text) => {
      const name = (Net.players.get(Net.myId) || {}).name || 'me';
      const msg = { type: 'chat', from: Net.myId, name, text: String(text).slice(0, 120), t: Date.now() };
      if (Net.isHost) {
        Net._broadcast(msg, null);
        this._emitChat(msg);
      } else if (Net.hostConn && Net.hostConn.open) {
        try { Net.hostConn.send(msg); } catch (_) {}
        // 自分にも反映
        this._emitChat(msg);
      }
    };

    // --- 公開API: sendPing ---
    Net.sendPing = () => {
      const t = Date.now();
      const msg = { type: 'ping', from: Net.myId, t };
      if (Net.isHost) {
        Net._broadcast(msg, null);
      } else if (Net.hostConn && Net.hostConn.open) {
        try { Net.hostConn.send(msg); } catch (_) {}
      }
    };

    // 定期ヘルスチェック(10秒毎)
    setInterval(() => this._healthCheck(), 10000);
  },

  _handleExtMessage(data, fromId, isHost, conn) {
    switch (data.type) {
      case 'chat': {
        if (isHost) {
          // ホストはチャットを全員へ中継 (送信元以外)
          Net._broadcast(data, fromId);
        }
        this._emitChat(data);
        return true;
      }
      case 'ping': {
        // 相手にpongを返す
        const pong = { type: 'pong', from: Net.myId, t: data.t, echoFrom: data.from };
        if (isHost && conn) {
          try { conn.send(pong); } catch (_) {}
        } else if (Net.hostConn && Net.hostConn.open) {
          try { Net.hostConn.send(pong); } catch (_) {}
        }
        return true;
      }
      case 'pong': {
        const rtt = Date.now() - data.t;
        this.rttMap.set(data.from, rtt);
        this.pingCallbacks.forEach(fn => fn(data.from, rtt));
        return true;
      }
      case 'sysmsg': {
        // システムメッセージ(誰かが切断した等)
        this._emitChat({ from: 'system', name: 'system', text: data.text, t: Date.now(), sys: true });
        if (isHost) Net._broadcast(data, fromId);
        return true;
      }
    }
    return false;
  },

  _emitChat(msg) {
    this.chatCallbacks.forEach(fn => {
      try { fn(msg); } catch (_) {}
    });
  },

  onChat(fn) { this.chatCallbacks.push(fn); },
  onPing(fn) { this.pingCallbacks.push(fn); },

  getRTT(id) { return this.rttMap.get(id) || 0; },

  _healthCheck() {
    if (!Net.peer || !Net.players.size) return;
    Net.sendPing && Net.sendPing();

    // クライアント: ホストとの最終通信から15秒経ったら自動再接続を試みる
    if (!Net.isHost && Net.hostConn) {
      const last = this.lastSeen.get('host') || 0;
      if (last && Date.now() - last > 15000 && this.reconnectAttempts < 3) {
        this.reconnectAttempts++;
        this._sysToast(`通信断? 再接続を試行中 (${this.reconnectAttempts}/3)…`);
        try {
          const hostId = Net.ROOM_PREFIX + Net.roomCode;
          const conn = Net.peer.connect(hostId, { reliable: true });
          conn.on('open', () => {
            Net.hostConn = conn;
            this.reconnectAttempts = 0;
            const me = Net.players.get(Net.myId);
            if (me) conn.send({ type: 'hello', info: me });
            this._sysToast('再接続成功');
          });
          conn.on('data', (d) => Net._onClientReceive(d));
        } catch (e) { /* noop */ }
      }
    }
  },

  _sysToast(text) {
    if (typeof showToast === 'function') showToast(text);
    this._emitChat({ from: 'system', name: 'system', text, t: Date.now(), sys: true });
  },
};
