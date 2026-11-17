// Auto-Symbole für Menü und Bestzeiten: jedes Auto einmal aus dem echten 3D-Modell (CarMesh) offscreen rendern,
// Dreiviertelansicht schräg von vorn, Studiolicht, dann auf Pixelgröße herunterrechnen (Kantenglättung weg, Farben gestuft, dunkle Kontur).
// Nutzt den vorhandenen WebGLRenderer über ein Render-Target; Ergebnis wird gecacht (pixel.ts setIcons). Schlägt etwas fehl -> alte Sprites bleiben.
import * as THREE from 'three';
import { CARS } from './physics/params';
import { Vehicle } from './physics/vehicle';
import { FlatTerrain } from './physics/terrain';
import { CarMesh } from './world';
import { setIcons } from './pixel';

export const ICON_W = 28, ICON_H = 15;
const SS = 6;                       // Überabtastung je Bildpunkt
const LEVELS = 6;                   // Farbstufen je Kanal
const TARGET_LUM = 96;               // mittlere Helligkeit der Icon-Pixel (0..255), darunter wird angehoben
const EDGE = [16, 0, 42];           // Kontur (wie die Logo-Kontur #10002a)

export function renderCarIcons(renderer: THREE.WebGLRenderer): Record<string, HTMLCanvasElement> {
  const W = ICON_W * SS, H = ICON_H * SS, out: Record<string, HTMLCanvasElement> = {};
  const rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x4a3a66, 1.7));
  const key = new THREE.DirectionalLight(0xfff1dc, 3.2); key.position.set(-4, 6, -5); scene.add(key);   // Hauptlicht: vorn links oben
  const fill = new THREE.DirectionalLight(0x8fb0ff, 0.9); fill.position.set(6, 2, -2); scene.add(fill);  // Aufheller: rechts
  const rim = new THREE.DirectionalLight(0xff6ad0, 1.6); rim.position.set(2, 3, 7); scene.add(rim);      // Gegenlicht: hinten (Magenta, Kante)
  const prev = { rt: renderer.getRenderTarget(), alpha: renderer.getClearAlpha(), col: renderer.getClearColor(new THREE.Color()).clone() };
  try {
    for (const p of Object.values(CARS)) {
      const veh = new Vehicle(p, new FlatTerrain());
      const mesh = new CarMesh(veh, p); mesh.markDriven(p.drive); mesh.setNight(true);
      mesh.update(veh.pose, veh.pose, 0); mesh.root.position.set(0, 0, 0); mesh.root.quaternion.identity();
      mesh.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).blending === THREE.AdditiveBlending) m.visible = false; });   // Lichtkegel/Schein (30 m lang) weg, Lampen selbst bleiben
      scene.add(mesh.root); scene.updateMatrixWorld(true);
      // Kamera: Blick von vorn-links-oben auf die Mitte; Ortho-Ausschnitt aus den projizierten Eckpunkten der Hülle
      const box = new THREE.Box3();
      mesh.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)); } });
      const c = box.getCenter(new THREE.Vector3());
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      cam.position.copy(c).add(new THREE.Vector3(-4.6, 2.5, -6.2)); cam.lookAt(c); cam.updateMatrixWorld(true);
      const inv = cam.matrixWorldInverse; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const v = new THREE.Vector3(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const pad = 0.04, asp = ICON_W / ICON_H, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      let hw = (x1 - x0) / 2 * (1 + pad), hh = (y1 - y0) / 2 * (1 + pad);
      if (hw / hh < asp) hw = hh * asp; else hh = hw / asp;
      cam.left = cx - hw; cam.right = cx + hw; cam.top = cy + hh; cam.bottom = cy - hh; cam.updateProjectionMatrix();
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
      const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      out[`${p.style === 'buggy' || p.style === 'rally' || p.style === 'jeep' ? p.style : 'car'}_${p.drive}`] = toIcon(buf);
      scene.remove(mesh.root);
      mesh.root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((q) => q.dispose()); });
    }
  } finally {
    renderer.setRenderTarget(prev.rt); renderer.setClearColor(prev.col, prev.alpha); rt.dispose();
  }
  return out;
}

/** Überabgetastetes RGBA (Ursprung unten links) -> Pixel-Icon: Deckung > 50 % = Bildpunkt, Farbe gemittelt + gestuft, dunkle Kontur */
function toIcon(buf: Uint8Array): HTMLCanvasElement {
  const W = ICON_W * SS, px: (number[] | null)[] = [];
  for (let y = 0; y < ICON_H; y++) for (let x = 0; x < ICON_W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const o = (((ICON_H - 1 - y) * SS + j) * W + x * SS + i) * 4, al = buf[o + 3] / 255;
      r += buf[o] * al; g += buf[o + 1] * al; b += buf[o + 2] * al; a += al;      // Render-Target ist ungewichtet (nicht vormultipliziert): mit Deckung gewichten
    }
    if (a / (SS * SS) < 0.5) { px.push(null); continue; }
    const q = (v: number) => Math.round(Math.round(v / a / 255 * (LEVELS - 1)) / (LEVELS - 1) * 255);
    px.push([q(r), q(g), q(b)]);
  }
  // Belichtung je Auto: dunkle Modelle (viel Glas/Schwarz) werden auf eine Mindesthelligkeit angehoben
  const lit = px.filter((p) => p) as number[][];
  const lum = lit.reduce((s, p) => s + (p[0] + p[1] + p[2]) / 3, 0) / Math.max(1, lit.length), gain = Math.min(1.7, Math.max(1, TARGET_LUM / Math.max(1, lum)));
  if (gain > 1.01) for (const p of lit) for (let k = 0; k < 3; k++) p[k] = Math.min(255, Math.round(p[k] * gain));
  const c = document.createElement('canvas'); c.width = ICON_W; c.height = ICON_H;
  const g = c.getContext('2d')!, at = (x: number, y: number) => (x < 0 || y < 0 || x >= ICON_W || y >= ICON_H ? null : px[y * ICON_W + x]);
  for (let y = 0; y < ICON_H; y++) for (let x = 0; x < ICON_W; x++) {
    const p = px[y * ICON_W + x];
    if (p) { g.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; g.fillRect(x, y, 1, 1); }
    else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) { g.fillStyle = `rgb(${EDGE})`; g.fillRect(x, y, 1, 1); }
  }
  return c;
}

/** Beim Start einmal aufrufen; bei Fehlern (kein WebGL, Readback gesperrt) bleiben die gezeichneten Sprites. */
export function installCarIcons(renderer: THREE.WebGLRenderer): void {
  try { setIcons(renderCarIcons(renderer)); } catch (e) { console.warn('Auto-Symbole: Rückfall auf Sprites', e); }
}
