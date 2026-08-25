import * as THREE from 'three';

export function makeSky(sunDir) {
  const geo = new THREE.SphereGeometry(800, 32, 20);

  const uniforms = {
    uSunDir: { value: sunDir.clone().normalize() },
    uSunColor: { value: new THREE.Color('#ffcf8a') },
    uHorizon: { value: new THREE.Color('#edcfa3') },
    uZenith: { value: new THREE.Color('#575f99') },
  };

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      void main() {
        vec3 dir = normalize(vDir);
        float y = dir.y * 0.5 + 0.5;

        vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55));

        float s = max(dot(dir, uSunDir), 0.0);
        col += uSunColor * pow(s, 700.0) * 0.55;
        col += uSunColor * pow(s, 9.0) * 0.30;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}