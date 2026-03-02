/* AWS Signature Version 4 — Web Crypto API implementation */

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function hmac(key, data) {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        typeof key === 'string' ? new TextEncoder().encode(key) : key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey,
        typeof data === 'string' ? new TextEncoder().encode(data) : data
    );
}

async function sha256hex(data) {
    const buf = await crypto.subtle.digest('SHA-256',
        typeof data === 'string' ? new TextEncoder().encode(data) : data
    );
    return toHex(buf);
}

export async function signRequest({ method, url, body, service, region, accessKeyId, secretAccessKey }) {
    const u = new URL(url);
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const dateTimeStr = now.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';

    const bodyBytes = typeof body === 'string' ? new TextEncoder().encode(body) : (body || new Uint8Array());
    const payloadHash = await sha256hex(bodyBytes);

    const headers = {
        'content-type': 'application/json',
        'host': u.hostname,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': dateTimeStr,
    };

    const sortedKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedKeys.map(k => `${k}:${headers[k]}\n`).join('');
    const signedHeaders = sortedKeys.join(';');

    const canonicalRequest = [
        method,
        u.pathname,
        u.search.slice(1),
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');

    const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        dateTimeStr,
        credentialScope,
        await sha256hex(canonicalRequest),
    ].join('\n');

    const kDate     = await hmac(`AWS4${secretAccessKey}`, dateStr);
    const kRegion   = await hmac(kDate, region);
    const kService  = await hmac(kRegion, service);
    const kSigning  = await hmac(kService, 'aws4_request');
    const signature = toHex(await hmac(kSigning, stringToSign));

    return {
        ...headers,
        'authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
}
