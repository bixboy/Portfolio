/**
 * i18n Engine for Imperial Datapad
 * The French text written in the HTML is the fallback: a key only needs an "en" entry,
 * the original markup is restored when switching back to French.
 */

class I18nManager {
    constructor() {
        this.currentLang = this.readStoredLang();
        this.init();
    }

    readStoredLang() {
        try {
            return localStorage.getItem('site-lang') || 'fr';
        } catch (e) {
            return 'fr';
        }
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.cacheOriginals();
            this.updateUI();
            this.injectToggle();
        });
    }

    cacheOriginals() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
                el.dataset.i18nOriginal = el.placeholder;
            else if (el.classList.contains('btn-content'))
                el.dataset.i18nOriginal = el.textContent.trim();
            else
                el.dataset.i18nOriginal = el.innerHTML;
        });
    }

    lookup(key) {
        const dict = translations[this.currentLang];
        if (dict && dict[key])
            return dict[key];

        return null;
    }

    updateUI() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            try {
                const text = this.lookup(key);
                const value = text !== null ? text : el.dataset.i18nOriginal;
                if (value === undefined)
                    return;

                if (el.classList.contains('btn-content')) {
                    el.innerText = value;
                } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = value;
                } else {
                    el.innerHTML = value;
                }
            } catch (err) {
                console.error(`i18n update failed for key: ${key}`, err);
            }
        });

        document.documentElement.lang = this.currentLang;
        document.dispatchEvent(new CustomEvent('i18n:updated', { detail: { lang: this.currentLang } }));
    }

    t(key, fallback) {
        return this.lookup(key) || fallback;
    }

    setLanguage(lang) {
        if (lang === this.currentLang)
            return;

        this.currentLang = lang;
        try {
            localStorage.setItem('site-lang', lang);
        } catch (e) { /* storage blocked: language only lasts for this page */ }

        // Use the existing hyperspace effect for transition
        if (typeof engageHyperspace === 'function') {
            try {
                engageHyperspace();
            } catch (e) {
                console.warn("Hyperspace effect failed:", e);
            }
            setTimeout(() => this.updateUI(), 500);
        } else {
            this.updateUI();
        }
    }

    toggleLanguage() {
        const nextLang = this.currentLang === 'fr' ? 'en' : 'fr';
        this.setLanguage(nextLang);
    }

    injectToggle() {
        const navContainer = document.querySelector('.nav-container');
        if (!navContainer)
            return;

        const toggle = document.createElement('div');
        toggle.className = 'lang-switcher';
        toggle.innerHTML = `
            <button type="button" class="hologram-btn lang-btn" aria-label="Switch language / Changer de langue">
                <span class="btn-content" data-i18n="nav-lang-toggle">${this.currentLang === 'fr' ? 'EN' : 'FR'}</span>
                <span class="btn-glitch"></span>
            </button>
        `;
        const content = toggle.querySelector('.btn-content');
        content.dataset.i18nOriginal = 'EN';
        toggle.querySelector('button').addEventListener('click', () => this.toggleLanguage());

        const navLinks = navContainer.querySelector('.nav-links');
        if (navLinks) {
            const li = document.createElement('li');
            li.appendChild(toggle);
            navLinks.appendChild(li);
        }
    }
}

// Global instance
window.i18n = new I18nManager();
