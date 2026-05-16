// ============= トラック選択マネージャ =============
const Track = {
  currentMapId: 'grand',
  active: null,
  maps: {
    grand: {
      label: 'GRAND CIRCUIT',
      subtitle: '元のマップ',
      description: '広いクラシックコース',
      factoryName: 'createTrackGrand',
    },
    volcano: {
      label: 'VOLCANO CIRCUIT',
      subtitle: '新マップ',
      description: '火山ギミックコース',
      factoryName: 'createTrackVolcano',
    },
  },

  normalizeMapId(mapId) {
    const raw = typeof mapId === 'string' ? mapId.trim() : '';
    if (this.maps[raw]) return raw;
    const lower = raw.toLowerCase();
    if (lower === 'volucano') return 'volcano';
    return this.maps[lower] ? lower : 'grand';
  },

  getMapList() {
    return Object.entries(this.maps).map(([id, meta]) => ({ id, ...meta }));
  },

  getMapMeta(mapId = this.currentMapId) {
    const id = this.normalizeMapId(mapId);
    return { id, ...this.maps[id] };
  },

  generate(scene, mapId = this.currentMapId) {
    const id = this.normalizeMapId(mapId);
    const meta = this.maps[id];
    const factory = window[meta.factoryName];
    if (typeof factory !== 'function') {
      throw new Error(`Track factory not found: ${meta.factoryName}`);
    }
    this.currentMapId = id;
    this.active = factory();
    this.active.currentMapId = id;
    this.active.generate(scene);
    return this;
  },

  _delegate(method, fallback, ...args) {
    const active = this.active;
    if (!active || typeof active[method] !== 'function') return fallback;
    return active[method](...args);
  },

  widthAt(i) {
    return this._delegate('widthAt', this.width || 22, i);
  },

  update(dt, now) {
    return this._delegate('update', undefined, dt, now);
  },

  getProgress(x, z, hintIdx = -1) {
    return this._delegate('getProgress', { index: 0, dist: Infinity, totalDist: 0 }, x, z, hintIdx);
  },

  getStartPositions(count) {
    return this._delegate('getStartPositions', [], count);
  },

  isOffTrack(x, z, hintIdx = -1) {
    return this._delegate('isOffTrack', false, x, z, hintIdx);
  },

  isOnShortcut(x, z) {
    return this._delegate('isOnShortcut', false, x, z);
  },

  resolveWalls(x, z, radius, hintIdx = -1) {
    return this._delegate('resolveWalls', { x, z, hit: false, nx: 0, nz: 0, lateral: 0, index: 0 }, x, z, radius, hintIdx);
  },

  checkPads(car, now) {
    return this._delegate('checkPads', { boost: false, jump: false, lava: false, airBoost: false }, car, now);
  },

  checkBoulderHit(car, now) {
    return this._delegate('checkBoulderHit', { hit: false }, car, now);
  },

  collectItemBox(x, z, radius = 2.2) {
    return this._delegate('collectItemBox', false, x, z, radius);
  },

  collectCoin(x, z, radius = 2.0) {
    return this._delegate('collectCoin', false, x, z, radius);
  },

  getSurfaceHeight(x, z, hintIdx = -1) {
    return this._delegate('getSurfaceHeight', 0, x, z, hintIdx);
  },
};

[
  'controlPoints', 'pathPoints', 'pathLength', 'cumLen', 'width', 'widthArray', 'wallHeight',
  'group', 'trackMesh', 'itemBoxes', 'boostPads', 'jumpPads', 'airBoostRings', 'oilPads', 'shortcuts', 'coins',
  'lavaPools', 'boulders', 'geysers', 'wallSegmentsOuter', 'wallSegmentsInner', '_segDir', '_segNorm',
].forEach((prop) => {
  Object.defineProperty(Track, prop, {
    get() {
      return this.active ? this.active[prop] : undefined;
    },
    set(value) {
      if (this.active) this.active[prop] = value;
    },
    configurable: true,
    enumerable: true,
  });
});

window.Track = Track;
