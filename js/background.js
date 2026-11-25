/**
 * STAR WARS CONTEMPLATIVE ORBITAL SCENE (HD Key-Art + Live Real-Time Canvas FX)
 *
 * Combines a razor-sharp photorealistic Rogue One orbital backdrop (assets/bg_orbital_fleet.jpg)
 * with live 60fps native-DPI procedural effects pixel-locked to the artwork:
 *   - Smooth subtle mouse parallax & slow contemplative breathing zoom;
 *   - Volumetric pulsing cyan ion engine glows & delicate horizontal anamorphic glints
 *     locked to the hovering Star Destroyer's rear thrusters;
 *   - Slow blinking navigation beacons on the bridge domes, prow & distant escort cruiser,
 *     plus delicate night-side planetary city-light shimmers;
 *   - Tiny, true-kilometric-scale patrolling fighter squadrons (TIE & X-Wing formations)
 *     gliding serenely along the planetary horizon and around the cruiser with whisper-thin trails;
 *   - Seamless 2.5s hyperspace tunnel exit intro driven by js/intro.js on the exact same canvas.
 */
(function () {
    'use strict';

    const starCanvas = document.getElementById('space-canvas');
    if (!starCanvas)
        return;

    const root = document.documentElement;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.id = 'well-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    starCanvas.parentNode.insertBefore(canvas, starCanvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        canvas.remove();
        return;
    }
    root.classList.add('has-well');

    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const rand = (a, b) => a + Math.random() * (b - a);
    const easeOutCubic = k => 1 - Math.pow(1 - k, 3);
    const easeOutQuart = k => 1 - Math.pow(1 - k, 4);

    // =========================================================================
    // LOAD HIGH-RES ORBITAL BACKDROP
    // =========================================================================
    const bgImg = new Image();
    let imgReady = false;
    bgImg.onload = () => {
        imgReady = true;
        if (reduced && !root.classList.contains('intro-pending')) {
            render();
        }
    };
    bgImg.src = 'assets/bg_orbital_fleet.jpg';

    // Exact normalized UV anchors on bg_orbital_fleet.jpg (measured directly from artwork)
    const ENGINES = [
        { u: 0.852, v: 0.391, r: 0.026, phase: 0.0 },  // Port main ion engine
        { u: 0.888, v: 0.388, r: 0.028, phase: 1.7 },  // Center main ion engine
        { u: 0.919, v: 0.385, r: 0.024, phase: 3.1 },  // Starboard main ion engine
        { u: 0.867, v: 0.420, r: 0.011, phase: 2.3 },  // Lower-left aux thruster
        { u: 0.900, v: 0.415, r: 0.011, phase: 4.4 }   // Lower-right aux thruster
    ];

    const BEACONS = [
        { u: 0.790, v: 0.150, col: '255, 48, 72',  period: 3.4, offset: 0.0, size: 2.2 }, // Bridge dome port
        { u: 0.834, v: 0.153, col: '255, 48, 72',  period: 3.4, offset: 1.7, size: 2.2 }, // Bridge dome starboard
        { u: 0.460, v: 0.385, col: '0, 229, 255',  period: 4.2, offset: 0.8, size: 2.0 }, // Prow tip beacon
        { u: 0.154, v: 0.296, col: '0, 229, 255',  period: 2.8, offset: 0.4, size: 2.4 }  // Distant escort cruiser
    ];

    // Subtle shimmering city-light nodes on the shadowed lower-right continent
    const CITY_SPARKS = [];
    for (let i = 0; i < 36; i++) {
        CITY_SPARKS.push({
            u: rand(0.68, 0.96),
            v: rand(0.76, 0.97),
            phase: rand(0, Math.PI * 2),
            speed: rand(0.7, 2.1),
            r: rand(0.8, 1.8)
        });
    }

    // =========================================================================
    // CALM KILOMETRIC-SCALE ORBITAL PATROL SQUADRONS
    // Tiny, sleek, realistic scale relative to the 1.6 km Star Destroyer!
    // =========================================================================
    // Each patrol moves along a smooth cubic Bezier curve in image UV coordinates (u, v)
    function cubicBezier(p0, p1, p2, p3, k) {
        const m = 1 - k;
        const m2 = m * m, k2 = k * k;
        const u = m2 * m * p0[0] + 3 * m2 * k * p1[0] + 3 * m * k2 * p2[0] + k2 * k * p3[0];
        const v = m2 * m * p0[1] + 3 * m2 * k * p1[1] + 3 * m * k2 * p2[1] + k2 * k * p3[1];
        const du = 3 * m2 * (p1[0] - p0[0]) + 6 * m * k * (p2[0] - p1[0]) + 3 * k2 * (p3[0] - p2[0]);
        const dv = 3 * m2 * (p1[1] - p0[1]) + 6 * m * k * (p2[1] - p1[1]) + 3 * k2 * (p3[1] - p2[1]);
        return { u, v, ang: Math.atan2(dv, du) };
    }

    const PATROLS = [
        // Wing 1: 3 tiny TIEs sweeping gracefully along the glowing blue atmospheric horizon
        {
            p0: [0.22, 0.92], p1: [0.46, 0.68], p2: [0.74, 0.50], p3: [1.05, 0.45],
            duration: 28,
            offsetT: 6,
            color: '140, 238, 255',
            core: '235, 252, 255',
            trailLen: 26,
            formation: [
                { dk: 0.000, du:  0.000, dv:  0.000, s: 1.0 },
                { dk: -0.014, du: -0.006, dv:  0.009, s: 0.85 },
                { dk: -0.017, du:  0.007, dv: -0.007, s: 0.85 }
            ]
        },
        // Wing 2: 3 tiny X-Wing recon wing curving gently high above the Star Destroyer toward the distant escort
        {
            p0: [0.98, 0.25], p1: [0.72, 0.14], p2: [0.42, 0.18], p3: [0.06, 0.30],
            duration: 34,
            offsetT: 19,
            color: '255, 110, 145',
            core: '255, 230, 238',
            trailLen: 22,
            formation: [
                { dk: 0.000, du:  0.000, dv:  0.000, s: 0.95 },
                { dk: -0.013, du:  0.005, dv:  0.008, s: 0.80 },
                { dk: -0.016, du:  0.006, dv: -0.008, s: 0.80 }
            ]
        },
        // Wing 3: 2 distant Imperial patrol shuttles gliding under the Star Destroyer's prow
        {
            p0: [0.58, 0.42], p1: [0.42, 0.48], p2: [0.24, 0.42], p3: [0.05, 0.28],
            duration: 32,
            offsetT: 2,
            color: '120, 225, 255',
            core: '225, 250, 255',
            trailLen: 18,
            formation: [
                { dk: 0.000, du: 0.000, dv: 0.000, s: 0.78 },
                { dk: -0.012, du: 0.004, dv: 0.007, s: 0.68 }
            ]
        }
    ];

    // =========================================================================
    // CRISP 60FPS HYPERSPACE TUNNEL STARS (for Intro & Navigation Clicks)
    // =========================================================================
    const WARP_COUNT = 300;
    const warpStars = [];
    for (let i = 0; i < WARP_COUNT; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.pow(Math.random(), 0.62);
        warpStars.push({
            cos: Math.cos(ang),
            sin: Math.sin(ang),
            r0: 0.03 + rad * 0.97,
            speed: 0.65 + Math.random() * 1.45,
            size: 0.75 + Math.random() * 1.55,
            tint: Math.random() < 0.45 ? '140, 232, 255' : '232, 248, 255',
            bright: 0.48 + Math.random() * 0.52
        });
    }

    // Subtle floating foreground space dust motes for depth parallax
    const DUST = [];
    for (let i = 0; i < 28; i++) {
        DUST.push({
            x: Math.random(),
            y: Math.random(),
            vx: rand(-0.006, 0.006),
            vy: rand(-0.004, 0.004),
            r: rand(0.6, 1.4),
            a: rand(0.12, 0.32),
            depth: rand(0.5, 1.5)
        });
    }

    // =========================================================================
    // INTRO CONTROLLER (exposed as window.StarWarsEngine for js/intro.js)
    // =========================================================================
    const introState = {
        active: false,
        t: 0,
        debugT: null,
        exitDuration: 0.95,
        handoffTime: 2.45
    };

    window.StarWarsEngine = {
        startIntro(debugT) {
            introState.active = true;
            introState.t = debugT !== null ? debugT : 0;
            introState.debugT = debugT;
        },
        endIntro() {
            introState.active = false;
            introState.debugT = null;
        },
        getIntroTime() { return introState.t; },
        getExitDuration() { return introState.exitDuration; },
        getHandoffTime() { return introState.handoffTime; }
    };

    // =========================================================================
    // CANVAS SIZING & EXACT IMAGE-COVER MAPPING
    // =========================================================================
    let W = 0, H = 0, dpr = 1;
    let t = 0;
    let dim = 1;
    let navWarp = 0;
    const mouse = { nx: 0, ny: 0, sx: 0, sy: 0 };

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = Math.max(2, window.innerWidth);
        H = Math.max(2, window.innerHeight);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Computes exact drawImage rect (object-fit: cover + breathing zoom + mouse parallax)
    function computeImageRect(zoom) {
        const iw = bgImg.naturalWidth || 1920;
        const ih = bgImg.naturalHeight || 1080;
        const scale = Math.max(W / iw, H / ih) * zoom;
        const dw = iw * scale;
        const dh = ih * scale;
        // Anchor slightly toward right-bottom on narrow/portrait screens so cruiser & planet stay visible!
        const anchorX = W < H ? 0.68 : 0.5;
        const anchorY = 0.5;
        const maxShiftX = Math.max(0, (dw - W) * 0.42);
        const maxShiftY = Math.max(0, (dh - H) * 0.42);
        const px = clamp(-mouse.sx * 18, -maxShiftX, maxShiftX);
        const py = clamp(-mouse.sy * 12, -maxShiftY, maxShiftY);
        const dx = (W - dw) * anchorX + px;
        const dy = (H - dh) * anchorY + py;
        return { dx, dy, dw, dh };
    }

    function uvToScreen(rect, u, v) {
        return {
            x: rect.dx + u * rect.dw,
            y: rect.dy + v * rect.dh
        };
    }

    // =========================================================================
    // RENDERING LAYERS
    // =========================================================================
    function drawBackdropAndLiveFX(revealAlpha, zoom) {
        if (!imgReady || revealAlpha <= 0.005)
            return;

        const rect = computeImageRect(zoom);
        // Keep the hero vivid while letting <main>'s frosted focus scrim handle content darkening smoothly
        const effBright = introState.active ? 1.0 : lerp(0.68, 0.96, dim);

        // 1. Razor-sharp HD Rogue One Orbital Key-Art
        ctx.save();
        ctx.globalAlpha = revealAlpha;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bgImg, rect.dx, rect.dy, rect.dw, rect.dh);
        ctx.restore();

        // 2. Live pulsing cyan ion engine glows + subtle horizontal anamorphic glint
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const engineBoost = introState.active
            ? (1.0 + Math.exp(-Math.max(0, introState.t - 0.72) * 2.4) * 1.4)
            : (0.85 + navWarp * 1.1);

        for (let i = 0; i < ENGINES.length; i++) {
            const e = ENGINES[i];
            const p = uvToScreen(rect, e.u, e.v);
            const pulse = 0.86 + 0.14 * Math.sin(t * 3.1 + e.phase) + 0.05 * Math.sin(t * 9.7 + e.phase * 2.1);
            const rad = e.r * rect.dw * (0.95 + 0.15 * pulse) * Math.min(1.35, engineBoost);

            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
            g.addColorStop(0, 'rgba(210, 250, 255, ' + (0.34 * pulse * revealAlpha * effBright) + ')');
            g.addColorStop(0.35, 'rgba(0, 225, 255, ' + (0.20 * pulse * revealAlpha * effBright) + ')');
            g.addColorStop(1, 'rgba(0, 180, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
            ctx.fill();
        }

        // Delicate horizontal cyan anamorphic streak centered on the 3 main engines
        const eMid = uvToScreen(rect, 0.888, 0.388);
        const flareW = rect.dw * (0.12 + 0.03 * Math.sin(t * 2.2)) * Math.min(1.6, engineBoost);
        const flareH = Math.max(1.5, rect.dh * 0.0045);
        const fg = ctx.createLinearGradient(eMid.x - flareW, eMid.y, eMid.x + flareW, eMid.y);
        fg.addColorStop(0, 'rgba(0, 229, 255, 0)');
        fg.addColorStop(0.35, 'rgba(0, 220, 255, ' + (0.12 * revealAlpha * effBright) + ')');
        fg.addColorStop(0.5, 'rgba(210, 252, 255, ' + (0.32 * revealAlpha * effBright) + ')');
        fg.addColorStop(0.65, 'rgba(0, 220, 255, ' + (0.12 * revealAlpha * effBright) + ')');
        fg.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = fg;
        ctx.fillRect(eMid.x - flareW, eMid.y - flareH, flareW * 2, flareH * 2);

        // 3. Slow blinking navigation beacons on Star Destroyer & distant escort cruiser
        for (let i = 0; i < BEACONS.length; i++) {
            const b = BEACONS[i];
            const cyc = ((t + b.offset) % b.period) / b.period;
            // Crisp short radar-like blink pulse
            const blink = cyc < 0.14 ? Math.sin((cyc / 0.14) * Math.PI) : 0;
            if (blink <= 0.02) continue;
            const p = uvToScreen(rect, b.u, b.v);
            const r = b.size * (1.8 + blink * 2.4);
            const bg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            bg.addColorStop(0, 'rgba(255, 255, 255, ' + (0.85 * blink * revealAlpha * effBright) + ')');
            bg.addColorStop(0.35, 'rgba(' + b.col + ', ' + (0.55 * blink * revealAlpha * effBright) + ')');
            bg.addColorStop(1, 'rgba(' + b.col + ', 0)');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. Ultra-subtle atmospheric twinkle on the planet's night-side golden city lights
        for (let i = 0; i < CITY_SPARKS.length; i++) {
            const s = CITY_SPARKS[i];
            const tw = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
            if (tw < 0.55) continue;
            const p = uvToScreen(rect, s.u, s.v);
            const a = ((tw - 0.55) / 0.45) * 0.24 * revealAlpha * effBright;
            ctx.fillStyle = 'rgba(255, 200, 120, ' + a + ')';
            ctx.beginPath();
            ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. Tiny, serene, kilometric-scale patrolling fighter squadrons with crisp ion trails
        ctx.lineCap = 'round';
        for (let w = 0; w < PATROLS.length; w++) {
            const wing = PATROLS[w];
            const baseK = ((t + wing.offsetT) % wing.duration) / wing.duration;

            for (let i = 0; i < wing.formation.length; i++) {
                const f = wing.formation[i];
                const k = baseK + f.dk;
                if (k <= 0.02 || k >= 0.98) continue;
                // Smooth fade in & out at curve edges
                const edgeFade = Math.min(clamp(k / 0.10, 0, 1), clamp((1 - k) / 0.10, 0, 1));
                const alpha = edgeFade * revealAlpha * effBright * 0.85;
                if (alpha <= 0.01) continue;

                const head = cubicBezier(wing.p0, wing.p1, wing.p2, wing.p3, k);
                const hp = uvToScreen(rect, head.u + f.du, head.v + f.dv);

                // Whisper-thin tapering ion contrail along the exact curve!
                const steps = 10;
                const trailSpan = wing.trailLen * 0.0014;
                for (let j = 0; j < steps; j++) {
                    const k1 = clamp(k - (j / steps) * trailSpan, 0, 1);
                    const k2 = clamp(k - ((j + 1) / steps) * trailSpan, 0, 1);
                    const pt1 = cubicBezier(wing.p0, wing.p1, wing.p2, wing.p3, k1);
                    const pt2 = cubicBezier(wing.p0, wing.p1, wing.p2, wing.p3, k2);
                    const s1 = uvToScreen(rect, pt1.u + f.du, pt1.v + f.dv);
                    const s2 = uvToScreen(rect, pt2.u + f.du, pt2.v + f.dv);
                    const fall = 1 - j / steps;
                    ctx.strokeStyle = 'rgba(' + wing.color + ', ' + (fall * fall * 0.48 * alpha) + ')';
                    ctx.lineWidth = Math.max(0.6, 1.45 * f.s * fall);
                    ctx.beginPath();
                    ctx.moveTo(s1.x, s1.y);
                    ctx.lineTo(s2.x, s2.y);
                    ctx.stroke();
                }

                // Tiny razor-sharp engine pinpoint + soft micro-halo
                const glowR = 4.6 * f.s;
                const pg = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, glowR);
                pg.addColorStop(0, 'rgba(' + wing.core + ', ' + alpha + ')');
                pg.addColorStop(0.35, 'rgba(' + wing.color + ', ' + (0.55 * alpha) + ')');
                pg.addColorStop(1, 'rgba(' + wing.color + ', 0)');
                ctx.fillStyle = pg;
                ctx.beginPath();
                ctx.arc(hp.x, hp.y, glowR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 6. Subtle floating space dust motes (parallax foreground depth)
        for (let i = 0; i < DUST.length; i++) {
            const d = DUST[i];
            const dx = (d.x * W - mouse.sx * 24 * d.depth + W) % W;
            const dy = (d.y * H - mouse.sy * 16 * d.depth + H) % H;
            ctx.fillStyle = 'rgba(180, 232, 255, ' + (d.a * revealAlpha * effBright) + ')';
            ctx.beginPath();
            ctx.arc(dx, dy, d.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 7. Smooth dark dimming veil when scrolled down to read project cards (preserves effortless readability!)
        if (!introState.active && effBright < 0.99) {
            ctx.fillStyle = 'rgba(4, 6, 11, ' + (1 - effBright).toFixed(3) + ')';
            ctx.fillRect(0, 0, W, H);
        }
    }

    function drawHyperspaceTunnel(warp, travelK) {
        if (warp <= 0.008)
            return;

        const cx = W * 0.5;
        const cy = H * 0.5;
        const maxR = Math.hypot(cx, cy);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Electric blue-white hyperspace tunnel ambient core
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.72);
        cg.addColorStop(0, 'rgba(150, 240, 255, ' + (0.20 * warp) + ')');
        cg.addColorStop(0.35, 'rgba(0, 165, 245, ' + (0.10 * warp) + ')');
        cg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = cg;
        ctx.fillRect(0, 0, W, H);

        // 300 ultra-crisp radial Star Wars hyperspace starlines
        ctx.lineCap = 'round';
        for (let i = 0; i < warpStars.length; i++) {
            const s = warpStars[i];
            let frac = (s.r0 + travelK * s.speed) % 1.06;
            if (frac < 0.02) frac += 0.02;

            const r = frac * maxR;
            const x = cx + s.cos * r;
            const y = cy + s.sin * r;
            const streak = warp * (42 + frac * maxR * 0.44) * s.speed;
            const alpha = s.bright * clamp(frac * 2.5, 0.14, 1) * clamp(warp * 1.4, 0, 1);

            if (streak > 1.5) {
                const x0 = cx + s.cos * Math.max(0, r - streak);
                const y0 = cy + s.sin * Math.max(0, r - streak);
                const grad = ctx.createLinearGradient(x0, y0, x, y);
                grad.addColorStop(0, 'rgba(0, 195, 255, 0)');
                grad.addColorStop(0.65, 'rgba(' + s.tint + ', ' + (alpha * 0.75) + ')');
                grad.addColorStop(1, 'rgba(255, 255, 255, ' + alpha + ')');
                ctx.strokeStyle = grad;
                ctx.lineWidth = s.size * (0.85 + warp * 0.75);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
        }

        // Crisp subtle deceleration shock ring right on hyperspace exit
        if (introState.active && introState.t > 0.68 && introState.t < 1.38) {
            const pk = clamp((introState.t - 0.68) / 0.70, 0, 1);
            const ringR = easeOutCubic(pk) * maxR * 0.90;
            const ringA = (1 - pk) * (1 - pk) * 0.28;
            ctx.strokeStyle = 'rgba(130, 240, 255, ' + ringA + ')';
            ctx.lineWidth = 2.4 * (1 - pk) + 0.5;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    function render() {
        // Deep void black base
        ctx.fillStyle = '#04060b';
        ctx.fillRect(0, 0, W, H);

        let warp = navWarp;
        let travelK = t * 0.55;
        let revealAlpha = 1.0;
        // Slow serene Ken Burns breathing zoom (~1.045..1.062)
        let zoom = 1.052 + Math.sin(t * 0.08) * 0.010;

        if (introState.active) {
            const exitK = clamp(introState.t / introState.exitDuration, 0, 1);
            warp = Math.max(warp, Math.pow(1 - easeOutQuart(exitK), 1.35));
            travelK = easeOutCubic(exitK) * 0.62;
            // Orbital key-art emerges crisply right as hyperspace decelerates!
            revealAlpha = easeOutCubic(clamp((introState.t - 0.45) / 0.78, 0, 1));
            const settleK = easeOutCubic(clamp((introState.t - 0.45) / 1.9, 0, 1));
            zoom = lerp(1.14, 1.052, settleK);
        }

        drawBackdropAndLiveFX(revealAlpha, zoom);
        drawHyperspaceTunnel(warp, travelK);
    }

    // =========================================================================
    // MAIN LOOP & EVENTS
    // =========================================================================
    let last = 0;

    function update(dt) {
        t += dt;
        mouse.sx += (mouse.nx - mouse.sx) * Math.min(1, dt * 1.8);
        mouse.sy += (mouse.ny - mouse.sy) * Math.min(1, dt * 1.8);
        navWarp = Math.max(0, navWarp - dt / 1.15);

        const scrolled = clamp(window.scrollY / Math.max(1, window.innerHeight), 0, 1);
        dim = lerp(dim, lerp(1.0, 0.36, scrolled), Math.min(1, dt * 3));

        for (let i = 0; i < DUST.length; i++) {
            const d = DUST[i];
            d.x = (d.x + d.vx * dt + 1) % 1;
            d.y = (d.y + d.vy * dt + 1) % 1;
        }

        if (introState.active && introState.debugT === null) {
            introState.t += dt;
        }
    }

    function loop(now) {
        requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (document.hidden)
            return;
        update(dt);
        render();
    }

    window.addEventListener('pointermove', e => {
        mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.ny = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    window.addEventListener('resize', () => {
        resize();
        if (reduced) render();
    });

    document.addEventListener('DOMContentLoaded', () => {
        const original = window.engageHyperspace;
        if (typeof original !== 'function')
            return;
        window.engageHyperspace = function () {
            navWarp = 0.72;
            return original.apply(this, arguments);
        };
    });

    // =========================================================================
    // BOOT
    // =========================================================================
    resize();
    requestAnimationFrame(() => canvas.classList.add('is-on'));

    if (reduced && !root.classList.contains('intro-pending')) {
        render();
        return;
    }

    last = performance.now();
    requestAnimationFrame(loop);
})();
