#!/usr/bin/env node
// Dev server: static file serving + SSE live-reload via fs.watchFile polling
// Zero external dependencies — uses only Node.js built-ins
// Copyright (c) 2026 Gerhard Kanzler — MIT (see LICENSE)

const http = require('http');
const fs = require('fs');
const path = require('path');

// Config — CLI args override env vars override sensible defaults.
// Defaults make the script run identically inside Docker (cwd=/app) and
// when launched directly (e.g. `node dev-server.js` or from Electron),
// because __dirname always resolves to the location of this script.
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const ROOT = path.resolve(process.argv[3] || process.env.DEV_SERVER_ROOT || __dirname);
const POLL_INTERVAL = Number(process.env.DEV_SERVER_POLL || 800);
const WATCH_EXTS = new Set(['.html', '.css', '.js']);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
};

// SSE client list
const sseClients = new Set();

// Inject live-reload snippet into HTML
const INJECT = `
<script>
(function() {
    function connect() {
        var es = new EventSource('/__dev_sse');
        es.onmessage = function(e) { if (e.data === 'reload') location.reload(); };
        es.onerror = function() { es.close(); setTimeout(connect, 2000); };
    }
    connect();
})();
</script>`;

const server = http.createServer((req, res) => {
    // SSE endpoint
    if (req.url === '/__dev_sse') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });
        res.write(':\n\n'); // initial comment to open connection
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
    }

    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);

    // Prevent path traversal
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end(); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });

        if (ext === '.html') {
            res.end(data.toString().replace('</body>', INJECT + '</body>'));
        } else {
            res.end(data);
        }
    });
});

function broadcast() {
    for (const client of sseClients) {
        try { client.write('data: reload\n\n'); } catch {}
    }
}

// File watcher using fs.watchFile (stat-polling — works across VM/bind mounts)
function watchDir(dir) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stat;
        try { stat = fs.statSync(fullPath); } catch { continue; }

        if (stat.isDirectory()) {
            if (entry === 'node_modules' || entry === '.git' || entry === 'src-tauri') continue;
            watchDir(fullPath);
        } else if (WATCH_EXTS.has(path.extname(entry).toLowerCase())) {
            fs.watchFile(fullPath, { interval: POLL_INTERVAL, persistent: false }, (curr, prev) => {
                if (curr.mtimeMs !== prev.mtimeMs) {
                    console.log(`[reload] ${path.relative(ROOT, fullPath)}`);
                    broadcast();
                }
            });
        }
    }
}

watchDir(ROOT);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[dev] http://0.0.0.0:${PORT}  (live-reload via SSE, polling every ${POLL_INTERVAL}ms)`);
});
