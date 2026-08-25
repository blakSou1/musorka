import * as THREE from 'three';

const SNOISE = `
vec3 mod289(vec3 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec2 mod289(vec2 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec3 permute(vec3 x){return mod289(((x * 34.0) + 1.0) * x);}
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const CHUNK_SIZE = 13;
const LOD_SWITCH = 64;
const HIDDEN_Y = -1000;

// Пучок из 3 лезвий + цветок (отдельная модель для кисти «тип») в одном инстансе.
function makeTuftGeometry(seg) {
  const blades = [
    { yaw: 0.0, lean: 0.10, height: 1.0 },
    { yaw: 0.50, lean: 0.08, height: 0.78 },
    { yaw: -0.47, lean: 0.08, height: 0.88 },
  ];
  const ROWS = seg + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  const flower = [];
  let base = 0;

  for (const b of blades) {
    const cy = Math.cos(b.yaw);
    const sy = Math.sin(b.yaw);
    for (let i = 0; i < ROWS; i++) {
      const t = i / seg;
      const y = t * b.height;
      const halfW = 0.5 * 0.085 * (1.0 - t * 0.85);
      const fwd = b.lean * t * t;
      for (let s = 0; s < 2; s++) {
        const sx = (s - 0.5) * 2 * halfW + fwd;
        positions.push(sx * cy, y, sx * sy);
        uvs.push(s, t);
        flower.push(0);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2, b2 = base + i * 2 + 1, c = base + (i + 1) * 2, d = base + (i + 1) * 2 + 1;
      indices.push(a, c, b2, b2, c, d);
    }
    base += ROWS * 2;
  }

  // цветок: короткий стебель + 4 лепестка крест-накрест
  for (let i = 0; i <= 1; i++) {
    const t = i / 1;
    const y = t * 0.5;
    const halfW = 0.02 * (1 - t * 0.4);
    positions.push(-halfW, y, 0, halfW, y, 0);
    uvs.push(9, t, 9, t);
    flower.push(1, 1);
  }
  indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  base += 4;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    const px = -Math.sin(a), pz = Math.cos(a);
    positions.push(dx * 0.02 + px * 0.05, 0.5, dz * 0.02 + pz * 0.05);
    positions.push(dx * 0.02 - px * 0.05, 0.5, dz * 0.02 - pz * 0.05);
    positions.push(dx * 0.16, 0.8, dz * 0.16);
    uvs.push(9, 0.6, 9, 0.6, 9, 1.0);
    flower.push(1, 1, 1);
    indices.push(base, base + 2, base + 1);
    base += 3;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aFlower', new THREE.Float32BufferAttribute(flower, 1));
  geo.setIndex(indices);
  return geo;
}

// детерминированный ГПСЧ для чанков (один и тот же чанк всегда одинаковый)
function hash2(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GrassField {
  constructor(scene, { heightAt, activeRadius = 175, chunkDensity = 900, terrainHalf = 115 }) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.chunkSize = CHUNK_SIZE;
    this.activeRadius = activeRadius;
    this.chunkDensity = chunkDensity;
    this.terrainHalf = terrainHalf;

    this.mousePos = new THREE.Vector3(0, 0, 0);
    this.mouseStrength = 0;
    this.mouseRadius = 4.2;
    this.windDir = new THREE.Vector2(0.7, 0.35).normalize();
    this.windStrength = 0.9;
    this.whistleActive = 0;
    this.whistlePos = new THREE.Vector3();

    // потоковые чанки вокруг камеры
    this.chunkMap = new Map();
    this.chunks = [];
    this.streamDirty = false;

    // маска «где не должно быть травы» и маска типа травы (кисти)
    this.maskCell = 1.0;
    this.maskHalf = 160;
    this.maskSize = Math.ceil((this.maskHalf * 2) / this.maskCell);
    this.mask = new Float32Array(this.maskSize * this.maskSize).fill(1);
    this.typeMask = new Float32Array(this.maskSize * this.maskSize); // 0 = зелёная, 1 = сухая высокая

    const geoLOD0 = makeTuftGeometry(2);
    const geoLOD1 = makeTuftGeometry(1);

    const uniforms = {
      uTime: { value: 0 },
      uWindDir: { value: this.windDir },
      uWindStrength: { value: this.windStrength },
      uMousePos: { value: this.mousePos },
      uMouseStrength: { value: 0 },
      uMouseRadius: { value: this.mouseRadius },
      uWhistlePos: { value: this.whistlePos },
      uWhistleStrength: { value: 0 },
      uColBase: { value: new THREE.Color('#3a5a2a') },
      uColTip: { value: new THREE.Color('#a8c052') },
      uColVar: { value: new THREE.Color('#7f9c3f') },
      uColDryBase: { value: new THREE.Color('#7a6a34') },
      uColDryTip: { value: new THREE.Color('#d9c07a') },
      uColFlower: { value: new THREE.Color('#f3e7c9') },
      uSunColor: { value: new THREE.Color('#ffd98a') },
      uLightDir: { value: new THREE.Vector3(-0.35, 0.28, -0.62).normalize() },
      uFogColor: { value: new THREE.Color('#8f7c58') },
      uFogNear: { value: 70 },
      uFogFar: { value: 210 },
    };
    this.uniforms = uniforms;

    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms,
      vertexShader: `
        attribute float aVariation;
        attribute float aSeed;
        attribute float aTrample;
        attribute float aType;
        attribute float aFlower;
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        uniform vec3 uMousePos;
        uniform float uMouseStrength;
        uniform float uMouseRadius;
        uniform vec3 uWhistlePos;
        uniform float uWhistleStrength;
        uniform float uFogNear;
        uniform float uFogFar;

        varying vec2 vUV;
        varying float vMix;
        varying float vWind;
        varying float vFog;
        varying float vClump;
        varying vec2 vLeanDir;
        varying float vLeanAmt;
        varying float vType;
        varying float vFlower;

        ${SNOISE}

        void main() {
          vec4 base4 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 base = base4.xyz;
          float h = uv.y;
          float t = uTime;

          // скроллящийся шум + дешёвая детальная октава
          vec2 windUV = base.xz * 0.04 - uWindDir * t * 0.35 + aSeed * 10.0;
          float n1 = snoise(windUV);
          float n2 = sin(base.x * 0.05 + t * 0.3) * cos(base.z * 0.05 - t * 0.4)
                    + 0.5 * sin((base.x + base.z) * 0.08 + t * 0.6);
          float gust = 0.55 + 0.45 * sin(t * 0.5 + n1 * 5.0 + n2 * 2.0 + aSeed * 6.28);
          vec2 wdir = normalize(uWindDir + 0.22 * vec2(n1, n2));
          vec2 wind = wdir * uWindStrength * gust
            * (0.55 + 0.45 * sin(t * 1.2 + base.x * 0.11) * sin(t * 0.8 + base.z * 0.13)) * 0.55;
          wind += uWindDir * uWindStrength * 0.3 * vec2(
            sin(base.x * 0.07 + t * 1.4) * cos(base.z * 0.06 + t * 0.9),
            sin(base.z * 0.07 + t * 1.2) * cos(base.x * 0.06 - t * 0.8)
          );

          // мышь: мгновенное раздвижение
          vec2 dm = base.xz - uMousePos.xz;
          float dmLen = length(dm);
          float m = 1.0 - smoothstep(uMouseRadius * 0.15, uMouseRadius, dmLen);
          vec2 dirN = dm / max(dmLen, 0.0001);
          vec2 perp = vec2(-dirN.y, dirN.x);
          vec2 mouseVec = (dirN + perp * 0.55) * m * uMouseStrength;

          // свист: вихрь
          vec2 dw = base.xz - uWhistlePos.xz;
          float dwLen = length(dw);
          float w = uWhistleStrength * exp(-dwLen * 0.9);
          vec2 wN = dw / max(dwLen, 0.0001);
          vec2 wPerp = vec2(-wN.y, wN.x);
          vec2 whistleVec = (wN + wPerp * 0.9) * w * 2.2;

          // вытаптывание
          float tp = clamp(aTrample, 0.0, 1.0);
          vec2 tdm = base.xz - uMousePos.xz;
          float tdl = max(length(tdm), 0.0001);
          vec2 trampleVec = (tdm / tdl) * tp * (0.8 + h) * 1.6;
          float press = 1.0 - tp * 0.85;

          // клэмпинг
          vec2 cell = floor(base.xz / 1.7);
          float clumpHash = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float stiff = 0.75 + 0.5 * clumpHash;

          float bend = pow(h, 1.5 + 0.5 * aVariation) * stiff;
          vec2 total = wind * bend * 0.9 + mouseVec * (0.3 + h) + whistleVec * bend;

          vec4 worldPos = instanceMatrix * vec4(position, 1.0);
          // цветок растёт только у травы «типа»; иначе схлопывается в точку основания
          worldPos.xyz = mix(worldPos.xyz, base, (1.0 - aType) * aFlower);
          vec3 p = worldPos.xyz;
          p.xz += total + trampleVec;

          // сухая высокая трава (кисть типа) растёт выше
          float hMul = 1.0 + 0.5 * aType;
          float hScale = 0.8 + 0.5 * clumpHash;
          p.y = base.y + (p.y - base.y) * hScale * press * hMul;

          // дистанционное растворение (дальние чанки уходят в туман)
          float camDist = distance(p, cameraPosition);
          float dfade = 1.0 - smoothstep(70.0, 210.0, camDist);
          p.xyz = mix(base.xyz, p.xyz, dfade);

          vUV = uv;
          vMix = aVariation;
          vClump = clumpHash;
          vType = aType;
          vFlower = aFlower;
          vWind = clamp(length(wind) + gust * 0.5, 0.0, 1.8);
          vLeanAmt = length(total);
          vLeanDir = total / max(length(total), 0.0001);
          vFog = 1.0 - smoothstep(uFogNear, uFogFar, camDist);

          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColBase;
        uniform vec3 uColTip;
        uniform vec3 uColVar;
        uniform vec3 uColDryBase;
        uniform vec3 uColDryTip;
        uniform vec3 uColFlower;
        uniform vec3 uSunColor;
        uniform vec3 uFogColor;
        uniform vec3 uLightDir;

        varying vec2 vUV;
        varying float vMix;
        varying float vWind;
        varying float vFog;
        varying float vClump;
        varying vec2 vLeanDir;
        varying float vLeanAmt;
        varying float vType;
        varying float vFlower;

        void main() {
          vec3 col = mix(uColBase, uColTip, pow(vUV.y, 1.2));
          col = mix(col, uColVar, vMix * 0.75);
          vec3 dry = mix(uColDryBase, uColDryTip, pow(vUV.y, 1.2));
          col = mix(col, dry, vType * 0.85);
          col = mix(col, uColFlower, vFlower * vType * 0.95);
          col *= 0.85 + 0.3 * vClump;
          col *= 0.7 + 0.3 * vUV.y;

          vec3 N = normalize(vec3(-vLeanDir * clamp(vLeanAmt, 0.0, 1.2) * 0.45, 1.0));
          float ndl = max(dot(N, uLightDir), 0.0);
          col *= 0.55 + 0.55 * ndl;

          col += uSunColor * pow(vUV.y, 2.5) * (0.15 + 0.55 * vWind) * (0.4 + 0.6 * ndl);

          col = mix(uFogColor, col, vFog);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.material = material;
  }

  maskIndex(x, z) {
    const gx = Math.max(0, Math.min(this.maskSize - 1, Math.floor((x + this.maskHalf) / this.maskCell)));
    const gz = Math.max(0, Math.min(this.maskSize - 1, Math.floor((z + this.maskHalf) / this.maskCell)));
    return gz * this.maskSize + gx;
  }

  // создаёт чанк (детерминированно) и регистрирует его в сцене
  makeChunk(ix, iz) {
    const rnd = mulberry32(hash2(ix, iz));
    const x0 = ix * CHUNK_SIZE;
    const z0 = iz * CHUNK_SIZE;
    const cx = (ix + 0.5) * CHUNK_SIZE;
    const cz = (iz + 0.5) * CHUNK_SIZE;

    const list = [];
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();
    const u = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const mat = new THREE.Matrix4();

    for (let k = 0; k < this.chunkDensity; k++) {
      const x = x0 + rnd() * CHUNK_SIZE;
      const z = z0 + rnd() * CHUNK_SIZE;
      if (rnd() < 0.10) continue;
      const y = this.heightAt(x, z);
      const slope = Math.hypot(
        this.heightAt(x + 0.6, z) - this.heightAt(x - 0.6, z),
        this.heightAt(x, z + 0.6) - this.heightAt(x, z - 0.6)
      );
      if (slope > 0.8) continue;
      const h = 0.7 + rnd() * 0.9;
      const sc = 0.85 + rnd() * 0.3;
      euler.set(0, rnd() * Math.PI * 2, 0);
      quat.setFromEuler(euler);
      u.set(x, y + 0.04, z);
      scale.set(sc, h, sc);
      mat.compose(u, quat, scale);
      list.push({ m: mat.clone(), x, z, h, scale: sc, variation: rnd(), seed: rnd() });
    }
    if (list.length === 0) return null;

    const n = list.length;
    const n1 = Math.max(1, Math.ceil(n / 3));

    const aV0 = new Float32Array(n);
    const aS0 = new Float32Array(n);
    const t0 = new Float32Array(n);
    const ty0 = new Float32Array(n);
    const bx0 = new Float32Array(n);
    const bz0 = new Float32Array(n);
    const sc0 = new Float32Array(n);
    const hg0 = new Float32Array(n);
    const aV1 = new Float32Array(n1);
    const aS1 = new Float32Array(n1);
    const t1 = new Float32Array(n1);
    const ty1 = new Float32Array(n1);
    const bx1 = new Float32Array(n1);
    const bz1 = new Float32Array(n1);
    const sc1 = new Float32Array(n1);
    const hg1 = new Float32Array(n1);

    const g0 = makeTuftGeometry(2);
    const g1 = makeTuftGeometry(1);

    const attr0 = new THREE.InstancedBufferAttribute(t0, 1);
    const attr1 = new THREE.InstancedBufferAttribute(t1, 1);
    const attrTy0 = new THREE.InstancedBufferAttribute(ty0, 1);
    const attrTy1 = new THREE.InstancedBufferAttribute(ty1, 1);
    g0.setAttribute('aVariation', new THREE.InstancedBufferAttribute(aV0, 1));
    g0.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aS0, 1));
    g0.setAttribute('aTrample', attr0);
    g0.setAttribute('aType', attrTy0);
    g1.setAttribute('aVariation', new THREE.InstancedBufferAttribute(aV1, 1));
    g1.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aS1, 1));
    g1.setAttribute('aTrample', attr1);
    g1.setAttribute('aType', attrTy1);

    const mesh0 = new THREE.InstancedMesh(g0, this.material, n);
    const mesh1 = new THREE.InstancedMesh(g1, this.material, n1);
    mesh0.visible = true;
    mesh1.visible = false;

    list.forEach((d, i) => {
      mesh0.setMatrixAt(i, d.m);
      aV0[i] = d.variation;
      aS0[i] = d.seed;
      bx0[i] = d.x;
      bz0[i] = d.z;
      sc0[i] = d.scale;
      hg0[i] = d.h;
      ty0[i] = this.typeMask[this.maskIndex(d.x, d.z)] >= 0.5 ? 1 : 0;
      if (i % 3 === 0) {
        const k = i / 3;
        mesh1.setMatrixAt(k, d.m);
        aV1[k] = d.variation;
        aS1[k] = d.seed;
        bx1[k] = d.x;
        bz1[k] = d.z;
        sc1[k] = d.scale;
        hg1[k] = d.h;
        ty1[k] = ty0[i];
      }
    });
    mesh0.instanceMatrix.needsUpdate = true;
    mesh1.instanceMatrix.needsUpdate = true;

    for (const mesh of [mesh0, mesh1]) {
      mesh.frustumCulled = true;
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += 3.0;
      this.scene.add(mesh);
    }

    const ch = {
      key: ix + ',' + iz,
      cx,
      cz,
      mesh0,
      mesh1,
      trample0: t0,
      trample1: t1,
      attr0,
      attr1,
      type0: ty0,
      type1: ty1,
      attrType0: attrTy0,
      attrType1: attrTy1,
      bx0,
      bz0,
      bx1,
      bz1,
      scale0: sc0,
      h0: hg0,
      scale1: sc1,
      h1: hg1,
      allHidden: false,
      lod1: false,
      hasTrample: false,
    };
    this.applyMaskForChunk(ch);
    return ch;
  }

  removeChunk(key) {
    const ch = this.chunkMap.get(key);
    if (!ch) return;
    this.chunkMap.delete(key);
    this.scene.remove(ch.mesh0);
    this.scene.remove(ch.mesh1);
    ch.mesh0.geometry.dispose();
    ch.mesh1.geometry.dispose();
    this.streamDirty = true;
  }

  update(time, dt, windStrength, camera, mouseActive) {
    this.uniforms.uTime.value = time;
    this.windStrength += (windStrength - this.windStrength) * Math.min(1, dt * 3);
    this.uniforms.uWindStrength.value = this.windStrength;
    this.uniforms.uMousePos.value.copy(this.mousePos);
    this.uniforms.uMouseStrength.value = this.mouseStrength;
    this.uniforms.uWhistlePos.value.copy(this.whistlePos);
    this.uniforms.uWhistleStrength.value = this.whistleActive;

    // потоковая генерация: активны только чанки в радиусе activeRadius от камеры
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const R = Math.ceil(this.activeRadius / CHUNK_SIZE);
    const cix = Math.floor(camX / CHUNK_SIZE);
    const ciz = Math.floor(camZ / CHUNK_SIZE);
    const R2 = this.activeRadius * this.activeRadius;
    const wanted = [];
    for (let j = ciz - R; j <= ciz + R; j++) {
      for (let i = cix - R; i <= cix + R; i++) {
        const cx = (i + 0.5) * CHUNK_SIZE;
        const cz = (j + 0.5) * CHUNK_SIZE;
        const dx = cx - camX;
        const dz = cz - camZ;
        const d2 = dx * dx + dz * dz;
        if (d2 <= R2 && Math.abs(cx) <= this.terrainHalf && Math.abs(cz) <= this.terrainHalf) {
          wanted.push({ key: i + ',' + j, d2 });
        }
      }
    }
    // ближние чанки строим первыми
    wanted.sort((a, b) => a.d2 - b.d2);
    // создаём недостающие (не больше 6 за кадр, чтобы не было рывков)
    let built = 0;
    for (const w of wanted) {
      if (built >= 6) break;
      if (this.chunkMap.has(w.key)) continue;
      const parts = w.key.split(',');
      const ch = this.makeChunk(+parts[0], +parts[1]);
      if (ch) {
        this.chunkMap.set(w.key, ch);
        this.streamDirty = true;
        built++;
      }
    }
    const wantedSet = new Set();
    for (const w of wanted) wantedSet.add(w.key);
    // убираем чанки, вышедшие из радиуса
    for (const key of Array.from(this.chunkMap.keys())) {
      if (!wantedSet.has(key)) this.removeChunk(key);
    }
    this.chunks = Array.from(this.chunkMap.values());

    // LOD и фрустум-каллинг
    const cam = camera.position;
    for (const ch of this.chunks) {
      if (ch.allHidden) {
        if (ch.mesh0.visible) ch.mesh0.visible = false;
        if (ch.mesh1.visible) ch.mesh1.visible = false;
        continue;
      }
      const d = Math.hypot(ch.cx - cam.x, ch.cz - cam.z);
      ch.lod1 = d > LOD_SWITCH;
      ch.mesh0.visible = !ch.lod1;
      ch.mesh1.visible = ch.lod1;
    }

    this.updateTrample(dt, mouseActive);
  }

  // кисть «где не должно быть травы»: amount > 0 стирает, < 0 возвращает (мгновенно в радиусе)
  editMask(x, z, radius, amount) {
    const cell = this.maskCell;
    const gx0 = Math.max(0, Math.floor((x - radius + this.maskHalf) / cell));
    const gx1 = Math.min(this.maskSize - 1, Math.ceil((x + radius + this.maskHalf) / cell));
    const gz0 = Math.max(0, Math.floor((z - radius + this.maskHalf) / cell));
    const gz1 = Math.min(this.maskSize - 1, Math.ceil((z + radius + this.maskHalf) / cell));
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const wx = gx * cell - this.maskHalf;
        const wz = gz * cell - this.maskHalf;
        const dx = wx - x;
        const dz = wz - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= radius) {
          const t = 1 - d / radius;
          const f = t * t * (3 - 2 * t);
          const idx = gz * this.maskSize + gx;
          if (amount > 0) this.mask[idx] = Math.min(this.mask[idx], 1 - f);
          else this.mask[idx] = Math.max(this.mask[idx], f);
        }
      }
    }
    this.streamDirty = true;
    this.applyMask();
  }

  // кисть типа травы: type 1 = сухая высокая, 0 = зелёная
  editType(x, z, radius, type) {
    const cell = this.maskCell;
    const gx0 = Math.max(0, Math.floor((x - radius + this.maskHalf) / cell));
    const gx1 = Math.min(this.maskSize - 1, Math.ceil((x + radius + this.maskHalf) / cell));
    const gz0 = Math.max(0, Math.floor((z - radius + this.maskHalf) / cell));
    const gz1 = Math.min(this.maskSize - 1, Math.ceil((z + radius + this.maskHalf) / cell));
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const wx = gx * cell - this.maskHalf;
        const wz = gz * cell - this.maskHalf;
        const dx = wx - x;
        const dz = wz - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= radius) {
          const t = 1 - d / radius;
          const f = t * t * (3 - 2 * t);
          const idx = gz * this.maskSize + gx;
          if (type === 1) this.typeMask[idx] = Math.max(this.typeMask[idx], f);
          else this.typeMask[idx] = Math.min(this.typeMask[idx], 1 - f);
        }
      }
    }
    // обновляем атрибуты активных чанков
    const r2 = radius * radius;
    for (const ch of this.chunks) {
      if (Math.abs(ch.cx - x) > radius + CHUNK_SIZE || Math.abs(ch.cz - z) > radius + CHUNK_SIZE) continue;
      let d0 = false;
      for (let i = 0; i < ch.type0.length; i++) {
        const dx = ch.bx0[i] - x;
        const dz = ch.bz0[i] - z;
        if (dx * dx + dz * dz <= r2) {
          ch.type0[i] = type;
          d0 = true;
        }
      }
      if (d0) ch.attrType0.needsUpdate = true;
      let d1 = false;
      for (let i = 0; i < ch.type1.length; i++) {
        const dx = ch.bx1[i] - x;
        const dz = ch.bz1[i] - z;
        if (dx * dx + dz * dz <= r2) {
          ch.type1[i] = type;
          d1 = true;
        }
      }
      if (d1) ch.attrType1.needsUpdate = true;
    }
  }

  applyMaskForChunk(ch) {
    const mask = this.mask;
    const hA = this.heightAt;
    const m0 = ch.mesh0.instanceMatrix.array;
    let vis0 = 0;
    let dirty0 = false;
    for (let i = 0; i < ch.bx0.length; i++) {
      const vis = mask[this.maskIndex(ch.bx0[i], ch.bz0[i])] >= 0.5;
      if (vis) vis0++;
      const b = i * 16;
      if (vis) {
        const y = hA(ch.bx0[i], ch.bz0[i]) + 0.04;
        if (m0[b] !== ch.scale0[i] || m0[b + 13] !== y) {
          m0[b] = ch.scale0[i];
          m0[b + 5] = ch.h0[i];
          m0[b + 10] = ch.scale0[i];
          m0[b + 13] = y;
          dirty0 = true;
        }
      } else {
        if (m0[b] !== 0 || m0[b + 13] !== HIDDEN_Y) {
          m0[b] = 0;
          m0[b + 5] = 0;
          m0[b + 10] = 0;
          m0[b + 13] = HIDDEN_Y;
          dirty0 = true;
        }
      }
    }
    if (dirty0) ch.mesh0.instanceMatrix.needsUpdate = true;

    const m1 = ch.mesh1.instanceMatrix.array;
    let vis1 = 0;
    let dirty1 = false;
    for (let i = 0; i < ch.bx1.length; i++) {
      const vis = mask[this.maskIndex(ch.bx1[i], ch.bz1[i])] >= 0.5;
      if (vis) vis1++;
      const b = i * 16;
      if (vis) {
        const y = hA(ch.bx1[i], ch.bz1[i]) + 0.04;
        if (m1[b] !== ch.scale1[i] || m1[b + 13] !== y) {
          m1[b] = ch.scale1[i];
          m1[b + 5] = ch.h1[i];
          m1[b + 10] = ch.scale1[i];
          m1[b + 13] = y;
          dirty1 = true;
        }
      } else {
        if (m1[b] !== 0 || m1[b + 13] !== HIDDEN_Y) {
          m1[b] = 0;
          m1[b + 5] = 0;
          m1[b + 10] = 0;
          m1[b + 13] = HIDDEN_Y;
          dirty1 = true;
        }
      }
    }
    if (dirty1) ch.mesh1.instanceMatrix.needsUpdate = true;

    const wasHidden = ch.allHidden;
    ch.allHidden = vis0 === 0 && vis1 === 0;
    if (ch.allHidden) {
      if (!wasHidden) {
        ch.mesh0.visible = false;
        ch.mesh1.visible = false;
      }
    } else if (wasHidden) {
      // трава вернулась — восстанавливаем видимость по текущему LOD
      ch.mesh0.visible = !ch.lod1;
      ch.mesh1.visible = ch.lod1;
    }
  }

  applyMask() {
    for (const ch of this.chunks) this.applyMaskForChunk(ch);
  }

  // пересаживает траву на изменённый рельеф (скрытые пучки остаются под землёй)
  updateHeights() {
    const hA = this.heightAt;
    const mask = this.mask;
    for (const ch of this.chunks) {
      const m0 = ch.mesh0.instanceMatrix.array;
      let d0 = false;
      for (let i = 0; i < ch.bx0.length; i++) {
        const y = mask[this.maskIndex(ch.bx0[i], ch.bz0[i])] >= 0.5
          ? hA(ch.bx0[i], ch.bz0[i]) + 0.04
          : HIDDEN_Y;
        if (m0[i * 16 + 13] !== y) {
          m0[i * 16 + 13] = y;
          d0 = true;
        }
      }
      if (d0) ch.mesh0.instanceMatrix.needsUpdate = true;

      const m1 = ch.mesh1.instanceMatrix.array;
      let d1 = false;
      for (let i = 0; i < ch.bx1.length; i++) {
        const y = mask[this.maskIndex(ch.bx1[i], ch.bz1[i])] >= 0.5
          ? hA(ch.bx1[i], ch.bz1[i]) + 0.04
          : HIDDEN_Y;
        if (m1[i * 16 + 13] !== y) {
          m1[i * 16 + 13] = y;
          d1 = true;
        }
      }
      if (d1) ch.mesh1.instanceMatrix.needsUpdate = true;
    }
  }

  // собирает позиции всех активных пучков (для тени травы на земле)
  collectBases() {
    let total = 0;
    for (const ch of this.chunks) total += ch.bx0.length;
    const out = new Float32Array(total * 2);
    let o = 0;
    for (const ch of this.chunks) {
      for (let i = 0; i < ch.bx0.length; i++) {
        out[o] = ch.bx0[i];
        out[o + 1] = ch.bz0[i];
        o += 2;
      }
    }
    return out;
  }

  updateTrample(dt, mouseActive) {
    const mx = this.mousePos.x;
    const mz = this.mousePos.z;
    const r = this.mouseRadius;
    const rMin = r * 0.15;
    const rSpan = r - rMin;
    const far2 = (r + CHUNK_SIZE) * (r + CHUNK_SIZE);

    for (const ch of this.chunks) {
      // чанки без вытоптанной травы далеко от мыши можно не трогать
      if (!ch.hasTrample && (!mouseActive || (ch.cx - mx) * (ch.cx - mx) + (ch.cz - mz) * (ch.cz - mz) > far2)) {
        continue;
      }
      let c0 = false;
      let t0 = false;
      for (let i = 0; i < ch.trample0.length; i++) {
        let v = ch.trample0[i] - dt * 0.55;
        if (mouseActive) {
          const dx = ch.bx0[i] - mx;
          const dz = ch.bz0[i] - mz;
          if (dx * dx + dz * dz < r * r) {
            const d = Math.sqrt(dx * dx + dz * dz);
            const s = Math.min(1, Math.max(0, (d - rMin) / rSpan));
            const f = 1 - s * s * (3 - 2 * s);
            v += dt * 4.5 * f;
          }
        }
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        if (v > 0) t0 = true;
        if (v !== ch.trample0[i]) {
          ch.trample0[i] = v;
          c0 = true;
        }
      }
      if (c0) ch.attr0.needsUpdate = true;

      let c1 = false;
      let t1 = false;
      for (let i = 0; i < ch.trample1.length; i++) {
        let v = ch.trample1[i] - dt * 0.55;
        if (mouseActive) {
          const dx = ch.bx1[i] - mx;
          const dz = ch.bz1[i] - mz;
          if (dx * dx + dz * dz < r * r) {
            const d = Math.sqrt(dx * dx + dz * dz);
            const s = Math.min(1, Math.max(0, (d - rMin) / rSpan));
            const f = 1 - s * s * (3 - 2 * s);
            v += dt * 4.5 * f;
          }
        }
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        if (v > 0) t1 = true;
        if (v !== ch.trample1[i]) {
          ch.trample1[i] = v;
          c1 = true;
        }
      }
      if (c1) ch.attr1.needsUpdate = true;

      ch.hasTrample = t0 || t1;
    }
  }

  run() {
    this.whistleActive = 1;
  }
}