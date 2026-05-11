// ============= 視覚エフェクト拡張 =============
// パーティクル、天候、ポストエフェクト相当(色補正)、画面エフェクトをまとめる
const VFX = {
  scene: null,
  installed: false,

  particles: [],          // 汎用パーティクル
  maxParticles: 200,
  weather: 'clear',       // 'clear' | 'rain' | 'snow' | 'sunset' | 'night'
  rainGroup: null,
  snowGroup: null,
  rainDrops: [],
  snowFlakes: [],

  install(scene) {
    if (this.installed) return;
    this.installed = true;
    this.scene = scene;
  },

  // === ランダム天候を設定 ===
  setWeather(type) {
    this.weather = type;
    this._clearWeather();
    if (!this.scene) return;
    if (type === 'rain') this._setupRain();
    else if (type === 'snow') this._setupSnow();
    else if (type === 'night') this._setupNight();
    else if (type === 'sunset') this._setupSunset();
    else this._setupClear();
  },

  _clearWeather() {
    if (this.rainGroup) { this.scene.remove(this.rainGroup); this.rainGroup = null; this.rainDrops = []; }
    if (this.snowGroup) { this.scene.remove(this.snowGroup); this.snowGroup = null; this.snowFlakes = []; }
  },

  _setupClear() {
    if (this.scene) {
      this.scene.background = new THREE.Color(0x90caf9);
      if (this.scene.fog) this.scene.fog.color = new THREE.Color(0xcfe6ff);
    }
  },

  _setupSunset() {
    if (this.scene) {
      this.scene.background = new THREE.Color(0xff9a6c);
      if (this.scene.fog) {
        this.scene.fog.color = new THREE.Color(0xffb088);
        this.scene.fog.near = 200;
        this.scene.fog.far = 600;
      }
    }
  },

  _setupNight() {
    if (this.scene) {
      this.scene.background = new THREE.Color(0x0d1929);
      if (this.scene.fog) {
        this.scene.fog.color = new THREE.Color(0x16263d);
        this.scene.fog.near = 150;
        this.scene.fog.far = 500;
      }
    }
  },

  _setupRain() {
    this._setupClear();
    if (this.scene) {
      this.scene.background = new THREE.Color(0x607d8b);
      if (this.scene.fog) {
        this.scene.fog.color = new THREE.Color(0x8c9aa3);
        this.scene.fog.near = 100;
        this.scene.fog.far = 400;
      }
    }
    const group = new THREE.Group();
    const dropGeo = new THREE.BufferGeometry();
    const verts = [];
    const N = 600;
    for (let i = 0; i < N; i++) {
      verts.push(
        (Math.random() - 0.5) * 300, 30 + Math.random() * 60, (Math.random() - 0.5) * 300,
        (Math.random() - 0.5) * 300, 28 + Math.random() * 60, (Math.random() - 0.5) * 300,
      );
    }
    dropGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const dropMat = new THREE.LineBasicMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.6 });
    const lines = new THREE.LineSegments(dropGeo, dropMat);
    group.add(lines);
    this.scene.add(group);
    this.rainGroup = group;
    this.rainDrops = { geo: dropGeo, posAttr: dropGeo.attributes.position };
  },

  _setupSnow() {
    this._setupClear();
    if (this.scene) {
      this.scene.background = new THREE.Color(0xcfd8dc);
      if (this.scene.fog) this.scene.fog.color = new THREE.Color(0xe0e0e0);
    }
    const group = new THREE.Group();
    const N = 400;
    const geo = new THREE.BufferGeometry();
    const verts = [];
    for (let i = 0; i < N; i++) {
      verts.push((Math.random() - 0.5) * 300, Math.random() * 80, (Math.random() - 0.5) * 300);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, transparent: true, opacity: 0.85 });
    const pts = new THREE.Points(geo, mat);
    group.add(pts);
    this.scene.add(group);
    this.snowGroup = group;
    this.snowFlakes = { geo, posAttr: geo.attributes.position };
  },

  update(dt, cameraPos) {
    // 雨の更新: 落下 + リサイクル
    if (this.rainDrops && this.rainDrops.posAttr) {
      const arr = this.rainDrops.posAttr.array;
      for (let i = 0; i < arr.length; i += 6) {
        // 2点(線分の上下)を同じ速度で落下
        arr[i + 1] -= dt * 90;
        arr[i + 4] -= dt * 90;
        if (arr[i + 1] < 0) {
          // カメラ周辺に再配置
          const cx = cameraPos ? cameraPos.x : 0;
          const cz = cameraPos ? cameraPos.z : 0;
          const nx = cx + (Math.random() - 0.5) * 200;
          const nz = cz + (Math.random() - 0.5) * 200;
          arr[i] = nx; arr[i + 2] = nz;
          arr[i + 3] = nx; arr[i + 5] = nz;
          arr[i + 1] = 60 + Math.random() * 30;
          arr[i + 4] = 58 + Math.random() * 30;
        }
      }
      this.rainDrops.posAttr.needsUpdate = true;
    }
    // 雪の更新: 落下 + 横揺れ
    if (this.snowFlakes && this.snowFlakes.posAttr) {
      const arr = this.snowFlakes.posAttr.array;
      const tNow = performance.now() * 0.001;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= dt * 8;
        arr[i] += Math.sin(tNow + i) * dt * 1.2;
        if (arr[i + 1] < 0) {
          const cx = cameraPos ? cameraPos.x : 0;
          const cz = cameraPos ? cameraPos.z : 0;
          arr[i]     = cx + (Math.random() - 0.5) * 200;
          arr[i + 2] = cz + (Math.random() - 0.5) * 200;
          arr[i + 1] = 50 + Math.random() * 30;
        }
      }
      this.snowFlakes.posAttr.needsUpdate = true;
    }

    // 汎用パーティクル
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 4 * dt;
      const t = p.life / p.dur;
      if (p.mesh) {
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.material.opacity = Math.max(0, t);
        const s = p.startScale * (1 + (1 - t) * 0.6);
        p.mesh.scale.setScalar(s);
      }
      if (p.life <= 0) {
        if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  },

  // === パーティクル生成 ===
  spawnDebris(x, y, z, color = 0xffa726, count = 8) {
    if (!this.scene) return;
    if (this.particles.length > this.maxParticles) return;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.18 + Math.random() * 0.12, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.particles.push({
        mesh, x, y, z,
        vx: (Math.random() - 0.5) * 10,
        vy: 4 + Math.random() * 8,
        vz: (Math.random() - 0.5) * 10,
        life: 0.7 + Math.random() * 0.5, dur: 1.0,
        startScale: 1,
      });
    }
  },

  // ドリフトタイヤカス
  spawnTireDust(x, y, z, color = 0xeeeeee) {
    if (!this.scene) return;
    if (this.particles.length > this.maxParticles) return;
    const geo = new THREE.SphereGeometry(0.15, 5, 5);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.particles.push({
      mesh, x, y, z,
      vx: (Math.random() - 0.5) * 2,
      vy: 1 + Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 2,
      life: 0.6, dur: 0.6, startScale: 1,
    });
  },

  // ブースト時の熱波(リング)
  spawnHeatWave(x, z, color = 0xff9800) {
    if (!this.scene) return;
    const geo = new THREE.RingGeometry(0.8, 1.1, 24);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.15, z);
    this.scene.add(mesh);
    this.particles.push({
      mesh, x, y: 0.15, z,
      vx: 0, vy: 0, vz: 0,
      life: 0.5, dur: 0.5, startScale: 1,
    });
  },
};
window.VFX = VFX;
