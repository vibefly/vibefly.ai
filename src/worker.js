export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/api/submit') {
            return handleSubmit(request, env);
        }

        return env.ASSETS.fetch(request);
    }
};

async function handleSubmit(request, env) {
    try {
        const formData = await request.formData();

        // Collect all non-system fields
        const systemFields = new Set(['_gotcha', 'cf-turnstile-response']);
        const fields = [];
        for (const [key, val] of formData.entries()) {
            if (!systemFields.has(key)) {
                fields.push({ name: key, value: val.toString().trim() });
            }
        }

        const firstName = (formData.get('first_name') || '').trim();
        const lastName  = (formData.get('last_name')  || '').trim();
        const name = (formData.get('name') || [firstName, lastName].filter(Boolean).join(' ')).trim();

        // Turnstile verification (optional — skipped if secret not configured)
        if (env.TURNSTILE_SECRET_KEY) {
            const token = formData.get('cf-turnstile-response');
            const valid = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY);
            if (!valid) {
                return jsonError('CAPTCHA verification failed.', 400);
            }
        }

        // Load business info from content.json
        const content = await fetchContent(env, request);
        const ownerEmail = content?.business?.email || env.OWNER_EMAIL;

        if (!ownerEmail) {
            console.error('No owner email configured');
            return jsonError('Server configuration error.', 500);
        }

        const fromEmail = env.FROM_EMAIL || 'noreply@vibefly.ai';
        const site = fromEmail.split('@')[1] || '';

        // Notification to site owner
        const notifLines = fields.map(f =>
            `${f.name.charAt(0).toUpperCase() + f.name.slice(1)}: ${f.value || '(not provided)'}`
        );
        await sendEmail(env, {
            from:    fromEmail,
            to:      ownerEmail,
            subject: `${site ? '[' + site + '] ' : ''}New inquiry${name ? ' from ' + name : ''}`,
            body:    notifLines.join('\n'),
        });

        return jsonOk();

    } catch (err) {
        console.error('Form submission error:', err);
        return jsonError('Server error. Please try again.', 500);
    }
}

async function fetchContent(env, request) {
    try {
        const url = new URL('/content.json', new URL(request.url).origin);
        const res = await env.ASSETS.fetch(new Request(url.href));
        return await res.json();
    } catch {
        return null;
    }
}

async function verifyTurnstile(token, secretKey) {
    if (!token) return false;
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return data.success === true;
}

async function sendEmail(env, { from, to, subject, body }) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, text: body }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Resend ${res.status}: ${text}`);
    }
}

function jsonOk() {
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function jsonError(message, status) {
    return new Response(JSON.stringify({ ok: false, error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
