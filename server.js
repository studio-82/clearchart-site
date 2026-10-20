// Local server for the Clearchart marketing site.
// Serves /public and stores waitlist sign-ups in data/waitlist.jsonl.
// No dependencies: run with `node server.js`.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const WAITLIST_FILE = path.join(DATA_DIR, 'waitlist.jsonl');
const MAX_BODY_BYTES = 16 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// Security headers: no third-party scripts, fonts from Google only, no framing.
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'X-Frame-Options': 'DENY',
};

// Only these fields are ever stored. Anything else in the request is dropped.
const ALLOWED = {
  role: ['care-worker', 'enrolled-nurse', 'registered-nurse', 'manager', 'gp', 'pharmacist', 'executive', 'other'],
  state: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'],
  orgType: ['residential-aged-care', 'disability', 'pharmacy', 'general-practice', 'other'],
  size: ['', 'under-30', '30-60', '61-120', 'over-120', 'multi-site'],
  charting: ['', 'paper', 'electronic', 'mixed', 'unsure'],
  pains: ['script-not-charted', 'illegible', 'missed-change', 'rewriting'],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validate(body) {
  const entry = {
    name: text(body.name, 120),
    email: text(body.email, 254).toLowerCase(),
    role: body.role,
    state: body.state,
    organisation: text(body.organisation, 160),
    orgType: body.orgType,
    size: body.size || '',
    charting: body.charting || '',
    pains: Array.isArray(body.pains) ? body.pains.filter((p) => ALLOWED.pains.includes(p)) : [],
    notes: text(body.notes, 1000),
  };

  if (!entry.name) return { error: 'Enter your name.' };
  if (!EMAIL.test(entry.email)) return { error: 'Enter a valid work email.' };
  if (!ALLOWED.role.includes(entry.role)) return { error: 'Choose your role.' };
  if (!ALLOWED.state.includes(entry.state)) return { error: 'Choose your state or territory.' };
  if (!entry.organisation) return { error: "Enter your organisation's name." };
  if (!ALLOWED.orgType.includes(entry.orgType)) return { error: 'Choose a type of organisation.' };
  if (!ALLOWED.size.includes(entry.size)) entry.size = '';
  if (!ALLOWED.charting.includes(entry.charting)) entry.charting = '';
  if (body.consent !== true) return { error: 'Tick the box so we can email you about the waitlist.' };

  return { entry };
}

// Small in-memory rate limit: 10 sign-ups per IP per 10 minutes.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(JSON.stringify(payload));
}

function handleWaitlist(req, res) {
  if (rateLimited(req.socket.remoteAddress)) {
    return sendJson(res, 429, { error: 'Too many sign-ups from this connection. Try again in 10 minutes.' });
  }

  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      sendJson(res, 413, { error: 'That submission is too large. Shorten your notes and try again.' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (res.writableEnded) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return sendJson(res, 400, { error: "Your details couldn't be read. Refresh the page and try again." });
    }

    // Honeypot: bots fill the hidden field. Pretend it worked, store nothing.
    if (body.website) return sendJson(res, 201, { ok: true });

    const { entry, error } = validate(body);
    if (error) return sendJson(res, 422, { error });

    const record = { ...entry, consentedAt: new Date().toISOString() };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFile(WAITLIST_FILE, JSON.stringify(record) + '\n', { mode: 0o600 }, (err) => {
      if (err) {
        console.error('Could not save waitlist entry:', err.code);
        return sendJson(res, 500, { error: "Your details weren't saved. Try again in a minute." });
      }
      console.log(`Waitlist: new sign-up (${entry.role}, ${entry.state}, ${entry.orgType})`);
      sendJson(res, 201, { ok: true });
    });
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      return res.end('Page not found');
    }
    // Locally, point the waitlist form at this server instead of the email fallback.
    if (path.basename(filePath) === 'index.html') {
      data = data.toString('utf8').replace('data-endpoint=""', 'data-endpoint="/api/waitlist"');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/waitlist') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    return handleWaitlist(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, SECURITY_HEADERS);
    return res.end();
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Clearchart site running at http://localhost:${PORT}`);
});
