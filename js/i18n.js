/**
 * i18n Engine for Imperial Datapad
 */

class I18nManager {
    constructor() {
        this.currentLang = localStorage.getItem('site-lang') || 'fr';
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.updateUI();
            this.injectToggle();
        });
    }

    updateUI() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            try {
                if (translations[this.currentLang] && translations[this.currentLang][key]) {
                    const text = translations[this.currentLang][key];
                    
                    if (el.classList.contains('btn-content')) {
                        el.innerText = text;
                    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        el.placeholder = text;
                    } else {
                        el.innerHTML = text;
                    }
                }
            } catch (err) {
                console.error(`i18n update failed for key: ${key}`, err);
            }
        });

        // Update document lang attribute
        document.documentElement.lang = this.currentLang;
    }

    setLanguage(lang) {
        console.log(`Switching language to: ${lang}`);
        if (lang === this.currentLang) return;
        
        this.currentLang = lang;
        localStorage.setItem('site-lang', lang);
        
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
        if (!navContainer) return;

        const toggle = document.createElement('div');
        toggle.className = 'lang-switcher';
        toggle.innerHTML = `
            <button class="hologram-btn lang-btn" onclick="i18n.toggleLanguage()" style="padding: 5px 10px; font-size: 0.7rem; margin-left: 1rem; min-width: 80px;">
                <span class="btn-content" data-i18n="nav-lang-toggle">${this.currentLang === 'fr' ? 'EN' : 'FR'}</span>
                <span class="btn-glitch"></span>
            </button>
        `;
        
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
