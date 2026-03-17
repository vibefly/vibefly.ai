import { escHtml, escAttr, handleSubmit, computeTurnstileTheme } from './worker-utils.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/api/submit') {
            return handleSubmit(request, env);
        }

        if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
            return renderPage(env, url);
        }

        return env.ASSETS.fetch(request);
    }
};



async function renderPage(env, url) {
    try {
        const [htmlRes, contentRes] = await Promise.all([
            env.ASSETS.fetch(new Request(url.href)),
            env.ASSETS.fetch(new Request(new URL('/content.json', url).href)),
        ]);

        if (!htmlRes.ok || !contentRes.ok) return env.ASSETS.fetch(new Request(url.href));

        const [html, content] = await Promise.all([htmlRes.text(), contentRes.json()]);

        const biz = content.business || {};
        const formCfg = content.form || {};
        if (!formCfg.thankYouSub && formCfg.thankYouSubtext) formCfg.thankYouSub = formCfg.thankYouSubtext;
        if (!formCfg.thankYouSubtext && formCfg.thankYouSub) formCfg.thankYouSubtext = formCfg.thankYouSub;

        const sections = (content.pages && content.pages.home && content.pages.home.sections) || [];
        const nav = Array.isArray(content.nav) ? content.nav : [];
        const phone = biz.phone || '';
        const phoneHref = biz.phoneHref || (phone ? `tel:${phone.replace(/\D/g, '')}` : '#');

        function resolve(path) {
            return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), content);
        }

        // ── Head: string replacement ──────────────────────────────────────────
        const titleText = (content.meta && content.meta.title) || biz.name || '';
        const description = (content.meta && content.meta.description) || '';
        const canonical = url.origin + url.pathname;
        const ogTags = [
            `<meta property="og:type" content="website">`,
            `<meta property="og:url" content="${escAttr(canonical)}">`,
            `<meta property="og:title" content="${escAttr(titleText)}">`,
            `<meta property="og:description" content="${escAttr(description)}">`,
        ].join('\n');

        let siteImages = [];
        try {
            const imagesRes = await env.ASSETS.fetch(new Request(new URL('/images.json', url).href));
            if (imagesRes.ok) siteImages = await imagesRes.json();
        } catch { /* no images yet */ }

        const pricingToggleFn = `<script>function pricingToggle(btn){var wrap=document.getElementById('pricing-toggle-wrap');var grid=wrap&&wrap.querySelector('.pricing-grid');if(!wrap||!grid)return;var isAnnual=btn.getAttribute('data-period')==='annual';wrap.querySelectorAll('.pricing-toggle__btn').forEach(function(b){b.classList.toggle('is-active',b===btn);});if(isAnnual){wrap.classList.add('pricing-section--annual');grid.querySelectorAll('.pricing-card__amount').forEach(function(el){el.textContent=el.getAttribute('data-annual')||el.textContent;});grid.querySelectorAll('.pricing-card__period').forEach(function(el){el.textContent='/yr';});}else{wrap.classList.remove('pricing-section--annual');grid.querySelectorAll('.pricing-card__amount').forEach(function(el){el.textContent=el.getAttribute('data-monthly')||el.textContent;});grid.querySelectorAll('.pricing-card__period').forEach(function(el){el.textContent='/mo';});}}function lfSelect(card){document.querySelectorAll('.launch-fee__card').forEach(function(c){c.classList.remove('launch-fee__card--selected');});card.classList.add('launch-fee__card--selected');}function lfStep(btn,delta,base,extra,minPages){var card=btn.closest('.launch-fee__card');var countEl=card.querySelector('.launch-fee__stepper-count');var totalEl=card.querySelector('.launch-fee__card-total');var count=parseInt(countEl.textContent)+delta;if(count<minPages)count=minPages;countEl.textContent=count;var extraPages=count-minPages;if(extraPages>0){totalEl.textContent='Total: $'+(base+extraPages*extra);totalEl.style.display='block';}else{totalEl.style.display='none';}}<\/script>`;
        const inlineScripts = `<script>window.__BUSINESS=${JSON.stringify(biz)};window.__FORM_CONFIG=${JSON.stringify(formCfg)};window.__IMAGES=${JSON.stringify(siteImages)};</script>` + pricingToggleFn;

        let modifiedHtml = html;
        modifiedHtml = modifiedHtml.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(titleText)}</title>`);
        modifiedHtml = modifiedHtml.replace(/(<meta name="description" content=")[^"]*(")/,
            `$1${escAttr(description)}$2`);
        modifiedHtml = modifiedHtml.replace(/<script id="content-fetch">[\s\S]*?<\/script>\n?/, '');
        modifiedHtml = modifiedHtml.replace('</head>', `${ogTags}\n${inlineScripts}\n</head>`);

        // ── Body: HTMLRewriter ────────────────────────────────────────────────
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
            tsHtml = `<div style="display:flex;justify-content:center;margin-top:1.25rem;"><div class="cf-turnstile" data-sitekey="${escAttr(formCfg.turnstileSiteKey)}" data-theme="${tsTheme}"></div></div>`;
        }

        const serviceAreas = (content.contact && content.contact.serviceAreas) || [];
        const areasText = serviceAreas.join(', ');
        const areasListHtml = serviceAreas.map(a => `<li>${escHtml(a)}</li>`).join('');

        const hours = (content.contact && content.contact.hours) || [];
        const hoursHtml = `<strong>Hours</strong>${hours.map(h => `<span>${escHtml(h)}</span>`).join('')}`;

        const footerSvc = sections.find(s => s.items && s.items.length > 0 && !s.items[0].quote);
        const footerSvcHtml = footerSvc ? footerSvc.items.map(item =>
            `<li><a href="#${escAttr(footerSvc.id || 'services')}">${escHtml(item.title || '')}</a></li>`
        ).join('') : '';

        const rewriter = new HTMLRewriter()
            .on('body', {
                element(el) {
                    const cls = el.getAttribute('class') || '';
                    el.setAttribute('class', (cls + ' content-loaded').trim());
                }
            })
            .on('[data-content]', {
                element(el) {
                    const val = resolve(el.getAttribute('data-content'));
                    if (val != null) el.setInnerContent(String(val));
                }
            })
            .on('[data-content-attr-href]', {
                element(el) {
                    const val = resolve(el.getAttribute('data-content-attr-href'));
                    if (val) el.setAttribute('href', String(val));
                }
            })
            .on('[data-content-nav]', {
                element(el) { el.setInnerContent(navHtml, { html: true }); }
            })
            .on('[data-content-phone]', {
                element(el) {
                    el.setInnerContent(phone);
                    if (el.tagName === 'a') el.setAttribute('href', phoneHref);
                }
            })
            .on('[data-phone-href]', {
                element(el) {
                    if (el.tagName === 'a') el.setAttribute('href', phoneHref);
                }
            })
            .on('[data-content-email]', {
                element(el) {
                    el.setInnerContent(biz.email || '');
                    if (el.tagName === 'a' && biz.email) el.setAttribute('href', `mailto:${biz.email}`);
                }
            })
            .on('[data-content-list="contact.hours"]', {
                element(el) { el.setInnerContent(hoursHtml, { html: true }); }
            })
            .on('[data-content-areas-text]', {
                element(el) { el.setInnerContent(areasText); }
            })
            .on('[data-content-areas-list]', {
                element(el) { el.setInnerContent(areasListHtml, { html: true }); }
            })
            .on('#sections-container', {
                element(el) { el.setInnerContent(sectionsHtml, { html: true }); }
            })
            .on('#form-fields-placeholder', {
                element(el) { el.replace(fieldsHtml + (tsHtml ? '\n' + tsHtml : ''), { html: true }); }
            })
            .on('button[type="submit"]', {
                element(el) {
                    if (formCfg.submitLabel) el.setInnerContent(formCfg.submitLabel);
                }
            })
            .on('[data-content-footer-services]', {
                element(el) { el.setInnerContent(footerSvcHtml, { html: true }); }
            })
            .on('[data-content-footer-credit]', {
                element(el) {
                    if (content.footer && content.footer.creditName) el.setInnerContent(content.footer.creditName);
                    if (content.footer && content.footer.creditUrl) el.setAttribute('href', content.footer.creditUrl);
                }
            })
            .on('[data-content-copyright]', {
                element(el) {
                    if (content.footer && content.footer.copyright) el.setInnerContent(content.footer.copyright);
                }
            });

        return rewriter.transform(new Response(modifiedHtml, {
            status: 200,
            headers: {
                'Content-Type': 'text/html;charset=UTF-8',
                'Cache-Control': 'no-store',
            },
        }));

    } catch (e) {
        console.error('renderPage error:', e);
        return env.ASSETS.fetch(new Request(url.href));
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
            // Launch fee table
            let launchHtml = '';
            if (sec.launchFee) {
                const lf = sec.launchFee;
                const lfCards = (lf.items || []).map((item, idx) => {
                    const selClass = idx === 0 ? ' launch-fee__card--selected' : '';
                    const stepper = item.basePages
                        ? `<div class="launch-fee__stepper"><button class="launch-fee__stepper-btn" onclick="lfStep(this,-1,${item.price},${item.extraPagePrice||99},${item.basePages});event.stopPropagation()">−</button><span class="launch-fee__stepper-count">${item.basePages}</span><span class="launch-fee__stepper-label"> pages</span><button class="launch-fee__stepper-btn" onclick="lfStep(this,1,${item.price},${item.extraPagePrice||99},${item.basePages});event.stopPropagation()">+</button></div><p class="launch-fee__card-total"></p>`
                        : '';
        return `<div class="launch-fee__card${selClass}" onclick="lfSelect(this)"><h4 class="launch-fee__card-name">${escHtml(item.name||'')}</h4><p class="launch-fee__card-price">$${item.price}</p><p class="launch-fee__card-desc">${escHtml(item.description||'')}</p>${stepper}</div>`;
                }).join('');
                launchHtml = `<div class="launch-fee"><p class="launch-fee__label">${escHtml(lf.heading||'')}</p><div class="launch-fee__cards">${lfCards}</div></div>`;
            }

            // Toggle
            const toggleHtml = `<div class="pricing-toggle"><button class="pricing-toggle__btn is-active" data-period="monthly" onclick="pricingToggle(this)">Monthly</button><button class="pricing-toggle__btn" data-period="annual" onclick="pricingToggle(this)">Annual</button></div>`;

            // Cards
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
                if (item.icon)   inner += `<div class="card__icon"><i data-lucide="${escAttr(item.icon)}" width="40" height="40"></i></div>`;
                if (item.number) inner += `<div class="card__number">${escHtml(String(item.number))}</div>`;
                if (item.title)  inner += `<h3 class="card__title">${escHtml(item.title)}</h3>`;
                if (item.text)   inner += `<p class="card__text">${escHtml(item.text)}</p>`;
                return `<div class="card">${inner}</div>`;
            }).join('');
            gridHtml = `<div class="cards-grid">${cards}</div>`;
        }
    }

    return `<section${idAttr} class="section section-visible${useAlt ? ' section--alt' : ''}"><div class="container"><div class="section__header">${headerHtml}</div>${gridHtml}</div></section>`;
}
