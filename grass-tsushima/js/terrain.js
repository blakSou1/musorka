import * as THREE from 'three';

export function makeHeightAt(seed = 0) {
  return (x, z) => {
    return (
      0.55 * Math.sin(x * 0.028 + seed) * Math.cos(z * 0.036 + seed * 1.7) +
      0.38 * Math.sin(x * 0.11 + seed * 2.0 + 2.0) * Math.sin(z * 0.09 + seed * 3.1 + 1.0) +
      0.22 * Math.sin(x * 0.02 - z * 0.05 + seed * 4.0 + 1.7) +
      0.1 * Math.sin((x + z) * 0.4 + seed * 5.0)
    );
  };
}

// Редактируемый террейн: базовая шумовая высота + сетка смещений (холмы/ямы кистью).
export function createTerrain({ size = 240, segments = 200, seed = 3.7 }) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const baseHeightAt = makeHeightAt(seed);

  // сетка редактирования
  const GRID = 2.0;
  const gs = Math.ceil(size / GRID) + 1;
  const disp = new Float32Array(gs * gs);

  function dispAt(x, z) {
    const gx = Math.max(0, Math.min(gs - 1, Math.round((x + size / 2) / GRID)));
    const gz = Math.max(0, Math.min(gs - 1, Math.round((z + size / 2) / GRID)));
    return disp[gz * gs + gx];
  }

  function heightAt(x, z) {
    return baseHeightAt(x, z) + dispAt(x, z);
  }

  function rebuild() {
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  // цвет земли (по базовому шуму)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 0.12 + z * 0.08) * 0.5 + 0.5;
    c.setRGB(0.16 + 0.12 * n, 0.26 + 0.16 * n, 0.13 + 0.08 * n);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  rebuild();

  // кисть рельефа: поднимает (raise=true) или опускает землю в радиусе
  function edit(x, z, radius, strength, raise) {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor((x - radius + size / 2) / GRID));
    const x1 = Math.min(gs - 1, Math.ceil((x + radius + size / 2) / GRID));
    const z0 = Math.max(0, Math.floor((z - radius + size / 2) / GRID));
    const z1 = Math.min(gs - 1, Math.ceil((z + radius + size / 2) / GRID));
    for (let j = z0; j <= z1; j++) {
      for (let i = x0; i <= x1; i++) {
        const wx = i * GRID - size / 2;
        const wz = j * GRID - size / 2;
        const dx = wx - x;
        const dz = wz - z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2) {
          const d = Math.sqrt(d2);
          const t = 1 - d / radius;
          const fall = t * t * (3 - 2 * t);
          const idx = j * gs + i;
          disp[idx] = Math.max(-8, Math.min(8, disp[idx] + (raise ? 1 : -1) * strength * fall));
        }
      }
    }
    rebuild();
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  return { mesh, geometry: geo, heightAt, edit };
}