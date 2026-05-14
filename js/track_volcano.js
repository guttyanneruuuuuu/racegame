// ============= 🌋 VOLCANO CIRCUIT (火山サーキット) =============
// 軽量化 & スムーズ走行重視リファクタ:
//   - 制御点をクラシック GRAND サーキットと同じく低曲率にして CatmullRom の暴れを抑制
//   - 幅配列 (widthArray) + 曲率に応じた緩衝幅で内壁の自己交差を回避 (すり抜け対策)
//   - 高低差を path 上で連続補間する getSurfaceHeight (高低差バグ対策)
//   - 壁衝突は近傍 -6..+6 セグメントを走査し、最深めり込みで押し戻す
//   - グライダーガイドは『着地ゾーンへ向かう光の柱』にして遠くからでも進行方向が判る
//   - 装飾点数を削減し、マテリアル/ジオメトリを共有して draw call を削減
// 公開APIは従来どおり
window.createTrackVolcano = function () {
  return {
  controlPoints: [],
  pathPoints: [],
  pathLength: 0,
  cumLen: [],
  width: 22,
  widthArray: [],
  wallHeight: 3.0,
  surfaceHeights: [],

  group: null,
  trackMesh: null,
  itemBoxes: [],
  boostPads: [],
  jumpPads: [],
  coins: [],
  oilPads: [],
  shortcuts: [],
  lavaPools: [],
  boulders: [],
  forkBarriers: [],
  geysers: [],

  wallSegmentsOuter: [],
  wallSegmentsInner: [],

  _segDir: [],
  _segNorm: [],
  _sharedMats: {},
  _sharedGeos: {},
  _smokeParticles: [],

  generate(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // 制御点: ヘアピン2つを緩和して曲率を平準化
    // GRAND サーキットと同じく "Catmull-Rom が暴れない" よう、隣接距離を均し、
    // 急な折り返しを 2 段階の中継点で繋いでいる。
    this.controlPoints = [
      { x:    0, z:  170 },   // スタート直線
      { x:   90, z:  175 },
      { x:  170, z:  150 },
      { x:  225, z:   90 },   // 右大カーブ進入
      { x:  240, z:   10 },
      { x:  220, z:  -60 },
      { x:  170, z: -100 },   // ヘアピン1 (緩和)
      { x:  100, z: -100 },
      { x:   40, z:  -55 },   // S字へ復帰
      { x:    0, z:   10 },
      { x:  -60, z:   30 },
      { x: -130, z:    0 },   // 左外周
      { x: -195, z:  -70 },
      { x: -200, z: -150 },
      { x: -150, z: -210 },   // 下端の大カーブ
      { x:  -60, z: -225 },
      { x:   40, z: -210 },
      { x:  130, z: -180 },
      { x:  170, z: -130 },   // ヘアピン2 (緩和: 折返さず大回りに)
      { x:  150, z:  -70 },
      { x:   90, z:  -40 },
      { x:    0, z:   -5 },
      { x:  -70, z:   40 },
      { x: -110, z:  100 },   // 戻り直線
      { x:  -70, z:  155 },
    ];

    // Catmull-Rom の細かさを 16 → 14 に下げて頂点数 (= 壁ポリゴン数) を軽量化
    this.pathPoints = this._catmullRomLoop(this.controlPoints, 14);
    this._buildCumLen();
    this._buildSegmentDirs();
    this._buildWidthArray();        // 幅配列を準備 (Grand 流)
    this._buildSurfaceHeights();    // 連続補間の準備

    this._initSharedAssets();

    this._buildGround(scene);
    this._buildSkybox(scene);
    this._buildTrack();
    this._buildCurbs();
    this._buildBarriers();
    this._buildForkBranchDivider();
    this._buildStartLine();
    this._buildItemBoxes();
    this._buildBoostPads();
    this._buildJumpPads();
    this._buildDirectionArrows();
    this._buildAerialGuides();
    this._buildShortcuts();
    this._buildLavaPools();
    this._buildBoulders();
    this._buildCoins();
    this._buildDecorations();

    return this;
  },

  // ------------------------------------------------------------------
  _initSharedAssets() {
    this._sharedMats.rock      = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
    this._sharedMats.rockLight = new THREE.MeshLambertMaterial({ color: 0x3a3438 });
    this._sharedMats.lava      = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    this._sharedMats.lavaGlow  = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.7, depthWrite: false });
    this._sharedMats.crystal   = new THREE.MeshLambertMaterial({
      color: 0xff7043, emissive: 0xc63d10, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, depthWrite: false,
    });
    // ボルダー用も共有 (前はインライン生成していた)
    this._sharedMats.boulder = new THREE.MeshLambertMaterial({
      color: 0x3a2820, emissive: 0x5a1500, emissiveIntensity: 0.4,
    });
    this._sharedMats.coinFace = new THREE.MeshLambertMaterial({
      color: 0xffd54f, emissive: 0xb28c00, emissiveIntensity: 0.45,
    });
    this._sharedMats.coinEdge = new THREE.MeshLambertMaterial({
      color: 0xffec8b, emissive: 0xc79a00, emissiveIntensity: 0.35,
    });
    this._sharedMats.coinRing = new THREE.MeshBasicMaterial({
      color: 0xffe082, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false,
    });
    // ジオメトリ
    this._sharedGeos.rockPillar   = new THREE.ConeGeometry(2.2, 6, 5);
    this._sharedGeos.smallRock    = new THREE.DodecahedronGeometry(1.1, 0);
    this._sharedGeos.crystalShard = new THREE.OctahedronGeometry(1.4, 0);
    this._sharedGeos.boulder      = new THREE.IcosahedronGeometry(1.6, 0);
    this._sharedGeos.coin         = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 12);
    this._sharedGeos.coinRing     = new THREE.RingGeometry(0.66, 0.88, 12);
    // ガイドリング/矢印共有
    this._sharedGeos.guideRing    = new THREE.TorusGeometry(1.6, 0.18, 6, 14);
    this._sharedGeos.guideArrow   = new THREE.ConeGeometry(1.0, 2.4, 4);
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

  // 幅配列を作成 (Grand と同形式): 急カーブで僅かに広げて自己交差を緩和
  _buildWidthArray() {
    const n = this.pathPoints.length;
    this.widthArray = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n;
      const nxt  = (i + 1) % n;
      const a = this._segDir[prev], b = this._segDir[nxt];
      const dot = a.ux * b.ux + a.uz * b.uz;
      const curveSharp = 1 - Math.max(-1, Math.min(1, dot));
      // ベース 22 + 急カーブで最大 +3 (折り返し点の自己交差防止 & 走りやすさ)
      let w = this.width + curveSharp * 2.4;
      // 中盤に分岐→合流レーンを作るため一時的に拡幅
      const t = i / n;
      if (t >= 0.56 && t <= 0.70) {
        const p = (t - 0.56) / 0.14;
        const smooth = p < 0.5
          ? (p * 2) * (p * 2) * (3 - 2 * (p * 2))
          : (1 - (p - 0.5) * 2) * (1 - (p - 0.5) * 2) * (3 - 2 * (1 - (p - 0.5) * 2));
        w += 7.5 * smooth;
      }
      this.widthArray[i] = w;
    }
    // 平滑化 (急な幅変化を抑制)
    const smoothed = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = this.widthArray[(i - 1 + n) % n];
      const b = this.widthArray[i];
      const c = this.widthArray[(i + 1) % n];
      smoothed[i] = (a + b * 2 + c) / 4;
    }
    this.widthArray = smoothed;
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
    // 序盤: 控えめな高台 (4.5 → 3.5 に下げて走りやすく)
    applyPlateau(0.12, 0.17, 0.21, 0.27, 3.5);
    // 終盤: 高架 (10.5 → 7.5 に下げて急勾配を緩和)
    applyPlateau(0.55, 0.64, 0.71, 0.82, 7.5);

    // さらに 1回ぼかして連続性を確保 (急な勾配でカーが詰まらないように)
    const smoothed = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = this.surfaceHeights[(i - 1 + n) % n];
      const b = this.surfaceHeights[i];
      const c = this.surfaceHeights[(i + 1) % n];
      smoothed[i] = (a + b * 2 + c) / 4;
    }
    this.surfaceHeights = smoothed;
  },

  _getTrackY(i) {
    const n = this.surfaceHeights.length || 1;
    return this.surfaceHeights[((i % n) + n) % n] || 0;
  },

  // 連続的な路面高さ補間 (高低差バグ対策):
  // 最近傍 idx だけでなく、その隣のセグメントへの射影 t で線形補間する。
  getSurfaceHeight(x, z, hintIdx = -1, y = undefined) {
    const prog = this.getProgress(x, z, hintIdx, y);
    const n = this.pathPoints.length;
    if (n < 2) return this._getTrackY(prog.index);
    const i = prog.index;
    const pCur = this.pathPoints[i];
    const pNxt = this.pathPoints[(i + 1) % n];
    const pPrv = this.pathPoints[(i - 1 + n) % n];
    // どちらの方向 (前 or 後) に車があるかを射影で判定
    const fdx = pNxt.x - pCur.x, fdz = pNxt.z - pCur.z;
    const fwdLen = Math.hypot(fdx, fdz) || 1;
    const fwdProj = ((x - pCur.x) * fdx + (z - pCur.z) * fdz) / (fwdLen * fwdLen);
    if (fwdProj >= 0) {
      const t = Math.max(0, Math.min(1, fwdProj));
      return this._getTrackY(i) * (1 - t) + this._getTrackY((i + 1) % n) * t;
    } else {
      const bdx = pPrv.x - pCur.x, bdz = pPrv.z - pCur.z;
      const bwdLen = Math.hypot(bdx, bdz) || 1;
      const bwdProj = ((x - pCur.x) * bdx + (z - pCur.z) * bdz) / (bwdLen * bwdLen);
      const t = Math.max(0, Math.min(1, bwdProj));
      return this._getTrackY(i) * (1 - t) + this._getTrackY((i - 1 + n) % n) * t;
    }
  },

  widthAt(i = 0) {
    const n = this.widthArray.length;
    if (!n) return this.width;
    return this.widthArray[((i % n) + n) % n];
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
      const w = this.widthAt(i);

      verts.push(cur.x + nx * w, y + 0.02, cur.z + nz * w);
      verts.push(cur.x - nx * w, y + 0.02, cur.z - nz * w);
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

    const tex = this._makeVolcanicAsphaltTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.trackMesh = new THREE.Mesh(geo, mat);
    this.group.add(this.trackMesh);

    this._buildCenterLine();
  },

  _makeVolcanicAsphaltTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1d1a1c';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * 64, y = Math.random() * 64;
      const g = 30 + Math.random() * 30;
      ctx.fillStyle = `rgb(${g},${g-5},${g-8})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.strokeStyle = '#5a1e10';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) {
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
    // 1点おきにサンプリングして頂点数半減 (軽量化)
    for (let i = 0; i < n; i += 2) {
      const p = this.pathPoints[i];
      pts.push(new THREE.Vector3(p.x, this._getTrackY(i) + 0.05, p.z));
    }
    pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({ color: 0xff6f00, dashSize: 4, gapSize: 4, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    this.group.add(line);
  },

  _buildDirectionArrows() {
    const n = this.pathPoints.length;
    const spacing = 32; // 28 → 32 (装飾削減)
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
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc107, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
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
        const w = this.widthAt(i);
        const inner = side * w;
        const outer = side * (w + curbWidth);
        verts.push(cur.x + nx * inner, y + 0.05, cur.z + nz * inner);
        verts.push(cur.x + nx * outer, y + curbHeight, cur.z + nz * outer);
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
    const barrierGapMask = this._buildBarrierGapMask();

    for (const side of [1, -1]) {
      const verts = [];
      const colors = [];
      const idx = [];
      for (let i = 0; i < n; i++) {
        const cur = this.pathPoints[i];
        const { nx, nz } = this._segNorm[i];
        const y = this._getTrackY(i);
        const w = this.widthAt(i);
        const wallOff1 = side * (w + curbWidth);
        const wallOff2 = side * (w + curbWidth + wallThickness);
        const xi1 = cur.x + nx * wallOff1, zi1 = cur.z + nz * wallOff1;
        const xi2 = cur.x + nx * wallOff2, zi2 = cur.z + nz * wallOff2;
        verts.push(xi1, y + 0.15, zi1);
        verts.push(xi2, y + 0.15, zi2);
        verts.push(xi2, y + wallHeight, zi2);
        verts.push(xi1, y + wallHeight, zi1);
        const hot = (Math.floor(i / 5) % 4 === 0);
        const c1 = hot ? [0.55, 0.18, 0.08] : [0.22, 0.20, 0.22];
        for (let k = 0; k < 4; k++) colors.push(c1[0], c1[1], c1[2]);
      }
      for (let i = 0; i < n; i++) {
        if (barrierGapMask[i] || barrierGapMask[(i + 1) % n]) continue;
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

    // 壁上端の溶岩ライン (頂点数を半分にして軽量化)
    const topLineMat = new THREE.LineBasicMaterial({ color: 0xff5722 });
    for (const side of [1, -1]) {
      let pts = [];
      const flushTopLine = () => {
        if (pts.length >= 2) {
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          this.group.add(new THREE.Line(geo, topLineMat));
        }
      };
      for (let i = 0; i <= n; i += 2) {
        const idx2 = i % n;
        if (barrierGapMask[idx2]) {
          flushTopLine();
          pts = [];
          continue;
        }
        const cur = this.pathPoints[idx2];
        const { nx, nz } = this._segNorm[idx2];
        const w = this.widthAt(idx2);
        const off = side * (w + curbWidth + wallThickness);
        pts.push(new THREE.Vector3(cur.x + nx * off, this._getTrackY(idx2) + wallHeight + 0.05, cur.z + nz * off));
      }
      flushTopLine();
    }

    this.wallSegmentsOuter = [];
    this.wallSegmentsInner = [];
    for (let i = 0; i < n; i++) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const w = this.widthAt(i);
      this.wallSegmentsOuter.push({ x: cur.x + nx * w, z: cur.z + nz * w });
      this.wallSegmentsInner.push({ x: cur.x - nx * w, z: cur.z - nz * w });
    }
  },

  _buildBarrierGapMask() {
    const n = this.pathPoints.length;
    const mask = new Array(n).fill(false);
    const MIN_SEGMENTS_FOR_GAP_DETECTION = 40;
    if (n < MIN_SEGMENTS_FOR_GAP_DETECTION) return mask;

    // 近接判定は「近すぎる非隣接区間」だけに限定して通常コーナーは維持する。
    const MIN_ABSOLUTE_SEPARATION = 20;
    const MIN_SEPARATION_RATIO = 0.08;
    const NEAR_OVERLAP_THRESHOLD = 6.5;
    const GAP_MARK_RADIUS = 5;

    const minSep = Math.max(MIN_ABSOLUTE_SEPARATION, Math.floor(n * MIN_SEPARATION_RATIO));
    const nearDist2 = NEAR_OVERLAP_THRESHOLD * NEAR_OVERLAP_THRESHOLD;

    for (let i = 0; i < n; i++) {
      const a = this.pathPoints[i];
      for (let j = i + minSep; j < n; j++) {
        const sep = j - i;
        const cyclicSep = Math.min(sep, n - sep);
        if (cyclicSep < minSep) continue;

        const b = this.pathPoints[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        if (dx * dx + dz * dz > nearDist2) continue;

        for (let off = -GAP_MARK_RADIUS; off <= GAP_MARK_RADIUS; off++) {
          mask[(i + off + n) % n] = true;
          mask[(j + off + n) % n] = true;
        }
      }
    }

    return mask;
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

    const geo = new THREE.PlaneGeometry(this.widthAt(0) * 2, 3.5);
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
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1416';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const g = 25 + Math.random() * 35;
      ctx.fillStyle = `rgba(${g}, ${Math.floor(g*0.7)}, ${Math.floor(g*0.6)}, ${0.6 + Math.random()*0.3})`;
      ctx.fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 8; i++) {
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
    rockTex.repeat.set(28, 28);

    const geo = new THREE.PlaneGeometry(700, 700, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: rockTex });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.05;
    scene.add(m);

    // 遠景の溶岩湖
    const lavaGeo = new THREE.RingGeometry(280, 360, 24);
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const lava = new THREE.Mesh(lavaGeo, lavaMat);
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -0.02;
    scene.add(lava);
  },

  _buildSkybox(scene) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#3a1010');
    grad.addColorStop(0.4, '#8b2a10');
    grad.addColorStop(0.7, '#d96030');
    grad.addColorStop(1, '#2a1a14');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 256);
    ctx.fillStyle = 'rgba(60, 40, 35, 0.7)';
    for (let i = 0; i < 6; i++) {
      const y = 20 + Math.random() * 80;
      const x = Math.random() * 32;
      const r = 4 + Math.random() * 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.5, y + 2, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    const skyGeo = new THREE.SphereGeometry(420, 16, 10);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    scene.background = new THREE.Color(0x3a1a18);
    scene.fog = new THREE.Fog(0x4a2218, 180, 480);
  },

  _buildItemBoxes() {
    const n = this.pathPoints.length;
    const step = Math.floor(n / 8);

    // ?マークの単一テクスチャを共有 (前は6色×6面ぶん作っていた)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 6, 32, 32, 40);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, '#FFD740');
    g.addColorStop(1, '#FF6F00');
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
    // 6面とも同じマテリアルを共有 — 軽量化
    const itemMat = new THREE.MeshLambertMaterial({
      map: tex, emissive: new THREE.Color(0xff8a00), emissiveIntensity: 0.35,
    });
    const boxGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
    const ringGeo = new THREE.RingGeometry(1.4, 1.85, 12);
    const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, 4, 6, 1, true);
    // ring/beam マテリアルも共有
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xFFEB3B, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xFFEB3B, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });

    for (let i = 4; i < n; i += step) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const py = this._getTrackY(i);
      const w = this.widthAt(i);

      const pattern = Math.floor(i / step) % 4;
      const offsets = (pattern === 1 || pattern === 3)
        ? [-w * 0.48, w * 0.48]   // たまに2個
        : [-w * 0.55, 0, w * 0.55];
      offsets.forEach(off => {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const m = new THREE.Mesh(boxGeo, itemMat);
        m.position.set(px, py + 1.3, pz);
        this.group.add(m);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px, py + 0.05, pz);
        this.group.add(ring);
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(px, py + 2.0, pz);
        this.group.add(beam);
        this.itemBoxes.push({ mesh: m, ring, beam, x: px, z: pz, y: py, active: true, respawn: 0 });
      });
    }
  },

  _buildForkBranchDivider() {
    this.forkBarriers = [];
    const n = this.pathPoints.length;
    const startT = 0.58;
    const endT = 0.67;
    const count = 9;
    const geo = this._sharedGeos.smallRock || new THREE.DodecahedronGeometry(1.1, 0);
    const mat = this._sharedMats.rockLight || new THREE.MeshLambertMaterial({ color: 0x3a3438 });

    for (let k = 0; k < count; k++) {
      const t = startT + (endT - startT) * (k / (count - 1));
      const idx = Math.floor(t * n) % n;
      const p = this.pathPoints[idx];
      const y = this._getTrackY(idx);
      const { nx, nz } = this._segNorm[idx];
      const lateralOffset = (k % 2 === 0 ? -1 : 1) * 0.7;
      const x = p.x + nx * lateralOffset;
      const z = p.z + nz * lateralOffset;

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 1.1, z);
      mesh.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
      mesh.scale.set(1.45, 1.15, 1.45);
      this.group.add(mesh);

      this.forkBarriers.push({ mesh, x, z, y, radius: 1.85 });
    }
  },

  _buildBoostPads() {
    const n = this.pathPoints.length;
    // ブーストパッドを増設 (6 → 10) + ストレート区間を意識した配置
    const positions = [0.06, 0.16, 0.22, 0.35, 0.42, 0.54, 0.62, 0.72, 0.84, 0.92];
    const padTex = this._makeBoostPadTexture();
    const padGeo = new THREE.PlaneGeometry(6, 8);
    const arrowGeo = new THREE.ConeGeometry(2.0, 0.4, 4);
    // 共有マテリアル (装飾色は同じ)
    const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false });

    for (const t of positions) {
      const idx = Math.floor(t * n);
      const cur = this.pathPoints[idx];
      const next = this.pathPoints[(idx + 1) % n];
      const { nx, nz } = this._segNorm[idx];
      const py = this._getTrackY(idx);
      const w = this.widthAt(idx);
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const dirX = dx / len, dirZ = dz / len;

      for (const off of [-w * 0.35, w * 0.35]) {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const mesh = new THREE.Mesh(padGeo, padMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(px, py + 0.12, pz);
        mesh.rotation.z = Math.atan2(dirX, dirZ);
        this.group.add(mesh);

        // 矢印は個別マテリアル (アニメするため)
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.7, depthWrite: false });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.set(px, py + 0.26, pz);
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
    // ジャンプ台を増設 (4 → 6) で空中アクションを増加
    const positions = [0.13, 0.26, 0.44, 0.58, 0.74, 0.90];
    const padTex = this._makeGeyserPadTexture();

    const ringGeo = new THREE.CylinderGeometry(3.2, 3.6, 0.5, 10);
    const innerGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.05, 10);
    const ringMat = new THREE.MeshLambertMaterial({ color: 0x4a3530 });
    const innerMat = new THREE.MeshBasicMaterial({ map: padTex });
    const steamGeo = new THREE.CylinderGeometry(0.6, 2.2, 6, 6, 1, true);

    for (const t of positions) {
      const idx = Math.floor(t * n);
      const cur = this.pathPoints[idx];
      const next = this.pathPoints[(idx + 1) % n];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const dirX = dx / len, dirZ = dz / len;
      const py = this._getTrackY(idx);

      const px = cur.x, pz = cur.z;

      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(px, py + 0.25, pz);
      this.group.add(ringMesh);

      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.set(px, py + 0.32, pz);
      this.group.add(inner);

      // 蒸気エフェクトは個別マテリアル (アニメ用)
      const steamMat = new THREE.MeshBasicMaterial({
        color: 0xffccaa, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
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

  // ★ グライダー方向ガイド (再設計)
  //   従来の "3つの小さいリング" は飛距離に対して短すぎ、空中で目印が見えない問題があった。
  //   - 各ジャンプ台の "着地予想ポイント" (進行方向 ~25 path-index 先) に
  //     大きな縦長の "光の柱" + リング + 巨大矢印 を立てる。
  //   - 光の柱は地面から空高くまで伸び、フォグでも見える色 (鮮やかな黄色)。
  //   - 進行方向に向けた矢印が空中に浮かぶ。
  _buildAerialGuides() {
    if (!this.jumpPads || this.jumpPads.length === 0) return;
    const n = this.pathPoints.length;
    // 共有素材
    const pillarGeo = new THREE.CylinderGeometry(0.35, 0.35, 14, 6, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffe082, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.85, depthWrite: false });
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffca28, transparent: true, opacity: 0.95, depthWrite: false });

    for (const p of this.jumpPads) {
      const baseIdx = p.idx || 0;
      // 着地ゾーン (Math.floor(n*0.08) ~= 飛距離分先)
      const landIdx = (baseIdx + Math.max(20, Math.floor(n * 0.07))) % n;
      const land = this.pathPoints[landIdx];
      const next = this.pathPoints[(landIdx + 3) % n];
      const dx = next.x - land.x, dz = next.z - land.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      const groundY = this._getTrackY(landIdx);

      // 光の柱 (中央に1本)
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(land.x, groundY + 7, land.z);
      this.group.add(pillar);

      // 3段の同心リング (低・中・高) で着地ターゲット感
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(this._sharedGeos.guideRing, ringMat);
        ring.position.set(land.x, groundY + 2.5 + r * 2.5, land.z);
        ring.rotation.x = Math.PI / 2;
        this.group.add(ring);
      }

      // 大型矢印 (進行方向を指す)
      const arrow = new THREE.Mesh(this._sharedGeos.guideArrow, arrowMat);
      arrow.position.set(land.x + ux * 2.4, groundY + 4.5, land.z + uz * 2.4);
      // ConeGeometry はデフォルトで Y 軸方向に尖るので、横に倒して進行方向へ向ける
      arrow.rotation.z = -Math.PI / 2;
      arrow.rotation.y = Math.atan2(ux, uz);
      this.group.add(arrow);
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

  // ===== 溶岩割れ目ショートカット =====
  _buildShortcuts() {
    const n = this.pathPoints.length;
    const shortcuts = [
      { from: Math.floor(n * 0.10), to: Math.floor(n * 0.18) },
      { from: Math.floor(n * 0.55), to: Math.floor(n * 0.63) },
    ];
    const tex = this._makeFissureTexture();
    const fissureMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false });
    for (const sc of shortcuts) {
      const a = this.pathPoints[sc.from];
      const b = this.pathPoints[sc.to];
      const an = this._segNorm[sc.from];
      const bn = this._segNorm[sc.to];
      const wA = this.widthAt(sc.from);
      const wB = this.widthAt(sc.to);
      const off = -((wA + wB) * 0.5) * 1.05;
      const ax = a.x + an.nx * off, az = a.z + an.nz * off;
      const bx = b.x + bn.nx * off, bz = b.z + bn.nz * off;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const ang = Math.atan2(dx, dz);
      const geo = new THREE.PlaneGeometry(8, len);
      const m = new THREE.Mesh(geo, fissureMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = ang;
      m.position.set(cx, ((this._getTrackY(sc.from) + this._getTrackY(sc.to)) * 0.5) + 0.06, cz);
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
    ctx.fillStyle = '#15100e';
    ctx.fillRect(0, 0, 64, 64);
    const grad = ctx.createLinearGradient(0, 24, 0, 40);
    grad.addColorStop(0, 'rgba(255, 90, 20, 0.0)');
    grad.addColorStop(0.5, 'rgba(255, 180, 50, 1.0)');
    grad.addColorStop(1, 'rgba(255, 90, 20, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 24, 64, 16);
    ctx.strokeStyle = '#ff7733';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 64, 30 + Math.random() * 4);
      ctx.lineTo(Math.random() * 64, 30 + Math.random() * 4);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },

  _buildLavaPools() {
    const n = this.pathPoints.length;
    // 溶岩プールを増設 (3 → 5)。位置はジャンプ台/ブーストパッドと重ならないように調整
    const positions = [0.20, 0.32, 0.48, 0.66, 0.80];
    const lavaTex = this._makeLavaTexture();
    const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex });
    const lavaGeo = new THREE.CircleGeometry(2.4, 10);
    const glowGeo = new THREE.RingGeometry(2.4, 3.0, 12);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7700, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

    // 既存の重なりバグ防止: 位置をパスインデックスで決定的に左右配分する
    let toggle = 0;
    for (const t of positions) {
      const idx = Math.floor(t * n);
      const cur = this.pathPoints[idx];
      const { nx, nz } = this._segNorm[idx];
      const py = this._getTrackY(idx);
      const w = this.widthAt(idx);
      // 左右交互に配置 (Math.random は決定論的でないため壁/パッド重なりが偶発する問題を回避)
      const off = (toggle++ % 2 === 0 ? -1 : 1) * w * 0.55;
      const px = cur.x + nx * off;
      const pz = cur.z + nz * off;

      const m = new THREE.Mesh(lavaGeo, lavaMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(px, py + 0.04, pz);
      this.group.add(m);

      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(px, py + 0.06, pz);
      this.group.add(glow);

      this.lavaPools.push({
        mesh: m, glow, x: px, z: pz, y: py, radius: 2.6,
        _phase: Math.random() * Math.PI * 2,
        _lastTrigger: new Map(),
        // 周期的に明滅 (脈動) してプレイヤーに事前警告
        _pulsePhase: Math.random() * Math.PI * 2,
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
    ctx.fillStyle = 'rgba(20, 10, 8, 0.8)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return new THREE.CanvasTexture(c);
  },

  _buildBoulders() {
    const n = this.pathPoints.length;
    const seeds = [
      { idx: Math.floor(n * 0.22), range: 6, speed: 0.7 },
      { idx: Math.floor(n * 0.50), range: 7, speed: 0.85 },
      { idx: Math.floor(n * 0.78), range: 6, speed: 0.8 },
    ];
    const rockMat = this._sharedMats.boulder;
    for (const s of seeds) {
      const m = new THREE.Mesh(this._sharedGeos.boulder, rockMat);
      const cur = this.pathPoints[s.idx];
      const py = this._getTrackY(s.idx);
      m.position.set(cur.x, py + 1.6, cur.z);
      m.scale.setScalar(1.4 + Math.random() * 0.3);
      this.group.add(m);
      this.boulders.push({
        mesh: m,
        baseIdx: s.idx,
        y: py,
        range: s.range,
        speed: s.speed,
        phase: Math.random() * Math.PI * 2,
        offset: 0,
        radius: 1.8,
      });
    }
  },

  _buildCoins() {
    const n = this.pathPoints.length;
    const step = 9;
    const coinGeo = this._sharedGeos.coin;
    const ringGeo = this._sharedGeos.coinRing;
    const coinMats = [this._sharedMats.coinEdge, this._sharedMats.coinFace, this._sharedMats.coinFace];
    const ringMat = this._sharedMats.coinRing;

    let pattern = 0;
    for (let i = 10; i < n; i += step) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const py = this._getTrackY(i);
      const w = this.widthAt(i);
      const p = pattern % 3;
      const offsets = (p === 0) ? [0] : (p === 1 ? [-w * 0.38, w * 0.38] : [-w * 0.4, 0, w * 0.4]);

      for (const off of offsets) {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const coin = new THREE.Mesh(coinGeo, coinMats);
        coin.position.set(px, py + 1.1, pz);
        coin.rotation.x = Math.PI / 2;
        this.group.add(coin);

        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px, py + 0.05, pz);
        this.group.add(ring);

        this.coins.push({
          mesh: coin,
          ring,
          x: px,
          z: pz,
          y: py,
          active: true,
          respawn: 0,
          phase: Math.random() * Math.PI * 2,
        });
      }
      pattern++;
    }
  },

  _buildDecorations() {
    const n = this.pathPoints.length;
    const pillarMat = this._sharedMats.rock;
    const lightRockMat = this._sharedMats.rockLight;
    const crystalMat = this._sharedMats.crystal;

    // 装飾密度を 1/4 → 1/6 に下げて軽量化
    for (let i = 0; i < n; i += 6) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      for (let side of [1, -1]) {
        if (Math.random() > 0.5) continue;
        const off = (this.width + 10 + Math.random() * 30) * side;
        const px = cur.x + nx * off + Utils.rand(-3, 3);
        const pz = cur.z + nz * off + Utils.rand(-3, 3);
        const pillar = new THREE.Mesh(this._sharedGeos.rockPillar,
          Math.random() < 0.5 ? pillarMat : lightRockMat);
        pillar.position.set(px, 3, pz);
        pillar.rotation.y = Math.random() * Math.PI * 2;
        pillar.scale.set(0.8 + Math.random() * 0.6, 0.8 + Math.random() * 0.5, 0.8 + Math.random() * 0.6);
        this.group.add(pillar);

        if (Math.random() < 0.2) {
          const crystal = new THREE.Mesh(this._sharedGeos.crystalShard, crystalMat);
          crystal.position.set(px + Utils.rand(-2, 2), 1.4, pz + Utils.rand(-2, 2));
          crystal.rotation.y = Math.random() * Math.PI * 2;
          crystal.scale.setScalar(0.7 + Math.random() * 0.5);
          this.group.add(crystal);
        }
      }
    }

    // スタート付近の大きな溶岩柱 (前作の観客スタンド代わり) — 煙板は1枚だけ共有テクスチャに
    const p = this.pathPoints[0];
    const { nx, nz } = this._segNorm[0];
    const bigGeo = new THREE.CylinderGeometry(2.5, 3.8, 12, 6);
    const bigMat = new THREE.MeshLambertMaterial({ color: 0x2f221c, emissive: 0x5a1500, emissiveIntensity: 0.35 });
    // 煙テクスチャは1枚作って共有
    const smokeC = document.createElement('canvas');
    smokeC.width = smokeC.height = 64;
    const sx = smokeC.getContext('2d');
    const sg = sx.createRadialGradient(32, 32, 2, 32, 32, 30);
    sg.addColorStop(0, 'rgba(120,80,60,0.85)');
    sg.addColorStop(1, 'rgba(120,80,60,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 64, 64);
    const smokeTex = new THREE.CanvasTexture(smokeC);
    const smokeMat = new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, depthWrite: false });
    const smokeGeo = new THREE.PlaneGeometry(8, 8);
    for (const side of [1, -1]) {
      const off = (this.width + 10) * side;
      const big = new THREE.Mesh(bigGeo, bigMat);
      big.position.set(p.x + nx * off, 6, p.z + nz * off);
      this.group.add(big);
      const smoke = new THREE.Mesh(smokeGeo, smokeMat);
      smoke.position.set(p.x + nx * off, 14, p.z + nz * off);
      this.group.add(smoke);
    }
  },

  // 近傍探索の範囲を狭め、最寄りを正確に。さらに射影で連続位置を取れるよう
  // 結果は idx に加えて簡易距離も返している (従来互換)。
  getProgress(x, z, hintIdx = -1, y = undefined) {
    const n = this.pathPoints.length;
    let best = 0;
    let bestScore = Infinity;
    let bestD = Infinity;
    const hasY = Number.isFinite(y);
    // 高架/地上の近接交差で誤レーンを避けるため、縦 1m 差を平面距離 3m 相当として扱う (3^2=9)。
    const HEIGHT_WEIGHT = 9.0;
    // 交差区間で別レーンへ飛び移る誤スナップを抑えるための連続性パラメータ。
    // freeRange: 通常走行で許容するインデックス移動幅
    // continuityWeight: freeRange を超えた移動に対する二乗ペナルティ強度
    const CONTINUITY_FREE_RANGE = 14;
    const CONTINUITY_WEIGHT = 1.6;
    const heightWeight = hasY ? HEIGHT_WEIGHT : 0;
    const wrappedHintIdx = hintIdx >= 0 ? (hintIdx % n) : -1;
    const continuityPenaltyAt = (i) => {
      if (wrappedHintIdx < 0) return 0;
      const absoluteDistance = Math.abs(i - wrappedHintIdx);
      const cyclicDistance = Math.min(absoluteDistance, n - absoluteDistance);
      if (cyclicDistance <= CONTINUITY_FREE_RANGE) return 0;
      const d = cyclicDistance - CONTINUITY_FREE_RANGE;
      // 二乗で効かせることで、小さな揺れは許容しつつ大ジャンプだけ強く抑制する。
      return d * d * CONTINUITY_WEIGHT;
    };
    const consider = (i) => {
      const p = this.pathPoints[i];
      const dxq = p.x - x, dzq = p.z - z;
      const d = dxq * dxq + dzq * dzq;
      const dy = hasY ? (this._getTrackY(i) - y) : 0;
      const score = d + dy * dy * heightWeight + continuityPenaltyAt(i);
      if (score < bestScore || (score === bestScore && d < bestD)) {
        bestScore = score;
        bestD = d;
        best = i;
      }
    };
    if (hintIdx >= 0) {
      // 高速時のすり抜け対策: 近傍範囲を 30 → 40 に拡張
      const range = 40;
      for (let k = -range; k <= range; k++) {
        const i = ((hintIdx + k) % n + n) % n;
        consider(i);
      }
    } else {
      for (let i = 0; i < n; i++) {
        consider(i);
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

  isOffTrack(x, z, hintIdx = -1, y = undefined) {
    const prog = this.getProgress(x, z, hintIdx, y);
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

  // 壁衝突解決 (Grand と同じ堅牢ロジック + 探索範囲拡大 + タンジェント許容拡大):
  // - 近傍 -6..+6 セグメントを走査 (前作 -4..+4)
  // - MAX_TANGENT_DISTANCE を 24 → 28 に拡大して、高速で飛び込んだ際の取りこぼし防止
  // - 押し戻し inset/extra を Grand と同程度に強化 (再すり抜け防止)
  // - 隣接セグメント法線平均で押し戻し方向を安定化 (急カーブで折れない)
  resolveWalls(x, z, radius, hintIdx = -1, y = undefined) {
    // 高速時の取りこぼしを抑えるため検査範囲を少し広めに設定
    const MAX_TANGENT_DISTANCE = 34;
    // 初回押し戻し量を大きめにして再めり込みを防ぐ
    const WALL_COLLISION_INSET = 0.28;
    const WALL_EXTRA_PUSHBACK = 0.38;
    // 二次検証で使う最終押し戻しの最小量
    const VERIFICATION_PUSHBACK = 0.16;
    const prog = this.getProgress(x, z, hintIdx, y);
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
    // 探索範囲拡大: -4..+4 → -6..+6 (急カーブ + 高速での見落とし防止)
    for (let k = -7; k <= 7; k++) {
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
      // 隣接 ±1 の法線も平均して、急カーブで局所法線が暴れても安定して押し戻す
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

      // 二次検証:
      // 初回押し戻し後でも急カーブ連結部では隣接セグメント側に再めり込みすることがあるため、
      // 新しい位置でもう一度最近傍セグメント基準で許容幅内に収める。
      const verify = this.getProgress(newX, newZ, bestSeg.index, y);
      const vIdx = verify.index;
      const vCur = this.pathPoints[vIdx];
      const vNorm = this._segNorm[vIdx];
      const vrx = newX - vCur.x;
      const vrz = newZ - vCur.z;
      const vLateral = vrx * vNorm.nx + vrz * vNorm.nz;
      const vLimit = this.widthAt(vIdx) - radius - 0.02;
      if (Math.abs(vLateral) > vLimit && !this.isOnShortcut(newX, newZ)) {
        const vSign = vLateral >= 0 ? 1 : -1;
        const vExcess = Math.abs(vLateral) - vLimit;
        newX -= vSign * vNorm.nx * (vExcess + VERIFICATION_PUSHBACK);
        newZ -= vSign * vNorm.nz * (vExcess + VERIFICATION_PUSHBACK);
      }

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
        // glow は inner (光面) — マテリアルは個別ではないので opacity アニメは省略可
        // 共有マテリアルなのでここは触らない (パフォーマンス優先)
      }
      if (p.steam) {
        const eruption = (Math.sin(p._phase) + 1) * 0.5;
        const sy = 0.6 + eruption * 2.2;
        p.steam.scale.y = sy;
        p.steam.position.y = p.y + 3.0 + (sy - 1) * 1.6;
        p.steam.material.opacity = 0.35 + eruption * 0.4;
      }
    }
    for (const lp of this.lavaPools) {
      lp._phase += dt * 2.4;
      if (lp.glow) {
        const s = 1 + Math.sin(lp._phase) * 0.18;
        lp.glow.scale.set(s, s, 1);
        // glow マテリアルも共有なので個別 opacity 変更はスキップ
      }
    }
    for (const c of this.coins) {
      if (c.active) {
        c.mesh.rotation.z += dt * 3.2;
        c.mesh.position.y = c.y + 1.1 + Math.sin(now * 0.004 + c.phase) * 0.16;
        if (c.ring) c.ring.material.opacity = 0.36 + Math.sin(now * 0.005 + c.phase) * 0.14;
      } else if (now > c.respawn) {
        c.active = true;
        c.mesh.visible = true;
        if (c.ring) c.ring.visible = true;
      }
    }
    // 転がる岩 (Y を path 上で連続補間して、横移動時の段差を解消)
    for (const b of this.boulders) {
      b.phase += dt * b.speed;
      const cur = this.pathPoints[b.baseIdx];
      const { nx, nz } = this._segNorm[b.baseIdx];
      const lateral = Math.sin(b.phase) * (this.width * 0.55);
      b.offset = lateral;
      const bx = cur.x + nx * lateral;
      const bz = cur.z + nz * lateral;
      // 路面高さも横位置に応じて補間 (前は静的 b.y だった)
      const by = this.getSurfaceHeight(bx, bz, b.baseIdx);
      b.y = by;
      b.mesh.position.x = bx;
      b.mesh.position.y = by + 1.6;
      b.mesh.position.z = bz;
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

  checkBoulderHit(car, now) {
    for (const b of this.forkBarriers) {
      const dx = car.x - b.x;
      const dz = car.z - b.z;
      const d2 = dx * dx + dz * dz;
      const rr = (b.radius + 1.0);
      if (d2 < rr * rr && car.y < b.y + 2.0) {
        return { hit: true, nx: dx / Math.sqrt(d2 || 1), nz: dz / Math.sqrt(d2 || 1) };
      }
    }
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

  collectCoin(x, z, radius = 2.0) {
    for (const c of this.coins) {
      if (!c.active) continue;
      if (Utils.dist2(x, z, c.x, c.z) < radius) {
        c.active = false;
        c.mesh.visible = false;
        if (c.ring) c.ring.visible = false;
        c.respawn = performance.now() + 5500;
        return true;
      }
    }
    return false;
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
