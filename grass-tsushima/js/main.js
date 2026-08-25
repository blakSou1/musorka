import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createTerrain } from './terrain.js';
import { makeSky } from './sky.js';
import { GrassField } from './grass.js';
import { Pollen } from './particles.js';
import { WindAudio } from './audio.js';

// затемнение земли под густой травой (имитация тени без shadow pass)
function bakeGrassShadow(terrain, bases, baseColors, half = 115) {
  const pos = terrain.geometry.attributes.position;
  const col = terrain.geometry.attributes.color;
  const cell = 1.0;
  const size = Math.ceil((half * 2) / cell);
  const grid = new Float32Array(size * size);

  for (let i = 0; i < bases.length; i += 2) {
    const gx = Math.min(size - 1, Math.max(0, Math.floor((bases[i] + half) / cell)));
    const gz = Math.min(size - 1, Math.max(0, Math.floor((bases[i + 1] + half) / cell)));
    grid[gz * size + gx]++;
  }

  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const gx = Math.min(size - 1, Math.max(0, Math.floor((pos.getX(i) + half) / cell)));
    const gz = Math.min(size - 1, Math.max(0, Math.floor((pos.getZ(i) + half) / cell)));
    let dens = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = Math.min(size - 1, Math.max(0, gx + dx));
        const nz = Math.min(size - 1, Math.max(0, gz + dz));
        dens += grid[nz * size + nx];
      }
    }
    // всегда отталкиваемся от базовых цветов, чтобы затемнение не накапливалось
    const ao = 1.0 - Math.min(1, dens / 14) * 0.5;
    c.fromArray(baseColors, i * 3);
    c.multiplyScalar(ao);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

const canvas = document.getElementById('scene');
const loading = document.getElementById('loading');
const ui = document.getElementById('ui');
const loadingFill = document.querySelector('.loading-fill');
const errorBox = document.getElementById('errorBox');
const windFill = document.getElementById('windFill');

function showFatalError(msg) {
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
  }
  if (loading) loading.classList.add('fade');
  if (ui) ui.classList.remove('hidden');
}

const audio = new WindAudio();

let scene, camera, renderer, controls, terrain, grass, pollen, composer;
let useComposer = false;
let useGL2 = false;

function detectGL() {
  const test = document.createElement('canvas');
  try {
    const gl2 = test.getContext('webgl2');
    const gl1 = test.getContext('webgl') || test.getContext('experimental-webgl');
    if (gl2) return 2;
    if (gl1) return 1;
  } catch (e) { /* fall through */ }
  return 0;
}

function init() {
  const glLevel = detectGL();
  if (glLevel === 0) {
    throw new Error(
      'WebGL недоступен в этом браузере. Включите аппаратное ускорение ' +
      '(chrome://settings/system → «Использовать аппаратное ускорение») ' +
      'или обновите драйвер видеокарты, затем перезапустите браузер.'
    );
  }
  useGL2 = glLevel === 2;

  const params = new URLSearchParams(location.search);
  const fxEnabled = params.get('fx') === '1';

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: useGL2,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, useGL2 ? 2 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  const FOG_COLOR = new THREE.Color('#8f7c58');
  scene.fog = new THREE.Fog(FOG_COLOR, 70, 240);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(16, 7, 22);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 3.2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 5;
  controls.maxDistance = 95;
  controls.maxPolarAngle = 1.32;
  controls.autoRotate = false;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

  // lights
  const sunDir = new THREE.Vector3(-0.35, 0.28, -0.62).normalize();
  const sunColor = new THREE.Color('#ffcf8a');
  const sunLight = new THREE.DirectionalLight(sunColor, 1.6);
  sunLight.position.copy(sunDir).multiplyScalar(100);
  scene.add(sunLight);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6a5a3a, 0.55);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x333022, 0.4);
  scene.add(ambient);

  // world
  terrain = createTerrain({ size: 240, segments: 200, seed: 3.7 });
  scene.add(terrain.mesh);
  const heightAt = terrain.heightAt;
  const terrainBaseColors = new Float32Array(terrain.mesh.geometry.attributes.color.array);

  // адаптивное качество по числу ядер CPU (грубая оценка мощности)
  const cores = navigator.hardwareConcurrency || 4;
  const quality = Math.min(1, Math.max(0.6, cores / 8));

  grass = new GrassField(scene, { heightAt });
  pollen = new Pollen(scene, Math.round(useGL2 ? 750 * quality : 400 * quality), 80);
  const sky = makeSky(sunDir);
  scene.add(sky);

  // постобработка (только WebGL2, только по запросу ?fx=1)
  if (useGL2 && fxEnabled) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.5, 0.7, 0.72
      ));
      composer.addPass(new OutputPass());
      useComposer = true;
    } catch (e) {
      console.warn('Постобработка недоступна, рендер без bloom:', e);
      useComposer = false;
    }
  }

  // --- пресеты: цвета / погода / время дня --------------------------------
  const PRESETS = [
    {
      name: 'ДЕНЬ',
      sunDir: [-0.35, 0.28, -0.62], sunColor: '#ffcf8a', sunI: 1.6,
      hemiSky: '#bfd8ff', hemiGround: '#6a5a3a', hemiI: 0.55,
      amb: '#333022', ambI: 0.4,
      skyHor: '#edcfa3', skyZen: '#575f99',
      fog: '#8f7c58', fogNear: 70, fogFar: 240,
      base: '#3a5a2a', tip: '#a8c052', var: '#7f9c3f',
      dryBase: '#7a6a34', dryTip: '#d9c07a', flower: '#f3e7c9',
      ground: '#ffffff',
      wind: 0.9, exposure: 1.05, night: 0, rain: 0,
    },
    {
      name: 'ЗАКАТ',
      sunDir: [0.42, 0.12, -0.9], sunColor: '#ff7a3c', sunI: 1.25,
      hemiSky: '#ff9a5c', hemiGround: '#7a4a2a', hemiI: 0.5,
      amb: '#55331f', ambI: 0.3,
      skyHor: '#ffb36b', skyZen: '#7a4a7a',
      fog: '#c98a4e', fogNear: 70, fogFar: 240,
      base: '#6a5a2a', tip: '#e0c06a', var: '#a08a40',
      dryBase: '#a08040', dryTip: '#f0d080', flower: '#ffd0a0',
      ground: '#ffd9a0',
      wind: 1.1, exposure: 1.15, night: 0, rain: 0,
    },
    {
      name: 'РАССВЕТ',
      sunDir: [-0.55, 0.18, 0.72], sunColor: '#ff9a9a', sunI: 1.1,
      hemiSky: '#ffc0c0', hemiGround: '#5a6a8a', hemiI: 0.5,
      amb: '#4a3a5a', ambI: 0.3,
      skyHor: '#f0a8c0', skyZen: '#6a7ab8',
      fog: '#c8a0b0', fogNear: 70, fogFar: 240,
      base: '#5a7a4a', tip: '#c8d08a', var: '#8aa05a',
      dryBase: '#8a8a4a', dryTip: '#d0c07a', flower: '#f0c8c8',
      ground: '#f0e0d0',
      wind: 0.9, exposure: 1.0, night: 0, rain: 0,
    },
    {
      name: 'НОЧЬ',
      sunDir: [0.3, 0.5, -0.6], sunColor: '#7a8ad8', sunI: 0.55,
      hemiSky: '#2a3a5a', hemiGround: '#1a2233', hemiI: 0.4,
      amb: '#223044', ambI: 0.3,
      skyHor: '#3a4a6a', skyZen: '#101c33',
      fog: '#2a3550', fogNear: 70, fogFar: 240,
      base: '#2a4a3a', tip: '#5a7a6a', var: '#3a5a4a',
      dryBase: '#4a5a3a', dryTip: '#7a8a5a', flower: '#c8d0e8',
      ground: '#a8b8d0',
      wind: 0.7, exposure: 0.9, night: 1, rain: 0,
    },
    {
      name: 'ТУМАН',
      sunDir: [-0.3, 0.25, -0.6], sunColor: '#d0d0c0', sunI: 1.0,
      hemiSky: '#c8c8c0', hemiGround: '#9a9a8a', hemiI: 0.6,
      amb: '#80807a', ambI: 0.4,
      skyHor: '#e8e6da', skyZen: '#b8c0c8',
      fog: '#c8c4b0', fogNear: 30, fogFar: 150,
      base: '#7a8a6a', tip: '#c8c0a0', var: '#a0a88a',
      dryBase: '#9a9a7a', dryTip: '#d0c8a0', flower: '#f0ece0',
      ground: '#e8e4d8',
      wind: 0.6, exposure: 1.0, night: 0, rain: 0,
    },
    {
      name: 'ГРОЗА',
      sunDir: [-0.2, 0.35, -0.7], sunColor: '#9aa0b0', sunI: 0.7,
      hemiSky: '#5a6a7a', hemiGround: '#3a3a3a', hemiI: 0.5,
      amb: '#3a3a44', ambI: 0.35,
      skyHor: '#7a8898', skyZen: '#303c4c',
      fog: '#7a8494', fogNear: 60, fogFar: 220,
      base: '#3a5a4a', tip: '#7a8a6a', var: '#4a6a55',
      dryBase: '#6a6a4a', dryTip: '#a0a070', flower: '#d0d8e0',
      ground: '#a8b0b8',
      wind: 1.6, exposure: 0.95, night: 0.2, rain: 0.4,
    },
    {
      name: 'ДОЖДЬ',
      sunDir: [-0.25, 0.4, -0.65], sunColor: '#b8c4d8', sunI: 0.85,
      hemiSky: '#a8b0c0', hemiGround: '#4a4a52', hemiI: 0.55,
      amb: '#4a4a58', ambI: 0.4,
      skyHor: '#b8bcc4', skyZen: '#7a8494',
      fog: '#9aa4b4', fogNear: 40, fogFar: 190,
      base: '#4a6a4a', tip: '#8a9a6a', var: '#5a7a55',
      dryBase: '#7a7a5a', dryTip: '#a8a878', flower: '#d8e0e8',
      ground: '#c0c4cc',
      wind: 1.3, exposure: 1.0, night: 0.1, rain: 1, moon: 0,
    },
    {
      name: 'ЛУНА',
      sunDir: [-0.5, 0.32, 0.78], sunColor: '#ff9a5c', sunI: 1.15,
      hemiSky: '#b8786a', hemiGround: '#5a4a52', hemiI: 0.5,
      amb: '#6a4a5a', ambI: 0.35,
      skyHor: '#ffc080', skyZen: '#8a6a9a',
      fog: '#c89a6a', fogNear: 70, fogFar: 240,
      base: '#6a5a2a', tip: '#e0c06a', var: '#a08a40',
      dryBase: '#a08040', dryTip: '#f0d080', flower: '#ffd0c8',
      ground: '#ffd9a8',
      wind: 1.0, exposure: 1.1, night: 0.2, rain: 0,
      moon: 1, moonDir: [-0.5, 0.32, 0.78],
    },
  ];

  let currentPreset = 0;
  let windScale = 1;

  // мгновенно применяет пресет к сцене
  function applyPreset(i) {
    currentPreset = i;
    const p = PRESETS[i];

    sunLight.position.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize().multiplyScalar(100);
    sunLight.color.set(p.sunColor);
    sunLight.intensity = p.sunI;
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    hemi.intensity = p.hemiI;
    ambient.color.set(p.amb);
    ambient.intensity = p.ambI;
    scene.fog.color.set(p.fog);
    scene.fog.near = p.fogNear;
    scene.fog.far = p.fogFar;
    terrain.mesh.material.color.set(p.ground);

    sky.material.uniforms.uSunDir.value.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
    sky.material.uniforms.uSunColor.value.set(p.sunColor);
    sky.material.uniforms.uHorizon.value.set(p.skyHor);
    sky.material.uniforms.uZenith.value.set(p.skyZen);

    const gu = grass.uniforms;
    gu.uLightDir.value.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
    gu.uSunColor.value.set(p.sunColor);
    gu.uFogColor.value.set(p.fog);
    gu.uFogNear.value = p.fogNear;
    gu.uFogFar.value = p.fogFar;
    gu.uColBase.value.set(p.base);
    gu.uColTip.value.set(p.tip);
    gu.uColVar.value.set(p.var);
    gu.uColDryBase.value.set(p.dryBase);
    gu.uColDryTip.value.set(p.dryTip);
    gu.uColFlower.value.set(p.flower);

    renderer.toneMappingExposure = p.exposure;
    windScale = p.wind;

    stars.material.opacity = p.night * 0.9;
    stars.visible = p.night > 0.02;
    rain.material.opacity = p.rain * 0.6;
    rain.visible = p.rain > 0.02;
    moon.visible = !!p.moon;
    if (p.moon) {
      moon.position.set(p.moonDir[0], p.moonDir[1], p.moonDir[2]).normalize().multiplyScalar(700);
    }
  }

  // звёзды (видимы ночью)
  const starN = 700;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.12 + Math.random() * 0.88;
    const r = Math.sqrt(1 - y * y) * 750;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = y * 750;
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.8,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  }));
  scene.add(stars);

  // дождь: капли падают вокруг камеры (видимы в «ДОЖДЬ» и «ГРОЗА»)
  const RAIN_N = 1500;
  const rainPos = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3] = (Math.random() * 2 - 1) * 130;
    rainPos[i * 3 + 1] = Math.random() * 110;
    rainPos[i * 3 + 2] = (Math.random() * 2 - 1) * 130;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0xc8d8f0,
    size: 0.6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }));
  rain.visible = false;
  scene.add(rain);

  // большая луна (сцена «ЛУНА»)
  const moonCore = new THREE.Mesh(
    new THREE.SphereGeometry(46, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff4d8, fog: false })
  );
  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(72, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.32, fog: false })
  );
  const moon = new THREE.Group();
  moon.add(moonCore, moonGlow);
  moon.visible = false;
  scene.add(moon);

  // кнопки пресетов
  PRESETS.forEach((p, i) => {
    const btn = document.getElementById('preset-' + i);
    if (btn) {
      btn.addEventListener('click', () => {
        applyPreset(i);
        document.querySelectorAll('.presets .preset').forEach((b) => b.classList.toggle('active', b === btn));
      });
    }
  });
  applyPreset(0);

  // input
  const pointer = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  let pressing = false;
  let hasHit = false;
  let moved = false;
  let globalWind = 0.9;
  let whistleTimer = -10;

  // инструменты: walk (прогулка), hills (холмы), grass (убрать траву), type (тип травы)
  let mode = 'walk';
  let editing = false;
  let editRaise = true;
  const HILLS_RADIUS = 4.5;
  const GRASS_RADIUS = 3.2;
  const TYPE_RADIUS = 3.2;

  function setMode(m) {
    mode = m;
    controls.enabled = m === 'walk';
    if (m !== 'walk') editing = false;
    document.querySelectorAll('.tools .tool').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === m);
    });
  }
  document.querySelectorAll('.tools .tool').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });
  setMode('walk');

  // кольцо-указатель кисти
  const brushRingMat = new THREE.MeshBasicMaterial({
    color: 0xd8b26a,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const hillsRing = new THREE.Mesh(
    new THREE.RingGeometry(HILLS_RADIUS - 0.08, HILLS_RADIUS, 48),
    brushRingMat
  );
  hillsRing.rotation.x = -Math.PI / 2;
  hillsRing.renderOrder = 998;
  const grassRing = new THREE.Mesh(
    new THREE.RingGeometry(GRASS_RADIUS - 0.08, GRASS_RADIUS, 48),
    brushRingMat
  );
  grassRing.rotation.x = -Math.PI / 2;
  grassRing.renderOrder = 998;
  const typeRing = new THREE.Mesh(
    new THREE.RingGeometry(TYPE_RADIUS - 0.08, TYPE_RADIUS, 48),
    new THREE.MeshBasicMaterial({
      color: 0xc9a44e,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthTest: false,
    })
  );
  typeRing.rotation.x = -Math.PI / 2;
  typeRing.renderOrder = 998;
  scene.add(hillsRing, grassRing, typeRing);

  window.addEventListener('pointermove', (e) => {
    moved = true;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
  window.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
      if (mode === 'walk') {
        pressing = true;
        audio.init();
      } else {
        editing = true;
        editRaise = !e.shiftKey;
      }
    } else if (e.button === 2 && mode !== 'walk') {
      editing = true;
      editRaise = false;
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) {
      pressing = false;
      editing = false;
    } else if (e.button === 2) {
      editing = false;
    }
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  function fireWhistle() {
    audio.init();
    const pos = hasHit
      ? grass.mousePos.clone()
      : new THREE.Vector3(0, heightAt(0, 0), 0);
    grass.whistlePos.copy(pos);
    grass.whistleActive = 1;
    whistleTimer = 0;
    globalWind = 2.0;
    audio.whistle();
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyF') {
      e.preventDefault();
      fireWhistle();
    } else if (e.code === 'Digit1') setMode('walk');
    else if (e.code === 'Digit2') setMode('hills');
    else if (e.code === 'Digit3') setMode('grass');
    else if (e.code === 'Digit4') setMode('type');
  });

  const whistleBtn = document.getElementById('whistleBtn');
  if (whistleBtn) whistleBtn.addEventListener('click', fireWhistle);

  const soundBtn = document.getElementById('soundBtn');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      audio.init();
      audio.muted = !audio.muted;
      audio.applyMute();
      soundBtn.textContent = 'ЗВУК: ' + (audio.muted ? 'ВЫКЛ' : 'ВКЛ');
    });
  }

  // отображение чанков (боксы подсвечиваются по результатам каллинга)
  const chunkBtn = document.getElementById('chunkBtn');
  const chunkDebug = new THREE.Group();
  chunkDebug.visible = false;
  scene.add(chunkDebug);

  const hx = grass.chunkSize / 2;
  const chunkBoxMap = new Map();
  // синхронизирует боксы с потоковыми чанками (добавляет/убирает по мере стриминга)
  function syncChunkBoxes() {
    const chunkKeys = new Set();
    for (const ch of grass.chunks) {
      chunkKeys.add(ch.key);
      if (chunkBoxMap.has(ch.key)) continue;
      const yMin = Math.min(
        heightAt(ch.cx - hx, ch.cz - hx),
        heightAt(ch.cx + hx, ch.cz - hx),
        heightAt(ch.cx - hx, ch.cz + hx),
        heightAt(ch.cx + hx, ch.cz + hx)
      ) - 0.1;
      const boxMat = new THREE.LineBasicMaterial({
        color: 0xd8b26a,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      });
      const seg = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(grass.chunkSize, 7, grass.chunkSize)),
        boxMat
      );
      seg.position.set(ch.cx, yMin, ch.cz);
      seg.renderOrder = 999;
      chunkDebug.add(seg);
      chunkBoxMap.set(ch.key, { mat: boxMat, seg });
    }
    for (const key of Array.from(chunkBoxMap.keys())) {
      if (!chunkKeys.has(key)) {
        chunkDebug.remove(chunkBoxMap.get(key).seg);
        chunkBoxMap.delete(key);
      }
    }
  }
  if (chunkBtn) {
    chunkBtn.addEventListener('click', () => {
      chunkDebug.visible = !chunkDebug.visible;
      chunkBtn.textContent = 'ЧАНКИ: ' + (chunkDebug.visible ? 'ВКЛ' : 'ВЫКЛ');
    });
  }

  // окно статистики каллинга
  const hudFps = document.getElementById('hudFps');
  const hudChunks = document.getElementById('hudChunks');
  const hudLod1 = document.getElementById('hudLod1');
  const hudTris = document.getElementById('hudTris');
  const hudDraws = document.getElementById('hudDraws');
  const hudEl = document.getElementById('hud');
  const hudBtn = document.getElementById('hudBtn');
  if (hudBtn && hudEl) {
    hudBtn.addEventListener('click', () => {
      const show = hudEl.style.display === 'none';
      hudEl.style.display = show ? '' : 'none';
      hudBtn.textContent = 'HUD: ' + (show ? 'ВКЛ' : 'ВЫКЛ');
    });
  }
  const _projScreenMatrix = new THREE.Matrix4();
  const _frustum = new THREE.Frustum();

  // FPS: скользящее среднее, обновляется каждый кадр (живое значение)
  const fpsEl = document.getElementById('fps');
  let fpsSmooth = 60;

  // панель статистики каллинга (обновляется ~4 раза в секунду)
  let statsTimer = 0;

  // периодическая тень травы (пересчёт после стриминга/правок)
  let shadowDirty = false;
  let shadowTimer = 0;

  const clock = new THREE.Clock();
  let elapsed = 0;
  let loadT = 0;

  function renderFrame() {
    if (useComposer && composer) {
      try {
        composer.render();
        return;
      } catch (e) {
        console.warn('Ошибка постобработки, переключаюсь на прямой рендер:', e);
        useComposer = false;
      }
    }
    renderer.render(scene, camera);
  }

  function step() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const t = elapsed;

    // loading progress
    if (loadT < 1) {
      loadT = Math.min(1, loadT + dt * 1.6);
      loadingFill.style.width = (loadT * 100).toFixed(0) + '%';
      if (loadT >= 1) {
        loading.classList.add('fade');
        ui.classList.remove('hidden');
      }
    }

    // raycast to terrain for mouse parting
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(terrain.mesh, false);
    hasHit = hits.length > 0;
    if (hasHit) grass.mousePos.copy(hits[0].point);

    // кисти инструментов
    if (mode !== 'walk' && editing && hasHit) {
      const mx = grass.mousePos.x;
      const mz = grass.mousePos.z;
      if (mode === 'hills') {
        terrain.edit(mx, mz, HILLS_RADIUS, 2.4 * dt, editRaise);
        grass.updateHeights();
        shadowDirty = true;
      } else if (mode === 'grass') {
        grass.editMask(mx, mz, GRASS_RADIUS, editRaise ? 1 : -1);
      } else if (mode === 'type') {
        grass.editType(mx, mz, TYPE_RADIUS, editRaise ? 1 : 0);
      }
    }

    // кольцо-указатель кисти
    const showHills = mode === 'hills';
    const showGrass = mode === 'grass';
    const showType = mode === 'type';
    hillsRing.visible = showHills;
    grassRing.visible = showGrass;
    typeRing.visible = showType;
    if ((showHills || showGrass || showType) && hasHit) {
      const r = showHills ? hillsRing : (showGrass ? grassRing : typeRing);
      r.position.set(grass.mousePos.x, grass.mousePos.y + 0.15, grass.mousePos.z);
    }

    // mouse strength easing (только в режиме прогулки)
    let target = mode === 'walk' && hasHit && moved ? (pressing ? 2.6 : 1.15) : 0;
    grass.mouseStrength += (target - grass.mouseStrength) * Math.min(1, dt * 8);

    // whistle lifecycle
    if (whistleTimer >= 0) {
      whistleTimer += dt;
      const fade = Math.max(0, 1 - whistleTimer / 2.4);
      grass.whistleActive = fade;
      globalWind = 2.0 * fade + 0.9 * (1 - fade);
      if (whistleTimer >= 2.4) whistleTimer = -10;
    }

    // gentle ambient wind variation
    const ambient = 0.9 + 0.25 * Math.sin(t * 0.35) + 0.15 * Math.sin(t * 0.83 + 2.0);
    const windLevel = Math.min(3.0, (globalWind * 0.8 + ambient * 0.2) * windScale);

    grass.update(t, dt, windLevel, camera, hasHit && moved);

    pollen.update(t, dt, windLevel);
    audio.setWind(windLevel);

    // дождь: капли летят вниз, сцена «ДОЖДЬ»/«ГРОЗА»
    if (rain.visible) {
      rain.position.x = camera.position.x;
      rain.position.z = camera.position.z;
      const rp = rain.geometry.attributes.position.array;
      for (let i = 0; i < rp.length; i += 3) {
        rp[i + 1] -= 60 * dt;
        if (rp[i + 1] < 0) rp[i + 1] = 110;
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }

    controls.update();

    // синхронизация боксов чанков с потоковыми чанками
    syncChunkBoxes();

    // периодическая тень травы (после стриминга/правок, не чаще раза в секунду)
    if (grass.streamDirty) {
      shadowDirty = true;
      grass.streamDirty = false;
    }
    shadowTimer += dt;
    if (shadowDirty && shadowTimer >= 1.0) {
      shadowTimer = 0;
      shadowDirty = false;
      bakeGrassShadow(terrain.mesh, grass.collectBases(), terrainBaseColors);
    }

    // wind meter
    if (windFill) windFill.style.width = Math.min(100, (windLevel / 3.0) * 100).toFixed(0) + '%';

    // FPS: живое значение каждый кадр
    const instFps = 1 / Math.max(dt, 0.001);
    fpsSmooth += (instFps - fpsSmooth) * 0.08;
    const fps = Math.round(fpsSmooth);
    if (fpsEl) fpsEl.textContent = fps + ' FPS';
    if (hudFps) hudFps.textContent = fps;

    // панель каллинга по фактически отрендеренному кадру
    statsTimer += dt;
    if (statsTimer >= 0.25) {
      statsTimer = 0;
      _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projScreenMatrix);
      let vis = 0;
      let lod1 = 0;
      const n = grass.chunks.length;
      for (let i = 0; i < n; i++) {
        const ch = grass.chunks[i];
        const box = chunkBoxMap.get(ch.key);
        // боксы чанков следуют за рельефом
        if (box && chunkDebug.visible) {
          box.seg.position.y =
            Math.min(
              heightAt(ch.cx - hx, ch.cz - hx),
              heightAt(ch.cx + hx, ch.cz - hx),
              heightAt(ch.cx - hx, ch.cz + hx),
              heightAt(ch.cx + hx, ch.cz + hx)
            ) - 0.1;
        }
        const inView = _frustum.intersectsSphere(ch.mesh0.boundingSphere);
        if (inView) {
          vis++;
          if (box && chunkDebug.visible) box.mat.color.setHex(0xd8b26a);
        } else if (box && chunkDebug.visible) {
          box.mat.color.setHex(0x4a3527);
        }
        if (ch.lod1) lod1++;
      }
      if (hudChunks) hudChunks.textContent = vis + '/' + n;
      if (hudLod1) hudLod1.textContent = lod1;
      if (hudTris) hudTris.textContent = (renderer.info.render.triangles / 1000).toFixed(0) + 'k';
      if (hudDraws) hudDraws.textContent = renderer.info.render.calls;
    }

    renderFrame();
  }

  function animate() {
    requestAnimationFrame(animate);
    try {
      step();
    } catch (e) {
      console.error(e);
      showFatalError('Ошибка в цикле отрисовки: ' + e.message);
    }
  }

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, useGL2 ? 2 : 1.5));
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
  });

  // страховка для медленных устройств: показать интерфейс по таймеру
  setTimeout(() => {
    if (loadT < 1) {
      loadT = 1;
      loadingFill.style.width = '100%';
      loading.classList.add('fade');
      ui.classList.remove('hidden');
    }
  }, 1800);

  animate();

  // автотест кистей и стриминга (?selftest=1)
  if (params.get('selftest') === '1') {
    setTimeout(() => {
      const t = document.createElement('div');
      t.id = 'selftest';
      try {
        const logs = [];
        const ok = (name, cond) => logs.push((cond ? 'PASS' : 'FAIL') + ' ' + name);

        grass.editMask(0, 0, 8, 1);
        ok('mask-erased', grass.mask[grass.maskIndex(0, 0)] < 0.5);

        // хоть один пучок в поле должен быть скрыт (scale 0 и убран под землю)
        let hidden = false;
        for (const ch of grass.chunks) {
          const arr = ch.mesh0.instanceMatrix.array;
          for (let i = 0; i < ch.bx0.length; i++) {
            if (arr[i * 16] === 0 && arr[i * 16 + 13] === -1000) {
              hidden = true;
              break;
            }
          }
          if (hidden) break;
        }
        ok('grass-hidden', hidden);

        grass.editType(0, 0, 8, 1);
        let typed = false;
        for (const ch of grass.chunks) {
          for (let i = 0; i < ch.type0.length; i++) {
            if (ch.type0[i] === 1) {
              typed = true;
              break;
            }
          }
          if (typed) break;
        }
        ok('type-painted', typed);

        // у чанков есть модель цветка (кисть «тип» меняет модель, а не только цвет)
        let flowerGeo = false;
        for (const ch of grass.chunks) {
          const a = ch.mesh0.geometry.attributes.aFlower;
          if (a && a.array.length > 0 && a.array.some((v) => v === 1)) {
            flowerGeo = true;
            break;
          }
        }
        ok('flower-geo', flowerGeo);

        ok('chunks-active', grass.chunks.length > 0);

        // LOD-переключение согласовано: видна ровно одна из двух версий чанка
        let lodOk = true;
        for (const ch of grass.chunks) {
          const show0 = ch.mesh0.visible;
          const show1 = ch.mesh1.visible;
          if (ch.allHidden) {
            if (show0 || show1) lodOk = false;
          } else if (ch.lod1) {
            if (show0 || !show1) lodOk = false;
          } else if (!show0 || show1) {
            lodOk = false;
          }
        }
        ok('lod-consistent', lodOk);

        // пресеты применяются мгновенно (луна, дождь, звёзды)
        applyPreset(7);
        ok('preset-moon', moon.visible);
        applyPreset(6);
        ok('preset-rain', rain.visible && rain.material.opacity > 0);
        applyPreset(3);
        ok('preset-stars', stars.visible && stars.material.opacity > 0);

        t.textContent = logs.join(' | ');
      } catch (e) {
        t.textContent = 'ERROR ' + e.message;
      }
      document.body.appendChild(t);
    }, 2000);
  }
}

try {
  init();
  window.__appReady = true;
} catch (e) {
  console.error(e);
  showFatalError('Не удалось запустить сцену: ' + e.message);
}