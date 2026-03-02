import { signRequest } from './sigv4.js';

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

        // Honeypot — bots fill this in, humans don't
        if (formData.get('_hp')) {
            return jsonOk();
        }

        // Collect all non-system fields
        const systemFields = new Set(['_hp', 'cf-turnstile-response']);
        const fields = [];
        for (const [key, val] of formData.entries()) {
            if (!systemFields.has(key)) {
                fields.push({ name: key, value: val.toString().trim() });
            }
        }

        const email = (formData.get('email') || '').trim();
        const name  = (formData.get('name')  || '').trim();

        if (!email) {
            return jsonError('Email is required.', 400);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return jsonError('Invalid email address.', 400);
        }

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
        const bizName  = content?.business?.name  || 'The Team';
        const ownerEmail = content?.business?.email || env.OWNER_EMAIL;

        if (!ownerEmail) {
            console.error('No owner email configured');
            return jsonError('Server configuration error.', 500);
        }

        const fromEmail = env.FROM_EMAIL || 'noreply@vibefly.ai';
        const region    = env.AWS_REGION || 'us-east-1';

        // Notification to site owner
        const notifLines = fields.map(f =>
            `${f.name.charAt(0).toUpperCase() + f.name.slice(1)}: ${f.value || '(not provided)'}`
        );
        await sendEmail(env, region, {
            from:    fromEmail,
            to:      ownerEmail,
            subject: `New inquiry${name ? ' from ' + name : ''}`,
            body:    notifLines.join('\n'),
        });

        // Confirmation to customer
        await sendEmail(env, region, {
            from:    fromEmail,
            to:      email,
            subject: `We received your message`,
            body: [
                `Hi ${name},`,
                ``,
                `Thanks for reaching out. We received your message and will be in touch shortly.`,
                ``,
                `Best,`,
                bizName,
            ].join('\n'),
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

async function sendEmail(env, region, { from, to, subject, body }) {
    const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;

    const payload = JSON.stringify({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: {
            Simple: {
                Subject: { Data: subject, Charset: 'UTF-8' },
                Body:    { Text: { Data: body, Charset: 'UTF-8' } },
            },
        },
    });

    const headers = await signRequest({
        method: 'POST',
        url: endpoint,
        body: payload,
        service: 'ses',
        region,
        accessKeyId:     env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    });

    const res = await fetch(endpoint, { method: 'POST', headers, body: payload });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`SES ${res.status}: ${text}`);
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
