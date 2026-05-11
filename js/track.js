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

  // 壁衝突用セグメント (外側 / 内側) - 2D 線分
  wallSegmentsOuter: [],
  wallSegmentsInner: [],

  // 進行度キャッシュ
  _segDir: [],   // 各セグメントの単位方向ベクトル {ux, uz}
  _segNorm: [],  // 法線(左方向)

  generate(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // 制御点（楕円風＋ジグザグ）- 大きめスケール
    this.controlPoints = [
      { x:    0, z:  160 },
      { x:  100, z:  150 },
      { x:  180, z:   80 },
      { x:  200, z:  -30 },
      { x:  170, z: -120 },
      { x:   80, z: -170 },
      { x:  -40, z: -180 },
      { x: -140, z: -130 },
      { x: -190, z:  -40 },
      { x: -180, z:   70 },
      { x: -100, z:  150 },
    ];

    // Catmull-Rom補間で滑らかパス生成
    this.pathPoints = this._catmullRomLoop(this.controlPoints, 20);
    this._buildCumLen();
    this._buildSegmentDirs();

    this._buildGround(scene);
    this._buildSkybox(scene);
    this._buildTrack();
    this._buildCurbs();      // 縁石(赤白)
    this._buildBarriers();   // 壁
    this._buildStartLine();
    this._buildItemBoxes();
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
      // 左方向(進行方向に対して左) - 右手系では
      this._segNorm[i] = { nx: -uz, nz: ux };
    }
  },

  // 道路メッシュ：内側・外側の両端点列を作って三角形ストリップ
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

      // 壁線分用に外/内の点を保存
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

    // 中央線
    this._buildCenterLine();
  },

  _makeAsphaltTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5a5a60';
    ctx.fillRect(0, 0, 128, 128);
    // ノイズ
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const g = 70 + Math.random() * 40;
      ctx.fillStyle = `rgb(${g},${g},${g+2})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // 路肩風白線
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

  // 縁石（赤白チェック）- コース内側・外側のエッジ装飾
  _buildCurbs() {
    const n = this.pathPoints.length;
    const curbWidth = 1.4;
    const curbHeight = 0.15;
    // 外側 と 内側
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
        // 赤白縞
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

  // 立体的な壁（衝突判定用）
  _buildBarriers() {
    const n = this.pathPoints.length;
    const curbWidth = 1.4;
    const wallThickness = 0.6;
    const wallHeight = this.wallHeight;

    // 壁ジオメトリ(両側)
    for (const side of [1, -1]) {
      const verts = [];
      const colors = [];
      const idx = [];
      const wallOff1 = side * (this.width + curbWidth);
      const wallOff2 = side * (this.width + curbWidth + wallThickness);

      for (let i = 0; i < n; i++) {
        const cur = this.pathPoints[i];
        const { nx, nz } = this._segNorm[i];
        // 4頂点: 下内側、下外側、上外側、上内側 (1セグメントあたり)
        const xi1 = cur.x + nx * wallOff1, zi1 = cur.z + nz * wallOff1;
        const xi2 = cur.x + nx * wallOff2, zi2 = cur.z + nz * wallOff2;
        verts.push(xi1, 0.15, zi1);          // 0 下内
        verts.push(xi2, 0.15, zi2);          // 1 下外
        verts.push(xi2, wallHeight, zi2);    // 2 上外
        verts.push(xi1, wallHeight, zi1);    // 3 上内

        // 赤白縞色
        const c1 = (Math.floor(i / 3) % 2 === 0) ? [0.92, 0.92, 0.92] : [0.85, 0.15, 0.15];
        for (let k = 0; k < 4; k++) colors.push(c1[0], c1[1], c1[2]);
      }
      for (let i = 0; i < n; i++) {
        const a = i * 4;
        const b = ((i + 1) % n) * 4;
        // 内面 (コース側): 頂点 a+0,a+3 と b+0,b+3
        idx.push(a + 0, b + 0, a + 3, a + 3, b + 0, b + 3);
        // 上面: a+3,a+2,b+3,b+2
        idx.push(a + 3, b + 3, a + 2, a + 2, b + 3, b + 2);
        // 外面
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

    // 上部に黒い線(タイヤバリア風アクセント)
    const topLineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const idx2 = i % n;
        const cur = this.pathPoints[idx2];
        const { nx, nz } = this._segNorm[idx2];
        const off = side * (this.width + 1.4 + 0.6);
        pts.push(new THREE.Vector3(cur.x + nx * off, wallHeight + 0.05, cur.z + nz * off));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(geo, topLineMat));
    }

    // 壁衝突用の境界点列を保存(外側/内側)
    this.wallSegmentsOuter = [];
    this.wallSegmentsInner = [];
    for (let i = 0; i < n; i++) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      const off = this.width; // 路面端 (内壁面)
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

    // チェッカーパターン
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

    const geo = new THREE.PlaneGeometry(this.width * 2, 3.5);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.06, p.z);
    const angle = Math.atan2(dx, dz);
    m.rotation.z = angle;
    this.group.add(m);

    // スタートゲート（アーチ）
    this._buildArch(p.x, p.z, angle);

    this.startAngle = angle;
    this.startX = p.x;
    this.startZ = p.z;
    this.startDirX = dx / len;
    this.startDirZ = dz / len;
    this.startNX = nx;
    this.startNZ = nz;
  },

  _buildArch(x, z, angle) {
    const archMat = new THREE.MeshLambertMaterial({ color: 0xe53935 });
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7, 10), archMat);
    const post2 = post1.clone();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(this.width * 2.4, 0.8, 0.8), archMat);

    const grp = new THREE.Group();
    post1.position.set(-this.width - 1, 3.5, 0);
    post2.position.set(this.width + 1, 3.5, 0);
    beam.position.set(0, 7, 0);
    grp.add(post1, post2, beam);

    // バナー
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
    ctx.fillText('🏁  START / FINISH  🏁', 512, 64);
    const bannerTex = new THREE.CanvasTexture(c);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(this.width * 2.1, 1.6, 0.3),
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
    // 芝
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
    grassTex.repeat.set(40, 40);

    const geo = new THREE.PlaneGeometry(1200, 1200, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: grassTex });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.05;
    m.receiveShadow = true;
    scene.add(m);
  },

  _buildSkybox(scene) {
    // 青空〜地平線グラデ
    const c = document.createElement('canvas');
    c.width = 64; c.height = 512;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#4fc3f7');
    grad.addColorStop(0.55, '#90caf9');
    grad.addColorStop(0.85, '#ffe0b2');
    grad.addColorStop(1, '#ffcc80');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 512);
    // 雲
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
    const skyGeo = new THREE.SphereGeometry(600, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    scene.background = new THREE.Color(0x90caf9);
    scene.fog = new THREE.Fog(0xcfe6ff, 250, 700);
  },

  _buildItemBoxes() {
    const n = this.pathPoints.length;
    const step = Math.floor(n / 10);
    const boxGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);

    // テクスチャ(?マーク)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFEB3B'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff'; ctx.fillRect(6, 6, 116, 116);
    ctx.fillStyle = '#FFEB3B'; ctx.fillRect(10, 10, 108, 108);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 100px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#c62828'; ctx.lineWidth = 6;
    ctx.strokeText('?', 64, 70);
    ctx.fillText('?', 64, 70);
    const tex = new THREE.CanvasTexture(c);

    const boxMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x664400, emissiveIntensity: 0.3 });

    for (let i = 4; i < n; i += step) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];

      // 中央＋左右 3 つ並べる
      const offsets = [-this.width * 0.55, 0, this.width * 0.55];
      offsets.forEach(off => {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const m = new THREE.Mesh(boxGeo, boxMat.clone());
        m.position.set(px, 1.2, pz);
        m.castShadow = true;
        this.group.add(m);
        this.itemBoxes.push({ mesh: m, x: px, z: pz, active: true, respawn: 0 });
      });
    }
  },

  _buildDecorations() {
    // 木をコース外側にランダム配置
    const treeMat1 = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    const treeMat2 = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
    const leafGeo = new THREE.ConeGeometry(2.5, 6, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.6, 2.5, 6);

    const n = this.pathPoints.length;
    for (let i = 0; i < n; i += 2) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];

      for (let side of [1, -1]) {
        if (Math.random() > 0.55) continue;
        const off = (this.width + 12 + Math.random() * 40) * side;
        const px = cur.x + nx * off + Utils.rand(-3, 3);
        const pz = cur.z + nz * off + Utils.rand(-3, 3);
        const trunk = new THREE.Mesh(trunkGeo, treeMat2);
        const leaf = new THREE.Mesh(leafGeo, treeMat1);
        trunk.position.set(px, 1.2, pz);
        leaf.position.set(px, 4.5, pz);
        trunk.castShadow = leaf.castShadow = true;
        this.group.add(trunk);
        this.group.add(leaf);
      }
    }

    // 観客スタンド風のボックスをスタート付近に
    const p = this.pathPoints[0];
    const standColors = [0xffffff, 0xe53935, 0x1976d2, 0xfbc02d];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: standColors[i % standColors.length] });
      const stand = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 3), mat);
      const { nx, nz } = this._segNorm[0];
      const off = this.width + 12;
      stand.position.set(p.x + nx * off + (i - 2.5) * 11, 2, p.z + nz * off);
      stand.rotation.y = this.startAngle;
      this.group.add(stand);

      // 観客(色付きドット)
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
      // 少し前
      audience.position.x -= Math.cos(this.startAngle) * 0.1;
      this.group.add(audience);
    }

    // 看板/旗
    const flagColors = [0xff5252, 0xffd54f, 0x4fc3f7, 0x81c784];
    for (let i = 0; i < n; i += 8) {
      const cur = this.pathPoints[i];
      const { nx, nz } = this._segNorm[i];
      for (const side of [1, -1]) {
        if (Math.random() > 0.5) continue;
        const off = (this.width + 4) * side;
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 6);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
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

  // 進行度計算: 効率的にcurrent indexの近傍だけサーチ
  getProgress(x, z, hintIdx = -1) {
    const n = this.pathPoints.length;
    let best = 0;
    let bestD = Infinity;
    if (hintIdx >= 0) {
      // 近傍探索 (±20点)
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

  // スタートグリッド：count台分の初期位置を返す
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

  // コースから外れているか？
  isOffTrack(x, z, hintIdx = -1) {
    const { dist } = this.getProgress(x, z, hintIdx);
    return dist > this.width;
  },

  // 壁衝突解決：x, z 位置を壁内に押し戻して返す
  // 戻り値: { x, z, hit: bool, normalX, normalZ }
  resolveWalls(x, z, radius, hintIdx = -1) {
    const prog = this.getProgress(x, z, hintIdx);
    // 中心点から法線方向への距離（符号付き）
    const cur = this.pathPoints[prog.index];
    const { nx, nz } = this._segNorm[prog.index];
    // 距離(法線方向の射影)
    const rx = x - cur.x, rz = z - cur.z;
    const lateral = rx * nx + rz * nz; // +側は外側(左), -側は内側(右)
    const limit = this.width - radius;
    if (Math.abs(lateral) > limit) {
      const sign = Math.sign(lateral);
      const excess = Math.abs(lateral) - limit;
      const newX = x - sign * nx * excess;
      const newZ = z - sign * nz * excess;
      return { x: newX, z: newZ, hit: true, nx: -sign * nx, nz: -sign * nz, lateral };
    }
    return { x, z, hit: false, nx: 0, nz: 0, lateral };
  },

  update(dt, now) {
    for (const b of this.itemBoxes) {
      if (b.active) {
        b.mesh.rotation.y += dt * 2.2;
        b.mesh.rotation.x += dt * 1.3;
        b.mesh.position.y = 1.2 + Math.sin(now * 0.003 + b.x * 0.1) * 0.22;
      } else if (now > b.respawn) {
        b.active = true;
        b.mesh.visible = true;
      }
    }
  },

  collectItemBox(x, z, radius = 1.8) {
    for (const b of this.itemBoxes) {
      if (!b.active) continue;
      if (Utils.dist2(x, z, b.x, b.z) < radius) {
        b.active = false;
        b.mesh.visible = false;
        b.respawn = performance.now() + 4000;
        return true;
      }
    }
    return false;
  },
};
