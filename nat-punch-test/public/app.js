'use strict';

const $ = (id) => document.getElementById(id);

const DEFAULT_STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const OPENRELAY_TURN = {
  urls: 'turn:openrelay.metered.ca:80',
  username: 'openrelayproject',
  credential: 'openrelayproject',
};

let ws = null;
let room = null;
let role = null;
let pc = null;
let dc = null;
let pending = [];
let pingStart = 0;
let rttTimer = null;
let statsTimer = null;

/* ---------- helpers ---------- */

function log(msg, cls) {
  const el = document.createElement('div');
  el.className = 'logline ' + (cls || '');
  el.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  const box = $('chatLog');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function setStatus(text) {
  $('status').textContent = text;
}

function setBadge(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = 'badge ' + (cls || '');
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  } else {
    pending.push(obj);
  }
}

function iceServers() {
  const list = [];
  try {
    const custom = $('iceInput').value.trim();
    if (custom) {
      const parsed = JSON.parse(custom);
      if (Array.isArray(parsed)) list.push(...parsed);
    } else {
      list.push(...DEFAULT_STUN);
    }
  } catch (e) {
    setStatus('Ошибка в ICE-конфигурации: ' + e.message);
    throw e;
  }
  if ($('turnCheck').checked) list.push(OPENRELAY_TURN);
  return list;
}

function roomLink(code) {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('room', code);
  return u.toString();
}

function resetPeer() {
  $('peer').classList.add('hidden');
  clearInterval(rttTimer);
  clearInterval(statsTimer);
  rttTimer = null;
  statsTimer = null;
  if (dc) { try { dc.close(); } catch (e) {} }
  if (pc) { try { pc.close(); } catch (e) {} }
  dc = null;
  pc = null;
  $('candTable').querySelector('tbody').innerHTML = '';
  $('rtt').textContent = 'RTT: —';
  $('chatLog').innerHTML = '';
  enableChat(false);
}

function enableChat(on) {
  $('chatInput').disabled = !on;
  $('chatSend').disabled = !on;
}

/* ---------- signaling server ---------- */

function connectServer() {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(proto + location.host + '/ws');
  ws.onopen = () => {
    setStatus('Подключен к серверу сигнализации');
    while (pending.length) ws.send(JSON.stringify(pending.shift()));
    maybeAutoJoin();
  };
  ws.onclose = () => setStatus('Соединение с сервером сигнализации потеряно');
  ws.onerror = () => setStatus('Ошибка подключения к серверу сигнализации');
  ws.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch (e) { return; }
    handleMessage(msg);
  };
}

function maybeAutoJoin() {
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) {
    $('joinInput').value = urlRoom.toUpperCase();
    joinRoom(urlRoom);
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'created':
      room = msg.room;
      role = 'host';
      setStatus('Комната ' + room + ' создана. Жду друга...');
      $('linkBox').classList.remove('hidden');
      $('linkInput').value = roomLink(room);
      break;

    case 'joined':
      room = msg.room;
      role = 'client';
      setStatus('Вошел в комнату ' + room + '. Жду хост...');
      break;

    case 'client-joined':
      setStatus('Друг в комнате. Устанавливаю соединение...');
      startPeer();
      break;

    case 'signal':
      handleSignal(msg.data);
      break;

    case 'peer-left':
      setStatus('Собеседник покинул комнату');
      resetPeer();
      break;

    case 'error':
      setStatus('Ошибка: ' + msg.error);
      break;
  }
}

/* ---------- room actions ---------- */

function createRoom() {
  if (room) { setStatus('Ты уже в комнате ' + room); return; }
  $('linkBox').classList.add('hidden');
  send({ type: 'create' });
}

function joinRoom(code) {
  code = String(code || '').toUpperCase().trim();
  if (!code) return;
  send({ type: 'join', room: code });
}

function copyLink() {
  const input = $('linkInput');
  input.select();
  input.setSelectionRange(0, 99999);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  if (!ok && navigator.clipboard) {
    navigator.clipboard.writeText(input.value).then(() => { ok = true; }, () => { ok = false; });
  }
  log(ok ? 'Ссылка скопирована: ' + input.value : 'Скопируй ссылку вручную: ' + input.value, ok ? 'good' : '');
}

/* ---------- WebRTC ---------- */

function startPeer() {
  resetPeer();
  $('peer').classList.remove('hidden');
  setBadge('iceState', 'gathering...', '');
  setBadge('connState', 'connecting', '');

  let iceConf;
  try { iceConf = { iceServers: iceServers() }; } catch (e) { return; }

  pc = new RTCPeerConnection(iceConf);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      send({ type: 'signal', data: { kind: 'ice', candidate: e.candidate.toJSON() } });
      addCandidate(e.candidate);
    }
  };

  pc.oniceconnectionstatechange = () => {
    const s = pc.iceConnectionState;
    setBadge('iceState', s, s === 'connected' ? 'ok' : s === 'failed' ? 'bad' : 'warn');
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    setBadge('connState', s, s === 'connected' ? 'ok' : s === 'failed' ? 'bad' : '');
    if (s === 'connected') {
      setStatus('Соединение установлено! Пиши сообщения.');
      startStats();
    } else if (s === 'failed') {
      setStatus('Не удалось установить прямое соединение');
    }
  };

  pc.ondatachannel = (e) => setupChannel(e.channel);

  if (role === 'host') {
    dc = pc.createDataChannel('test');
    setupChannel(dc);
    pc.createOffer().then((offer) => {
      pc.setLocalDescription(offer).then(() => {
        send({ type: 'signal', data: { kind: 'sdp', data: pc.localDescription } });
      });
    });
  }
}

function setupChannel(ch) {
  dc = ch;
  dc.onopen = () => {
    log('DataChannel открыт — данные идут напрямую P2P', 'good');
    enableChat(true);
  };
  dc.onclose = () => { log('DataChannel закрыт'); enableChat(false); };
  dc.onmessage = (e) => {
    let data;
    try { data = JSON.parse(e.data); } catch (err) { return; }
    if (data.t === 'ping') {
      if (dc && dc.readyState === 'open') dc.send(JSON.stringify({ t: 'pong', s: data.s }));
    } else if (data.t === 'pong') {
      const rtt = (performance.now() - pingStart).toFixed(1);
      $('rtt').textContent = 'RTT: ' + rtt + ' ms';
    } else if (data.t === 'chat') {
      log('Друг: ' + data.m);
    }
  };
}

function handleSignal(data) {
  if (!pc) {
    if (role === 'host') {
      startPeer();
    } else {
      startPeer();
    }
  }
  if (!pc) return;
  if (data.kind === 'sdp') {
    const d = data.data;
    pc.setRemoteDescription(d).then(() => {
      if (d.type === 'offer' && role === 'client') {
        pc.createAnswer().then((answer) => {
          pc.setLocalDescription(answer).then(() => {
            send({ type: 'signal', data: { kind: 'sdp', data: pc.localDescription } });
          });
        });
      }
    }).catch((e) => setStatus('Ошибка SDP: ' + e.message));
  } else if (data.kind === 'ice') {
    pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
  }
}

function addCandidate(c) {
  const tr = document.createElement('tr');
  const proto = c.protocol + (c.tcpType ? '/' + c.tcpType : '');
  const rel = c.relatedAddress ? c.relatedAddress + ':' + c.relatedPort : '';
  tr.innerHTML = '<td>' + esc(c.type) + '</td><td>' + esc(proto) + '</td><td>' +
    esc(c.address + ':' + c.port) + '</td><td>' + esc(rel) + '</td>';
  $('candTable').querySelector('tbody').appendChild(tr);
}

function startStats() {
  clearInterval(statsTimer);
  statsTimer = setInterval(async () => {
    if (!pc) { clearInterval(statsTimer); return; }
    try {
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) {
          const pair = stats.get(r.selectedCandidatePairId);
          if (!pair) return;
          const local = stats.get(pair.localCandidateId);
          const remote = stats.get(pair.remoteCandidateId);
          if (local && remote) {
            setBadge('pairType', describePair(local.candidateType, remote.candidateType), local.candidateType === 'host' && remote.candidateType === 'host' ? '' : 'ok');
          }
        }
      });
    } catch (e) {}
  }, 1000);

  clearInterval(rttTimer);
  rttTimer = setInterval(() => {
    if (dc && dc.readyState === 'open') {
      pingStart = performance.now();
      dc.send(JSON.stringify({ t: 'ping', s: pingStart }));
    }
  }, 2000);
}

function describePair(l, r) {
  const both = [l, r].join('+');
  if (l === 'relay' || r === 'relay') return 'relay (через TURN, не P2P)';
  if (l === 'srflx' || r === 'srflx') return 'srflx — NAT пробит, P2P';
  if (l === 'prflx' || r === 'prflx') return 'prflx — P2P без STUN';
  if (both === 'host+host') return 'host (одна локальная сеть)';
  return both;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

function sendChat() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || !dc || dc.readyState !== 'open') return;
  dc.send(JSON.stringify({ t: 'chat', m: text }));
  log('Вы: ' + text);
  input.value = '';
}

/* ---------- init ---------- */

$('iceInput').value = JSON.stringify(DEFAULT_STUN, null, 2);
$('createBtn').addEventListener('click', createRoom);
$('joinBtn').addEventListener('click', () => joinRoom($('joinInput').value));
$('joinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('joinInput').value); });
$('copyBtn').addEventListener('click', copyLink);
$('chatSend').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

connectServer();
