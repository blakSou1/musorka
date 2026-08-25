'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === '/') filePath = '/index.html';
  const full = path.join(PUBLIC, filePath);
  if (!full.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let c;
  do {
    c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(c));
  return c;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (msg.type === 'create') {
      if (ws.room) return;
      const code = newCode();
      rooms.set(code, { host: ws, client: null });
      ws.room = code;
      ws.role = 'host';
      send(ws, { type: 'created', room: code });
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.room || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || !room.host || room.client) {
        send(ws, { type: 'error', error: 'Комната не найдена или уже занята' });
        return;
      }
      if (room.host === ws) {
        send(ws, { type: 'error', error: 'Ты уже создал эту комнату' });
        return;
      }
      room.client = ws;
      ws.room = code;
      ws.role = 'client';
      send(ws, { type: 'joined', room: code });
      send(room.host, { type: 'client-joined' });
      return;
    }

    if (msg.type === 'signal') {
      if (!ws.room) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      const to = ws.role === 'host' ? room.client : room.host;
      send(to, { type: 'signal', from: ws.role, data: msg.data });
      return;
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;
    const room = rooms.get(ws.room);
    if (!room) return;
    if (ws.role === 'host') {
      send(room.client, { type: 'peer-left' });
      rooms.delete(ws.room);
    } else {
      room.client = null;
      send(room.host, { type: 'peer-left' });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('NAT punchthrough test server');
  console.log('  Local: http://localhost:' + PORT);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name]) {
      if (ni.family === 'IPv4' && !ni.internal) {
        console.log('  LAN:   http://' + ni.address + ':' + PORT + '  (открой это с телефона)');
      }
    }
  }
  console.log('Чтобы протестировать через интернет — пробрось порт ' + PORT + ' наружу (playit.gg / ngrok).');
});
