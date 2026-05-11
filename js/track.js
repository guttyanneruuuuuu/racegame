// ============= レーストラック (3Dコース) =============
const Track = {
  // 中央線の制御点（閉じたループ）
  controlPoints: [],
  pathPoints: [],   // 補間後の点列 {x, z}
  pathLength: 0,
  cumLen: [],       // 累積距離
  width: 22,        // コース幅(半幅) - 広めに(壁ありで操作しやすく)
  wallHeight: 2.6,  // 壁の高さ

  group: null,
  trackMesh: null,
  itemBoxes: [],    // {mesh, pos, active, respawn}
  
  // ギミック
  jumpPads: [],     // {x, z, angle, width, length}
  boostPads: [],    // {x, z, angle, width, length}

  // 壁衝突用セグメント (外側 / 内側) - 2D 線分
  wallSegmentsOuter: [],
  wallSegmentsInner: [],

  // 進行度キャッシュ
  _segDir: [],   // 各セグメントの単位方向ベクトル {ux, uz}
  _segNorm: [],  // 法線(左方向)

  generate(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // 制御点（より複雑な形状へ変更）
    this.controlPoints = [
      { x:    0, z:  230 },
      { x:  105, z:  220 },
      { x:  190, z:  135 },
      { x:  250, z:   35 },
      { x:  210, z:  -40 },  // S字入口
      { x:  275, z: -120 },
      { x:  165, z: -215 },
      { x:   50, z: -180 },  // 中央くびれ
      { x:  -40, z: -265 },
      { x: -145, z: -225 },
      { x: -250, z: -120 },
      { x: -195, z:  -20 },  // イン側ヘアピン
      { x: -280, z:   85 },
      { x: -180, z:  170 },
      { x: -105, z:  255 },
      { x:   10, z:  250 },
    ];

    // Catmull-Rom補間で滑らかパス生成
    this.pathPoints = this._catmullRomLoop(this.controlPoints, 25);
    this._buildCumLen();
    this._buildSegmentDirs();

    this._buildGround(scene);
    this._buildSkybox(scene);
    this._buildTrack();
    this._buildCurbs();      // 縁石(赤白)
    this._buildBarriers();   // 壁
    this._buildStartLine();
    this._buildItemBoxes();
    this._buildGimmicks();   // ジャンプ台・加速パッド
    this._buildDecorations();

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

      verts.push(cur.x + nx * this.width, 0.02, cur.z + nz * this.width); // 左端(外側)
      verts.push(cur.x - nx * this.width, 0.02, cur.z - nz * this.width); // 右端(内側)
      uvs.push(0, i * 0.4);
      uvs.push(1, i * 0.4);

      this.wallSegmentsOuter.push({ x: cur.x + nx * this.width, z: cur.z + nz * this.width });
      this.wallSegmentsInner.push({ x: cur.x - nx * this.width, z: cur.z - nz * this.width });
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
    ctx.fillStyle = '#4a4a50';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const g = 60 + Math.random() * 40;
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
        const inner = side * this.width;
        const outer = side * (this.width + curbWidth);
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
      const wallOff1 = side * (this.width + curbWidth);
      const wallOff2 = side * (this.width + curbWidth + wallThickness);

      for (let i = 0; i < n; i++) {
        const cur = this.pathPoints[i];
        const { nx, nz } = this._segNorm[i];
        const xi1 = cur.x + nx * wallOff1, zi1 = cur.z + nz * wallOff1;
        const xi2 = cur.x + nx * wallOff2, zi2 = cur.z + nz * wallOff2;
        verts.push(xi1, 0.15, zi1);          // 0 下内
        verts.push(xi2, 0.15, zi2);          // 1 下外
        verts.push(xi2, wallHeight, zi2);    // 2 上外
        verts.push(xi1, wallHeight, zi1);    // 3 上内
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
  },

  _buildStartLine() {
    const p = this.pathPoints[0];
    const { nx, nz } = this._segNorm[0];
    const { ux, uz } = this._segDir[0];
    this.startX = p.x; this.startZ = p.z;
    this.startDirX = ux; this.startDirZ = uz;
    this.startNX = nx; this.startNZ = nz;
    this.startAngle = Math.atan2(ux, uz);

    const geo = new THREE.PlaneGeometry(this.width * 2, 4);
    const tex = this._makeCheckerTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, 0.08, p.z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -this.startAngle;
    this.group.add(mesh);

    const archGeo = new THREE.BoxGeometry(this.width * 2.2, 1.5, 2);
    const archMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.set(p.x, 10, p.z);
    arch.rotation.y = this.startAngle;
    this.group.add(arch);

    const pillarGeo = new THREE.CylinderGeometry(0.8, 0.8, 10, 8);
    const p1 = new THREE.Mesh(pillarGeo, archMat);
    p1.position.set(p.x + nx * (this.width + 2), 5, p.z + nz * (this.width + 2));
    this.group.add(p1);
    const p2 = new THREE.Mesh(pillarGeo, archMat);
    p2.position.set(p.x - nx * (this.width + 2), 5, p.z - nz * (this.width + 2));
    this.group.add(p2);
  },

  _makeCheckerTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = '#000';
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * 16, y * 16, 16, 16);
      }
    }
    return new THREE.CanvasTexture(c);
  },

  _buildItemBoxes() {
    const n = this.pathPoints.length;
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const boxMat = new THREE.MeshPhongMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.7, shininess: 100 });
    for (let i = 20; i < n; i += 60) {
      const p = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const offsets = [-10, 0, 10];
      for (const off of offsets) {
        const mesh = new THREE.Mesh(boxGeo, boxMat);
        const bx = p.x + nx * off, bz = p.z + nz * off;
        mesh.position.set(bx, 1.5, bz);
        this.group.add(mesh);
        this.itemBoxes.push({ mesh, x: bx, z: bz, active: true, respawn: 0 });
      }
    }
  },

  _buildGimmicks() {
    const n = this.pathPoints.length;
    const jumpGeo = new THREE.BoxGeometry(12, 0.5, 6);
    const jumpMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff, emissive: 0x00b8d4 });
    const boostGeo = new THREE.PlaneGeometry(10, 8);
    const boostMat = new THREE.MeshBasicMaterial({ color: 0xffea00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });

    // ジャンプ台の配置
    const jumpIndices = [Math.floor(n * 0.25), Math.floor(n * 0.75)];
    for (const idx of jumpIndices) {
      const p = this.pathPoints[idx];
      const { ux, uz } = this._segDir[idx];
      const angle = Math.atan2(ux, uz);
      const mesh = new THREE.Mesh(jumpGeo, jumpMat);
      mesh.position.set(p.x, 0.25, p.z);
      mesh.rotation.y = angle;
      mesh.rotation.x = -0.15; // 少し傾ける
      this.group.add(mesh);
      this.jumpPads.push({ x: p.x, z: p.z, angle, width: 12, length: 6 });
    }

    // 加速パッドの配置
    const boostIndices = [Math.floor(n * 0.1), Math.floor(n * 0.4), Math.floor(n * 0.6), Math.floor(n * 0.9)];
    for (const idx of boostIndices) {
      const p = this.pathPoints[idx];
      const { ux, uz } = this._segDir[idx];
      const angle = Math.atan2(ux, uz);
      const mesh = new THREE.Mesh(boostGeo, boostMat);
      mesh.position.set(p.x, 0.1, p.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -angle;
      this.group.add(mesh);
      this.boostPads.push({ x: p.x, z: p.z, angle, width: 10, length: 8 });
    }
  },

  _buildGround(scene) {
    const geo = new THREE.PlaneGeometry(2000, 2000);
    const mat = new THREE.MeshLambertMaterial({ color: 0x388e3c });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);
  },

  _buildSkybox(scene) {
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.0015);
  },

  _buildDecorations() {
    const treeMat1 = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    const treeMat2 = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
    const leafGeo = new THREE.ConeGeometry(2.5, 6, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.6, 2.5, 6);
    const n = this.pathPoints.length;
    for (let i = 0; i < n; i += 4) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      for (let side of [1, -1]) {
        if (Math.random() > 0.4) continue;
        const off = (this.width + 15 + Math.random() * 50) * side;
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const trunk = new THREE.Mesh(trunkGeo, treeMat2);
        const leaf = new THREE.Mesh(leafGeo, treeMat1);
        trunk.position.set(px, 1.2, pz);
        leaf.position.set(px, 4.5, pz);
        this.group.add(trunk);
        this.group.add(leaf);
      }
    }
  },

  getProgress(x, z, hintIdx = -1) {
    const n = this.pathPoints.length;
    let best = 0;
    let bestD = Infinity;
    const searchRange = hintIdx >= 0 ? 30 : n;
    const startK = hintIdx >= 0 ? -searchRange : 0;
    const endK = hintIdx >= 0 ? searchRange : n - 1;
    for (let k = startK; k <= endK; k++) {
      const i = hintIdx >= 0 ? ((hintIdx + k) % n + n) % n : k;
      const p = this.pathPoints[i];
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bestD) { bestD = d; best = i; }
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
      const off = (row + 1) * 6;
      const sideOff = col * 5;
      out.push({ x: sx + backX * off + sideX * sideOff, z: sz + backZ * off + sideZ * sideOff, angle: this.startAngle });
    }
    return out;
  },

  isOffTrack(x, z, hintIdx = -1) {
    const { dist } = this.getProgress(x, z, hintIdx);
    return dist > this.width;
  },

  resolveWalls(x, z, radius, hintIdx = -1) {
    const prog = this.getProgress(x, z, hintIdx);
    const cur = this.pathPoints[prog.index];
    const { nx, nz } = this._segNorm[prog.index];
    const rx = x - cur.x, rz = z - cur.z;
    const lateral = rx * nx + rz * nz;
    const limit = this.width - radius;
    if (Math.abs(lateral) > limit) {
      const sign = Math.sign(lateral);
      const excess = Math.abs(lateral) - limit;
      return { x: x - sign * nx * excess, z: z - sign * nz * excess, hit: true, nx: -sign * nx, nz: -sign * nz, lateral };
    }
    return { x, z, hit: false, nx: 0, nz: 0, lateral };
  },

  update(dt, now) {
    for (const b of this.itemBoxes) {
      if (b.active) {
        b.mesh.rotation.y += dt * 2;
        b.mesh.position.y = 1.5 + Math.sin(now * 0.003 + b.x * 0.1) * 0.2;
      } else if (now > b.respawn) {
        b.active = true; b.mesh.visible = true;
      }
    }
  },

  collectItemBox(x, z, radius = 2) {
    for (const b of this.itemBoxes) {
      if (b.active && Utils.dist2(x, z, b.x, b.z) < radius) {
        b.active = false; b.mesh.visible = false;
        b.respawn = performance.now() + 4000;
        return true;
      }
    }
    return false;
  },

  checkGimmicks(x, z) {
    for (const p of this.boostPads) {
      if (this._isPointInPad(x, z, p)) return 'boost';
    }
    for (const p of this.jumpPads) {
      if (this._isPointInPad(x, z, p)) return 'jump';
    }
    return null;
  },

  _isPointInPad(x, z, p) {
    const dx = x - p.x;
    const dz = z - p.z;
    const s = Math.sin(p.angle);
    const c = Math.cos(p.angle);
    const localLongitudinal = dx * s + dz * c;
    const localLateral = dx * c - dz * s;
    return Math.abs(localLongitudinal) <= p.length * 0.5 && Math.abs(localLateral) <= p.width * 0.5;
  },
};
