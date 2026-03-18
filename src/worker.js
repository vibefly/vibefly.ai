import { escHtml, escAttr, handleSubmit, computeTurnstileTheme } from './worker-utils.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/api/submit') {
            return handleSubmit(request, env);
        }

        if (request.method === 'GET') {
            if (url.pathname === '/terms' || url.pathname === '/privacy') {
                return renderLegalPage(env, url);
            }
            if (url.pathname === '/' || url.pathname === '/index.html') {
                return renderPage(env, url);
            }
        }

        return env.ASSETS.fetch(request);
    }
};

async function renderPage(env, url) {
    try {
        const contentRes = await env.ASSETS.fetch(new Request(new URL('/content.json', url).href));
        if (!contentRes.ok) return new Response('Not found', { status: 404 });

        const content = await contentRes.json();

        const biz = content.business || {};
        const formCfg = content.form || {};
        if (!formCfg.thankYouSub && formCfg.thankYouSubtext) formCfg.thankYouSub = formCfg.thankYouSubtext;
        if (!formCfg.thankYouSubtext && formCfg.thankYouSub) formCfg.thankYouSubtext = formCfg.thankYouSub;

        const sections = (content.pages && content.pages.home && content.pages.home.sections) || [];
        const nav = Array.isArray(content.nav) ? content.nav : [];

        const titleText = (content.meta && content.meta.title) || biz.name || '';
        const description = (content.meta && content.meta.description) || '';
        const canonical = url.origin + url.pathname;

        // ── Build content fragments ───────────────────────────────────────────

        const navHtml = nav.map(item =>
            `<li><a class="nav-link" href="${escAttr(item.href || '#')}">${escHtml(item.label || '')}</a></li>`
        ).join('');

        const sectionsHtml = sections.map((sec, idx) => renderSection(sec, idx)).join('\n');

        let fieldsHtml = '';
        if (formCfg.fields) {
            fieldsHtml = formCfg.fields.map(field => {
                const id = `contact-${field.name}`;
                const req = field.required ? ' required' : '';
                let inputHtml;
                if (field.type === 'textarea') {
                    inputHtml = `<textarea id="${id}" name="${escAttr(field.name)}" rows="${field.rows || 4}" placeholder="${escAttr(field.placeholder || '')}"${req}></textarea>`;
                } else if (field.type === 'select') {
                    const opts = (field.options || []).map(o =>
                        `<option value="${escAttr(String(o.value))}">${escHtml(String(o.label))}</option>`
                    ).join('');
                    inputHtml = `<select id="${id}" name="${escAttr(field.name)}"${req}><option value="">${escHtml(field.placeholder || 'Select\u2026')}</option>${opts}</select>`;
                } else {
                    inputHtml = `<input type="${escAttr(field.type || 'text')}" id="${id}" name="${escAttr(field.name)}" placeholder="${escAttr(field.placeholder || '')}"${req}>`;
                }
                return `<label for="${id}">${escHtml(field.label || '')}</label>${inputHtml}`;
            }).join('\n');
        }

        let tsHtml = '';
        if (formCfg.turnstileSiteKey) {
            const tsTheme = computeTurnstileTheme(content.theme);
            tsHtml = `<div style="display:flex;justify-content:center;margin-top:2rem;"><div class="cf-turnstile" data-sitekey="${escAttr(formCfg.turnstileSiteKey)}" data-theme="${tsTheme}"></div></div>`;
        }

        const ogTags = [
            `<meta property="og:type" content="website">`,
            `<meta property="og:url" content="${escAttr(canonical)}">`,
            `<meta property="og:title" content="${escAttr(titleText)}">`,
            `<meta property="og:description" content="${escAttr(description)}">`,
        ].join('\n');

        const inlineScripts = `<script>window.__BUSINESS=${JSON.stringify(biz)};window.__FORM_CONFIG=${JSON.stringify(formCfg)};window.__IMAGES=[];</script>`;

        // Pricing toggle function
        const pricingToggleFn = `<script>function pricingToggle(btn){var wrap=document.getElementById('pricing-toggle-wrap');var grid=wrap&&wrap.querySelector('.pricing-grid');if(!wrap||!grid)return;var isAnnual=btn.getAttribute('data-period')==='annual';wrap.querySelectorAll('.pricing-toggle__btn').forEach(function(b){b.classList.toggle('is-active',b===btn);});if(isAnnual){wrap.classList.add('pricing-section--annual');grid.querySelectorAll('.pricing-card__amount').forEach(function(el){el.textContent=el.getAttribute('data-annual')||el.textContent;});grid.querySelectorAll('.pricing-card__period').forEach(function(el){el.textContent='/yr';});}else{wrap.classList.remove('pricing-section--annual');grid.querySelectorAll('.pricing-card__amount').forEach(function(el){el.textContent=el.getAttribute('data-monthly')||el.textContent;});grid.querySelectorAll('.pricing-card__period').forEach(function(el){el.textContent='/mo';});}}function lfSelect(card){document.querySelectorAll('.launch-fee__card').forEach(function(c){c.classList.remove('launch-fee__card--selected');});card.classList.add('launch-fee__card--selected');}function lfStep(btn,delta,base,extra,minPages){var card=btn.closest('.launch-fee__card');var countEl=card.querySelector('.launch-fee__stepper-count');var totalEl=card.querySelector('.launch-fee__card-total');var count=parseInt(countEl.textContent)+delta;if(count<minPages)count=minPages;countEl.textContent=count;var extraPages=count-minPages;if(extraPages>0){totalEl.textContent='Total: $'+(base+extraPages*extra);totalEl.style.display='block';}else{totalEl.style.display='none';}}<\/script>`;

        const logo = content.logo || {};
        const hero = content.hero || {};
        const contact = content.contact || {};
        const footer = content.footer || {};
        const submitLabel = escHtml(formCfg.submitLabel || 'Send Message');
        const heroCtaHref = escAttr(hero.ctaHref || '#contact');
        const heroCtaText = escHtml(hero.ctaText || 'Get Started');

        const creditHtml = footer.creditName
            ? `<p class="footer-credit"><span>${escHtml(footer.creditText || 'Built by')}</span> <a href="${escAttr(footer.creditUrl || '#')}" target="_blank" rel="noopener">${escHtml(footer.creditName)}</a></p>`
            : '';

        // ── Build complete HTML ───────────────────────────────────────────────

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(titleText)}</title>
    <meta name="description" content="${escAttr(description)}">
    ${ogTags}
    <link rel="stylesheet" href="template.css">
    ${inlineScripts}
    ${pricingToggleFn}
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" defer></script>
    <script src="js/lucide.min.js" defer onload="lucide.createIcons()"></script>
    <script src="js/main.js" defer></script>
    <style>body{opacity:0}body.content-loaded{opacity:1;transition:opacity .15s}</style>
    <noscript><style>body{opacity:1}</style></noscript>
</head>
<body class="content-loaded">

    <div class="bg-orbs" aria-hidden="true">
        <div class="bg-orb bg-orb--1"></div>
        <div class="bg-orb bg-orb--2"></div>
        <div class="bg-orb bg-orb--3"></div>
    </div>

    <header class="site-header" role="banner">
        <div class="header-inner">
            <a href="#hero" class="logo">
                <span>${escHtml(logo.name || biz.name || '')}</span><span class="logo-dot">${escHtml(logo.tld || '')}</span>
            </a>
            <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
                <span class="nav-toggle__bar"></span>
                <span class="nav-toggle__bar"></span>
                <span class="nav-toggle__bar"></span>
            </button>
            <nav class="main-nav" id="main-nav" role="navigation">
                <ul class="nav-list">${navHtml}</ul>
            </nav>
        </div>
    </header>

    <section id="hero" class="hero" data-section="hero">
        <div class="hero-bg">
            <div class="hero-orb hero-orb--1"></div>
            <div class="hero-orb hero-orb--2"></div>
            <div class="hero-orb hero-orb--3"></div>
            <div class="hero-grid"></div>
        </div>
        <div class="hero-content">
            <p class="hero-tagline">${escHtml(hero.label || '')}</p>
            <h1 class="hero-title">${escHtml(hero.title || '')}</h1>
            <p class="hero-subtext">${escHtml(hero.subtext || '')}</p>
            <a href="${heroCtaHref}" class="primary-shiny-btn cta-button--wide">${heroCtaText}</a>
        </div>
    </section>

    <div id="sections-container">${sectionsHtml}</div>

    <section id="contact" class="section section--contact" data-section="contact">
        <h2 class="section-heading">${escHtml(contact.heading || 'Get in Touch')}</h2>
        <p class="contact-subtext">${escHtml(contact.subheading || '')}</p>
        <form id="contact-form" class="contact-form" action="/api/submit" method="POST">
            <input type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot">
            ${fieldsHtml}
            ${tsHtml}
            <button type="submit" class="primary-shiny-btn cta-button--wide">${submitLabel}</button>
        </form>
    </section>

    <footer class="site-footer">
        <span class="footer-copy">&copy; ${escHtml(biz.year || new Date().getFullYear().toString())} ${escHtml(biz.name || '')}</span>
        <span class="footer-sep" aria-hidden="true">|</span>
        <a href="/terms">Terms</a>
        <span class="footer-sep" aria-hidden="true">|</span>
        <a href="/privacy">Privacy</a>
        ${creditHtml ? `<span class="footer-sep" aria-hidden="true">|</span>${creditHtml}` : ''}
    </footer>

</body>
</html>`;

        return new Response(html, {
            status: 200,
            headers: {
                'Content-Type': 'text/html;charset=UTF-8',
                'Cache-Control': 'no-store',
            },
        });

    } catch (e) {
        console.error('renderPage error:', e);
        return new Response('Internal server error', { status: 500 });
    }
}

function renderSection(sec, idx) {
    const isPricing     = sec.type === 'pricing';
    const isTestimonial = !isPricing && sec.items && sec.items.length > 0 && sec.items[0].quote !== undefined;
    const useAlt = idx % 2 === 1;
    const idAttr = sec.id ? ` id="${escAttr(sec.id)}"` : '';

    let headerHtml = '';
    if (sec.label)      headerHtml += `<p class="section__label">${escHtml(sec.label)}</p>`;
    if (sec.heading)    headerHtml += `<h2 class="section-heading">${escHtml(sec.heading)}</h2>`;
    if (sec.subheading) headerHtml += `<p class="section__subheading">${escHtml(sec.subheading)}</p>`;

    let gridHtml = '';
    if (sec.items && sec.items.length > 0) {
        if (isPricing) {
            let launchHtml = '';
            if (sec.launchFee) {
                const lf = sec.launchFee;
                const lfCards = (lf.items || []).map((item) => {
                    const stepper = item.basePages
                        ? `<div class="launch-fee__stepper"><button class="launch-fee__stepper-btn" onclick="lfStep(this,-1,${item.price},${item.extraPagePrice||99},${item.basePages});event.stopPropagation()">−</button><span class="launch-fee__stepper-count">${item.basePages}</span><span class="launch-fee__stepper-label"> pages</span><button class="launch-fee__stepper-btn" onclick="lfStep(this,1,${item.price},${item.extraPagePrice||99},${item.basePages});event.stopPropagation()">+</button></div><p class="launch-fee__card-total"></p>`
                        : '';
                    return `<div class="launch-fee__card" onclick="lfSelect(this)"><h4 class="launch-fee__card-name">${escHtml(item.name||'')}</h4><p class="launch-fee__card-price">$${item.price}</p><p class="launch-fee__card-desc">${escHtml(item.description||'')}</p>${stepper}</div>`;
                }).join('');
                launchHtml = `<div class="launch-fee"><p class="launch-fee__label">${escHtml(lf.heading||'')}</p><div class="launch-fee__cards">${lfCards}</div></div>`;
            }

            const toggleHtml = `<div class="pricing-toggle"><button class="pricing-toggle__btn is-active" data-period="monthly" onclick="pricingToggle(this)">Monthly</button><button class="pricing-toggle__btn" data-period="annual" onclick="pricingToggle(this)">Annual</button></div>`;

            const cards = sec.items.map(item => {
                const featured = item.featured ? ' pricing-card--featured' : '';
                const turnaround = item.turnaround ? `<p class="pricing-card__turnaround">${escHtml(item.turnaround)}</p>` : '';
                const savings = item.annualSavings ? `<p class="pricing-card__savings">${escHtml(item.annualSavings)}</p>` : '';
                const bullets = (item.bullets || []).map(b => `<li>${escHtml(b)}</li>`).join('');
                const cta = item.cta ? `<a class="pricing-card__cta" href="${escAttr(item.ctaHref || '#contact')}">${escHtml(item.cta)}</a>` : '';
                return `<div class="pricing-card${featured}">` +
                    `<h3 class="pricing-card__name">${escHtml(item.name || '')}</h3>` +
                    `<div class="pricing-card__price"><span class="pricing-card__amount" data-monthly="${escAttr(item.price || '')}" data-annual="${escAttr(item.annualPrice || item.price || '')}">${escHtml(item.price || '')}</span><span class="pricing-card__period">/mo</span></div>` +
                    savings + turnaround +
                    `<ul class="pricing-card__bullets">${bullets}</ul>` +
                    cta + `</div>`;
            }).join('');
            gridHtml = `<div id="pricing-toggle-wrap">${launchHtml}${toggleHtml}<div class="pricing-grid">${cards}</div></div>`;
        } else if (isTestimonial) {
            const cards = sec.items.map(item => {
                const stars = Array(item.stars || 5).fill(
                    `<svg width="20" height="20" viewBox="0 0 20 20" fill="var(--color-star)"><path d="M10 1l2.5 5.5H18l-4.5 3.5 1.5 5.5L10 13l-5 2.5 1.5-5.5L2 6.5h5.5z"/></svg>`
                ).join('');
                return `<div class="testimonial-card"><div class="testimonial-card__stars">${stars}</div><blockquote class="testimonial-card__quote">${escHtml(item.quote || '')}</blockquote><div class="testimonial-card__author"><strong>${escHtml(item.author || '')}</strong><span>${escHtml(item.role || '')}</span></div></div>`;
            }).join('');
            gridHtml = `<div class="testimonials-grid">${cards}</div>`;
        } else {
            const cards = sec.items.map(item => {
                let inner = '';
                const titleHtml = item.title ? `<h3 class="card__title">${escHtml(item.title)}</h3>` : '';
                const iconHtml = item.icon ? `<div class="card__icon"><i data-lucide="${escAttr(item.icon)}"></i></div>` : '';
                inner += `<div class="card__header">${titleHtml}${iconHtml}</div>`;
                if (item.text) inner += `<p class="card__text">${escHtml(item.text)}</p>`;
                return `<div class="card">${inner}</div>`;
            }).join('');
            gridHtml = `<div class="cards-grid">${cards}</div>`;
        }
    }

    return `<section${idAttr} class="section section-visible${useAlt ? ' section--alt' : ''}"><div class="container"><div class="section__header">${headerHtml}</div>${gridHtml}</div></section>`;
}

async function renderLegalPage(env, url) {
    try {
        const contentRes = await env.ASSETS.fetch(new Request(new URL('/content.json', url).href));
        if (!contentRes.ok) return new Response('Not found', { status: 404 });
        const content = await contentRes.json();

        const type = url.pathname === '/terms' ? 'terms' : 'privacy';
        const biz = content.business || {};
        const nav = Array.isArray(content.nav) ? content.nav : [];
        const logo = content.logo || {};
        const footer = content.footer || {};
        const legal = content.legal || {};
        const pageConfig = legal[type] || {};

        const defaults = type === 'terms' ? defaultTerms(biz) : defaultPrivacy(biz);
        const heading = pageConfig.heading || defaults.heading;
        const effectiveDate = pageConfig.effectiveDate || defaults.effectiveDate;
        const intro = pageConfig.intro || defaults.intro;
        const sections = (pageConfig.sections && pageConfig.sections.length > 0)
            ? pageConfig.sections
            : defaults.sections;

        const navHtml = nav.map(item =>
            `<li><a class="nav-link" href="${escAttr(item.href || '#')}">${escHtml(item.label || '')}</a></li>`
        ).join('');

        const creditHtml = footer.creditName
            ? `<p class="footer-credit"><span>${escHtml(footer.creditText || 'Built by')}</span> <a href="${escAttr(footer.creditUrl || '#')}" target="_blank" rel="noopener">${escHtml(footer.creditName)}</a></p>`
            : '';

        const sectionsHtml = sections.map(sec =>
            `<div class="legal-section">
                <h2>${escHtml(sec.heading || '')}</h2>
                ${(sec.body || '').split('\n\n').filter(p => p.trim()).map(p => `<p>${escHtml(p.trim())}</p>`).join('')}
            </div>`
        ).join('');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(heading)} | ${escHtml((content.meta && content.meta.title) || biz.name || '')}</title>
    <link rel="stylesheet" href="/template.css">
    <script>window.__BUSINESS=${JSON.stringify(biz)};window.__FORM_CONFIG={};window.__IMAGES=[];</script>
    <script src="/js/lucide.min.js" defer onload="lucide.createIcons()"></script>
    <style>body{opacity:0}body.content-loaded{opacity:1;transition:opacity .15s}</style>
    <noscript><style>body{opacity:1}</style></noscript>
</head>
<body class="content-loaded">

    <div class="bg-orbs" aria-hidden="true">
        <div class="bg-orb bg-orb--1"></div>
        <div class="bg-orb bg-orb--2"></div>
        <div class="bg-orb bg-orb--3"></div>
    </div>

    <header class="site-header" role="banner">
        <div class="header-inner">
            <a href="/" class="logo">
                <span>${escHtml(logo.name || biz.name || '')}</span><span class="logo-dot">${escHtml(logo.tld || '')}</span>
            </a>
            <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
                <span class="nav-toggle__bar"></span>
                <span class="nav-toggle__bar"></span>
                <span class="nav-toggle__bar"></span>
            </button>
            <nav class="main-nav" id="main-nav" role="navigation">
                <ul class="nav-list">${navHtml}</ul>
            </nav>
        </div>
    </header>

    <main class="legal-page">
        <div class="container">
            <h1>${escHtml(heading)}</h1>
            ${effectiveDate ? `<p class="legal-page__date">Effective date: ${escHtml(effectiveDate)}</p>` : ''}
            ${intro ? `<p class="legal-page__intro">${escHtml(intro)}</p>` : ''}
            ${sectionsHtml}
        </div>
    </main>

    <footer class="site-footer">
        <span class="footer-copy">&copy; ${escHtml(biz.year || new Date().getFullYear().toString())} ${escHtml(biz.name || '')}</span>
        <span class="footer-sep" aria-hidden="true">|</span>
        <a href="/terms">Terms</a>
        <span class="footer-sep" aria-hidden="true">|</span>
        <a href="/privacy">Privacy</a>
        ${creditHtml ? `<span class="footer-sep" aria-hidden="true">|</span>${creditHtml}` : ''}
    </footer>

</body>
</html>`;

        return new Response(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
        });
    } catch (e) {
        console.error('renderLegalPage error:', e);
        return new Response('Internal server error', { status: 500 });
    }
}

function defaultTerms(biz) {
    const name = biz.name || 'this business';
    const email = biz.email || '';
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const sections = [
        { heading: 'Acceptance of Terms', body: 'By accessing or using this website, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our website.' },
        { heading: 'Use of Website', body: 'You may use this website for lawful purposes only. You agree not to use this site in any way that is unlawful, harmful, fraudulent, or otherwise objectionable.' },
        { heading: 'Intellectual Property', body: `All content on this website, including text, graphics, logos, and images, is the property of ${name} and protected by applicable intellectual property laws. You may not reproduce or distribute any content without written permission.` },
        { heading: 'Disclaimer of Warranties', body: 'This website is provided "as is" without any warranties, express or implied. We do not guarantee that the site will be error-free, uninterrupted, or free of harmful components.' },
        { heading: 'Limitation of Liability', body: `${name} shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of, or inability to use, this website.` },
        { heading: 'Changes to Terms', body: 'We reserve the right to update these Terms at any time. Continued use of the website after changes constitutes acceptance of the updated Terms.' },
    ];
    if (email) sections.push({ heading: 'Contact', body: `If you have questions about these Terms of Service, please contact us at ${email}.` });
    return { heading: 'Terms of Service', effectiveDate: date, intro: 'Please read these Terms of Service carefully before using our website.', sections };
}

function defaultPrivacy(biz) {
    const name = biz.name || 'we';
    const email = biz.email || '';
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const sections = [
        { heading: 'Information We Collect', body: 'When you submit our contact form, we collect the information you provide, including your name, email address, phone number, and message. We do not collect information automatically beyond standard server logs.' },
        { heading: 'How We Use Your Information', body: `We use the information you provide solely to respond to your inquiry and communicate with you about our services. ${name} does not sell, rent, or share your personal information with third parties for marketing purposes.` },
        { heading: 'Data Retention', body: 'We retain your contact information only as long as necessary to fulfill your request or as required by law. You may request deletion of your information at any time.' },
        { heading: 'Data Security', body: 'We take reasonable precautions to protect your information. However, no method of transmission over the internet is completely secure, and we cannot guarantee absolute security.' },
        { heading: 'Cookies', body: 'This website may use cookies to improve your browsing experience. Cookies are small text files stored on your device. You can disable cookies through your browser settings, though some features may not function correctly.' },
        { heading: 'Third-Party Services', body: 'This website uses Cloudflare for security and performance services. These services may process technical data such as IP addresses in accordance with their own privacy policies.' },
        { heading: 'Changes to This Policy', body: 'We may update this Privacy Policy from time to time. We will indicate the effective date of the latest version at the top of this page.' },
    ];
    if (email) sections.push({ heading: 'Contact', body: `If you have questions about this Privacy Policy or wish to request deletion of your data, please contact us at ${email}.` });
    return { heading: 'Privacy Policy', effectiveDate: date, intro: 'Your privacy is important to us. This policy explains what information we collect and how we use it.', sections };
}
