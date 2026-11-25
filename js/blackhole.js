/**
 * BLACK HOLE RENDERER — the WebGL black hole of the intro (js/intro.js).
 *
 *   const bh = BlackHole.create(canvas, { scenePixels, outputPixels, maxDpr, steps, onLost });
 *   bh.resize();                                   // after the canvas' CSS size changes
 *   bh.render(t, BlackHole.camera({...}), { exposure, bloom, ca, shift, histW });
 *   bh.setQuality(0.8);                            // scales the ray-march resolution
 *   bh.destroy();
 *
 * Frame pipeline (all RGBA8 targets, HDR stored as sqrt(c / (1 + c)), see enc/dec):
 *   scene    ray-march the curved photon paths, blended with last frame (jittered → anti-aliased)
 *   bright   keep what is brighter than 1.0, half resolution
 *   blur     bloom at 1/2, 1/4, 1/8 + a wide horizontal streak (anamorphic flare)
 *   comp     chromatic aberration, bloom, filmic tone map, grade, vignette, grain → screen
 *
 * Units: Schwarzschild radius rs = 1. Photon sphere 1.5, innermost stable orbit 3, disk out to 17.
 */
(function () {
    'use strict';

    // Look of the disk. Physical values would be beam 4; 3.4 keeps the receding side readable.
    const LOOK = {
        tPeak: 10000,   // K, hottest ring of the disk
        beam: 3.4,      // exponent of the Doppler/gravitational shift on brightness
        emit: 1.7,      // overall disk brightness
        tau: 0.85,      // optical depth: higher = more opaque disk
        spin: 7.0       // speed-up of the Keplerian rotation (real time would look frozen)
    };

    const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

    const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
// HDR in 8 bits: e = sqrt(c / (1 + c)). The square root keeps precision in the darks; without it
// the temporal blend rounds dim pixels up to 1/255 forever and the black hole turns grey.
vec3 dec(vec4 e) { vec3 y = e.rgb * e.rgb; return y / max(vec3(1.0) - y, vec3(0.004)); }
vec4 enc(vec3 c) { c = max(c, vec3(0.0)); return vec4(sqrt(c / (vec3(1.0) + c)), 1.0); }
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
`;

    const SCENE_FS = HEAD + `
uniform vec2 uRes;
uniform vec2 uJitter;
uniform vec2 uShift;
uniform float uTime;
uniform vec3 uPos;
uniform vec3 uF;
uniform vec3 uR;
uniform vec3 uU;
uniform float uFocal;
uniform sampler2D uNoise;
uniform sampler2D uHist;
uniform float uHistW;
uniform float uTpeak;
uniform float uBeam;
uniform float uEmit;
uniform float uTau;
uniform float uSpin;

// Units: Schwarzschild radius rs = 1 (mass M = 0.5). Photon sphere 1.5, ISCO 3.
#define STEPS 200
const float RIN = 3.0;
const float ROUT = 17.0;

float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

// Value noise from a 256² texture whose R channel is G shifted by (37, 17): one fetch per sample.
float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy;
    vec2 rg = texture2D(uNoise, (uv + 0.5) / 256.0).yx;
    return mix(rg.x, rg.y, f.z);
}

float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
        s += a * noise(p);
        p = p * 2.02 + vec3(1.7, 9.2, 3.1);
        a *= 0.5;
    }
    return s / 0.97;
}

// Colour of a black body at temperature t (K), luminance 1. Planckian locus fit, 1000–15000 K.
vec3 blackbody(float t) {
    t = clamp(t, 1000.0, 15000.0);
    float u = (0.860117757 + 1.54118254e-4 * t + 1.28641212e-7 * t * t) / (1.0 + 8.42420235e-4 * t + 7.08145163e-7 * t * t);
    float v = (0.317398726 + 4.22806245e-5 * t + 4.20481691e-8 * t * t) / (1.0 - 2.89741816e-5 * t + 1.61456053e-7 * t * t);
    float d = 2.0 * u - 8.0 * v + 4.0;
    float x = 3.0 * u / d;
    float y = 2.0 * v / d;
    vec3 xyz = vec3(x / y, 1.0, (1.0 - x - y) / y);
    vec3 rgb = mat3(3.2404542, -0.9692660, 0.0556434,
                    -1.5371385, 1.8760108, -0.2040259,
                    -0.4985314, 0.0415560, 1.0572252) * xyz;
    return max(rgb, vec3(0.0));
}

vec3 stars(vec3 d, float pix, float band) {
    vec3 col = vec3(0.0);
    for (int L = 0; L < 3; L++) {
        float fl = float(L);
        float S = L == 0 ? 38.0 : (L == 1 ? 90.0 : 210.0);
        float prob = L == 0 ? 0.3 : (L == 1 ? 0.3 : 0.06 + 0.5 * band);
        vec3 id = floor(d * S) + fl * 101.0;
        if (hash13(id) < prob) {
            vec3 jit = vec3(hash13(id + 1.1), hash13(id + 2.3), hash13(id + 3.7));
            vec3 sp = normalize(floor(d * S) + 0.15 + 0.7 * jit);
            float a = length(d - sp);
            float m = hash13(id + 4.9);
            float flux = (pow(m, 22.0) * 30.0 + pow(m, 6.0) * 0.6 + 0.03) * (L == 0 ? 1.0 : (L == 1 ? 0.3 : 0.12));
            float sig = pix * 0.8;
            float temp = mix(3200.0, 13000.0, pow(hash13(id + 6.1), 0.7));
            col += blackbody(temp) * flux * exp(-a * a / (2.0 * sig * sig));
        }
    }
    return col;
}

vec3 background(vec3 d, float pix) {
    // Milky Way: a tilted band, warmer toward its core, cut by dust lanes.
    vec3 n = normalize(vec3(-0.32, 0.83, -0.458));
    vec3 gc = normalize(vec3(0.46, -0.29, -0.84));
    float b = dot(d, n);
    float band = exp(-b * b * 22.0);
    float core = pow(max(dot(d, gc), 0.0), 5.0);

    float n1 = fbm(d * 3.0 + 2.0);
    float n2 = fbm(d * 9.0 + n1 * 1.6);
    float dust = smoothstep(0.42, 0.7, fbm(d * 7.0 + vec3(5.2, 1.3, 8.1))) * exp(-b * b * 70.0);
    float glow = band * (0.35 + 1.1 * n2 * n2) * (0.5 + 2.2 * core);

    vec3 col = mix(vec3(0.55, 0.68, 1.0), vec3(1.0, 0.8, 0.58), clamp(core * 1.4, 0.0, 1.0)) * glow * 0.035;
    col *= 1.0 - dust * 0.85;
    col += vec3(0.32, 0.18, 0.7) * pow(fbm(d * 2.4 + 7.0), 4.0) * 0.05;
    col += stars(d, pix, band * (1.0 - dust));
    return col;
}

void disk(vec3 p, vec3 dir, inout vec3 col, inout float trans) {
    float r = length(p.xz);
    if (r < RIN * 0.94 || r > ROUT)
        return;

    float lr = log(r);
    float ang = atan(p.z, p.x);
    float omega = sqrt(0.5 / (r * r * r));
    float a = ang - omega * uTime * uSpin;
    vec2 cs = vec2(cos(a), sin(a));

    // Turbulence sheared into thin arcs by the differential rotation.
    float d1 = fbm(vec3(cs * 1.9, lr * 8.0));
    float d2 = fbm(vec3(cs * 5.5 + 3.1, lr * 26.0));
    float d3 = noise(vec3(cs * 15.0 + 7.0, lr * 75.0));
    float dens = smoothstep(0.3, 0.92, d1 * 0.55 + d2 * 0.33 + d3 * 0.22);
    dens *= smoothstep(RIN * 0.94, RIN * 1.1, r) * (1.0 - smoothstep(ROUT * 0.3, ROUT, r));
    if (dens < 0.002)
        return;

    // Novikov–Thorne temperature profile, peak normalised to uTpeak.
    float x = RIN / r;
    float te = uTpeak * pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0), 0.25) / 0.488;
    te = max(te, 0.3 * uTpeak);

    // Redshift factor g = sqrt(1 - 3M/r) / (1 - beta cos): gravity + Doppler of a Keplerian orbit.
    float beta = min(sqrt(0.5 / (r - 1.0)), 0.95);
    vec3 vdir = normalize(vec3(-p.z, 0.0, p.x));
    float g = sqrt(max(1.0 - 1.5 / r, 0.02)) / (1.0 - beta * dot(vdir, -dir));

    float lum = pow(te / uTpeak, 4.0) * pow(g, uBeam) * uEmit;
    float tau = dens * uTau / max(abs(dir.y), 0.035);
    float alpha = 1.0 - exp(-tau);

    col += trans * blackbody(te * g) * lum * alpha * (0.4 + 0.6 * dens);
    trans *= 1.0 - alpha;
}

vec3 accel(vec3 p, float h2) {
    float r2 = dot(p, p);
    return -1.5 * h2 * p / (r2 * r2 * sqrt(r2));
}

void main() {
    vec2 fc = gl_FragCoord.xy + uJitter;
    vec2 uv = (fc - 0.5 * uRes) / uRes.y - uShift;
    vec3 rd = normalize(uF * uFocal + uR * uv.x + uU * uv.y);
    float pix = 1.0 / (uRes.y * uFocal);

    vec3 pos = uPos;
    vec3 vel = rd;
    vec3 hv = cross(pos, vel);
    float h2 = dot(hv, hv);
    vec3 acc = accel(pos, h2);

    vec3 col = vec3(0.0);
    float trans = 1.0;
    bool escaped = false;

    for (int i = 0; i < STEPS; i++) {
        float r = length(pos);
        if (r < 1.01)
            break;

        // Velocity Verlet: stable around the photon sphere, where the ring is drawn.
        float dt = clamp(0.08 * r, 0.012, 2.2) * mix(0.6, 1.0, smoothstep(1.3, 2.6, r));
        vec3 vh = vel + 0.5 * dt * acc;
        vec3 np = pos + vh * dt;
        acc = accel(np, h2);
        vel = vh + 0.5 * dt * acc;

        if (pos.y * np.y < 0.0) {
            vec3 cp = mix(pos, np, pos.y / (pos.y - np.y));
            disk(cp, normalize(vel), col, trans);
            if (trans < 0.01)
                break;
        }

        pos = np;

        if (r > ROUT * 1.05 && dot(pos, vel) > 0.0) {
            escaped = true;
            break;
        }
    }

    // Only rays that really left see the sky. Rays still circling the photon sphere when the
    // step budget runs out are as good as captured: counting them as escaped greys the shadow.
    if (escaped)
        col += trans * background(normalize(vel), pix);

    vec3 hist = dec(texture2D(uHist, gl_FragCoord.xy / uRes));
    gl_FragColor = enc(mix(col, hist, uHistW));
}
`;

    const BRIGHT_FS = HEAD + `
uniform sampler2D uTex;
uniform vec2 uOut;
uniform vec2 uTexel;
uniform float uThresh;
void main() {
    vec2 uv = gl_FragCoord.xy / uOut;
    vec3 c = dec(texture2D(uTex, uv + uTexel * vec2(-0.5, -0.5)))
           + dec(texture2D(uTex, uv + uTexel * vec2(0.5, -0.5)))
           + dec(texture2D(uTex, uv + uTexel * vec2(-0.5, 0.5)))
           + dec(texture2D(uTex, uv + uTexel * vec2(0.5, 0.5)));
    c *= 0.25;
    float l = max(c.r, max(c.g, c.b));
    float knee = uThresh * 0.5;
    float soft = clamp(l - uThresh + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    gl_FragColor = enc(c * max(soft, l - uThresh) / max(l, 1e-4));
}
`;

    const BLUR_FS = HEAD + `
uniform sampler2D uTex;
uniform vec2 uOut;
uniform vec2 uDir;
void main() {
    vec2 uv = gl_FragCoord.xy / uOut;
    vec2 o1 = uDir * 1.3846153846;
    vec2 o2 = uDir * 3.2307692308;
    vec3 c = dec(texture2D(uTex, uv)) * 0.2270270270;
    c += (dec(texture2D(uTex, uv + o1)) + dec(texture2D(uTex, uv - o1))) * 0.3162162162;
    c += (dec(texture2D(uTex, uv + o2)) + dec(texture2D(uTex, uv - o2))) * 0.0702702703;
    gl_FragColor = enc(c);
}
`;

    const COMP_FS = HEAD + `
uniform sampler2D uScene;
uniform sampler2D uB1;
uniform sampler2D uB2;
uniform sampler2D uB3;
uniform sampler2D uFlare;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure;
uniform float uBloom;
uniform float uCA;

vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 dc = uv - 0.5;
    float r2 = dot(dc, dc);

    // Lens: chromatic aberration grows toward the edges.
    vec2 off = dc * (0.0006 + r2 * 0.005) * uCA;
    vec3 col = vec3(dec(texture2D(uScene, uv + off)).r,
                    dec(texture2D(uScene, uv)).g,
                    dec(texture2D(uScene, uv - off)).b);

    vec3 bloom = dec(texture2D(uB1, uv)) * 0.3 + dec(texture2D(uB2, uv)) * 0.25 + dec(texture2D(uB3, uv)) * 0.3;
    vec3 flare = dec(texture2D(uFlare, uv)) * vec3(0.35, 0.65, 1.0);
    col += (bloom + flare * 0.06) * uBloom;

    col = aces(col * uExposure);

    // Grade: cool shadows, a touch of teal lift, vignette.
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col * vec3(0.9, 0.97, 1.08), col, smoothstep(0.0, 0.6, luma));
    col += vec3(0.0, 0.002, 0.006) * (1.0 - luma);
    col *= mix(0.42, 1.0, smoothstep(0.85, 0.15, length(dc * vec2(1.15, 1.0))));

    col = pow(col, vec3(1.0 / 2.2));

    float grain = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 517.0) - 0.5;
    col += grain * 0.045 * (1.0 - luma * 0.6);

    gl_FragColor = vec4(col, 1.0);
}
`;


    const HALTON = [];
    (function () {
        const halton = (i, b) => {
            let f = 1;
            let r = 0;
            while (i > 0) {
                f /= b;
                r += f * (i % b);
                i = Math.floor(i / b);
            }
            return r;
        };
        for (let i = 1; i <= 8; i++)
            HALTON.push([halton(i, 2) - 0.5, halton(i, 3) - 0.5]);
    })();

    function create(canvas, options) {
        const opts = Object.assign({
            scenePixels: 620000,  // ray-march resolution cap
            outputPixels: 2300000, // post-processing / screen resolution cap
            maxDpr: 1.5,
            steps: 200,
            onLost: null
        }, options || {});

        const ctxOpts = { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
        const gl = canvas.getContext('webgl', ctxOpts) || canvas.getContext('experimental-webgl', ctxOpts);
        if (!gl)
            return null;

        function compile(type, src) {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
                throw new Error(gl.getShaderInfoLog(sh));
            return sh;
        }

        function makeProgram(fs) {
            const p = gl.createProgram();
            gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
            gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
            gl.bindAttribLocation(p, 0, 'p');
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS))
                throw new Error(gl.getProgramInfoLog(p));
            const locs = {};
            return {
                p,
                u(name) {
                    if (!(name in locs))
                        locs[name] = gl.getUniformLocation(p, name);
                    return locs[name];
                }
            };
        }

        function makeTexture(w, h, data, repeat) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
            return tex;
        }

        function makeTarget(w, h) {
            w = Math.max(1, Math.round(w));
            h = Math.max(1, Math.round(h));
            const tex = makeTexture(w, h, null, false);
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                throw new Error('framebuffer incomplete');
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return { tex, fbo, w, h };
        }

        function freeTarget(t) {
            gl.deleteTexture(t.tex);
            gl.deleteFramebuffer(t.fbo);
        }

        const P = {};
        try {
            P.scene = makeProgram(SCENE_FS.replace('#define STEPS 200', '#define STEPS ' + (opts.steps | 0)));
            P.bright = makeProgram(BRIGHT_FS);
            P.blur = makeProgram(BLUR_FS);
            P.comp = makeProgram(COMP_FS);
        } catch (e) {
            console.warn('[blackhole] shader:', e.message);
            return null;
        }

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // Noise texture: G random, R = G shifted by (37, 17) — see noise() in the shader.
        const N = 256;
        const g = new Uint8Array(N * N);
        for (let i = 0; i < g.length; i++)
            g[i] = Math.random() * 256;
        const data = new Uint8Array(N * N * 4);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const i = (y * N + x) * 4;
                data[i] = g[((y + 17) & 255) * N + ((x + 37) & 255)];
                data[i + 1] = g[y * N + x];
                data[i + 3] = 255;
            }
        }
        const noiseTex = makeTexture(N, N, data, true);

        let RT = null;
        let hist = [];
        let histIdx = 0;
        let histValid = false;
        let frameNo = 0;
        let quality = 1;
        let lost = false;

        canvas.addEventListener('webglcontextlost', e => {
            e.preventDefault();
            lost = true;
            if (opts.onLost)
                opts.onLost();
        });

        function resize() {
            if (lost)
                return;
            const w = Math.max(1, canvas.clientWidth || window.innerWidth);
            const h = Math.max(1, canvas.clientHeight || window.innerHeight);
            const outScale = Math.min(Math.min(window.devicePixelRatio || 1, opts.maxDpr), Math.sqrt(opts.outputPixels / (w * h)));
            canvas.width = Math.max(2, Math.round(w * outScale));
            canvas.height = Math.max(2, Math.round(h * outScale));

            const s = Math.min(1, Math.sqrt(opts.scenePixels / (w * h))) * quality;
            const sw = w * s;
            const sh = h * s;

            if (RT)
                Object.keys(RT).forEach(k => freeTarget(RT[k]));
            hist.forEach(freeTarget);
            hist = [makeTarget(sw, sh), makeTarget(sw, sh)];
            histValid = false;
            RT = {
                h1a: makeTarget(sw / 2, sh / 2),
                h1b: makeTarget(sw / 2, sh / 2),
                qa: makeTarget(sw / 4, sh / 4),
                qb: makeTarget(sw / 4, sh / 4),
                ea: makeTarget(sw / 8, sh / 8),
                eb: makeTarget(sw / 8, sh / 8),
                fa: makeTarget(sw / 4, sh / 4),
                fb: makeTarget(sw / 4, sh / 4)
            };
        }

        function pass(prog, target, textures, uniforms) {
            gl.useProgram(prog.p);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
            if (target)
                gl.viewport(0, 0, target.w, target.h);
            else
                gl.viewport(0, 0, canvas.width, canvas.height);

            let unit = 0;
            Object.keys(textures).forEach(name => {
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, textures[name]);
                gl.uniform1i(prog.u(name), unit);
                unit++;
            });

            Object.keys(uniforms).forEach(name => {
                const v = uniforms[name];
                const loc = prog.u(name);
                if (typeof v === 'number')
                    gl.uniform1f(loc, v);
                else if (v.length === 2)
                    gl.uniform2fv(loc, v);
                else
                    gl.uniform3fv(loc, v);
            });

            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        function blur(src, dst, dx, dy) {
            pass(P.blur, dst, { uTex: src.tex }, { uOut: [dst.w, dst.h], uDir: [dx / src.w, dy / src.h] });
        }

        /**
         * frame: { exposure, bloom, ca, shift: [x, y] (black hole position, in screen heights
         *          from the centre), histW (temporal blend, 0..0.9), look (overrides LOOK) }
         */
        function render(t, cam, frame) {
            if (lost)
                return;
            if (!RT)
                resize();

            const f = frame || {};
            const look = Object.assign({}, LOOK, f.look || {});
            const prev = hist[histIdx];
            const cur = hist[1 - histIdx];
            const jitter = HALTON[frameNo++ % HALTON.length];
            const histW = f.histW !== undefined ? f.histW : 0.6;

            pass(P.scene, cur, { uNoise: noiseTex, uHist: prev.tex }, {
                uRes: [cur.w, cur.h],
                uJitter: jitter,
                uShift: f.shift || [0, 0],
                uTime: t,
                uPos: cam.pos,
                uF: cam.f,
                uR: cam.r,
                uU: cam.u,
                uFocal: cam.focal,
                uHistW: histValid ? histW : 0,
                uTpeak: look.tPeak,
                uBeam: look.beam,
                uEmit: look.emit,
                uTau: look.tau,
                uSpin: look.spin
            });
            histIdx = 1 - histIdx;
            histValid = true;

            pass(P.bright, RT.h1a, { uTex: cur.tex }, {
                uOut: [RT.h1a.w, RT.h1a.h],
                uTexel: [1 / cur.w, 1 / cur.h],
                uThresh: 1.0
            });
            blur(RT.h1a, RT.h1b, 1, 0);
            blur(RT.h1b, RT.h1a, 0, 1);
            blur(RT.h1a, RT.qa, 1, 0);
            blur(RT.qa, RT.qb, 0, 1);
            blur(RT.qb, RT.ea, 1, 0);
            blur(RT.ea, RT.eb, 0, 1);
            blur(RT.qb, RT.fa, 2, 0);
            blur(RT.fa, RT.fb, 6, 0);
            blur(RT.fb, RT.fa, 18, 0);

            pass(P.comp, null, {
                uScene: cur.tex,
                uB1: RT.h1a.tex,
                uB2: RT.qb.tex,
                uB3: RT.eb.tex,
                uFlare: RT.fa.tex
            }, {
                uRes: [canvas.width, canvas.height],
                uTime: t,
                uExposure: f.exposure !== undefined ? f.exposure : 1,
                uBloom: f.bloom !== undefined ? f.bloom : 0.55,
                uCA: f.ca !== undefined ? f.ca : 0.6
            });
        }

        return {
            gl,
            render,
            resize,
            get quality() {
                return quality;
            },
            setQuality(q) {
                if (q === quality)
                    return;
                quality = q;
                resize();
            },
            destroy() {
                const ext = gl.getExtension('WEBGL_lose_context');
                if (ext)
                    ext.loseContext();
            }
        };
    }

    /**
     * Orbit camera looking at the hole. elev/azim/roll in radians; focal = 1 / tan(half vertical fov) / 2.
     */
    function camera(c) {
        const dist = c.dist;
        const elev = c.elev;
        const azim = c.azim;
        const pos = [
            dist * Math.cos(elev) * Math.sin(azim),
            dist * Math.sin(elev),
            dist * Math.cos(elev) * Math.cos(azim)
        ];

        let f = [-pos[0], -pos[1], -pos[2]];
        const fl = Math.hypot(f[0], f[1], f[2]);
        f = f.map(v => v / fl);

        // right = f x up, up = right x f
        let r = [-f[2], 0, f[0]];
        const rl = Math.hypot(r[0], r[1], r[2]) || 1;
        r = r.map(v => v / rl);
        let u = [
            r[1] * f[2] - r[2] * f[1],
            r[2] * f[0] - r[0] * f[2],
            r[0] * f[1] - r[1] * f[0]
        ];

        const roll = c.roll || 0;
        const cr = Math.cos(roll);
        const sr = Math.sin(roll);
        const r2 = r.map((v, i) => v * cr + u[i] * sr);
        u = u.map((v, i) => v * cr - r[i] * sr);

        return { pos, f, r: r2, u, focal: c.focal || 1.45 };
    }

    // Smooth pseudo-random wobble (sum of incommensurate sines), for a hand-held feel.
    function wobble(t, seed) {
        return Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 3.13 + seed * 2.3) * 0.3 + Math.sin(t * 7.37 + seed * 0.7) * 0.2;
    }

    window.BlackHole = { create, camera, wobble, LOOK };
})();
