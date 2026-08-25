import * as THREE from 'three';

function makeSoftTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,230,170,0.8)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class Pollen {
  constructor(scene, count = 750, bounds = 52) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * bounds;
      positions[i * 3 + 1] = 0.5 + Math.random() * 6;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * bounds;
      seeds[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.14,
      map: makeSoftTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color('#ffd98a'),
      opacity: 0.7,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    this.points = points;
    this.seeds = seeds;
    this.count = count;
    this.bounds = bounds;
    this.base = positions.slice();
  }

  update(time, dt, wind) {
    const pos = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const s = this.seeds[i];
      pos[i * 3] += Math.sin(time * 0.4 + s) * 0.05 * dt * 60;
      pos[i * 3 + 1] += (0.015 + wind * 0.02) * dt * 60;
      pos[i * 3 + 2] += Math.cos(time * 0.35 + s * 1.3) * 0.05 * dt * 60;
      if (pos[i * 3 + 1] > 7) pos[i * 3 + 1] = 0.4;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}