// ============= レーストラック (3Dコース) =============
const Track = {
  controlPoints: [],
  pathPoints: [],
  pathLength: 0,
  cumLen: [],
  width: 22,        // 基本コース幅 (セクターごとに変化)
  widthArray: [],   // 各セグメントごとの幅 (動的に算出)
  wallHeight: 4.5,

  group: null,
  trackMesh: null,
  itemBoxes: [],
  boostPads: [],
  jumpPads: [],
  oilPads: [],       // ハザード: オイル
  shortcuts: [],     // 近道(芝ショートカット)
  coins: [],         // コイン (取得で速度ボーナス, 最大10枚)

  wallSegmentsOuter: [],
  wallSegmentsInner: [],

  _segDir: [],
  _segNorm: [],

  generate(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // 制御点（大幅拡張: 5つのテーマセクターを持つ大型サーキット）
    // セクター1: スタート→高速ストレート→大ロングコーナー (北東)
    // セクター2: テクニカルS字シケイン (東)
    // セクター3: 急角度ヘアピン×複数 (南東)
    // セクター4: 8の字風クロス領域 + 高速バンク (南西)
    // セクター5: 山岳ワインディング → スタジアム帰還 (北西)
    this.controlPoints = [
      // --- セクター1: スタート → 北東ロング ---
      { x:    0, z:  280 },
      { x:   50, z:  300 },
      { x:  120, z:  310 },
      { x:  200, z:  295 },
      { x:  280, z:  260 },
      { x:  340, z:  210 },
      { x:  380, z:  150 },
      { x:  410, z:   80 },
      { x:  420, z:    0 },
      // --- セクター2: 東テクニカルS字 ---
      { x:  400, z:  -70 },
      { x:  350, z:  -90 },
      { x:  300, z:  -60 },
      { x:  280, z:  -10 },
      { x:  300, z:   40 },
      { x:  280, z:   90 },
      { x:  230, z:  100 },
      { x:  190, z:   60 },
      { x:  210, z:   10 },
      { x:  200, z:  -50 },
      { x:  160, z: -100 },
      // --- セクター3: 南東ヘアピン地帯 ---
      { x:  120, z: -150 },
      { x:  170, z: -210 },
      { x:  230, z: -250 },
      { x:  280, z: -290 },
      { x:  240, z: -340 },
      { x:  160, z: -360 },
      { x:   80, z: -340 },
      { x:   20, z: -300 },
      { x:  -10, z: -240 },
      { x:  -50, z: -210 },
      // --- セクター4: 南西高速バンク + クロス橋下 ---
      { x: -120, z: -240 },
      { x: -200, z: -270 },
      { x: -280, z: -250 },
      { x: -340, z: -200 },
      { x: -380, z: -130 },
      { x: -400, z:  -50 },
      { x: -390, z:   30 },
      { x: -360, z:   90 },
      // --- セクター5: 北西ワインディング (修正版: 自己交差を解消し滑らかに) ---
      // 旧コースは折り返しが多すぎて Catmull-Rom スプラインが暴れ、
      // 隣接セグメント同士の壁が交差して "壁すり抜け" が発生していた。
      // ゴール直前は緩やかな大回りカーブで安定したライン取りに整える。
      { x: -300, z:  140 },
      { x: -260, z:  190 },
      { x: -210, z:  230 },
      { x: -150, z:  260 },
      { x:  -90, z:  270 },
      { x:  -40, z:  275 },
      { x:    0, z:  280 }, // セクター1の最初の点へスムーズ接続
    ];

    this.pathPoints = this._catmullRomLoop(this.controlPoints, 14);
    this._buildCumLen();
    this._buildSegmentDirs();
    this._buildWidthArray();

    this._buildGround(scene);
    this._buildSkybox(scene);
    this._buildTrack();
    this._buildCurbs();
    this._buildBarriers();
    this._buildStartLine();
    this._buildItemBoxes();
    this._buildBoostPads();
    this._buildJumpPads();
    this._buildShortcuts();   // 芝ショートカット (隅っこを攻める)
    this._buildCoins();       // コインをルートに点在
    this._buildDecorations();
    this._buildDirectionArrows();

    return this;
  },

  _catmullRomLoop(pts, segments) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );
        const z = 0.5 * (
          (2 * p1.z) +
          (-p0.z + p2.z) * t +
          (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
          (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
        );
        out.push({ x, z });
      }
    }
    return out;
  },

  _buildCumLen() {
    this.cumLen = [0];
    for (let i = 1; i < this.pathPoints.length; i++) {
      const a = this.pathPoints[i - 1];
      const b = this.pathPoints[i];
      this.cumLen.push(this.cumLen[i - 1] + Utils.dist2(a.x, a.z, b.x, b.z));
    }
    const last = this.pathPoints[this.pathPoints.length - 1];
    const first = this.pathPoints[0];
    this.pathLength = this.cumLen[this.cumLen.length - 1] + Utils.dist2(last.x, last.z, first.x, first.z);
  },

  _buildSegmentDirs() {
    const n = this.pathPoints.length;
    this._segDir = new Array(n);
    this._segNorm = new Array(n);
    for (let i = 0; i < n; i++) {
      const cur = this.pathPoints[i];
      const next = this.pathPoints[(i + 1) % n];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      this._segDir[i] = { ux, uz };
      this._segNorm[i] = { nx: -uz, nz: ux };
    }
  },

  // セクターごとに幅を変化させる: 高速直線は広く、テクニカル区間は狭く
  _buildWidthArray() {
    const n = this.pathPoints.length;
    this.widthArray = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / n;            // 0..1 でループ
      let w = this.width;
      // セクター1 (0..0.18) 高速ストレート: 広い
      if (t < 0.18)        w = 28;
      // セクター2 (0.18..0.30) テクニカルS字: 狭い
      else if (t < 0.30)   w = 18;
      // セクター3 (0.30..0.50) ヘアピン: 中
      else if (t < 0.50)   w = 22;
      // セクター4 (0.50..0.72) 高速バンク: 広い
      else if (t < 0.72)   w = 30;
      // セクター5 (0.72..1.0) ゴール直前カーブ: 広めに変更 (壁すり抜け対策)
      else                 w = 26;

      // 隣接セグメントとの曲率に応じて少し補正 (急カーブは僅かに広げる)
      const prev = (i - 1 + n) % n;
      const nxt  = (i + 1) % n;
      const a = this._segDir[prev], b = this._segDir[nxt];
      const dot = a.ux * b.ux + a.uz * b.uz;
      const curveSharp = 1 - Math.max(-1, Math.min(1, dot));
      w += curveSharp * 1.4;
      this.widthArray[i] = w;
    }
    // 平滑化 (急な幅変化を緩める)
    const smoothed = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -3; k <= 3; k++) s += this.widthArray[((i + k) % n + n) % n];
      smoothed[i] = s / 7;
    }
    this.widthArray = smoothed;
  },

  widthAt(i) {
    if (!this.widthArray || this.widthArray.length === 0) return this.width;
    return this.widthArray[((i % this.widthArray.length) + this.widthArray.length) % this.widthArray.length];
  },

  _buildTrack() {
    const verts = [];
    const uvs = [];
    const idx = [];
    const n = this.pathPoints.length;

    this.wallSegmentsOuter = [];
    this.wallSegmentsInner = [];

    for (let i = 0; i < n; i++) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);

      verts.push(cur.x + nx * w, 0.02, cur.z + nz * w);
      verts.push(cur.x - nx * w, 0.02, cur.z - nz * w);
      uvs.push(0, i * 0.4);
      uvs.push(1, i * 0.4);

      this.wallSegmentsOuter.push({ x: cur.x + nx * w, z: cur.z + nz * w });
      this.wallSegmentsInner.push({ x: cur.x - nx * w, z: cur.z - nz * w });
    }

    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = ((i + 1) % n) * 2;
      const d = ((i + 1) % n) * 2 + 1;
      idx.push(a, c, b);
      idx.push(b, c, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const tex = this._makeAsphaltTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.trackMesh = new THREE.Mesh(geo, mat);
    this.trackMesh.receiveShadow = true;
    this.group.add(this.trackMesh);

    this._buildCenterLine();
  },

  _makeAsphaltTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5a5a60';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const g = 70 + Math.random() * 40;
      ctx.fillStyle = `rgb(${g},${g},${g+2})`;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 0, 122, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    return tex;
  },

  _buildCenterLine() {
    const pts = [];
    const n = this.pathPoints.length;
    for (let i = 0; i < n; i++) {
      const p = this.pathPoints[i];
      pts.push(new THREE.Vector3(p.x, 0.05, p.z));
    }
    pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({ color: 0xffd54f, dashSize: 4, gapSize: 4, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    this.group.add(line);
  },

  _buildDirectionArrows() {
    const n = this.pathPoints.length;
    const arrowSpacing = 24; // 間隔を広げて軽量化
    const arrowScale = 3.5;
    const arrowHeight = 0.1;

    // すべての矢印を1つのジオメトリにマージ (描画コール削減)
    const verts = [];
    const idx = [];
    let vCount = 0;
    for (let i = 0; i < n; i += arrowSpacing) {
      const cur = this.pathPoints[i];
      const next = this.pathPoints[(i + 5) % n];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const angle = Math.atan2(dx, dz);

      // シンプルな三角形の矢印
      const x1 = 0, z1 = 1.2;
      const x2 = -0.8, z2 = -0.8;
      const x3 = 0.8, z3 = -0.8;

      const rot = (x, z) => {
        const s = Math.sin(angle), c = Math.cos(angle);
        return { rx: (x * c + z * s) * arrowScale, rz: (-x * s + z * c) * arrowScale };
      };

      const p1 = rot(x1, z1), p2 = rot(x2, z2), p3 = rot(x3, z3);
      verts.push(cur.x + p1.rx, arrowHeight, cur.z + p1.rz);
      verts.push(cur.x + p2.rx, arrowHeight, cur.z + p2.rz);
      verts.push(cur.x + p3.rx, arrowHeight, cur.z + p3.rz);
      idx.push(vCount, vCount + 1, vCount + 2);
      vCount += 3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);
  },

  _buildStartLine() {
    const n = this.pathPoints.length;
    const cur = this.pathPoints[0];
    const { nx, nz } = this._segNorm[0];
    const w = this.widthAt(0);
    const geo = new THREE.PlaneGeometry(w * 2, 2.5);
    const tex = this._makeStartTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cur.x, 0.08, cur.z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(nx, nz) + Math.PI / 2;
    this.group.add(mesh);
  },

  _makeStartTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#222';
    const sz = 32;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * sz, y * sz, sz, sz);
      }
    }
    return new THREE.CanvasTexture(c);
  },

  _buildCurbs() {
    const n = this.pathPoints.length;
    const curbWidth = 1.4;
    const curbHeight = 0.15;
    for (const side of [1, -1]) {
      const verts = [];
      const colors = [];
      const idx = [];
      for (let i = 0; i < n; i++) {
        const cur = this.pathPoints[i];
        const { nx, nz } = this._segNorm[i];
        const w = this.widthAt(i);
        const inner = side * w;
        const outer = side * (w + curbWidth);
        verts.push(cur.x + nx * inner, 0.05, cur.z + nz * inner);
        verts.push(cur.x + nx * outer, curbHeight, cur.z + nz * outer);
        const isRed = (Math.floor(i / 2) % 2 === 0);
        const r = isRed ? 0.85 : 0.95;
        const g = isRed ? 0.18 : 0.95;
        const b = isRed ? 0.18 : 0.95;
        colors.push(r, g, b, r, g, b);
      }
      for (let i = 0; i < n; i++) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = ((i + 1) % n) * 2;
        const d = ((i + 1) % n) * 2 + 1;
        idx.push(a, c, b);
        idx.push(b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.group.add(new THREE.Mesh(geo, mat));
    }
  },

  _buildBarriers() {
    const n = this.pathPoints.length;
    const bW = 0.6;
    const bH = this.wallHeight;
    for (const side of [1, -1]) {
      const verts = [];
      const uvs = [];
      const idx = [];
      for (let i = 0; i < n; i++) {
        const cur = this.pathPoints[i];
        const { nx, nz } = this._segNorm[i];
        const w = this.widthAt(i) + 1.3;
        const px = cur.x + nx * side * w;
        const pz = cur.z + nz * side * w;
        verts.push(px, 0, pz);
        verts.push(px, bH, pz);
        uvs.push(i * 0.2, 0);
        uvs.push(i * 0.2, 1);
      }
      for (let i = 0; i < n; i++) {
        const a = i * 2, b = i * 2 + 1, c = ((i + 1) % n) * 2, d = ((i + 1) % n) * 2 + 1;
        idx.push(a, c, b); idx.push(b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const tex = this._makeBarrierTexture();
      const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
      this.group.add(new THREE.Mesh(geo, mat));
    }
  },

  _makeBarrierTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ccc';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 60, 60);
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(0, 28, 64, 8);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },

  _buildGround(scene) {
    const geo = new THREE.PlaneGeometry(2500, 2500);
    const tex = this._makeGrassTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.1;
    mesh.receiveShadow = true;
    scene.add(mesh);
  },

  _makeGrassTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#43a047' : '#388e3c';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 4, 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    return tex;
  },

  _buildSkybox(scene) {
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.0015);
  },

  _buildItemBoxes() {
    this.itemBoxes = [];
    const n = this.pathPoints.length;
    const spacing = 75;
    for (let i = spacing / 2; i < n; i += spacing) {
      const p = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      const offsets = [-0.6, 0, 0.6];
      offsets.forEach(off => {
        const x = p.x + nx * off * w;
        const z = p.z + nz * off * w;
        const box = this._createItemBoxMesh(x, z);
        this.group.add(box);
        this.itemBoxes.push({ x, z, mesh: box, active: true, respawnTimer: 0 });
      });
    }
  },

  _createItemBoxMesh(x, z) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const mat = new THREE.MeshPhongMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.6,
      emissive: 0x00ffff, emissiveIntensity: 0.5
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.8;
    group.add(mesh);
    group.position.set(x, 0, z);
    return group;
  },

  _buildBoostPads() {
    this.boostPads = [];
    const n = this.pathPoints.length;
    const locations = [0.1, 0.25, 0.45, 0.6, 0.85];
    locations.forEach(t => {
      const i = Math.floor(n * t);
      const p = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      const side = Math.random() > 0.5 ? 0.5 : -0.5;
      const x = p.x + nx * side * w;
      const z = p.z + nz * side * w;
      const mesh = this._createBoostPadMesh(x, z, Math.atan2(nx, nz) + Math.PI / 2);
      this.group.add(mesh);
      this.boostPads.push({ x, z, radius: 4 });
    });
  },

  _createBoostPadMesh(x, z, angle) {
    const geo = new THREE.PlaneGeometry(6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3d00, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.12, z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle;
    return mesh;
  },

  _buildJumpPads() {
    this.jumpPads = [];
    const n = this.pathPoints.length;
    const locations = [0.15, 0.55, 0.92];
    locations.forEach(t => {
      const i = Math.floor(n * t);
      const p = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      const x = p.x;
      const z = p.z;
      const mesh = this._createJumpPadMesh(x, z, Math.atan2(nx, nz) + Math.PI / 2, w * 1.8);
      this.group.add(mesh);
      this.jumpPads.push({ x, z, radius: 6, width: w * 1.8 });
    });
  },

  _createJumpPadMesh(x, z, angle, w) {
    const group = new THREE.Group();
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.5, 6),
      new THREE.MeshLambertMaterial({ color: 0xffeb3b })
    );
    ramp.rotation.x = -0.2;
    group.add(ramp);
    group.position.set(x, 0.4, z);
    group.rotation.y = angle;
    return group;
  },

  _buildShortcuts() {
    this.shortcuts = [];
  },

  _buildCoins() {
    this.coins = [];
    const n = this.pathPoints.length;
    for (let i = 20; i < n; i += 40) {
      const p = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      const side = (Math.sin(i * 0.1) * 0.7);
      const x = p.x + nx * side * w;
      const z = p.z + nz * side * w;
      const mesh = this._createCoinMesh(x, z);
      this.group.add(mesh);
      this.coins.push({ x, z, mesh, active: true, respawnTimer: 0 });
    }
  },

  _createCoinMesh(x, z) {
    const geo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 12);
    const mat = new THREE.MeshPhongMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1.2, z);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  },

  _buildDecorations() {
    // 木や建物を配置
    for (let i = 0; i < 150; i++) {
      const x = (Math.random() - 0.5) * 1500;
      const z = (Math.random() - 0.5) * 1500;
      // コース上には置かない
      let onTrack = false;
      for (let j = 0; j < this.pathPoints.length; j += 10) {
        if (Utils.dist2(x, z, this.pathPoints[j].x, this.pathPoints[j].z) < 60) {
          onTrack = true; break;
        }
      }
      if (!onTrack) {
        const tree = this._createTreeMesh(x, z);
        this.group.add(tree);
      }
    }
  },

  _createTreeMesh(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 5), new THREE.MeshLambertMaterial({ color: 0x795548 }));
    trunk.position.y = 2.5;
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), new THREE.MeshLambertMaterial({ color: 0x2e7d32 }));
    leaves.position.y = 7;
    group.add(trunk, leaves);
    group.position.set(x, 0, z);
    return group;
  },

  update(dt, now) {
    this.itemBoxes.forEach(b => {
      if (!b.active) {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) {
          b.active = true;
          b.mesh.visible = true;
        }
      } else {
        b.mesh.rotation.y += dt * 1.5;
        b.mesh.position.y = Math.sin(now * 0.003) * 0.3;
      }
    });
    this.coins.forEach(c => {
      if (c.active) {
        c.mesh.rotation.z += dt * 2;
        c.mesh.position.y = 1.2 + Math.sin(now * 0.005) * 0.2;
      } else {
        c.respawnTimer -= dt;
        if (c.respawnTimer <= 0) {
          c.active = true;
          c.mesh.visible = true;
        }
      }
    });
  },

  getStartPositions(count) {
    const pos = [];
    const p0 = this.pathPoints[0];
    const { ux, uz } = this._segDir[0];
    const { nx, nz } = this._segNorm[0];
    const angle = Math.atan2(ux, uz);
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const side = (i % 2 === 0 ? 1 : -1);
      pos.push({
        x: p0.x - ux * (row * 8 + 5) + nx * side * 5,
        z: p0.z - uz * (row * 8 + 5) + nz * side * 5,
        angle
      });
    }
    return pos;
  },

  checkWallCollision(car) {
    const idx = car.lastProgressIdx;
    const n = this.pathPoints.length;
    const range = 15;
    for (let i = -range; i <= range; i++) {
      const curr = (idx + i + n) % n;
      const p = this.pathPoints[curr];
      const { nx, nz } = this._segNorm[curr];
      const w = this.widthAt(curr);
      const dx = car.x - p.x, dz = car.z - p.z;
      const dist = dx * nx + dz * nz;
      if (Math.abs(dist) > w - 1.2) {
        const side = Math.sign(dist);
        const over = Math.abs(dist) - (w - 1.2);
        car.x -= nx * side * over;
        car.z -= nz * side * over;
        return { nx: nx * -side, nz: nz * -side, strength: over };
      }
    }
    return null;
  }
};
