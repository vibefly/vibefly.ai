/* content-loader.js — Populates the DOM from content.json */

(async function () {
    'use strict';

    var data;
    try { data = await window.__CONTENT; } catch (e) { return; }
    if (!data) return;

    /* Globals for main.js */
    window.__FORM_CONFIG = data.contact || {};

    /* Theme — set CSS custom properties before any paint */
    if (data.theme) {
        var root = document.documentElement.style;
        var t = data.theme;
        if (t.darkBg)          root.setProperty('--color-dark-bg', t.darkBg);
        if (t.accentNeon)      root.setProperty('--color-accent-neon', t.accentNeon);
        if (t.accentBlue)      root.setProperty('--color-accent-blue', t.accentBlue);
        if (t.borderCard)      root.setProperty('--color-border-card', t.borderCard);
        if (t.borderCardHover) root.setProperty('--color-border-card-hover', t.borderCardHover);
        if (t.textSecondary)   root.setProperty('--color-text-secondary', t.textSecondary);
    }

    /* Meta */
    if (data.meta) {
        if (data.meta.title) document.title = data.meta.title;
        var desc = document.querySelector('meta[name="description"]');
        if (desc && data.meta.description) desc.setAttribute('content', data.meta.description);
    }

    /* Resolve dotted path */
    function resolve(path) {
        return path.split('.').reduce(function (o, k) { return o && o[k]; }, data);
    }

    /* Simple text bindings */
    document.querySelectorAll('[data-content]').forEach(function (el) {
        var val = resolve(el.dataset.content);
        if (val !== undefined && val !== null) el.textContent = val;
    });

    /* Attribute bindings (data-content-attr-<attrname>="path") */
    document.querySelectorAll('[data-content-attr-href]').forEach(function (el) {
        var val = resolve(el.dataset.contentAttrHref);
        if (val) el.setAttribute('href', val);
    });

    /* Nav links */
    var navList = document.querySelector('[data-content-nav]');
    if (navList && data.nav && Array.isArray(data.nav)) {
        navList.innerHTML = '';
        data.nav.forEach(function (item) {
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.className = 'nav-link';
            a.href = item.href;
            a.textContent = item.label;
            li.appendChild(a);
            navList.appendChild(li);
        });
    }

    /* Steps grid — build cards dynamically */
    var stepsGrid = document.querySelector('[data-steps-grid]');
    if (stepsGrid && data.steps && Array.isArray(data.steps.items)) {
        stepsGrid.innerHTML = '';
        data.steps.items.forEach(function (item) {
            var iconDiv = document.createElement('div');
            iconDiv.className = 'step-card__icon';
            var i = document.createElement('i');
            i.setAttribute('data-lucide', item.icon);
            i.setAttribute('width', '40');
            i.setAttribute('height', '40');
            iconDiv.appendChild(i);

            var numDiv = document.createElement('div');
            numDiv.className = 'step-card__number';
            numDiv.textContent = item.number;

            var title = document.createElement('h3');
            title.className = 'step-card__title';
            title.textContent = item.title;

            var text = document.createElement('p');
            text.className = 'step-card__text';
            text.textContent = item.text;

            var card = document.createElement('div');
            card.className = 'step-card';
            card.appendChild(iconDiv);
            card.appendChild(numDiv);
            card.appendChild(title);
            card.appendChild(text);

            stepsGrid.appendChild(card);
        });
    }

    /* Footer credit link */
    var creditLink = document.querySelector('[data-content-footer-credit]');
    if (creditLink && data.footer) {
        if (data.footer.creditName) creditLink.textContent = data.footer.creditName;
        if (data.footer.creditUrl) creditLink.href = data.footer.creditUrl;
    }

    /* Render Lucide icons */
    if (window.lucide) {
        lucide.createIcons();
    }

    /* Reveal page */
    document.body.classList.add('content-loaded');
})();

/* Safety fallback */
setTimeout(function () { document.body.classList.add('content-loaded'); }, 800);
