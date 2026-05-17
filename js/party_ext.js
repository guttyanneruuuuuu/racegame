const PartyExt = {
    installed: false,
    settings: {
        events: true,
        gates: true,
        emotes: true,
        assist: true,
        partyItems: true
    },
    gateMeshes: [],
    cannons: [],
    balloons: [],
    burstCoins: [],
    lastEventAt: 0,
    activeEvent: null,
    eventEndsAt: 0,
    partyMeter: 0,
    localCombo: 0,
    hud: {},

    install() {
        if (this.installed) return;
        this.installed = true;
        this._loadSettings();
        this._injectStyles();
        this._patchItems();
        this._patchGame();
        this._patchItemDex();
        this._decorateExistingMenus();
        console.log('PartyExt installed');
    },

    _loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('party-ext-settings') || '{}');
            this.settings = { ...this.settings, ...saved };
        } catch (error) {
            console.warn('PartyExt settings reset', error);
        }
    },

    _saveSettings() {
        localStorage.setItem('party-ext-settings', JSON.stringify(this.settings));
    },

    _injectStyles() {
        if (document.getElementById('party-ext-style')) return;
        const style = document.createElement('style');
        style.id = 'party-ext-style';
        style.textContent = `
            .party-card {
                margin-top: 12px;
                padding: 12px;
                border: 1px solid rgba(255,255,255,.18);
                background: rgba(0,0,0,.32);
                border-radius: 8px;
                color: #fff;
                backdrop-filter: blur(14px);
            }
            .party-card h3 {
                margin: 0 0 8px;
                font-size: clamp(13px, 1.8vw, 16px);
                letter-spacing: 0;
            }
            .party-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
            }
            .party-toggle,
            .party-preset,
            .party-emote {
                min-height: 38px;
                border: 1px solid rgba(255,255,255,.22);
                border-radius: 8px;
                background: rgba(255,255,255,.1);
                color: #fff;
                font-weight: 800;
                cursor: pointer;
                touch-action: manipulation;
            }
            .party-toggle.on {
                background: linear-gradient(135deg, rgba(0,205,172,.78), rgba(255,204,51,.74));
                color: #101820;
            }
            .party-preset {
                width: 100%;
                margin-top: 8px;
                background: rgba(255,204,51,.18);
            }
            .party-hud {
                position: fixed;
                left: max(10px, env(safe-area-inset-left));
                bottom: max(8px, env(safe-area-inset-bottom));
                z-index: 25;
                display: flex;
                gap: 8px;
                align-items: flex-end;
                pointer-events: none;
            }
            .party-meter,
            .tilt-meter {
                width: min(34vw, 180px);
                padding: 8px;
                border: 1px solid rgba(255,255,255,.18);
                border-radius: 8px;
                background: rgba(5,9,18,.66);
                color: white;
                box-shadow: 0 8px 22px rgba(0,0,0,.26);
            }
            .party-meter-label,
            .tilt-label {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                font-weight: 900;
                letter-spacing: 0;
                opacity: .92;
            }
            .party-bar,
            .tilt-track {
                height: 8px;
                margin-top: 5px;
                overflow: hidden;
                border-radius: 999px;
                background: rgba(255,255,255,.16);
            }
            .party-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #00cdac, #ffcc33, #ff5c8a);
                transition: width .18s ease;
            }
            .tilt-dot {
                width: 14px;
                height: 14px;
                margin-top: -3px;
                border-radius: 50%;
                background: #fff;
                box-shadow: 0 0 14px rgba(255,255,255,.75);
                transform: translateX(calc(50% - 7px));
                transition: transform .08s linear;
            }
            .party-emotes {
                position: fixed;
                right: max(9px, env(safe-area-inset-right));
                bottom: max(9px, env(safe-area-inset-bottom));
                z-index: 26;
                display: flex;
                gap: 7px;
            }
            .party-emote {
                width: 42px;
                height: 42px;
                padding: 0;
                font-size: 21px;
                background: rgba(7,10,20,.68);
            }
            .party-banner {
                position: fixed;
                left: 50%;
                top: max(12px, env(safe-area-inset-top));
                z-index: 30;
                padding: 9px 16px;
                border-radius: 999px;
                color: #101820;
                background: linear-gradient(135deg, #fff, #ffcc33);
                font-size: clamp(13px, 2.4vw, 18px);
                font-weight: 950;
                box-shadow: 0 12px 30px rgba(0,0,0,.26);
                opacity: 0;
                transform: translate(-50%, -10px);
                transition: opacity .2s ease, transform .2s ease;
                pointer-events: none;
                white-space: nowrap;
            }
            .party-banner.show {
                opacity: 1;
                transform: translate(-50%, 0);
            }
            @media (orientation: portrait) {
                .party-hud, .party-emotes { bottom: 72px; }
                .party-meter, .tilt-meter { width: 148px; }
                .party-emote { width: 38px; height: 38px; }
            }
        `;
        document.head.appendChild(style);
    },

    _decorateExistingMenus() {
        const addPanels = () => {
            // Real screen ids are screen-title and screen-lobby
            const title = document.getElementById('screen-title');
            const lobby = document.getElementById('screen-lobby');
            this._addPanel(title, 'title');
            this._addPanel(lobby, 'lobby');
        };
        addPanels();
        setTimeout(addPanels, 500);
    },

    _addPanel(parent, key) {
        if (!parent || parent.querySelector(`[data-party-panel="${key}"]`)) return;
        const panel = document.createElement('div');
        panel.className = 'party-card';
        panel.dataset.partyPanel = key;
        panel.innerHTML = `
            <h3>6人パーティー設定</h3>
            <div class="party-grid">
                ${this._toggleMarkup('events', 'イベント')}
                ${this._toggleMarkup('gates', 'ゲート')}
                ${this._toggleMarkup('partyItems', '新アイテム')}
                ${this._toggleMarkup('assist', 'ジャイロ補助')}
            </div>
            <button class="party-preset" type="button" data-party-preset>6人おすすめにする</button>
        `;
        panel.querySelectorAll('[data-party-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                const name = button.dataset.partyToggle;
                this.settings[name] = !this.settings[name];
                button.classList.toggle('on', this.settings[name]);
                button.textContent = `${button.dataset.label}: ${this.settings[name] ? 'ON' : 'OFF'}`;
                this._saveSettings();
            });
        });
        panel.querySelector('[data-party-preset]').addEventListener('click', () => {
            this.settings = {
                events: true,
                gates: true,
                emotes: true,
                assist: true,
                partyItems: true
            };
            this._saveSettings();
            panel.querySelectorAll('[data-party-toggle]').forEach((button) => {
                const name = button.dataset.partyToggle;
                button.classList.toggle('on', this.settings[name]);
                button.textContent = `${button.dataset.label}: ON`;
            });
            localStorage.setItem('race-laps', '2');
            localStorage.setItem('race-weather', 'random');
            localStorage.setItem('race-ai-count', '5');
            this._flash('6人わちゃわちゃ設定をON');
        });
        const anchor = parent.querySelector('.title-content') || parent.querySelector('.lobby-panel') || parent;
        anchor.appendChild(panel);
    },

    _toggleMarkup(name, label) {
        const on = this.settings[name];
        return `<button class="party-toggle ${on ? 'on' : ''}" type="button" data-label="${label}" data-party-toggle="${name}">${label}: ${on ? 'ON' : 'OFF'}</button>`;
    },

    _patchItems() {
        // ItemSystem.ITEMS is an Array of strings (item keys). Party items are stored
        // separately in a meta map and exposed via getDisplay augmentation.
        if (!window.ItemSystem || ItemSystem._partyPatched) return;
        ItemSystem._partyPatched = true;
        const PARTY_META = {
            partyHorn:  { name: 'PARTY HORN', color: '#ffcc33', icon: '📣', description: '前方の相手をスピンさせる音波' },
            bubble:     { name: 'BUBBLE',     color: '#67e8f9', icon: '🫧', description: '短時間守りつつ小ジャンプ' },
            partySwap:  { name: 'P-SWAP',     color: '#a78bfa', icon: '🔁', description: '近い相手と位置を入れ替え' },
            coinStorm:  { name: 'COIN STORM', color: '#fde047', icon: '🪙', description: '周囲にコイン嵐を起こす' },
        };
        this._partyMeta = PARTY_META;
        // augment ITEMS list so they appear in dex (avoid duplicates)
        for (const k of Object.keys(PARTY_META)) {
            if (!ItemSystem.ITEMS.includes(k)) ItemSystem.ITEMS.push(k);
        }
        // augment getDisplay (the actual API used by Game/UI)
        if (typeof ItemSystem.getDisplay === 'function') {
            const orig = ItemSystem.getDisplay.bind(ItemSystem);
            ItemSystem.getDisplay = (item) => {
                if (PARTY_META[item]) {
                    return { emoji: PARTY_META[item].icon, label: PARTY_META[item].name, color: PARTY_META[item].color };
                }
                return orig(item);
            };
        }
        // Patch weightedRoll to occasionally drop a party item when enabled
        if (typeof ItemSystem.weightedRoll === 'function') {
            const origRoll = ItemSystem.weightedRoll.bind(ItemSystem);
            const self = this;
            ItemSystem.weightedRoll = (rank, total) => {
                if (self.settings.partyItems && Math.random() < 0.18) {
                    const backBias = total && rank > Math.max(2, total / 2);
                    const pool = backBias
                        ? ['partySwap', 'partyHorn', 'coinStorm', 'bubble']
                        : ['partyHorn', 'bubble', 'coinStorm'];
                    return pool[Math.floor(Math.random() * pool.length)];
                }
                return origRoll(rank, total);
            };
        }
    },

    _patchGame() {
        if (!window.Game || Game._partyPatched) return;
        Game._partyPatched = true;
        const originalSetupRace = Game.setupRace.bind(Game);
        Game.setupRace = (players, localId, mode, mapId) => {
            // Do NOT auto-fill players in solo — UI already supplies 6 AI cars
            originalSetupRace(players, localId, mode, mapId);
            this._afterRaceSetup();
        };

        const originalLoop = Game.loop.bind(Game);
        Game.loop = () => {
            originalLoop();
            this._update();
        };

        // useItem(car, allCars) is the actual signature
        const originalUseItem = Game.useItem.bind(Game);
        Game.useItem = (car, allCars) => {
            if (car && car.item && this._usePartyItem(car, car.item)) {
                // consume item via Car API
                if (typeof car.consumeItem === 'function') car.consumeItem();
                else car.item = null;
                if (car.isLocal && window.GameUI && GameUI.updateItem) {
                    const held = (typeof car.getHeldItems === 'function') ? car.getHeldItems() : (car.item ? [car.item] : []);
                    GameUI.updateItem(held.length ? held : null);
                }
                return;
            }
            originalUseItem(car, allCars);
        };

        // remote emotes via _emote action
        if (typeof Net !== 'undefined' && Net.on) {
            Net.on('action', (action) => {
                if (action && action.kind === '_emote') {
                    const car = (Game.cars || []).find(c => c.id === action.by);
                    if (car) this._spawnEmote(car, action.emote);
                }
            });
        }
    },

    _getLocalCar() {
        return Game.localCar || null;
    },

    _getCarsArray() {
        return Array.isArray(Game.cars) ? Game.cars : [];
    },

    _getPathPoints() {
        return (window.Track && Track.pathPoints) ? Track.pathPoints : [];
    },

    _fillSoloPlayers(players) {
        // Kept for backward compatibility — but no longer used (UI already fills 6 cars)
        return players;
    },

    _afterRaceSetup() {
        this._resetRuntime();
        this._buildHud();
        this._buildWorldExtras();
        this._flash('PARTY RACE START');
    },

    _resetRuntime() {
        this.gateMeshes = [];
        this.cannons = [];
        this.balloons = [];
        this.burstCoins = [];
        this.partyMeter = 0;
        this.localCombo = 0;
        this.lastEventAt = Date.now();
        this.activeEvent = null;
        this.eventEndsAt = 0;
    },

    _buildHud() {
        document.querySelectorAll('.party-hud,.party-emotes,.party-banner').forEach((node) => node.remove());
        const hud = document.createElement('div');
        hud.className = 'party-hud';
        hud.innerHTML = `
            <div class="party-meter">
                <div class="party-meter-label"><span>PARTY</span><span data-party-meter-text>0%</span></div>
                <div class="party-bar"><div class="party-fill" data-party-fill></div></div>
            </div>
            <div class="tilt-meter">
                <div class="tilt-label"><span>TILT</span><span data-tilt-text>0</span></div>
                <div class="tilt-track"><div class="tilt-dot" data-tilt-dot></div></div>
            </div>
        `;
        document.body.appendChild(hud);
        const banner = document.createElement('div');
        banner.className = 'party-banner';
        document.body.appendChild(banner);
        this.hud = {
            fill: hud.querySelector('[data-party-fill]'),
            meterText: hud.querySelector('[data-party-meter-text]'),
            tiltDot: hud.querySelector('[data-tilt-dot]'),
            tiltText: hud.querySelector('[data-tilt-text]'),
            banner
        };

        if (this.settings.emotes) {
            const emotes = document.createElement('div');
            emotes.className = 'party-emotes';
            ['🔥', '😂', '👍', '👑'].forEach((emote) => {
                const button = document.createElement('button');
                button.className = 'party-emote';
                button.type = 'button';
                button.textContent = emote;
                button.addEventListener('click', () => this._sendEmote(emote));
                emotes.appendChild(button);
            });
            document.body.appendChild(emotes);
        }
    },

    _buildWorldExtras() {
        if (!Game.scene || !this._getPathPoints().length) return;
        if (this.settings.gates) this._buildPartyGates();
        this._buildBalloons();
        this._buildConfettiCannons();
    },

    _buildPartyGates() {
        const points = this._getPathPoints();
        if (!points.length) return;
        const spots = [0.13, 0.26, 0.39, 0.52, 0.65, 0.78, 0.91];
        spots.forEach((t, index) => {
            const position = this._pointAt(t);
            const dir = this._dirAt(t);
            const gate = this._createPartyGate(index, position, dir);
            Game.scene.add(gate);
            this.gateMeshes.push({
                mesh: gate,
                t,
                radius: 13,
                hit: new Set()
            });
        });
    },

    _buildBalloons() {
        const materialSet = [
            new THREE.MeshStandardMaterial({ color: 0xff5c8a, roughness: 0.45 }),
            new THREE.MeshStandardMaterial({ color: 0x00cdac, roughness: 0.45 }),
            new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.45 }),
            new THREE.MeshStandardMaterial({ color: 0x63b3ff, roughness: 0.45 })
        ];
        for (let i = 0; i < 24; i += 1) {
            const t = i / 24;
            const point = this._pointAt(t);
            const normal = this._normalAt(t);
            const side = i % 2 === 0 ? 1 : -1;
            const group = new THREE.Group();
            group.position.set(point.x + normal.x * side * (14 + (i % 3) * 5), 5.8 + (i % 4) * 0.45, point.z + normal.z * side * (14 + (i % 3) * 5));
            const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 16), materialSet[i % materialSet.length]);
            balloon.scale.set(0.86, 1.18, 0.86);
            const string = new THREE.Mesh(
                new THREE.CylinderGeometry(0.025, 0.025, 3, 6),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            string.position.y = -2.2;
            group.add(balloon);
            group.add(string);
            group.userData.baseY = group.position.y;
            group.userData.phase = i * 0.72;
            Game.scene.add(group);
            this.balloons.push(group);
        }
    },

    _buildConfettiCannons() {
        for (let i = 0; i < 10; i += 1) {
            const t = i / 10 + 0.035;
            const point = this._pointAt(t % 1);
            const normal = this._normalAt(t % 1);
            [-1, 1].forEach((side) => {
                const cannon = new THREE.Group();
                cannon.position.set(point.x + normal.x * side * 12, 0.35, point.z + normal.z * side * 12);
                const body = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.35, 0.48, 1.7, 12),
                    new THREE.MeshStandardMaterial({ color: side > 0 ? 0x1f2937 : 0x334155, metalness: 0.4, roughness: 0.35 })
                );
                body.rotation.z = Math.PI / 2.5 * side;
                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(0.52, 0.06, 8, 18),
                    new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.35 })
                );
                ring.position.x = 0.75 * side;
                ring.rotation.y = Math.PI / 2;
                cannon.add(body, ring);
                cannon.userData.nextShot = Date.now() + 1800 + i * 350;
                Game.scene.add(cannon);
                this.cannons.push(cannon);
            });
        }
    },

    _createPartyGate(index, point, dir) {
        const angle = Math.atan2(dir.x, dir.z);
        const group = new THREE.Group();
        group.position.set(point.x, 0, point.z);
        group.rotation.y = angle;
        const accent = [0xff5c8a, 0x00cdac, 0xffcc33, 0x63b3ff][index % 4];
        const postMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.2, roughness: 0.5 });
        const glowMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.75, roughness: 0.25 });
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.65, 5.8, 0.65), postMat);
        const right = left.clone();
        left.position.set(-7.2, 2.9, 0);
        right.position.set(7.2, 2.9, 0);
        const top = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.55, 0.55), glowMat);
        top.position.set(0, 5.9, 0);
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.22, 0.28), glowMat);
        ribbon.position.set(0, 4.55, 0);
        const signCanvas = document.createElement('canvas');
        signCanvas.width = 256;
        signCanvas.height = 96;
        const ctx = signCanvas.getContext('2d');
        ctx.fillStyle = '#101820';
        ctx.fillRect(0, 0, 256, 96);
        ctx.fillStyle = '#ffcc33';
        ctx.font = '900 38px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`PARTY ${index + 1}`, 128, 48);
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(5.2, 1.9),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas), transparent: true, side: THREE.DoubleSide })
        );
        sign.position.set(0, 4.95, -0.05);
        group.add(left, right, top, ribbon, sign);
        group.userData.spin = 0.012 + index * 0.001;
        return group;
    },

    _update() {
        if (!Game.scene || Game.state !== 'racing') return;
        this._updateHud();
        this._animateExtras();
        if (this.settings.gates) this._checkGates();
        if (this.settings.events) this._updateRaceEvent();
        this._updateBurstCoins();
    },

    _updateHud() {
        if (!this.hud.fill) return;
        this.hud.fill.style.width = `${Math.max(0, Math.min(100, this.partyMeter))}%`;
        this.hud.meterText.textContent = `${Math.round(this.partyMeter)}%`;
        if (this.settings.assist && this.hud.tiltDot) {
            // Input is a global module; steer is in [-1, 1]
            const input = (window.Input && typeof Input.steer === 'number') ? Input.steer : 0;
            const x = 50 + Math.max(-1, Math.min(1, input)) * 42;
            this.hud.tiltDot.style.transform = `translateX(calc(${x}% - 7px))`;
            this.hud.tiltText.textContent = input.toFixed(2);
        }
    },

    _animateExtras() {
        const now = performance.now() * 0.001;
        this.balloons.forEach((balloon) => {
            balloon.position.y = balloon.userData.baseY + Math.sin(now * 1.6 + balloon.userData.phase) * 0.34;
            balloon.rotation.y += 0.005;
        });
        this.gateMeshes.forEach((gate, index) => {
            gate.mesh.children.forEach((child) => {
                if (child.material && child.material.emissiveIntensity !== undefined) {
                    child.material.emissiveIntensity = 0.55 + Math.sin(now * 4 + index) * 0.18;
                }
            });
        });
        const ms = Date.now();
        this.cannons.forEach((cannon) => {
            if (ms > cannon.userData.nextShot) {
                this._spawnConfetti(cannon.position);
                cannon.userData.nextShot = ms + 4800 + Math.random() * 3300;
            }
        });
    },

    _checkGates() {
        const cars = this._getCarsArray();
        if (!cars.length) return;
        this.gateMeshes.forEach((gate, gateIndex) => {
            const gatePos = gate.mesh.position;
            cars.forEach((car) => {
                if (!car || !car.mesh || gate.hit.has(car.id)) return;
                const dist = car.mesh.position.distanceTo(gatePos);
                if (dist > gate.radius) return;
                gate.hit.add(car.id);
                this._rewardGatePass(car, gateIndex);
                setTimeout(() => gate.hit.delete(car.id), 2200);
            });
        });
    },

    _rewardGatePass(car, gateIndex) {
        const maxSp = (window.CarPhysics && CarPhysics.MAX_SPEED) || 54;
        car.speed = Math.min(maxSp * 1.25, car.speed + 4.0);
        if (typeof car.addCoin === 'function') car.addCoin(1);
        else car.coins = Math.min(10, (car.coins || 0) + 1);
        this._spawnConfetti(car.mesh.position);
        if (car.isLocal) {
            this.partyMeter = Math.min(100, this.partyMeter + 9);
            this.localCombo += 1;
            this._flash(`GATE BONUS x${this.localCombo}`);
            if (window.SFX) SFX.play('pickup');
            if (this.partyMeter >= 100) {
                this.partyMeter = 20;
                if (!car.item && typeof car.setItem === 'function') car.setItem('coinStorm');
                else if (!car.item) car.item = 'coinStorm';
                this._flash('PARTY ITEM READY');
                if (window.GameUI && GameUI.updateItem) {
                    const held = (typeof car.getHeldItems === 'function') ? car.getHeldItems() : (car.item ? [car.item] : []);
                    GameUI.updateItem(held.length ? held : null);
                }
            }
        }
    },

    _updateRaceEvent() {
        const now = Date.now();
        if (this.activeEvent && now > this.eventEndsAt) {
            this._endEvent();
        }
        if (!this.activeEvent && now - this.lastEventAt > 21000) {
            this._startEvent();
        }
    },

    _startEvent() {
        const events = ['coinRush', 'tailwind', 'itemFever', 'makeNoise'];
        const event = events[Math.floor(Math.random() * events.length)];
        this.activeEvent = event;
        this.eventEndsAt = Date.now() + 10500;
        this.lastEventAt = Date.now();
        const cars = this._getCarsArray();
        const maxSp = (window.CarPhysics && CarPhysics.MAX_SPEED) || 54;
        if (event === 'coinRush') {
            this._flash('COIN RUSH');
            this._spawnCoinLine();
        } else if (event === 'tailwind') {
            this._flash('TAILWIND');
            cars.forEach((car) => {
                car.speed = Math.min(maxSp * 1.35, car.speed + 5.0);
            });
        } else if (event === 'itemFever') {
            this._flash('ITEM BOX FEVER');
            cars.forEach((car, idx) => {
                if (!car.item) {
                    const item = ItemSystem.weightedRoll(idx + 1, cars.length);
                    if (typeof car.setItem === 'function') car.setItem(item);
                    else car.item = item;
                }
            });
            const local = this._getLocalCar();
            if (local && local.isLocal && window.GameUI && GameUI.updateItem) {
                const held = (typeof local.getHeldItems === 'function') ? local.getHeldItems() : (local.item ? [local.item] : []);
                GameUI.updateItem(held.length ? held : null);
            }
        } else {
            this._flash('MAKE SOME NOISE');
            cars.forEach((car) => this._spawnEmote(car, ['🔥', '😂', '👍', '👑'][Math.floor(Math.random() * 4)]));
        }
    },

    _endEvent() {
        this.activeEvent = null;
        this.lastEventAt = Date.now();
        this._flash('EVENT CLEAR');
    },

    _spawnCoinLine() {
        const baseT = Math.random();
        for (let i = 0; i < 20; i += 1) {
            const t = (baseT + i * 0.012) % 1;
            const p = this._pointAt(t);
            const n = this._normalAt(t);
            this._spawnBurstCoin({
                x: p.x + n.x * ((i % 5) - 2) * 1.6,
                y: 1.2,
                z: p.z + n.z * ((i % 5) - 2) * 1.6
            }, 2200 + i * 50);
        }
    },

    _usePartyItem(car, item) {
        if (!this.settings.partyItems) return false;
        if (item === 'partyHorn') { this._partyHorn(car); return true; }
        if (item === 'bubble')    { this._bubble(car);    return true; }
        if (item === 'partySwap') { this._swap(car);      return true; }
        if (item === 'coinStorm') { this._coinStorm(car); return true; }
        return false;
    },

    _partyHorn(car) {
        this._flash('PARTY HORN');
        this._spawnRing(car.mesh.position, 0xffcc33);
        this._getCarsArray().forEach((target) => {
            if (!target || target === car || !target.mesh) return;
            if (target.invincibleTimer > 0 || target.ghostTimer > 0) return;
            const dist = target.mesh.position.distanceTo(car.mesh.position);
            if (dist > 20) return;
            const forward = new THREE.Vector3(Math.sin(car.angle || 0), 0, Math.cos(car.angle || 0));
            const toTarget = target.mesh.position.clone().sub(car.mesh.position).normalize();
            if (forward.dot(toTarget) < 0.12) return;
            target.spinTimer = Math.max(target.spinTimer || 0, 1.45);
            target.speed *= 0.62;
            this._spawnEmote(target, '😂');
        });
    },

    _bubble(car) {
        this._flash('BUBBLE BOOST');
        if (typeof car.giveShield === 'function') car.giveShield(3.5);
        else car.invincibleTimer = Math.max(car.invincibleTimer || 0, 3.5);
        const maxSp = (window.CarPhysics && CarPhysics.MAX_SPEED) || 54;
        car.speed = Math.min(maxSp * 1.22, car.speed + 5.0);
        if (typeof car.applyJump === 'function') car.applyJump(6);
        const bubble = new THREE.Mesh(
            new THREE.SphereGeometry(2.2, 24, 18),
            new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.24, wireframe: true })
        );
        bubble.position.copy(car.mesh.position);
        Game.scene.add(bubble);
        const start = Date.now();
        const animate = () => {
            if (!car.mesh || Date.now() - start > 3500) {
                Game.scene.remove(bubble);
                return;
            }
            bubble.position.copy(car.mesh.position);
            bubble.rotation.y += 0.03;
            requestAnimationFrame(animate);
        };
        animate();
    },

    _swap(car) {
        const target = this._findSwapTarget(car);
        if (!target) {
            this._flash('SWAP MISS');
            return;
        }
        const ax = car.x, az = car.z;
        const bx = target.x, bz = target.z;
        car.x = bx; car.z = bz;
        target.x = ax; target.z = az;
        const tempSpeed = car.speed;
        const maxSp = (window.CarPhysics && CarPhysics.MAX_SPEED) || 54;
        car.speed = Math.max(target.speed || 0, maxSp * 0.35);
        target.speed = Math.max(tempSpeed || 0, maxSp * 0.25);
        this._spawnRing(car.mesh.position, 0xa78bfa);
        this._spawnRing(target.mesh.position, 0xa78bfa);
        this._flash('POSITION SWAP');
    },

    _findSwapTarget(car) {
        const candidates = this._getCarsArray().filter((target) => target && target !== car && target.mesh && !target.finished);
        candidates.sort((a, b) => car.mesh.position.distanceTo(a.mesh.position) - car.mesh.position.distanceTo(b.mesh.position));
        return candidates[0];
    },

    _coinStorm(car) {
        this._flash('COIN STORM');
        if (typeof car.addCoin === 'function') car.addCoin(8);
        else car.coins = Math.min(10, (car.coins || 0) + 8);
        for (let i = 0; i < 24; i += 1) {
            const angle = Math.PI * 2 * (i / 24);
            const radius = 2 + (i % 4) * 1.2;
            this._spawnBurstCoin({
                x: car.mesh.position.x + Math.cos(angle) * radius,
                y: 1.4 + (i % 3) * 0.35,
                z: car.mesh.position.z + Math.sin(angle) * radius
            }, 1300 + Math.random() * 700);
        }
        this._getCarsArray().forEach((target) => {
            if (!target || target === car || !target.mesh) return;
            if (target.invincibleTimer > 0 || target.ghostTimer > 0) return;
            if (target.mesh.position.distanceTo(car.mesh.position) > 15) return;
            if (typeof target.dropCoin === 'function') target.dropCoin(2);
            else target.coins = Math.max(0, (target.coins || 0) - 2);
            target.speed *= 0.78;
            target.spinTimer = Math.max(target.spinTimer || 0, 0.7);
        });
        if (car.isLocal && window.GameUI && GameUI.updateCoins) GameUI.updateCoins(car.coins || 0);
    },

    _sendEmote(emote) {
        const car = this._getLocalCar();
        if (!car) return;
        this._spawnEmote(car, emote);
        if (typeof Net !== 'undefined' && typeof Net.sendAction === 'function' && Game.mode === 'multi') {
            try { Net.sendAction({ kind: '_emote', emote }); } catch (_) {}
        }
    },

    _spawnEmote(car, emote) {
        if (!car || !car.mesh || !Game.scene) return;
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,.42)';
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(10, 10, 108, 108, 24);
            ctx.fill();
        } else {
            ctx.fillRect(10, 10, 108, 108);
        }
        ctx.font = '72px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emote, 64, 64);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
        sprite.position.copy(car.mesh.position).add(new THREE.Vector3(0, 5.2, 0));
        sprite.scale.set(3.5, 3.5, 1);
        Game.scene.add(sprite);
        const start = Date.now();
        const animate = () => {
            const age = Date.now() - start;
            if (age > 1400) {
                Game.scene.remove(sprite);
                return;
            }
            sprite.position.y += 0.025;
            sprite.material.opacity = 1 - age / 1400;
            requestAnimationFrame(animate);
        };
        animate();
    },

    _spawnConfetti(position) {
        if (!Game.scene) return;
        const colors = [0xff5c8a, 0x00cdac, 0xffcc33, 0x63b3ff, 0xffffff];
        for (let i = 0; i < 16; i += 1) {
            const piece = new THREE.Mesh(
                new THREE.BoxGeometry(0.16, 0.05, 0.28),
                new THREE.MeshBasicMaterial({ color: colors[i % colors.length] })
            );
            piece.position.set(position.x, 2 + Math.random() * 1.5, position.z);
            piece.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.08 + Math.random() * 0.14, (Math.random() - 0.5) * 0.2);
            piece.userData.life = 45 + Math.random() * 25;
            Game.scene.add(piece);
            const tick = () => {
                piece.position.add(piece.userData.velocity);
                piece.userData.velocity.y -= 0.006;
                piece.rotation.x += 0.18;
                piece.rotation.z += 0.15;
                piece.userData.life -= 1;
                if (piece.userData.life <= 0) {
                    Game.scene.remove(piece);
                    return;
                }
                requestAnimationFrame(tick);
            };
            tick();
        }
    },

    _spawnRing(position, color) {
        if (!Game.scene) return;
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.8, 0.08, 8, 44),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
        );
        ring.position.copy(position);
        ring.position.y = 1;
        ring.rotation.x = Math.PI / 2;
        Game.scene.add(ring);
        let life = 35;
        const tick = () => {
            life -= 1;
            ring.scale.multiplyScalar(1.055);
            ring.material.opacity = life / 35;
            if (life <= 0) {
                Game.scene.remove(ring);
                return;
            }
            requestAnimationFrame(tick);
        };
        tick();
    },

    _spawnBurstCoin(position, life = 1000) {
        if (!Game.scene) return;
        const coin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.35, 0.09, 24),
            new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.55, roughness: 0.28 })
        );
        coin.position.set(position.x, position.y, position.z);
        coin.rotation.x = Math.PI / 2;
        coin.userData.created = Date.now();
        coin.userData.life = life;
        Game.scene.add(coin);
        this.burstCoins.push(coin);
    },

    _updateBurstCoins() {
        const now = Date.now();
        this.burstCoins = this.burstCoins.filter((coin) => {
            const age = now - coin.userData.created;
            if (age > coin.userData.life) {
                Game.scene.remove(coin);
                return false;
            }
            coin.rotation.z += 0.12;
            coin.position.y += Math.sin(age * 0.01) * 0.006;
            coin.material.opacity = Math.max(0, 1 - age / coin.userData.life);
            coin.material.transparent = true;
            return true;
        });
    },

    _flash(text) {
        if (!this.hud.banner) {
            const banner = document.querySelector('.party-banner');
            if (banner) this.hud.banner = banner;
        }
        if (!this.hud.banner) return;
        this.hud.banner.textContent = text;
        this.hud.banner.classList.add('show');
        clearTimeout(this.hud.banner._timer);
        this.hud.banner._timer = setTimeout(() => this.hud.banner.classList.remove('show'), 1500);
    },

    _pointAt(t) {
        const points = (Game.track && Game.track.pathPoints) || [];
        if (!points.length) return new THREE.Vector3();
        const index = Math.floor(t * points.length) % points.length;
        const p = points[index];
        return p.clone ? p.clone() : new THREE.Vector3(p.x, p.y || 0, p.z);
    },

    _dirAt(t) {
        const points = (Game.track && Game.track.pathPoints) || [];
        if (points.length < 2) return new THREE.Vector3(0, 0, 1);
        const index = Math.floor(t * points.length) % points.length;
        const next = points[(index + 1) % points.length];
        const prev = points[(index - 1 + points.length) % points.length];
        return new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
    },

    _normalAt(t) {
        const dir = this._dirAt(t);
        return new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    },

    _patchItemDex() {
        // UIExt._renderItemDex reads from ItemSystem.ITEMS which now contains the
        // party item keys (pushed in _patchItems), so the dex includes them automatically.
        // No-op kept for forward compatibility with any external UIExt.buildItemDex impl.
        if (!window.UIExt || UIExt._partyDexPatched) return;
        UIExt._partyDexPatched = true;
    }
};

if (typeof window !== 'undefined') {
    window.PartyExt = PartyExt;
}
