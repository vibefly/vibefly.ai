(function () {
    'use strict';

    var formCfg = window.__FORM_CONFIG || {};

    /* ---------- Mobile Nav Toggle ---------- */
    var navToggle = document.getElementById('nav-toggle');
    var mainNav = document.getElementById('main-nav');

    if (navToggle && mainNav) {
        navToggle.addEventListener('click', function () {
            var isOpen = mainNav.classList.toggle('is-open');
            navToggle.setAttribute('aria-expanded', isOpen);
        });

        mainNav.querySelectorAll('.nav-link').forEach(function (link) {
            link.addEventListener('click', function () {
                mainNav.classList.remove('is-open');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* ---------- Smooth Scroll ---------- */
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            var targetId = this.getAttribute('href');
            if (targetId === '#') return;

            var target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
                history.pushState(null, '', targetId);
            }
        });
    });

    /* ---------- Section Reveal on Scroll ---------- */
    var sections = document.querySelectorAll('.section');

    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('section-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -10% 0px'
        });

        sections.forEach(function (section) {
            observer.observe(section);
        });
    } else {
        sections.forEach(function (section) {
            section.classList.add('section-visible');
        });
    }

    /* ---------- Contact Form AJAX Submission ---------- */
    var form = document.getElementById('contact-form');
    if (!form) return;

    var contactSection = document.getElementById('contact');
    var heading = contactSection.querySelector('.section-heading');
    var subtext = contactSection.querySelector('.contact-subtext');
    var formAction = form.action;

    var statusMessages = formCfg.statusMessages || [
        'Sending your message\u2026',
        'Almost there\u2026'
    ];

    function sleep(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var formData = new FormData(form);
        var btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;

        contactSection.style.minHeight = contactSection.offsetHeight + 'px';

        /* Phase 1: Fade out form */
        form.classList.add('is-hidden');
        subtext.style.opacity = '0';

        setTimeout(function () {
            form.style.display = 'none';
            beginSending(formData);
        }, 450);
    });

    function beginSending(formData) {
        /* Phase 2: Show progress UI */
        var sending = document.createElement('div');
        sending.className = 'contact-sending';
        sending.innerHTML =
            '<div class="sending-status"></div>' +
            '<div class="sending-progress-track">' +
                '<div class="sending-progress-bar"></div>' +
            '</div>';
        contactSection.insertBefore(sending, form);

        var statusEl = sending.querySelector('.sending-status');
        var barEl = sending.querySelector('.sending-progress-bar');

        requestAnimationFrame(function () {
            sending.classList.add('is-visible');
        });

        /* Cycle status messages */
        var msgIdx = 0;
        statusEl.textContent = statusMessages[msgIdx++];

        var msgTimer = setInterval(function () {
            statusEl.style.opacity = '0';
            statusEl.style.transform = 'translateY(-8px)';
            setTimeout(function () {
                statusEl.textContent = statusMessages[msgIdx % statusMessages.length];
                msgIdx++;
                statusEl.style.transform = 'translateY(8px)';
                requestAnimationFrame(function () {
                    statusEl.style.opacity = '1';
                    statusEl.style.transform = 'translateY(0)';
                });
            }, 200);
        }, 1800);

        /* Animate bar to ~75% */
        requestAnimationFrame(function () {
            barEl.style.width = '75%';
        });

        /* Fire the fetch */
        fetch(formAction, {
            method: 'POST',
            body: formData,
            headers: { 'Accept': 'application/json' }
        }).then(function (res) {
            return res.ok;
        }).catch(function () {
            return false;
        }).then(function (ok) {
            clearInterval(msgTimer);

            if (ok) {
                /* Phase 3: Complete bar */
                barEl.classList.add('is-complete');
                statusEl.style.opacity = '0';
                setTimeout(function () {
                    statusEl.textContent = formCfg.deliveredMessage || 'Message delivered!';
                    statusEl.style.opacity = '1';
                    statusEl.style.transform = 'translateY(0)';
                }, 150);

                sleep(1400).then(function () {
                    /* Phase 4: Transition to Thank You */
                    sending.classList.remove('is-visible');
                    setTimeout(function () {
                        sending.remove();
                        showThankYou();
                    }, 500);
                });
            } else {
                /* Error: bring form back */
                sending.classList.remove('is-visible');
                setTimeout(function () {
                    sending.remove();
                    form.style.display = '';
                    var btn = form.querySelector('button[type="submit"]');
                    btn.disabled = false;
                    requestAnimationFrame(function () {
                        form.classList.remove('is-hidden');
                        subtext.style.opacity = '1';
                    });
                }, 500);
            }
        });
    }

    function showThankYou() {
        heading.style.opacity = '0';
        setTimeout(function () {
            heading.textContent = formCfg.thankYouHeading || 'Thank You';
            heading.style.opacity = '1';
        }, 300);

        subtext.style.display = 'none';

        var ty = document.createElement('div');
        ty.className = 'form-thank-you';
        ty.innerHTML =
            '<p>' + (formCfg.thankYouMessage || 'We received your message.') + '</p>' +
            '<p class="thank-you-subtext">' + (formCfg.thankYouSubtext || '') + '</p>';
        contactSection.insertBefore(ty, form);
        form.remove();

        requestAnimationFrame(function () {
            ty.classList.add('is-visible');
        });
    }
})();
