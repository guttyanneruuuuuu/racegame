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
      // --- セクター5: 北西からゴールへの大回りカーブ (再修正: 完全に滑らか) ---
      // 過去のコースは折り返しが多く Catmull-Rom が暴れ、隣接セグメント同士の
      // 壁が交差して "壁すり抜け" が発生していた。
      // 制御点を等間隔・低曲率に絞り、ゴール直前は緩やかな大回りで接続。
      { x: -320, z:  150 },
      { x: -280, z:  210 },
      { x: -220, z:  250 },
      { x: -150, z:  275 },
      { x:  -75, z:  285 },
      // セクター1の最初の点 { x: 0, z: 280 } へスムーズに戻る (重複点は省く)
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

      const dx = next.x - cur.x;
      const dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz, pz = ux;

      verts.push(
        cur.x + ux * arrowScale, arrowHeight, cur.z + uz * arrowScale,
        cur.x - px * (arrowScale * 0.4) - ux * (arrowScale * 0.3), arrowHeight, cur.z - pz * (arrowScale * 0.4) - uz * (arrowScale * 0.3),
        cur.x + px * (arrowScale * 0.4) - ux * (arrowScale * 0.3), arrowHeight, cur.z + pz * (arrowScale * 0.4) - uz * (arrowScale * 0.3),
      );
      idx.push(vCount, vCount + 1, vCount + 2);
      vCount += 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);
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
        const bb = i * 2 + 1;
        const c = ((i + 1) % n) * 2;
        const d = ((i + 1) % n) * 2 + 1;
        if (side === 1) {
          idx.push(a, c, bb, bb, c, d);
        } else {
          idx.push(a, bb, c, bb, d, c);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const m = new THREE.Mesh(geo, mat);
      this.group.add(m);
    }
  },

  _buildBarriers() {
    const n = this.pathPoints.length;
    const curbWidth = 1.4;
    const wallThickness = 0.6;
    const wallHeight = this.wallHeight;

    for (const side of [1, -1]) {
      const verts = [];
      const colors = [];
      const idx = [];

      for (let i = 0; i < n; i++) {
        const cur = this.pathPoints[i];
        const { nx, nz } = this._segNorm[i];
        const w = this.widthAt(i);
        const wallOff1 = side * (w + curbWidth);
        const wallOff2 = side * (w + curbWidth + wallThickness);
        const xi1 = cur.x + nx * wallOff1, zi1 = cur.z + nz * wallOff1;
        const xi2 = cur.x + nx * wallOff2, zi2 = cur.z + nz * wallOff2;
        verts.push(xi1, 0.15, zi1);
        verts.push(xi2, 0.15, zi2);
        verts.push(xi2, wallHeight, zi2);
        verts.push(xi1, wallHeight, zi1);

        const c1 = (Math.floor(i / 3) % 2 === 0) ? [0.92, 0.92, 0.92] : [0.85, 0.15, 0.15];
        for (let k = 0; k < 4; k++) colors.push(c1[0], c1[1], c1[2]);
      }
      for (let i = 0; i < n; i++) {
        const a = i * 4;
        const b = ((i + 1) % n) * 4;
        idx.push(a + 0, b + 0, a + 3, a + 3, b + 0, b + 3);
        idx.push(a + 3, b + 3, a + 2, a + 2, b + 3, b + 2);
        idx.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const m = new THREE.Mesh(geo, mat);
      this.group.add(m);
    }

    const topLineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const idx2 = i % n;
        const cur = this.pathPoints[idx2];
        const { nx, nz } = this._segNorm[idx2];
        const off = side * (this.widthAt(idx2) + 1.4 + 0.6);
        pts.push(new THREE.Vector3(cur.x + nx * off, wallHeight + 0.05, cur.z + nz * off));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(geo, topLineMat));
    }

    this.wallSegmentsOuter = [];
    this.wallSegmentsInner = [];
    for (let i = 0; i < n; i++) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const off = this.widthAt(i);
      this.wallSegmentsOuter.push({ x: cur.x + nx * off, z: cur.z + nz * off });
      this.wallSegmentsInner.push({ x: cur.x - nx * off, z: cur.z - nz * off });
    }
  },

  _buildStartLine() {
    const p = this.pathPoints[0];
    const p1 = this.pathPoints[1];
    const dx = p1.x - p.x, dz = p1.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#000' : '#fff';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.width * 0.6, 0.5);

    const startW = this.widthAt(0);
    const geo = new THREE.PlaneGeometry(startW * 2, 3.5);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.06, p.z);
    const angle = Math.atan2(dx, dz);
    m.rotation.z = angle;
    this.group.add(m);

    this._buildArch(p.x, p.z, angle, startW);

    this.startAngle = angle;
    this.startX = p.x;
    this.startZ = p.z;
    this.startDirX = dx / len;
    this.startDirZ = dz / len;
    this.startNX = nx;
    this.startNZ = nz;
  },

  _buildArch(x, z, angle, w) {
    const archW = w || this.width;
    const archMat = new THREE.MeshLambertMaterial({ color: 0xe53935 });
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7, 10), archMat);
    const post2 = post1.clone();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(archW * 2.4, 0.8, 0.8), archMat);

    const grp = new THREE.Group();
    post1.position.set(-archW - 1, 3.5, 0);
    post2.position.set(archW + 1, 3.5, 0);
    beam.position.set(0, 7, 0);
    grp.add(post1, post2, beam);

    const c = document.createElement('canvas');
    c.width = 1024; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#FFF176');
    grad.addColorStop(1, '#FFB300');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#c62828';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏁  GRAND CIRCUIT  🏁', 512, 64);
    const bannerTex = new THREE.CanvasTexture(c);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(archW * 2.1, 1.6, 0.3),
      new THREE.MeshBasicMaterial({ map: bannerTex })
    );
    banner.position.set(0, 8.1, 0);
    grp.add(banner);

    grp.position.set(x, 0, z);
    grp.rotation.y = angle - Math.PI / 2;
    this.group.add(grp);
  },

  _buildGround(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const base = ctx.createLinearGradient(0, 0, 256, 256);
    base.addColorStop(0, '#7cc26b');
    base.addColorStop(1, '#5fa84b');
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const g = 80 + Math.random() * 100;
      ctx.fillStyle = `rgba(${Math.floor(g*0.4)},${g},${Math.floor(g*0.45)},${0.4 + Math.random() * 0.5})`;
      ctx.fillRect(x, y, 2, 3);
    }
    const grassTex = new THREE.CanvasTexture(c);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(80, 80);

    // 大型化: 2400x2400m に拡大
    const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: grassTex });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.05;
    m.receiveShadow = true;
    scene.add(m);

    // 遠景の山々 (4方向)
    this._buildMountains(scene);
    // 砂エリア (色違いの地面区画)
    this._buildSandPatches(scene);
  },

  _buildMountains(scene) {
    const mountainMat = new THREE.MeshLambertMaterial({ color: 0x6b8e7f });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const positions = [
      { x:    0, z:  900, s: 1.0 },
      { x:  900, z:    0, s: 1.2 },
      { x:    0, z: -900, s: 1.1 },
      { x: -900, z:    0, s: 1.0 },
      { x:  650, z:  650, s: 0.8 },
      { x: -650, z: -650, s: 0.9 },
      { x: -700, z:  700, s: 0.85 },
      { x:  700, z: -700, s: 0.95 },
    ];
    for (const p of positions) {
      const grp = new THREE.Group();
      const peaks = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < peaks; k++) {
        const h = (60 + Math.random() * 80) * p.s;
        const r = (50 + Math.random() * 50) * p.s;
        const mountain = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), mountainMat);
        mountain.position.set((Math.random() - 0.5) * 200, h / 2 - 5, (Math.random() - 0.5) * 200);
        grp.add(mountain);
        if (h > 100) {
          const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, h * 0.3, 8), snowMat);
          snow.position.set(mountain.position.x, mountain.position.y + h * 0.4, mountain.position.z);
          grp.add(snow);
        }
      }
      grp.position.set(p.x, 0, p.z);
      scene.add(grp);
    }
  },

  _buildSandPatches(scene) {
    // 視覚的に多彩にするための砂・畑風パッチ
    const sandTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#e6d5a3'; ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 600; i++) {
        ctx.fillStyle = `rgba(${180 + Math.random()*40},${160 + Math.random()*30},${110 + Math.random()*30},${Math.random() * 0.6})`;
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(6, 6);
      return t;
    })();
    const patches = [
      { x:  500, z:  300, w: 200, h: 150 },
      { x: -500, z: -350, w: 250, h: 180 },
      { x:  200, z: -500, w: 180, h: 220 },
      { x: -300, z:  500, w: 200, h: 160 },
    ];
    const mat = new THREE.MeshLambertMaterial({ map: sandTex });
    for (const p of patches) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, -0.02, p.z);
      scene.add(m);
    }
  },

  _buildSkybox(scene) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 512;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#4fc3f7');
    grad.addColorStop(0.55, '#90caf9');
    grad.addColorStop(0.85, '#ffe0b2');
    grad.addColorStop(1, '#ffcc80');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 512);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 12; i++) {
      const y = 30 + Math.random() * 180;
      const x = Math.random() * 64;
      const r = 6 + Math.random() * 10;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.6, y + 2, r * 0.7, 0, Math.PI * 2);
      ctx.arc(x - r * 0.5, y + 2, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    const skyGeo = new THREE.SphereGeometry(1100, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    scene.background = new THREE.Color(0x90caf9);
    // フォグを少し近くに (描画負荷削減)
    scene.fog = new THREE.Fog(0xcfe6ff, 350, 680);
  },

  _buildItemBoxes() {
    const n = this.pathPoints.length;
    // 多くの周回距離になるためアイテムボックスを増やす (8→14グループ)
    const step = Math.max(4, Math.floor(n / 14));

    const colors = ['#FF5252', '#FFD740', '#69F0AE', '#40C4FF', '#E040FB', '#FFAB40'];
    const makeFace = (color) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 12, 64, 64, 80);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, color);
      g.addColorStop(1, color);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, 108, 108);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 80px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 5;
      ctx.strokeText('?', 64, 68);
      ctx.fillText('?', 64, 68);
      const tex = new THREE.CanvasTexture(c);
      return new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(color).multiplyScalar(0.3), emissiveIntensity: 0.5 });
    };
    const mats = colors.map(makeFace);
    const boxGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);  // 当たり判定取りやすく少し大きく

    for (let i = 4; i < n; i += step) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);

      const offsets = [-w * 0.55, 0, w * 0.55];
      offsets.forEach(off => {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const m = new THREE.Mesh(boxGeo, mats.map(mt => mt.clone()));
        m.position.set(px, 1.3, pz);
        m.castShadow = true;
        this.group.add(m);

        const ringGeo = new THREE.RingGeometry(1.4, 1.85, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xFFEB3B, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px, 0.05, pz);
        this.group.add(ring);

        // 光柱 (取得しやすさ向上)
        const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, 4, 8, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0xFFEB3B, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(px, 2.0, pz);
        this.group.add(beam);

        this.itemBoxes.push({ mesh: m, ring, beam, x: px, z: pz, active: true, respawn: 0 });
      });
    }
  },

  _buildBoostPads() {
    const n = this.pathPoints.length;
    // 多くの直線部分にブーストパッドを配置 (7→13箇所)
    const positions = [0.04, 0.10, 0.16, 0.24, 0.36, 0.44, 0.54, 0.60, 0.66, 0.74, 0.82, 0.90, 0.96];
    const padTex = this._makeBoostPadTexture();
    for (const t of positions) {
      const idx = Math.floor(t * n);
      const cur = this.pathPoints[idx];
      const next = this.pathPoints[(idx + 1) % n];
      const { nx, nz } = this._segNorm[idx];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const dirX = dx / len, dirZ = dz / len;
      const w = this.widthAt(idx);

      for (const off of [-w * 0.35, w * 0.35]) {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const geo = new THREE.PlaneGeometry(6, 8);
        const mat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(px, 0.08, pz);
        mesh.rotation.z = Math.atan2(dirX, dirZ);
        this.group.add(mesh);

        const arrowGeo = new THREE.ConeGeometry(2.0, 0.4, 4);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.7 });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.set(px, 0.22, pz);
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = Math.atan2(dirX, dirZ);
        this.group.add(arrow);

        this.boostPads.push({
          mesh, arrow, x: px, z: pz, dirX, dirZ,
          radius: 3.2,
          _phase: Math.random() * Math.PI * 2,
          _lastTrigger: new Map(),
        });
      }
    }
  },

  _makeBoostPadTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#FF9800');
    grad.addColorStop(0.5, '#FFEB3B');
    grad.addColorStop(1, '#FF5722');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#C62828'; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const y = 30 + i * 35;
      ctx.beginPath();
      ctx.moveTo(20, y + 18);
      ctx.lineTo(64, y - 8);
      ctx.lineTo(108, y + 18);
      ctx.lineTo(94, y + 18);
      ctx.lineTo(64, y);
      ctx.lineTo(34, y + 18);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    return tex;
  },

  // ===== ジャンプ盤 (大型化、両側にスロープ感) =====
  _buildJumpPads() {
    const n = this.pathPoints.length;
    // 大型コースに合わせジャンプ盤も増設 (3→6箇所)
    const positions = [0.12, 0.28, 0.42, 0.56, 0.70, 0.86];
    const padTex = this._makeJumpPadTexture();
    for (const t of positions) {
      const idx = Math.floor(t * n);
      const cur = this.pathPoints[idx];
      const next = this.pathPoints[(idx + 1) % n];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const dirX = dx / len, dirZ = dz / len;

      const px = cur.x, pz = cur.z;
      // ランプを大きめに（横幅広く、高さも高く）
      const rampGeo = this._makeRampGeometry(8, 1.8, 6);
      const rampMat = new THREE.MeshLambertMaterial({ map: padTex });
      const ramp = new THREE.Mesh(rampGeo, rampMat);
      ramp.position.set(px, 0, pz);
      ramp.rotation.y = Math.atan2(dirX, dirZ);
      this.group.add(ramp);

      const glowGeo = new THREE.PlaneGeometry(6, 5);
      const glowMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, opacity: 0.9 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(px + dirX * 0.5, 1.3, pz + dirZ * 0.5);
      glow.rotation.z = Math.atan2(dirX, dirZ);
      this.group.add(glow);

      this.jumpPads.push({
        mesh: ramp, glow, x: px, z: pz, dirX, dirZ,
        radius: 4.0,    // 当たり判定広く (取り損なわない)
        _phase: Math.random() * Math.PI * 2,
        _lastTrigger: new Map(),
      });
    }
  },

  _makeRampGeometry(width, height, depth) {
    const w = width / 2, d = depth / 2;
    const verts = new Float32Array([
      -w, 0, -d,   w, 0, -d,   w, 0,  d,  -w, 0,  d,
      -w, 0.2, -d,  w, 0.2, -d,  w, height,  d,  -w, height,  d,
    ]);
    const idx = [
      0, 1, 2,  0, 2, 3,
      4, 6, 5,  4, 7, 6,
      0, 5, 1,  0, 4, 5,
      3, 2, 6,  3, 6, 7,
      0, 3, 7,  0, 7, 4,
      1, 5, 6,  1, 6, 2,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  },

  _makeJumpPadTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#7E57C2');
    grad.addColorStop(0.5, '#42A5F5');
    grad.addColorStop(1, '#26C6DA');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0D47A1'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(64, 18);
    ctx.lineTo(105, 70);
    ctx.lineTo(82, 70);
    ctx.lineTo(82, 110);
    ctx.lineTo(46, 110);
    ctx.lineTo(46, 70);
    ctx.lineTo(23, 70);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    return tex;
  },

  // ===== ショートカット (内側を攻めるとアスファルト化された近道) =====
  _buildShortcuts() {
    // ヘアピン内側に複数の戦略的ショートカット
    const n = this.pathPoints.length;
    const shortcuts = [
      // セクター2 S字の内側
      { from: Math.floor(n * 0.22), to: Math.floor(n * 0.30) },
      // セクター3 ヘアピン
      { from: Math.floor(n * 0.42), to: Math.floor(n * 0.52) },
      // セクター4 バンク内側
      { from: Math.floor(n * 0.62), to: Math.floor(n * 0.68) },
      // セクター5 はゴール直前のスムーズカーブに変更したのでショートカットは削除
    ];
    for (const sc of shortcuts) {
      const a = this.pathPoints[sc.from];
      const b = this.pathPoints[sc.to];
      const an = this._segNorm[sc.from];
      const bn = this._segNorm[sc.to];
      const off = -this.widthAt(sc.from) * 1.05; // 内側に少し外
      const ax = a.x + an.nx * off, az = a.z + an.nz * off;
      const bx = b.x + bn.nx * off, bz = b.z + bn.nz * off;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const ang = Math.atan2(dx, dz);
      // 地面に少しだけ薄いダート風メッシュ
      const geo = new THREE.PlaneGeometry(8, len);
      const tex = this._makeDirtTexture();
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.95 });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = ang;
      m.position.set(cx, 0.03, cz);
      this.group.add(m);

      this.shortcuts.push({
        x: cx, z: cz, halfLen: len / 2, halfWid: 4, ang,
        cosA: Math.cos(ang), sinA: Math.sin(ang),
      });
    }
  },

  _makeDirtTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#8d6e63');
    grad.addColorStop(1, '#a1887f');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(60,40,20,${Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },

  // ショートカット上か判定
  isOnShortcut(x, z) {
    for (const sc of this.shortcuts) {
      const rx = x - sc.x, rz = z - sc.z;
      // ローカル座標
      const lx = rx * sc.cosA - rz * sc.sinA;
      const lz = rx * sc.sinA + rz * sc.cosA;
      if (Math.abs(lx) < sc.halfWid && Math.abs(lz) < sc.halfLen) return true;
    }
    return false;
  },

  _buildDecorations() {
    const treeMat1 = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    const treeMat2 = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
    const leafGeo = new THREE.ConeGeometry(2.5, 6, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.6, 2.5, 6);

    // 木の本数を半分以下に間引いて軽量化 (i+=2 → i+=4, 確率も下げる)
    const n = this.pathPoints.length;
    for (let i = 0; i < n; i += 4) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);

      for (let side of [1, -1]) {
        if (Math.random() > 0.45) continue;
        const off = (w + 12 + Math.random() * 60) * side;
        const px = cur.x + nx * off + Utils.rand(-3, 3);
        const pz = cur.z + nz * off + Utils.rand(-3, 3);
        const trunk = new THREE.Mesh(trunkGeo, treeMat2);
        const leaf = new THREE.Mesh(leafGeo, treeMat1);
        trunk.position.set(px, 1.2, pz);
        leaf.position.set(px, 4.5, pz);
        this.group.add(trunk);
        this.group.add(leaf);
      }
    }

    // ===== セクターサインボード (大型) =====
    this._buildSectorSigns();
    // ===== コースゲート/トンネル風アーチ (進行を盛り上げる) =====
    this._buildGates();
    // ===== 街灯ポール (高速ストレート区間) =====
    this._buildStreetLamps();

    const p = this.pathPoints[0];
    const standColors = [0xffffff, 0xe53935, 0x1976d2, 0xfbc02d];
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: standColors[i % standColors.length] });
      const stand = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 3), mat);
      const { nx, nz } = this._segNorm[0];
      const off = this.widthAt(0) + 12;
      stand.position.set(p.x + nx * off + (i - 4.5) * 11, 2, p.z + nz * off);
      stand.rotation.y = this.startAngle;
      this.group.add(stand);

      const audCanvas = document.createElement('canvas');
      audCanvas.width = 256; audCanvas.height = 64;
      const actx = audCanvas.getContext('2d');
      actx.fillStyle = '#ffffff'; actx.fillRect(0, 0, 256, 64);
      for (let k = 0; k < 80; k++) {
        actx.fillStyle = `hsl(${Math.random() * 360}, 80%, 55%)`;
        actx.beginPath();
        actx.arc(Math.random() * 256, Math.random() * 64, 3 + Math.random() * 2, 0, Math.PI * 2);
        actx.fill();
      }
      const audTex = new THREE.CanvasTexture(audCanvas);
      const audMat = new THREE.MeshBasicMaterial({ map: audTex });
      const audience = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 3.5), audMat);
      audience.position.copy(stand.position);
      audience.position.y += 2.5;
      audience.rotation.y = this.startAngle;
      audience.position.x -= Math.cos(this.startAngle) * 0.1;
      this.group.add(audience);
    }

    // フラッグの設置数を削減 (毎8→毎14)
    const flagColors = [0xff5252, 0xffd54f, 0x4fc3f7, 0x81c784];
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    for (let i = 0; i < n; i += 14) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      for (const side of [1, -1]) {
        if (Math.random() > 0.4) continue;
        const off = (w + 4) * side;
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(px, 2.5, pz);
        this.group.add(pole);

        const flagMat = new THREE.MeshLambertMaterial({
          color: flagColors[Math.floor(Math.random() * flagColors.length)],
          side: THREE.DoubleSide,
        });
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), flagMat);
        flag.position.set(px + 1.1 * (side === 1 ? 1 : -1), 4.3, pz);
        flag.rotation.y = Math.PI / 2;
        this.group.add(flag);
      }
    }
  },

  // セクター名サイン
  _buildSectorSigns() {
    const n = this.pathPoints.length;
    const signs = [
      { t: 0.18, text: 'SECTOR 2  S-CURVES',  color: '#1976d2' },
      { t: 0.36, text: 'SECTOR 3  HAIRPINS',  color: '#e53935' },
      { t: 0.55, text: 'SECTOR 4  HIGH BANK', color: '#7b1fa2' },
      { t: 0.78, text: 'SECTOR 5  MOUNTAIN',  color: '#2e7d32' },
    ];
    for (const s of signs) {
      const i = Math.floor(s.t * n);
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      const c = document.createElement('canvas');
      c.width = 512; c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = s.color; ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 112);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.text, 256, 64);
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), mat);
      const off = w + 9;
      sign.position.set(cur.x + nx * off, 5.5, cur.z + nz * off);
      sign.rotation.y = Math.atan2(nx, nz) + Math.PI / 2;
      this.group.add(sign);
      // ポール
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x666 });
      for (const pOff of [-7, 7]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 8), poleMat);
        pole.position.set(cur.x + nx * off + pOff * Math.cos(Math.atan2(nx, nz)), 3.5, cur.z + nz * off + pOff * Math.sin(Math.atan2(nx, nz)));
        // 単純化: ポールはサインの真下付近に2本
        pole.position.x = cur.x + nx * off;
        pole.position.z = cur.z + nz * off;
        pole.position.y = 3.5;
        this.group.add(pole);
        break;
      }
    }
  },

  // 進行を盛り上げるゲート/アーチ (装飾的な「くぐる門」)
  _buildGates() {
    const n = this.pathPoints.length;
    const positions = [0.14, 0.32, 0.50, 0.68, 0.85];
    const colors = [0x42a5f5, 0xff7043, 0xab47bc, 0x66bb6a, 0xffa726];
    for (let k = 0; k < positions.length; k++) {
      const t = positions[k];
      const i = Math.floor(t * n);
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      const angle = Math.atan2(this._segDir[i].ux, this._segDir[i].uz);

      const grp = new THREE.Group();
      const archMat = new THREE.MeshLambertMaterial({ color: colors[k] });
      // 2本の柱
      const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 9, 10), archMat);
      const post2 = post1.clone();
      post1.position.set(-w - 1.5, 4.5, 0);
      post2.position.set(w + 1.5, 4.5, 0);
      // 上部ビーム
      const beam = new THREE.Mesh(new THREE.BoxGeometry((w + 1.5) * 2 + 0.8, 0.9, 0.9), archMat);
      beam.position.set(0, 9, 0);
      // 装飾の小さなトロフィー風球
      const ballMat = new THREE.MeshLambertMaterial({ color: 0xffd54f });
      const ball1 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), ballMat);
      const ball2 = ball1.clone();
      ball1.position.set(-w - 1.5, 9.5, 0);
      ball2.position.set(w + 1.5, 9.5, 0);
      grp.add(post1, post2, beam, ball1, ball2);

      // 番号バナー
      const c = document.createElement('canvas');
      c.width = 512; c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#fff8e1'); g.addColorStop(1, '#ffca28');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#b71c1c';
      ctx.font = 'bold 80px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`CHECKPOINT ${k + 1}`, 256, 64);
      const bTex = new THREE.CanvasTexture(c);
      const banner = new THREE.Mesh(
        new THREE.BoxGeometry((w + 1.5) * 2, 1.6, 0.3),
        new THREE.MeshBasicMaterial({ map: bTex })
      );
      banner.position.set(0, 10.2, 0);
      grp.add(banner);

      grp.position.set(cur.x, 0, cur.z);
      grp.rotation.y = angle;
      this.group.add(grp);
    }
  },

  // ストレート区間の街灯
  _buildStreetLamps() {
    // 街灯を大幅削減 (毎6→毎16) + 共通ジオメトリ/マテリアル化
    const n = this.pathPoints.length;
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffee58 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6);
    const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
    const armGeo = new THREE.BoxGeometry(1.5, 0.12, 0.12);
    for (let i = 0; i < n; i += 16) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      for (const side of [1, -1]) {
        const off = (w + 2.5) * side;
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(px, 2.75, pz);
        this.group.add(pole);
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(px - nx * 0.6 * side, 5.4, pz - nz * 0.6 * side);
        this.group.add(head);
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(px - nx * 0.3 * side, 5.4, pz - nz * 0.3 * side);
        arm.rotation.y = Math.atan2(nx, nz) + Math.PI / 2;
        this.group.add(arm);
      }
    }
  },

  getProgress(x, z, hintIdx = -1) {
    const n = this.pathPoints.length;
    let best = 0;
    let bestD = Infinity;
    if (hintIdx >= 0) {
      const range = 30;
      for (let k = -range; k <= range; k++) {
        const i = ((hintIdx + k) % n + n) % n;
        const p = this.pathPoints[i];
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const p = this.pathPoints[i];
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return { index: best, dist: Math.sqrt(bestD), totalDist: this.cumLen[best] };
  },

  getStartPositions(count) {
    const out = [];
    const sx = this.startX, sz = this.startZ;
    const backX = -this.startDirX, backZ = -this.startDirZ;
    const sideX = this.startNX, sideZ = this.startNZ;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = (i % 2 === 0) ? -1 : 1;
      const off = (row + 1) * 5.5;
      const sideOff = col * 4.5;
      out.push({
        x: sx + backX * off + sideX * sideOff,
        z: sz + backZ * off + sideZ * sideOff,
        angle: this.startAngle,
      });
    }
    return out;
  },

  isOffTrack(x, z, hintIdx = -1) {
    const prog = this.getProgress(x, z, hintIdx);
    const w = this.widthAt(prog.index);
    if (prog.dist <= w) return false;
    if (this.isOnShortcut(x, z)) return false; // ショートカットはOK
    return true;
  },

  // 壁衝突解決 (改善版: 法線にのみ押し戻し、接線は保存)
  // すり抜け対策: 検査範囲を大幅に広げ、最も深いめり込みを基準に押し戻す
  resolveWalls(x, z, radius, hintIdx = -1) {
    const prog = this.getProgress(x, z, hintIdx);
    const idx = prog.index;
    const cur = this.pathPoints[idx];
    const { nx, nz } = this._segNorm[idx];
    const rx = x - cur.x, rz = z - cur.z;
    const lateral = rx * nx + rz * nz;
    const w = this.widthAt(idx);
    const limit = w - radius;

    // 最大めり込みを追跡 (代表セグメントから周辺まで全部見て最深を採用)
    let bestExcess = -Infinity;
    let bestSeg = null;

    if (Math.abs(lateral) > limit) {
      if (!this.isOnShortcut(x, z)) {
        bestExcess = Math.abs(lateral) - limit;
        bestSeg = { sign: Math.sign(lateral) || 1, nx, nz, lateral, index: idx };
      }
    }

    // 近隣セグメントも広めに検査 (-2..+2 → -4..+4 に拡張)
    const n = this.pathPoints.length;
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const j = ((idx + k) % n + n) % n;
      const pj = this.pathPoints[j];
      const seg = this._segNorm[j];
      const rxj = x - pj.x, rzj = z - pj.z;
      const latj = rxj * seg.nx + rzj * seg.nz;
      const wj = this.widthAt(j);
      const limj = wj - radius;
      const segDir = this._segDir[j];
      const tang = Math.abs(rxj * segDir.ux + rzj * segDir.uz);
      // タンジェント許容を 18 → 26 に広げる (高速で飛び込んだ場合の取りこぼし防止)
      if (tang > 26) continue;
      if (Math.abs(latj) > limj) {
        if (this.isOnShortcut(x, z)) continue;
        const excess = Math.abs(latj) - limj;
        if (excess > bestExcess) {
          bestExcess = excess;
          bestSeg = { sign: Math.sign(latj) || 1, nx: seg.nx, nz: seg.nz, lateral: latj, index: j };
        }
      }
    }

    if (bestSeg) {
      // 隣接セグメントとの法線の平均を取り、急カーブで法線が暴れるケースを安定化
      const nA = this._segNorm[bestSeg.index];
      const nP = this._segNorm[((bestSeg.index - 1) % this.pathPoints.length + this.pathPoints.length) % this.pathPoints.length];
      const nN = this._segNorm[(bestSeg.index + 1) % this.pathPoints.length];
      let avgNx = nA.nx + nP.nx + nN.nx;
      let avgNz = nA.nz + nP.nz + nN.nz;
      const avgLen = Math.hypot(avgNx, avgNz) || 1;
      avgNx /= avgLen; avgNz /= avgLen;

      const inset = 0.18; // 0.12 → 0.18 (さらに深めに押し戻して再すり抜け防止)
      // 元の法線で押し戻し
      let newX = x - bestSeg.sign * bestSeg.nx * (bestExcess + inset);
      let newZ = z - bestSeg.sign * bestSeg.nz * (bestExcess + inset);
      // 平均法線でも安全側に追加押し戻し (急カーブ自己交差対策)
      const extra = 0.25;
      newX -= bestSeg.sign * avgNx * extra;
      newZ -= bestSeg.sign * avgNz * extra;
      return {
        x: newX, z: newZ, hit: true,
        nx: -bestSeg.sign * bestSeg.nx,
        nz: -bestSeg.sign * bestSeg.nz,
        lateral: bestSeg.lateral, index: bestSeg.index,
      };
    }
    return { x, z, hit: false, nx: 0, nz: 0, lateral, index: idx };
  },

  update(dt, now) {
    for (const b of this.itemBoxes) {
      if (b.active) {
        b.mesh.rotation.y += dt * 2.2;
        b.mesh.rotation.x += dt * 1.3;
        b.mesh.position.y = 1.3 + Math.sin(now * 0.003 + b.x * 0.1) * 0.22;
        if (b.ring) {
          const s = 1 + Math.sin(now * 0.005 + b.x * 0.05) * 0.15;
          b.ring.scale.set(s, s, 1);
          b.ring.material.opacity = 0.35 + Math.sin(now * 0.005) * 0.2;
        }
        if (b.beam) {
          b.beam.material.opacity = 0.18 + Math.sin(now * 0.004) * 0.1;
        }
      } else if (now > b.respawn) {
        b.active = true;
        b.mesh.visible = true;
        if (b.ring) b.ring.visible = true;
        if (b.beam) b.beam.visible = true;
      }
    }
    for (const p of this.boostPads) {
      p._phase += dt * 5;
      if (p.arrow) {
        const s = 1 + Math.sin(p._phase) * 0.18;
        p.arrow.scale.set(s, s, s);
        p.arrow.material.opacity = 0.55 + Math.sin(p._phase) * 0.3;
      }
    }
    for (const p of this.jumpPads) {
      p._phase += dt * 4;
      if (p.glow) {
        p.glow.material.opacity = 0.7 + Math.sin(p._phase) * 0.25;
        p.glow.position.y = 1.4 + Math.sin(p._phase) * 0.15;
      }
    }
    // コインの回転・上下バウンス
    for (const c of this.coins) {
      if (c.active) {
        c.mesh.rotation.z += dt * 3.5;
        c.mesh.position.y = 1.2 + Math.sin(now * 0.004 + c.phase) * 0.18;
        if (c.ring) {
          c.ring.material.opacity = 0.4 + Math.sin(now * 0.005 + c.phase) * 0.18;
        }
      } else if (now > c.respawn) {
        c.active = true;
        c.mesh.visible = true;
        if (c.ring) c.ring.visible = true;
      }
    }
  },

  // ===== パッド衝突チェック =====
  checkPads(car, now) {
    let result = { boost: false, jump: false };
    for (const p of this.boostPads) {
      const d = Utils.dist2(car.x, car.z, p.x, p.z);
      if (d < p.radius) {
        const last = p._lastTrigger.get(car.id) || 0;
        if (now - last > 500) {
          p._lastTrigger.set(car.id, now);
          result.boost = true;
        }
      }
    }
    for (const p of this.jumpPads) {
      const d = Utils.dist2(car.x, car.z, p.x, p.z);
      if (d < p.radius && car.y < 1.5) {  // 空中時は再発動しない
        const last = p._lastTrigger.get(car.id) || 0;
        if (now - last > 1500) {
          p._lastTrigger.set(car.id, now);
          result.jump = true;
        }
      }
    }
    return result;
  },

  collectItemBox(x, z, radius = 2.2) {
    for (const b of this.itemBoxes) {
      if (!b.active) continue;
      if (Utils.dist2(x, z, b.x, b.z) < radius) {
        b.active = false;
        b.mesh.visible = false;
        if (b.ring) b.ring.visible = false;
        if (b.beam) b.beam.visible = false;
        b.respawn = performance.now() + 3500;
        return true;
      }
    }
    return false;
  },

  // ===== コイン (マリオカート風: 1枚 = +2%最高速, 最大10枚) =====
  _buildCoins() {
    const n = this.pathPoints.length;
    // ルート全周にわたって等間隔に多数配置
    const step = 6; // 細かめ間隔
    const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.15, 18);
    const coinMat = new THREE.MeshLambertMaterial({
      color: 0xFFD700,
      emissive: 0xB28900,
      emissiveIntensity: 0.5,
    });
    const coinEdgeMat = new THREE.MeshLambertMaterial({
      color: 0xFFEA70,
      emissive: 0xC79500,
      emissiveIntensity: 0.4,
    });

    // パターン: 中央 / ジグザグ / 三連 / 弧 をローテーション
    let pattern = 0;
    for (let i = 8; i < n; i += step) {
      // アイテムボックス/ブーストパッド/ジャンプ盤と被らないように軽くチェック
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      // 他要素との被り簡易判定 (距離8m以内なら配置スキップ)
      let skip = false;
      for (const o of this.itemBoxes) {
        if (Math.abs(o.x - cur.x) < 8 && Math.abs(o.z - cur.z) < 8) { skip = true; break; }
      }
      if (skip) continue;
      for (const o of this.boostPads) {
        if (Math.abs(o.x - cur.x) < 6 && Math.abs(o.z - cur.z) < 6) { skip = true; break; }
      }
      if (skip) continue;
      for (const o of this.jumpPads) {
        if (Math.abs(o.x - cur.x) < 8 && Math.abs(o.z - cur.z) < 8) { skip = true; break; }
      }
      if (skip) continue;

      // パターンごとに横オフセット
      let offsets;
      const p = pattern % 4;
      if (p === 0) offsets = [0];                         // 中央単独
      else if (p === 1) offsets = [-w * 0.45, w * 0.45];   // 両サイド
      else if (p === 2) offsets = [-w * 0.5, 0, w * 0.5];  // 三連
      else offsets = [Math.sin(i * 0.3) * w * 0.4];        // 蛇行

      for (const off of offsets) {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const mesh = new THREE.Mesh(coinGeo, [coinEdgeMat, coinMat, coinMat]);
        // CylinderGeometry はマテリアル配列を使う場合 [側面, 上, 下]
        mesh.material = [coinEdgeMat, coinMat, coinMat];
        mesh.position.set(px, 1.2, pz);
        mesh.rotation.x = Math.PI / 2; // 立てる
        mesh.castShadow = false;
        this.group.add(mesh);

        // 光るリング (拾いやすさUP)
        const ringGeo = new THREE.RingGeometry(0.7, 0.95, 18);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xFFE082, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px, 0.05, pz);
        this.group.add(ring);

        this.coins.push({
          mesh, ring,
          x: px, z: pz,
          active: true,
          respawn: 0,
          phase: Math.random() * Math.PI * 2,
        });
      }
      pattern++;
    }
  },

  // コイン取得判定
  collectCoin(x, z, radius = 2.0) {
    for (const c of this.coins) {
      if (!c.active) continue;
      if (Utils.dist2(x, z, c.x, c.z) < radius) {
        c.active = false;
        c.mesh.visible = false;
        if (c.ring) c.ring.visible = false;
        c.respawn = performance.now() + 6000; // 6秒後に復活
        return true;
      }
    }
    return false;
  },
};
