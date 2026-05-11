// ============= レーストラック (3Dコース) =============
const Track = {
  // 中央線の制御点（閉じたループ）
  // ベジェやCatmull-Romではなく、シンプルに2D点列 -> 補間
  controlPoints: [],
  pathPoints: [],   // 補間後の点列 {x, z}
  pathLength: 0,
  cumLen: [],       // 累積距離
  width: 14,        // コース幅(半幅)

  group: null,
  trackMesh: null,
  itemBoxes: [],    // {mesh, pos, active, respawn}

  generate(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // 制御点（楕円風＋ジグザグ）
    this.controlPoints = [
      { x:    0, z:  120 },
      { x:   80, z:  110 },
      { x:  140, z:   60 },
      { x:  160, z:  -20 },
      { x:  130, z:  -90 },
      { x:   60, z: -130 },
      { x:  -30, z: -140 },
      { x: -110, z: -100 },
      { x: -150, z:  -30 },
      { x: -140, z:   50 },
      { x:  -80, z:  110 },
    ];

    // Catmull-Rom補間で滑らかパス生成
    this.pathPoints = this._catmullRomLoop(this.controlPoints, 16);
    this._buildCumLen();

    this._buildGround(scene);
    this._buildTrack();
    this._buildBarriers();
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
    // 閉じる
    const last = this.pathPoints[this.pathPoints.length - 1];
    const first = this.pathPoints[0];
    this.pathLength = this.cumLen[this.cumLen.length - 1] + Utils.dist2(last.x, last.z, first.x, first.z);
  },

  // 道路メッシュ：内側・外側の両端点列を作って三角形ストリップ
  _buildTrack() {
    const verts = [];
    const uvs = [];
    const idx = [];
    const n = this.pathPoints.length;

    for (let i = 0; i < n; i++) {
      const cur = this.pathPoints[i];
      const next = this.pathPoints[(i + 1) % n];
      const dx = next.x - cur.x;
      const dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      // 進行方向に垂直なベクトル（左方向）
      const nx = -dz / len;
      const nz = dx / len;

      verts.push(cur.x + nx * this.width, 0.02, cur.z + nz * this.width); // 左端
      verts.push(cur.x - nx * this.width, 0.02, cur.z - nz * this.width); // 右端
      uvs.push(0, i * 0.5);
      uvs.push(1, i * 0.5);
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

    // チェッカー風テクスチャ
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
    ctx.fillStyle = '#4a4a4f';
    ctx.fillRect(0, 0, 128, 128);
    // ノイズ
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const g = 60 + Math.random() * 35;
      ctx.fillStyle = `rgb(${g},${g},${g+2})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // 路肩風白線
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 0, 124, 128);
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
    const mat = new THREE.LineDashedMaterial({ color: 0xffd54f, dashSize: 3, gapSize: 3, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    this.group.add(line);
  },

  _buildBarriers() {
    const n = this.pathPoints.length;
    const outer = [], inner = [];
    for (let i = 0; i < n; i++) {
      const cur = this.pathPoints[i];
      const next = this.pathPoints[(i + 1) % n];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      outer.push(new THREE.Vector3(cur.x + nx * (this.width + 0.2), 1.0, cur.z + nz * (this.width + 0.2)));
      inner.push(new THREE.Vector3(cur.x - nx * (this.width + 0.2), 1.0, cur.z - nz * (this.width + 0.2)));
    }
    outer.push(outer[0].clone());
    inner.push(inner[0].clone());

    const mkBarrier = (pts) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0xe53935, linewidth: 3 });
      return new THREE.Line(geo, mat);
    };
    this.group.add(mkBarrier(outer));
    this.group.add(mkBarrier(inner));

    // タイヤバリア風の円柱を等間隔に
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.8, 12);
    const step = 8;
    for (let side of [1, -1]) {
      for (let i = 0; i < n; i += step) {
        const cur = this.pathPoints[i];
        const next = this.pathPoints[(i + 1) % n];
        const dx = next.x - cur.x, dz = next.z - cur.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        const px = cur.x + nx * (this.width + 1.2) * side;
        const pz = cur.z + nz * (this.width + 1.2) * side;
        const isStripe = (i / step) % 2 === 0;
        const m = new THREE.Mesh(tireGeo, isStripe ? stripeMat : tireMat);
        m.position.set(px, 0.4, pz);
        m.castShadow = true;
        this.group.add(m);
      }
    }
  },

  _buildStartLine() {
    // pathPoints[0] にスタート/フィニッシュライン
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
    tex.repeat.set(this.width, 0.5);

    const geo = new THREE.PlaneGeometry(this.width * 2, 3);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.05, p.z);
    const angle = Math.atan2(dx, dz);
    m.rotation.z = angle;
    this.group.add(m);

    // スタートゲート（アーチ）
    this._buildArch(p.x, p.z, angle);

    // スタート位置（pathに沿って後ろに少しずらす）
    this.startAngle = angle;
    this.startX = p.x;
    this.startZ = p.z;
    this.startDirX = dx / len;
    this.startDirZ = dz / len;
    this.startNX = nx;
    this.startNZ = nz;
  },

  _buildArch(x, z, angle) {
    const archMat = new THREE.MeshLambertMaterial({ color: 0xff5722 });
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xffeb3b });
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 8), archMat);
    const post2 = post1.clone();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(this.width * 2.4, 0.6, 0.6), archMat);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(this.width * 2.0, 1.2, 0.3), flagMat);

    const grp = new THREE.Group();
    post1.position.set(-this.width - 1, 3, 0);
    post2.position.set(this.width + 1, 3, 0);
    beam.position.set(0, 6, 0);
    flag.position.set(0, 7.0, 0);
    grp.add(post1, post2, beam, flag);
    grp.position.set(x, 0, z);
    grp.rotation.y = angle - Math.PI / 2;
    this.group.add(grp);

    // フラッグテキスト
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffeb3b'; ctx.fillRect(0,0,512,64);
    ctx.fillStyle = '#c62828';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('START / FINISH', 256, 32);
    flag.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) });
  },

  _buildGround(scene) {
    const geo = new THREE.PlaneGeometry(800, 800, 16, 16);
    const mat = new THREE.MeshLambertMaterial({ color: 0x6abe4d });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.05;
    m.receiveShadow = true;
    scene.add(m);

    // 空
    scene.background = new THREE.Color(0xa3d4ff);
    scene.fog = new THREE.Fog(0xa3d4ff, 200, 500);
  },

  _buildItemBoxes() {
    // path に沿って一定間隔でアイテムボックスを配置
    const n = this.pathPoints.length;
    const step = Math.floor(n / 8);
    const boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const boxMat = new THREE.MeshLambertMaterial({ color: 0xffeb3b, emissive: 0x553300 });

    for (let i = 4; i < n; i += step) {
      const cur = this.pathPoints[i];
      const next = this.pathPoints[(i + 1) % n];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;

      // 中央＋左右で3つ並べる（取りやすく）
      const offsets = [-this.width * 0.5, 0, this.width * 0.5];
      offsets.forEach(off => {
        const px = cur.x + nx * off;
        const pz = cur.z + nz * off;
        const m = new THREE.Mesh(boxGeo, boxMat.clone());
        m.position.set(px, 1.0, pz);
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
    const leafGeo = new THREE.ConeGeometry(2, 5, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 6);

    const n = this.pathPoints.length;
    for (let i = 0; i < n; i += 2) {
      const cur = this.pathPoints[i];
      const next = this.pathPoints[(i + 1) % n];
      const dx = next.x - cur.x, dz = next.z - cur.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;

      for (let side of [1, -1]) {
        if (Math.random() > 0.55) continue;
        const off = (this.width + 6 + Math.random() * 30) * side;
        const px = cur.x + nx * off + Utils.rand(-3, 3);
        const pz = cur.z + nz * off + Utils.rand(-3, 3);
        const trunk = new THREE.Mesh(trunkGeo, treeMat2);
        const leaf = new THREE.Mesh(leafGeo, treeMat1);
        trunk.position.set(px, 1.0, pz);
        leaf.position.set(px, 4.0, pz);
        trunk.castShadow = leaf.castShadow = true;
        this.group.add(trunk);
        this.group.add(leaf);
      }
    }

    // 観客スタンド風のボックスをスタート付近に
    const p = this.pathPoints[0];
    const standMat1 = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const standMat2 = new THREE.MeshLambertMaterial({ color: 0xff5722 });
    for (let i = 0; i < 5; i++) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 2), i % 2 === 0 ? standMat1 : standMat2);
      stand.position.set(p.x + (i - 2) * 9, 1.5, p.z + this.width + 8);
      this.group.add(stand);
    }
  },

  // 進行度計算: ワールド座標 → trackパス上の最も近い点インデックス & 距離
  getProgress(x, z) {
    let best = 0;
    let bestD = Infinity;
    const n = this.pathPoints.length;
    for (let i = 0; i < n; i++) {
      const p = this.pathPoints[i];
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return { index: best, dist: Math.sqrt(bestD), totalDist: this.cumLen[best] };
  },

  // スタートグリッド：6台分の初期位置を返す
  getStartPositions(count) {
    const out = [];
    // 後方向（逆向き）に並べる
    const sx = this.startX, sz = this.startZ;
    // 進行方向の反対 = -(dirX, dirZ)
    const backX = -this.startDirX, backZ = -this.startDirZ;
    const sideX = this.startNX, sideZ = this.startNZ;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = (i % 2 === 0) ? -1 : 1;
      const off = (row + 1) * 4.5;
      const sideOff = col * 3.5;
      out.push({
        x: sx + backX * off + sideX * sideOff,
        z: sz + backZ * off + sideZ * sideOff,
        angle: this.startAngle,
      });
    }
    return out;
  },

  // コースから外れているか？
  isOffTrack(x, z) {
    const { dist } = this.getProgress(x, z);
    return dist > this.width;
  },

  update(dt, now) {
    // アイテムボックス回転 & リスポーン
    for (const b of this.itemBoxes) {
      if (b.active) {
        b.mesh.rotation.y += dt * 2;
        b.mesh.position.y = 1.0 + Math.sin(now * 0.003 + b.x * 0.1) * 0.2;
      } else if (now > b.respawn) {
        b.active = true;
        b.mesh.visible = true;
      }
    }
  },

  // アイテムボックス取得（収集された場合）
  collectItemBox(x, z, radius = 1.5) {
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
