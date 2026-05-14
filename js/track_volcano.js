// ============= 🌋 VOLCANO CIRCUIT (火山サーキット) =============
// 軽量化 & テーマ統一: 火山岩・溶岩・間欠泉・転がる溶岩岩。
// 公開APIは従来どおり (pathPoints / width / _segNorm / itemBoxes / boostPads / jumpPads / shortcuts / startX,Z,Angle, etc.)
window.createTrackVolcano = function () {
  return {
  controlPoints: [],
  pathPoints: [],
  pathLength: 0,
  cumLen: [],
  width: 22,
  wallHeight: 3.0,
  surfaceHeights: [],

  group: null,
  trackMesh: null,
  itemBoxes: [],
  boostPads: [],
  jumpPads: [],
  oilPads: [],
  shortcuts: [],
  lavaPools: [],     // 溶岩プール (オイル相当・スリップ+ダメージ)
  boulders: [],      // 転がる溶岩岩 (動く障害物)
  geysers: [],       // 間欠泉の煙パーティクル参照

  wallSegmentsOuter: [],
  wallSegmentsInner: [],

  _segDir: [],
  _segNorm: [],
  _sharedMats: {},   // マテリアル共有プール (軽量化)
  _sharedGeos: {},   // ジオメトリ共有プール
  _smokeParticles: [],

  generate(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // 火山サーキット用 制御点 — 従来とは全く違うレイアウト
    // 急なヘアピン2連 + 螺旋気味の長いカーブ + 折り返し直線
    this.controlPoints = [
      { x:    0, z:  160 },   // スタート
      { x:   80, z:  170 },
      { x:  170, z:  140 },
      { x:  220, z:   60 },   // 大きく右カーブ
      { x:  200, z:  -20 },
      { x:  150, z:  -60 },   // 内側に折り返し (ヘアピン1)
      { x:   80, z:  -40 },
      { x:   40, z:   30 },   // 中央 S字
      { x:  -10, z:   80 },
      { x:  -80, z:   60 },
      { x: -150, z:    0 },   // 左外周へ
      { x: -200, z:  -80 },
      { x: -170, z: -170 },   // 下端の大カーブ
      { x:  -80, z: -200 },
      { x:   40, z: -180 },
      { x:  130, z: -150 },
      { x:  180, z: -100 },   // 右下のフック
      { x:  145, z: -125 },   // 折返し (ヘアピン2) を緩和
      { x:   75, z: -110 },
      { x:   10, z:  -70 },
      { x:  -40, z:  -15 },
      { x:  -90, z:   40 },
      { x:  -90, z:  110 },   // 戻り直線
      { x:  -40, z:  150 },
    ];

    // 壁重なり抑制のため分割を少し増やして接線変化を滑らかにする
    this.pathPoints = this._catmullRomLoop(this.controlPoints, 16);
    this._buildCumLen();
    this._buildSegmentDirs();
    this._buildSurfaceHeights();

    this._initSharedAssets();    // 共有マテリアル/ジオメトリ準備

    this._buildGround(scene);
    this._buildSkybox(scene);
    this._buildTrack();
    this._buildCurbs();
    this._buildBarriers();
    this._buildStartLine();
    this._buildItemBoxes();
    this._buildBoostPads();
    this._buildJumpPads();       // 間欠泉ジャンプ台
    this._buildDirectionArrows(); // 地上ガイド
    this._buildAerialGuides();    // 空中ガイド
    this._buildShortcuts();      // 溶岩割れ目ショートカット
    this._buildLavaPools();      // ハザード
    this._buildBoulders();       // 動く障害物
    this._buildDecorations();    // 軽量装飾 (岩柱 + 溶岩流)

    return this;
  },

  // ------------------------------------------------------------------
  _initSharedAssets() {
    // 岩用マテリアル (共有して draw call 節約)
    this._sharedMats.rock = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
    this._sharedMats.rockLight = new THREE.MeshLambertMaterial({ color: 0x3a3438 });
    this._sharedMats.lava = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    this._sharedMats.lavaGlow = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.7 });
    this._sharedMats.crystal = new THREE.MeshLambertMaterial({
      color: 0xff7043, emissive: 0xc63d10, emissiveIntensity: 0.6, transparent: true, opacity: 0.85,
    });

    // 共有ジオメトリ
    this._sharedGeos.rockPillar = new THREE.ConeGeometry(2.2, 6, 5);
    this._sharedGeos.smallRock  = new THREE.DodecahedronGeometry(1.1, 0);
    this._sharedGeos.crystalShard = new THREE.OctahedronGeometry(1.4, 0);
    this._sharedGeos.boulder = new THREE.IcosahedronGeometry(1.6, 0);
  },

  _catmullRomLoop(pts, segments) {
    const curve = new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(p.x, 0, p.z)),
      true,
      'centripetal',
      0.5
    );
    const sampleCount = Math.max(pts.length * segments, pts.length * 4);
    const sampled = curve.getPoints(sampleCount);
    if (sampled.length > 1) sampled.pop(); // 末尾の始点重複を除去
    return sampled.map((v) => ({ x: v.x, z: v.z }));
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

  _buildSurfaceHeights() {
    const n = this.pathPoints.length;
    this.surfaceHeights = new Array(n).fill(0);
    const ease = (t) => 0.5 - Math.cos(Math.PI * t) * 0.5;
    const applyPlateau = (fromT, peakStartT, peakEndT, toT, height) => {
      const from = Math.floor(n * fromT);
      const peakStart = Math.floor(n * peakStartT);
      const peakEnd = Math.floor(n * peakEndT);
      const to = Math.floor(n * toT);
      for (let i = from; i <= to; i++) {
        let h = height;
        if (i < peakStart) {
          const t = (i - from) / Math.max(1, peakStart - from);
          h = height * ease(t);
        } else if (i > peakEnd) {
          const t = (to - i) / Math.max(1, to - peakEnd);
          h = height * ease(t);
        }
        this.surfaceHeights[i] = Math.max(this.surfaceHeights[i], h);
      }
    };

    // 序盤: 小さな高台 (ジャンプ後のライン取り意味付け)
    applyPlateau(0.12, 0.16, 0.19, 0.24, 4.5);
    // 終盤: 大きな高架 (登り→頂上→下りを明確化)
    applyPlateau(0.56, 0.65, 0.71, 0.82, 10.5);
  },

  _getTrackY(i) {
    const n = this.surfaceHeights.length || 1;
    return this.surfaceHeights[((i % n) + n) % n] || 0;
  },

  getSurfaceHeight(x, z, hintIdx = -1) {
    const prog = this.getProgress(x, z, hintIdx);
    return this._getTrackY(prog.index);
  },

  widthAt(_i = 0) {
    return this.width;
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
      const y = this._getTrackY(i);

      verts.push(cur.x + nx * this.width, y + 0.02, cur.z + nz * this.width);
      verts.push(cur.x - nx * this.width, y + 0.02, cur.z - nz * this.width);
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

    const tex = this._makeVolcanicAsphaltTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.trackMesh = new THREE.Mesh(geo, mat);
    this.group.add(this.trackMesh);

    this._buildCenterLine();
  },

  _makeVolcanicAsphaltTexture() {
    // 128 → 64 に縮小 (軽量化)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    // ベース: 黒い火山岩アスファルト
    ctx.fillStyle = '#1d1a1c';
    ctx.fillRect(0, 0, 64, 64);
    // ひびと粒
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 64, y = Math.random() * 64;
      const g = 30 + Math.random() * 30;
      ctx.fillStyle = `rgb(${g},${g-5},${g-8})`;
      ctx.fillRect(x, y, 1, 1);
    }
    // 赤いひび割れ
    ctx.strokeStyle = '#5a1e10';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 64, Math.random() * 64);
      ctx.lineTo(Math.random() * 64, Math.random() * 64);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },

  _buildCenterLine() {
    const pts = [];
    const n = this.pathPoints.length;
    for (let i = 0; i < n; i++) {
      const p = this.pathPoints[i];
      pts.push(new THREE.Vector3(p.x, this._getTrackY(i) + 0.05, p.z));
    }
    pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    // 黄色 → 溶岩オレンジに変更
    const mat = new THREE.LineDashedMaterial({ color: 0xff6f00, dashSize: 4, gapSize: 4, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    this.group.add(line);
  },

  _buildDirectionArrows() {
    const n = this.pathPoints.length;
    const spacing = 28;
    const arrowScale = 3.4;
    const verts = [];
    const idx = [];
    let vCount = 0;
    for (let i = 0; i < n; i += spacing) {
      const cur = this.pathPoints[i];
      const next = this.pathPoints[(i + 5) % n];
      const dx = next.x - cur.x;
      const dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz;
      const pz = ux;
      const y = this._getTrackY(i) + 0.1;
      verts.push(
        cur.x + ux * arrowScale, y, cur.z + uz * arrowScale,
        cur.x - px * (arrowScale * 0.4) - ux * (arrowScale * 0.3), y, cur.z - pz * (arrowScale * 0.4) - uz * (arrowScale * 0.3),
        cur.x + px * (arrowScale * 0.4) - ux * (arrowScale * 0.3), y, cur.z + pz * (arrowScale * 0.4) - uz * (arrowScale * 0.3),
      );
      idx.push(vCount, vCount + 1, vCount + 2);
      vCount += 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc107, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
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
        const y = this._getTrackY(i);
        const inner = side * this.width;
        const outer = side * (this.width + curbWidth);
        verts.push(cur.x + nx * inner, y + 0.05, cur.z + nz * inner);
        verts.push(cur.x + nx * outer, y + curbHeight, cur.z + nz * outer);
        // 縁石: 黒/赤(溶岩) の繰り返し
        const isHot = (Math.floor(i / 2) % 2 === 0);
        const r = isHot ? 0.95 : 0.18;
        const g = isHot ? 0.35 : 0.18;
        const b = isHot ? 0.10 : 0.18;
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
        const y = this._getTrackY(i);
        const xi1 = cur.x + nx * wallOff1, zi1 = cur.z + nz * wallOff1;
        const xi2 = cur.x + nx * wallOff2, zi2 = cur.z + nz * wallOff2;
        verts.push(xi1, y + 0.15, zi1);
        verts.push(xi2, y + 0.15, zi2);
        verts.push(xi2, y + wallHeight, zi2);
        verts.push(xi1, y + wallHeight, zi1);

        // 火山岩壁: ダークグレー基調、たまに赤い溶岩光
        const hot = (Math.floor(i / 5) % 4 === 0);
        const c1 = hot ? [0.55, 0.18, 0.08] : [0.22, 0.20, 0.22];
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

    // 壁の上端の溶岩ライン (1本に統合: コスト減)
    const topLineMat = new THREE.LineBasicMaterial({ color: 0xff5722 });
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const idx2 = i % n;
        const cur = this.pathPoints[idx2];
        const { nx, nz } = this._segNorm[idx2];
        const off = side * (this.width + 1.4 + 0.6);
        pts.push(new THREE.Vector3(cur.x + nx * off, this._getTrackY(idx2) + wallHeight + 0.05, cur.z + nz * off));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(geo, topLineMat));
    }

    this.wallSegmentsOuter = [];
    this.wallSegmentsInner = [];
    for (let i = 0; i < n; i++) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const off = this.width;
      this.wallSegmentsOuter.push({ x: cur.x + nx * off, z: cur.z + nz * off });
      this.wallSegmentsInner.push({ x: cur.x - nx * off, z: cur.z - nz * off });
    }
  },

  _buildStartLine() {
    const p = this.pathPoints[0];
    const p1 = this.pathPoints[1];
    const startY = this._getTrackY(0);
    const dx = p1.x - p.x, dz = p1.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#0a0a0a' : '#ffffff';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.width * 0.6, 0.5);

    const geo = new THREE.PlaneGeometry(this.width * 2, 3.5);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, startY + 0.06, p.z);
    const angle = Math.atan2(dx, dz);
    m.rotation.z = angle;
    this.group.add(m);

    this._buildArch(p.x, startY, p.z, angle);

    this.startAngle = angle;
    this.startX = p.x;
    this.startZ = p.z;
    this.startDirX = dx / len;
    this.startDirZ = dz / len;
    this.startNX = nx;
    this.startNZ = nz;
  },

  // ゲート: 火山岩柱 + 燃えるバナー
  _buildArch(x, baseY, z, angle) {
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x3a2f2d });
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 7, 6), stoneMat);
    const post2 = post1.clone();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(this.width * 2.4, 0.9, 0.9), stoneMat);

    const grp = new THREE.Group();
    post1.position.set(-this.width - 1, 3.5, 0);
    post2.position.set(this.width + 1, 3.5, 0);
    beam.position.set(0, 7, 0);
    grp.add(post1, post2, beam);

    // バナー: 溶岩オレンジ
    const c = document.createElement('canvas');
    c.width = 512; c.height = 80;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 80);
    grad.addColorStop(0, '#ff8a00');
    grad.addColorStop(1, '#b71c1c');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 80);
    ctx.fillStyle = '#fff8e1';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌋  VOLCANO CIRCUIT  🌋', 256, 42);
    const bannerTex = new THREE.CanvasTexture(c);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(this.width * 2.1, 1.6, 0.3),
      new THREE.MeshBasicMaterial({ map: bannerTex })
    );
    banner.position.set(0, 8.1, 0);
    grp.add(banner);

    grp.position.set(x, baseY, z);
    grp.rotation.y = angle;
    this.group.add(grp);
  },

  _buildGround(scene) {
    // 地面: 黒い火山岩 + 赤い溶岩ヒビ
    const c = document.createElement('canvas');
    c.width = c.height = 128;     // 256 → 128
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1416';
    ctx.fillRect(0, 0, 128, 128);
    // 火山岩のざらつき
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const g = 25 + Math.random() * 35;
      ctx.fillStyle = `rgba(${g}, ${Math.floor(g*0.7)}, ${Math.floor(g*0.6)}, ${0.6 + Math.random()*0.3})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // 赤い溶岩ヒビ
    for (let i = 0; i < 12; i++) {
      const g = ctx.createLinearGradient(0, 0, 128, 128);
      g.addColorStop(0, 'rgba(255,80,20,0)');
      g.addColorStop(0.5, 'rgba(255,80,20,0.6)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.beginPath();
      const x1 = Math.random() * 128, y1 = Math.random() * 128;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + (Math.random() - 0.5) * 60, y1 + (Math.random() - 0.5) * 60);
      ctx.stroke();
    }
    const rockTex = new THREE.CanvasTexture(c);
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
    rockTex.repeat.set(30, 30);

    // 地面サイズを 1200 → 800 に縮小 (フォグで隠す)
    const geo = new THREE.PlaneGeometry(800, 800, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: rockTex });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.05;
    scene.add(m);

    // 遠景の溶岩湖 (シンプル円)
    const lavaGeo = new THREE.RingGeometry(280, 380, 32);
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const lava = new THREE.Mesh(lavaGeo, lavaMat);
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -0.02;
    scene.add(lava);
  },

  _buildSkybox(scene) {
    // 火山の空: 暗い赤紫 → 黒い煙
    const c = document.createElement('canvas');
    c.width = 32; c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#3a1010');
    grad.addColorStop(0.4, '#8b2a10');
    grad.addColorStop(0.7, '#d96030');
    grad.addColorStop(1, '#2a1a14');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 256);
    // 火山灰の雲 (暗め)
    ctx.fillStyle = 'rgba(60, 40, 35, 0.7)';
    for (let i = 0; i < 8; i++) {
      const y = 20 + Math.random() * 80;
      const x = Math.random() * 32;
      const r = 4 + Math.random() * 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.5, y + 2, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    // スカイドーム 600 → 450 (軽量化)
    const skyGeo = new THREE.SphereGeometry(450, 20, 12);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    scene.background = new THREE.Color(0x3a1a18);
    // 火山フォグ: 赤茶
    scene.fog = new THREE.Fog(0x4a2218, 180, 500);

    // 環境光は赤みを帯びさせる (game.js でライト作るのでここでは追加しない)
  },

  _buildItemBoxes() {
    const n = this.pathPoints.length;
    const step = Math.floor(n / 8);

    const colors = ['#FF5252', '#FFD740', '#69F0AE', '#40C4FF', '#E040FB', '#FFAB40'];
    const makeFace = (color) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;     // 128 → 64
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 6, 32, 32, 40);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, color);
      g.addColorStop(1, color);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, 54, 54);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
      ctx.strokeText('?', 32, 36);
      ctx.fillText('?', 32, 36);
      const tex = new THREE.CanvasTexture(c);
      return new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(color).multiplyScalar(0.3), emissiveIntensity: 0.5 });
    };
    const mats = colors.map(makeFace);
    const boxGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);

    // リング・ビームのジオメトリは共有 (軽量化)
    const ringGeo = new THREE.RingGeometry(1.4, 1.85, 16);
    const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, 4, 6, 1, true);

    for (let i = 4; i < n; i += step) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const py = this._getTrackY(i);

      const offsets = [-this.width * 0.55, 0, this.width * 0.55];
      offsets.forEach(off => {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const m = new THREE.Mesh(boxGeo, mats);
        m.position.set(px, py + 1.3, pz);
        this.group.add(m);

        const ringMat = new THREE.MeshBasicMaterial({ color: 0xFFEB3B, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px, py + 0.05, pz);
        this.group.add(ring);

        const beamMat = new THREE.MeshBasicMaterial({ color: 0xFFEB3B, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(px, py + 2.0, pz);
        this.group.add(beam);

        this.itemBoxes.push({ mesh: m, ring, beam, x: px, z: pz, y: py, active: true, respawn: 0 });
      });
    }
  },

  _buildBoostPads() {
    const n = this.pathPoints.length;
    const positions = [0.08, 0.22, 0.38, 0.54, 0.68, 0.84];
    const padTex = this._makeBoostPadTexture();
    const padGeo = new THREE.PlaneGeometry(6, 8);
    const arrowGeo = new THREE.ConeGeometry(2.0, 0.4, 4);

    for (const t of positions) {
      const idx = Math.floor(t * n);
      const cur = this.pathPoints[idx];
      const next = this.pathPoints[(idx + 1) % n];
      const { nx, nz } = this._segNorm[idx];
      const py = this._getTrackY(idx);
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const dirX = dx / len, dirZ = dz / len;

      for (const off of [-this.width * 0.35, this.width * 0.35]) {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const mat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true });
        const mesh = new THREE.Mesh(padGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(px, py + 0.08, pz);
        mesh.rotation.z = Math.atan2(dirX, dirZ);
        this.group.add(mesh);

        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.7 });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.set(px, py + 0.22, pz);
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = Math.atan2(dirX, dirZ);
        this.group.add(arrow);

        this.boostPads.push({
          mesh, arrow, x: px, z: pz, y: py, dirX, dirZ,
          radius: 3.2,
          _phase: Math.random() * Math.PI * 2,
          _lastTrigger: new Map(),
        });
      }
    }
  },

  _makeBoostPadTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#ff3300');
    grad.addColorStop(0.5, '#ffeb3b');
    grad.addColorStop(1, '#b71c1c');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const y = 14 + i * 18;
      ctx.beginPath();
      ctx.moveTo(10, y + 9);
      ctx.lineTo(32, y - 4);
      ctx.lineTo(54, y + 9);
      ctx.lineTo(47, y + 9);
      ctx.lineTo(32, y + 1);
      ctx.lineTo(17, y + 9);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
  },

  // ===== 💨 間欠泉ジャンプ台 =====
  _buildJumpPads() {
    const n = this.pathPoints.length;
    const positions = [0.16, 0.42, 0.66, 0.90]; // 4箇所に増設 (前作:3)
    const padTex = this._makeGeyserPadTexture();

    // 共有ジオメトリ
    const ringGeo = new THREE.CylinderGeometry(3.2, 3.6, 0.5, 12);
    const innerGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.05, 12);

    for (const t of positions) {
      const idx = Math.floor(t * n);
      const cur = this.pathPoints[idx];
      const next = this.pathPoints[(idx + 1) % n];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const dirX = dx / len, dirZ = dz / len;
      const py = this._getTrackY(idx);

      const px = cur.x, pz = cur.z;

      // 岩のリング (間欠泉の口)
      const ringMat = new THREE.MeshLambertMaterial({ color: 0x4a3530 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(px, py + 0.25, pz);
      this.group.add(ringMesh);

      // 内側の光る溶岩面
      const innerMat = new THREE.MeshBasicMaterial({ map: padTex });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.set(px, py + 0.32, pz);
      this.group.add(inner);

      // 蒸気エフェクト (シンプル円柱でフェイク - 動的に伸縮)
      const steamGeo = new THREE.CylinderGeometry(0.6, 2.2, 6, 6, 1, true);
      const steamMat = new THREE.MeshBasicMaterial({
        color: 0xffccaa, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      });
      const steam = new THREE.Mesh(steamGeo, steamMat);
      steam.position.set(px, py + 3.0, pz);
      this.group.add(steam);

      this.jumpPads.push({
        mesh: ringMesh, glow: inner, steam, x: px, z: pz, y: py, dirX, dirZ, idx,
        radius: 4.0,
        _phase: Math.random() * Math.PI * 2,
        _lastTrigger: new Map(),
      });
    }
  },

  _buildAerialGuides() {
    if (!this.jumpPads || this.jumpPads.length === 0) return;
    const ringGeo = new THREE.TorusGeometry(1.25, 0.12, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.78 });
    const arrowGeo = new THREE.ConeGeometry(0.75, 1.8, 4);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffca28, transparent: true, opacity: 0.9 });

    for (const p of this.jumpPads) {
      const baseIdx = p.idx || 0;
      const markers = [5, 10, 15];
      for (let m = 0; m < markers.length; m++) {
        const i = (baseIdx + markers[m]) % this.pathPoints.length;
        const cur = this.pathPoints[i];
        const next = this.pathPoints[(i + 3) % this.pathPoints.length];
        const dx = next.x - cur.x;
        const dz = next.z - cur.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        const y = this._getTrackY(i) + (2.8 - m * 0.8);

        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(cur.x, y, cur.z);
        ring.rotation.x = Math.PI / 2;
        this.group.add(ring);

        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.set(cur.x + ux * 1.6, y, cur.z + uz * 1.6);
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = Math.atan2(ux, uz);
        this.group.add(arrow);
      }
    }
  },

  _makeGeyserPadTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, '#ffffaa');
    grad.addColorStop(0.4, '#ffaa33');
    grad.addColorStop(1, '#cc3300');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    // 上向き矢印
    ctx.fillStyle = '#fff8e0';
    ctx.strokeStyle = '#5a1a00'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(52, 36);
    ctx.lineTo(40, 36);
    ctx.lineTo(40, 56);
    ctx.lineTo(24, 56);
    ctx.lineTo(24, 36);
    ctx.lineTo(12, 36);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    return new THREE.CanvasTexture(c);
  },

  // ===== 溶岩割れ目ショートカット (前作の芝ショートカットを溶岩割れ目に) =====
  _buildShortcuts() {
    const n = this.pathPoints.length;
    const shortcuts = [
      { from: Math.floor(n * 0.10), to: Math.floor(n * 0.18) },
      { from: Math.floor(n * 0.55), to: Math.floor(n * 0.63) },
    ];
    const tex = this._makeFissureTexture();
    for (const sc of shortcuts) {
      const a = this.pathPoints[sc.from];
      const b = this.pathPoints[sc.to];
      const an = this._segNorm[sc.from];
      const bn = this._segNorm[sc.to];
      const off = -this.width * 1.05;
      const ax = a.x + an.nx * off, az = a.z + an.nz * off;
      const bx = b.x + bn.nx * off, bz = b.z + bn.nz * off;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const ang = Math.atan2(dx, dz);
      const geo = new THREE.PlaneGeometry(8, len);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = ang;
      m.position.set(cx, ((this._getTrackY(sc.from) + this._getTrackY(sc.to)) * 0.5) + 0.03, cz);
      this.group.add(m);

      this.shortcuts.push({
        x: cx, z: cz, halfLen: len / 2, halfWid: 4, ang,
        cosA: Math.cos(ang), sinA: Math.sin(ang),
      });
    }
  },

  _makeFissureTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    // 黒い岩 + 中央に赤い割れ目
    ctx.fillStyle = '#15100e';
    ctx.fillRect(0, 0, 64, 64);
    const grad = ctx.createLinearGradient(0, 24, 0, 40);
    grad.addColorStop(0, 'rgba(255, 90, 20, 0.0)');
    grad.addColorStop(0.5, 'rgba(255, 180, 50, 1.0)');
    grad.addColorStop(1, 'rgba(255, 90, 20, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 24, 64, 16);
    // 細かいヒビ
    ctx.strokeStyle = '#ff7733';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 64, 30 + Math.random() * 4);
      ctx.lineTo(Math.random() * 64, 30 + Math.random() * 4);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },

  // ===== 🌋 溶岩プール (ハザード: スリップ+ダメージ) =====
  _buildLavaPools() {
    const n = this.pathPoints.length;
    const positions = [0.28, 0.50, 0.76];
    const lavaTex = this._makeLavaTexture();
    const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex });
    const lavaGeo = new THREE.CircleGeometry(2.4, 12);

    for (const t of positions) {
      const idx = Math.floor(t * n);
      const cur = this.pathPoints[idx];
      const { nx, nz } = this._segNorm[idx];
      const py = this._getTrackY(idx);
      // 端寄りに配置 (ライン取りで避けられる)
      const off = (Math.random() < 0.5 ? -1 : 1) * this.width * 0.55;
      const px = cur.x + nx * off;
      const pz = cur.z + nz * off;

      const m = new THREE.Mesh(lavaGeo, lavaMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(px, py + 0.04, pz);
      this.group.add(m);

      // 周りに光のリング
      const glowGeo = new THREE.RingGeometry(2.4, 3.0, 16);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7700, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(px, py + 0.06, pz);
      this.group.add(glow);

      this.lavaPools.push({
        mesh: m, glow, x: px, z: pz, y: py, radius: 2.6,
        _phase: Math.random() * Math.PI * 2,
        _lastTrigger: new Map(),
      });
    }
  },

  _makeLavaTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, '#fff89a');
    grad.addColorStop(0.3, '#ffaa00');
    grad.addColorStop(0.7, '#ff3300');
    grad.addColorStop(1, '#8b1500');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    // 黒い岩のかたまり
    ctx.fillStyle = 'rgba(20, 10, 8, 0.8)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return new THREE.CanvasTexture(c);
  },

  // ===== 🪨 転がる溶岩岩 (動く障害物) =====
  _buildBoulders() {
    const n = this.pathPoints.length;
    // コース上を行ったり来たりする岩を3個配置
    const seeds = [
      { idx: Math.floor(n * 0.20), range: 6, speed: 0.7 },
      { idx: Math.floor(n * 0.48), range: 8, speed: 0.9 },
      { idx: Math.floor(n * 0.78), range: 7, speed: 0.8 },
    ];
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x3a2820, emissive: 0x5a1500, emissiveIntensity: 0.4 });
    for (const s of seeds) {
      const m = new THREE.Mesh(this._sharedGeos.boulder, rockMat);
      const cur = this.pathPoints[s.idx];
      const py = this._getTrackY(s.idx);
      m.position.set(cur.x, py + 1.6, cur.z);
      m.scale.setScalar(1.4 + Math.random() * 0.4);
      this.group.add(m);
      this.boulders.push({
        mesh: m,
        baseIdx: s.idx,
        y: py,
        range: s.range,
        speed: s.speed,
        phase: Math.random() * Math.PI * 2,
        offset: 0,         // 横方向オフセット (-width*0.6 .. +width*0.6)
        radius: 1.8,
      });
    }
  },

  // ===== 装飾 (軽量化: 岩柱とクリスタル) =====
  _buildDecorations() {
    const n = this.pathPoints.length;
    const pillarMat = this._sharedMats.rock;
    const lightRockMat = this._sharedMats.rockLight;
    const crystalMat = this._sharedMats.crystal;

    // 岩柱 (前作の木の代わり) — 少なめに配置
    for (let i = 0; i < n; i += 4) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];

      for (let side of [1, -1]) {
        if (Math.random() > 0.5) continue;
        const off = (this.width + 10 + Math.random() * 30) * side;
        const px = cur.x + nx * off + Utils.rand(-3, 3);
        const pz = cur.z + nz * off + Utils.rand(-3, 3);
        // 岩柱
        const pillar = new THREE.Mesh(this._sharedGeos.rockPillar,
          Math.random() < 0.5 ? pillarMat : lightRockMat);
        pillar.position.set(px, 3, pz);
        pillar.rotation.y = Math.random() * Math.PI * 2;
        pillar.scale.set(0.8 + Math.random() * 0.7, 0.8 + Math.random() * 0.6, 0.8 + Math.random() * 0.7);
        this.group.add(pillar);

        // たまにクリスタル
        if (Math.random() < 0.25) {
          const crystal = new THREE.Mesh(this._sharedGeos.crystalShard, crystalMat);
          crystal.position.set(px + Utils.rand(-2, 2), 1.4, pz + Utils.rand(-2, 2));
          crystal.rotation.y = Math.random() * Math.PI * 2;
          crystal.scale.setScalar(0.7 + Math.random() * 0.6);
          this.group.add(crystal);
        }
      }
    }

    // スタート付近に大きめの溶岩柱 2本 (前作の観客スタンド代わり)
    const p = this.pathPoints[0];
    const { nx, nz } = this._segNorm[0];
    for (const side of [1, -1]) {
      const off = (this.width + 10) * side;
      const big = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5, 3.8, 12, 6),
        new THREE.MeshLambertMaterial({ color: 0x2f221c, emissive: 0x5a1500, emissiveIntensity: 0.35 })
      );
      big.position.set(p.x + nx * off, 6, p.z + nz * off);
      this.group.add(big);
      // 頂上の煙 (静的板でフェイク)
      const smokeC = document.createElement('canvas');
      smokeC.width = smokeC.height = 64;
      const sx = smokeC.getContext('2d');
      const sg = sx.createRadialGradient(32, 32, 2, 32, 32, 30);
      sg.addColorStop(0, 'rgba(120,80,60,0.85)');
      sg.addColorStop(1, 'rgba(120,80,60,0)');
      sx.fillStyle = sg; sx.fillRect(0, 0, 64, 64);
      const smokeTex = new THREE.CanvasTexture(smokeC);
      const smokeMat = new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, depthWrite: false });
      const smoke = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), smokeMat);
      smoke.position.set(p.x + nx * off, 14, p.z + nz * off);
      this.group.add(smoke);
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
    if (this.isOnShortcut(x, z)) return false;
    return true;
  },

  isOnShortcut(x, z) {
    for (const sc of this.shortcuts) {
      const rx = x - sc.x, rz = z - sc.z;
      const lx = rx * sc.cosA - rz * sc.sinA;
      const lz = rx * sc.sinA + rz * sc.cosA;
      if (Math.abs(lx) < sc.halfWid && Math.abs(lz) < sc.halfLen) return true;
    }
    return false;
  },

  resolveWalls(x, z, radius, hintIdx = -1) {
    const MAX_TANGENT_DISTANCE = 24;
    const WALL_COLLISION_INSET = 0.18;
    const WALL_EXTRA_PUSHBACK = 0.22;
    const prog = this.getProgress(x, z, hintIdx);
    const idx = prog.index;
    const cur = this.pathPoints[idx];
    const { nx, nz } = this._segNorm[idx];
    const rx = x - cur.x, rz = z - cur.z;
    const lateral = rx * nx + rz * nz;
    const w = this.widthAt(idx);
    const limit = w - radius;

    let bestExcess = -Infinity;
    let bestSeg = null;

    if (Math.abs(lateral) > limit) {
      if (!this.isOnShortcut(x, z)) {
        bestExcess = Math.abs(lateral) - limit;
        bestSeg = { sign: lateral >= 0 ? 1 : -1, nx, nz, lateral, index: idx };
      }
    }

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
      if (tang > MAX_TANGENT_DISTANCE) continue;
      if (Math.abs(latj) > limj) {
        if (this.isOnShortcut(x, z)) continue;
        const excess = Math.abs(latj) - limj;
        if (excess > bestExcess) {
          bestExcess = excess;
          bestSeg = { sign: latj >= 0 ? 1 : -1, nx: seg.nx, nz: seg.nz, lateral: latj, index: j };
        }
      }
    }

    if (bestSeg) {
      const nA = this._segNorm[bestSeg.index];
      const nP = this._segNorm[((bestSeg.index - 1) % n + n) % n];
      const nN = this._segNorm[(bestSeg.index + 1) % n];
      let avgNx = nA.nx + nP.nx + nN.nx;
      let avgNz = nA.nz + nP.nz + nN.nz;
      const avgLen = Math.hypot(avgNx, avgNz) || 1;
      avgNx /= avgLen; avgNz /= avgLen;

      let newX = x - bestSeg.sign * bestSeg.nx * (bestExcess + WALL_COLLISION_INSET);
      let newZ = z - bestSeg.sign * bestSeg.nz * (bestExcess + WALL_COLLISION_INSET);
      newX -= bestSeg.sign * avgNx * WALL_EXTRA_PUSHBACK;
      newZ -= bestSeg.sign * avgNz * WALL_EXTRA_PUSHBACK;

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
    // アイテムボックスのアニメ
    for (const b of this.itemBoxes) {
      if (b.active) {
        b.mesh.rotation.y += dt * 2.2;
        b.mesh.rotation.x += dt * 1.3;
        b.mesh.position.y = b.y + 1.3 + Math.sin(now * 0.003 + b.x * 0.1) * 0.22;
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
    // ブースト盤
    for (const p of this.boostPads) {
      p._phase += dt * 5;
      if (p.arrow) {
        const s = 1 + Math.sin(p._phase) * 0.18;
        p.arrow.scale.set(s, s, s);
        p.arrow.material.opacity = 0.55 + Math.sin(p._phase) * 0.3;
      }
    }
    // 間欠泉 (蒸気がリズミカルに伸びる)
    for (const p of this.jumpPads) {
      p._phase += dt * 4;
      if (p.glow) {
        p.glow.material.opacity = 0.7 + Math.sin(p._phase) * 0.25;
      }
      if (p.steam) {
        const eruption = (Math.sin(p._phase) + 1) * 0.5; // 0..1
        const sy = 0.6 + eruption * 2.2;
        p.steam.scale.y = sy;
        p.steam.position.y = p.y + 3.0 + (sy - 1) * 1.6;
        p.steam.material.opacity = 0.35 + eruption * 0.4;
      }
    }
    // 溶岩プール (脈動)
    for (const lp of this.lavaPools) {
      lp._phase += dt * 2.4;
      if (lp.glow) {
        const s = 1 + Math.sin(lp._phase) * 0.18;
        lp.glow.scale.set(s, s, 1);
        lp.glow.material.opacity = 0.4 + Math.sin(lp._phase) * 0.25;
      }
    }
    // 転がる岩 (左右に往復しながらコース幅をスライド)
    const n = this.pathPoints.length;
    for (const b of this.boulders) {
      b.phase += dt * b.speed;
      const cur = this.pathPoints[b.baseIdx];
      const { nx, nz } = this._segNorm[b.baseIdx];
      const lateral = Math.sin(b.phase) * (this.width * 0.55);
      b.offset = lateral;
      b.mesh.position.x = cur.x + nx * lateral;
      b.mesh.position.y = b.y + 1.6;
      b.mesh.position.z = cur.z + nz * lateral;
      // 転がってる風に回転
      b.mesh.rotation.x += dt * 2.8;
      b.mesh.rotation.z += dt * 1.4;
    }
  },

  checkPads(car, now) {
    let result = { boost: false, jump: false, lava: false };
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
      if (d < p.radius && car.y < p.y + 1.5) {
        const last = p._lastTrigger.get(car.id) || 0;
        if (now - last > 1500) {
          p._lastTrigger.set(car.id, now);
          result.jump = true;
        }
      }
    }
    // 溶岩プール接触
    for (const lp of this.lavaPools) {
      const d = Utils.dist2(car.x, car.z, lp.x, lp.z);
      if (d < lp.radius && car.y < lp.y + 1.5) {
        const last = lp._lastTrigger.get(car.id) || 0;
        if (now - last > 1200) {
          lp._lastTrigger.set(car.id, now);
          result.lava = true;
        }
      }
    }
    return result;
  },

  // 転がる岩との衝突チェック (game.js から毎フレーム呼ぶ用)
  checkBoulderHit(car, now) {
    for (const b of this.boulders) {
      const dx = car.x - b.mesh.position.x;
      const dz = car.z - b.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      const rr = (b.radius + 1.0);
      if (d2 < rr * rr && car.y < b.y + 2.0) {
        return { hit: true, nx: dx / Math.sqrt(d2 || 1), nz: dz / Math.sqrt(d2 || 1) };
      }
    }
    return { hit: false };
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
  };
};
