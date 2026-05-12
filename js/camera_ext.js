// ============= カメラ拡張: 視点切替 (チェイス/コックピット/俯瞰/後方) =============
const CameraExt = {
  mode: 'chase', // 'chase' | 'cockpit' | 'top' | 'cinematic'
  installed: false,

  install() {
    if (this.installed) return;
    if (!window.Game) return;
    this.installed = true;
    // 保存された設定
    const saved = localStorage.getItem('gyrorush-camera-mode');
    if (saved && ['chase', 'cockpit', 'top', 'cinematic'].includes(saved)) this.mode = saved;

    // Game._updateCamera をラップ
    const origUpdate = Game._updateCamera.bind(Game);
    Game._updateCamera = (dt, snap = false) => {
      if (!Game.localCar) return origUpdate(dt, snap);
      // 後方視点(Lookback) は最優先で適用
      if (window.Input && Input.lookBack) {
        return this._chase(dt, snap, true);
      }
      if (this.mode === 'cockpit') return this._cockpit(dt, snap);
      if (this.mode === 'top')     return this._top(dt, snap);
      if (this.mode === 'cinematic') return this._cinematic(dt, snap);
      return origUpdate(dt, snap);
    };
  },

  setMode(m) {
    this.mode = m;
    localStorage.setItem('gyrorush-camera-mode', m);
    if (window.showToast) showToast(`📷 視点: ${this._label(m)}`, 900);
  },

  cycle() {
    const order = ['chase', 'cockpit', 'top', 'cinematic'];
    const idx = order.indexOf(this.mode);
    this.setMode(order[(idx + 1) % order.length]);
  },

  _label(m) {
    return { chase: 'チェイス', cockpit: 'コックピット', top: '俯瞰', cinematic: 'シネマ' }[m] || m;
  },

  _chase(dt, snap, lookBack) {
    const c = Game.localCar;
    const absSpeed = Math.abs(c.speed);
    const speedT = Utils.clamp(absSpeed / CarPhysics.MAX_SPEED, 0, 1);
    const back = Utils.lerp(4.2, 5.4, speedT) * (lookBack ? -1 : 1);
    const up = Utils.lerp(2.2, 1.8, speedT);
    const lookFwd = Utils.lerp(6, 14, speedT) * (lookBack ? -1 : 1);
    let backDir = c.speed < -1 ? -1 : 1;
    if (lookBack) backDir = -backDir;
    const tx = c.x - Math.sin(c.angle) * back * backDir;
    const tz = c.z - Math.cos(c.angle) * back * backDir;
    const ty = up + c.y * 0.7;
    if (snap) Game.camera.position.set(tx, ty, tz);
    else {
      Game.camera.position.x = Utils.lerp(Game.camera.position.x, tx, 0.3);
      Game.camera.position.y = Utils.lerp(Game.camera.position.y, ty, 0.25);
      Game.camera.position.z = Utils.lerp(Game.camera.position.z, tz, 0.3);
    }
    const lx = c.x + Math.sin(c.angle) * lookFwd * backDir;
    const lz = c.z + Math.cos(c.angle) * lookFwd * backDir;
    Game.camera.lookAt(lx, 0.9 + c.y * 0.5, lz);
    const baseFov = 52;
    let targetFov = baseFov + Math.min(14, absSpeed * 0.22);
    if (c.boostTimer > 0) targetFov = 78;
    else if (c.miniTurboTimer > 0) targetFov = 66;
    Game.camera.fov = Utils.lerp(Game.camera.fov, targetFov, 0.1);
    Game.camera.updateProjectionMatrix();
  },

  _cockpit(dt, snap) {
    const c = Game.localCar;
    const absSpeed = Math.abs(c.speed);
    // 車内: ボディの少し前方+上方
    const tx = c.x + Math.sin(c.angle) * 0.4;
    const tz = c.z + Math.cos(c.angle) * 0.4;
    const ty = 1.35 + c.y;
    if (snap) Game.camera.position.set(tx, ty, tz);
    else {
      Game.camera.position.x = Utils.lerp(Game.camera.position.x, tx, 0.55);
      Game.camera.position.y = Utils.lerp(Game.camera.position.y, ty, 0.5);
      Game.camera.position.z = Utils.lerp(Game.camera.position.z, tz, 0.55);
    }
    const lx = c.x + Math.sin(c.angle) * 20;
    const lz = c.z + Math.cos(c.angle) * 20;
    Game.camera.lookAt(lx, 1.0 + c.y * 0.5, lz);
    let targetFov = 65 + Math.min(15, absSpeed * 0.2);
    if (c.boostTimer > 0) targetFov = 88;
    Game.camera.fov = Utils.lerp(Game.camera.fov, targetFov, 0.15);
    Game.camera.updateProjectionMatrix();
  },

  _top(dt, snap) {
    const c = Game.localCar;
    const tx = c.x;
    const tz = c.z - 0.001;  // ほぼ真上、僅かに後ろ
    const ty = 22 + Math.abs(c.speed) * 0.05;
    if (snap) Game.camera.position.set(tx, ty, tz);
    else {
      Game.camera.position.x = Utils.lerp(Game.camera.position.x, tx, 0.25);
      Game.camera.position.y = Utils.lerp(Game.camera.position.y, ty, 0.18);
      Game.camera.position.z = Utils.lerp(Game.camera.position.z, tz, 0.25);
    }
    Game.camera.lookAt(c.x, 0, c.z);
    Game.camera.fov = Utils.lerp(Game.camera.fov, 60, 0.1);
    Game.camera.updateProjectionMatrix();
  },

  _cinematic(dt, snap) {
    // 進行方向の右側 or 左側にカメラ。リプレイ風
    const c = Game.localCar;
    const t = performance.now() * 0.0003;
    const side = Math.sin(t) > 0 ? 1 : -1;
    const offBack = 6 + Math.sin(t * 1.7) * 2;
    const offSide = 6 + Math.cos(t * 1.3) * 3;
    const tx = c.x - Math.sin(c.angle) * offBack + Math.cos(c.angle) * offSide * side;
    const tz = c.z - Math.cos(c.angle) * offBack - Math.sin(c.angle) * offSide * side;
    const ty = 3.0 + Math.sin(t * 2) * 0.6 + c.y * 0.5;
    if (snap) Game.camera.position.set(tx, ty, tz);
    else {
      Game.camera.position.x = Utils.lerp(Game.camera.position.x, tx, 0.08);
      Game.camera.position.y = Utils.lerp(Game.camera.position.y, ty, 0.08);
      Game.camera.position.z = Utils.lerp(Game.camera.position.z, tz, 0.08);
    }
    Game.camera.lookAt(c.x, 1.0, c.z);
    Game.camera.fov = Utils.lerp(Game.camera.fov, 38, 0.05);
    Game.camera.updateProjectionMatrix();
  },
};
window.CameraExt = CameraExt;
