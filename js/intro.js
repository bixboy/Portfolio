/**
 * STAR WARS 3D HYPERSPACE INTRO CONTROLLER
 *
 * Drives the exact same real-time 3D WebGL engine in js/background.js (window.StarWarsEngine),
 * so the 3-second hyperspace exit + 3D fleet flyby transitions directly into the portfolio
 * with zero cut, zero double canvas, and no pretentious click gate or movie credits.
 *
 * Shown once per browser session (sessionStorage "sw-intro-v3").
 *   ?intro         forces replay
 *   ?nointro       skips immediately
 *   ?introDebug=t  freezes at timestamp t (seconds)
 */
(function () {
    'use strict';

    const root = document.documentElement;
    const intro = document.getElementById('intro');
    window.__introReady = true;

    if (!intro)
        return;

    if (!root.classList.contains('intro-pending')) {
        intro.remove();
        return;
    }

    const engine = window.StarWarsEngine;
    if (!engine) {
        root.classList.remove('intro-pending');
        intro.remove();
        return;
    }

    const params = new URLSearchParams(location.search);
    const debugT = params.has('introDebug') ? (parseFloat(params.get('introDebug')) || 0) : null;

    const lang = (function () {
        try {
            return localStorage.getItem('site-lang') === 'en' ? 'en' : 'fr';
        } catch (e) {
            return 'fr';
        }
    })();

    const TEXT = {
        fr: {
            skip: 'PASSER ›',
            hudWarp: '// SORTIE D\'HYPERESPACE — ORBITE PL-88',
            hudSublight: '// ORBITE STATIONNAIRE — SECTEUR PL-88'
        },
        en: {
            skip: 'SKIP ›',
            hudWarp: '// HYPERSPACE EXIT — ORBIT PL-88',
            hudSublight: '// STATIONARY ORBIT — SECTOR PL-88'
        }
    }[lang];

    const skipBtn = intro.querySelector('.intro-skip');
    const hudEl = intro.querySelector('.intro-hud');
    if (skipBtn)
        skipBtn.textContent = TEXT.skip;
    if (hudEl)
        hudEl.textContent = TEXT.hudWarp;

    // Mark seen for this session (unless inspecting via introDebug)
    if (debugT === null) {
        try {
            sessionStorage.setItem('sw-intro-v9', '1');
        } catch (e) {}
    }

    // Boot the 3D hyperspace arrival directly on the live WebGL canvas
    engine.startIntro(debugT);
    intro.classList.add('is-active');

    let done = false;
    let switchedHud = false;
    let rafId = 0;

    function finish(instant) {
        if (done)
            return;
        done = true;
        cancelAnimationFrame(rafId);
        document.removeEventListener('keydown', onKey);

        engine.endIntro();
        root.classList.remove('intro-pending');
        root.classList.add('intro-arrived');
        intro.classList.add(instant ? 'is-skip' : 'is-out');
        window.scrollTo(0, 0);

        setTimeout(() => root.classList.remove('intro-arrived'), 1400);
        setTimeout(() => intro.remove(), instant ? 400 : 850);
    }

    function onKey(e) {
        if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
            finish(true);
        }
    }

    function watch() {
        if (done)
            return;
        rafId = requestAnimationFrame(watch);

        const t = engine.getIntroTime();
        if (!switchedHud && t >= engine.getExitDuration() && hudEl) {
            switchedHud = true;
            hudEl.textContent = TEXT.hudSublight;
        }

        if (debugT === null && t >= engine.getHandoffTime()) {
            finish(false);
        }
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', e => {
            e.stopPropagation();
            finish(true);
        });
    }
    intro.addEventListener('click', () => finish(true));
    document.addEventListener('keydown', onKey);

    rafId = requestAnimationFrame(watch);
})();
