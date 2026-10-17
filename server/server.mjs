#!/usr/bin/env node
// OUAGX API server — zero dependencies, plain Node http.
// Provider keys stay on this machine; clients authenticate with OUAGX_API_KEY.
//
//   $env:OUAGX_API_KEY = "share-this-with-your-people"
//   $env:OUAGX_DEEPSEEK_KEY = "sk-..."
//   npm run api        # or: node server/server.mjs
import { createServer } from 'node:http';
import { route } from './handler.mjs';

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.OUAGX_HOST || '127.0.0.1';
const MAX_BODY_BYTES = 1024 * 1024;

if (!process.env.OUAGX_API_KEY) {
  console.error('OUAGX API needs OUAGX_API_KEY (the shared key clients send as `Authorization: Bearer <key>`).');
  console.error('Example: $env:OUAGX_API_KEY = "a-long-random-string"; npm run api');
  process.exit(1);
}

function send(res, status, json) {
  const body = JSON.stringify(json);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const chunks = [];
  let size = 0;
  let tooBig = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) tooBig = true;
    else chunks.push(chunk);
  });
  req.on('end', async () => {
    if (tooBig) {
      send(res, 413, { error: 'Request body too large (max 1 MB).' });
      return;
    }
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    try {
      const out = await route(
        req.method || 'GET',
        path,
        req.headers || {},
        Buffer.concat(chunks).toString('utf8'),
        { env: process.env },
      );
      send(res, out.status, out.json);
    } catch (error) {
      console.error(`Request failed: ${error.message}`);
      send(res, 500, { error: 'Internal error.' });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`OUAGX API listening on http://${HOST}:${PORT}/  (health: GET /health)`);
});
