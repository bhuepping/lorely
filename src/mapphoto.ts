// „Foto von oben“ – die laufende Szene einmal orthografisch von oben in ein 2D-Canvas rendern (nicht pro Frame).
// Nebel bleibt als Objekt (nur Entfernungen riesig, sonst neu kompilierte Shader), Himmel/Auto/Partikel/Sprites/Sterne/Checkpoints sind für den Schuss unsichtbar.
import * as THREE from 'three';

export interface MapExt { cx: number; cz: number; span: number }

/** Mindestabstand (sRGB 0–255, euklidisch) Fahrbahn gegen Streifen daneben; darunter wird die Fahrbahn fürs Foto getönt */
export const ROAD_CONTRAST_MIN = 80;
export const ROAD_TINT = 0x9a7c60;   // Faktor je Kanal (dunkler, wärmer), nur fürs Foto
export interface RoadProbe { length: number; half: number; offset(s: number, l: number): number[] }
export const mapPhotoState: { contrast: number; after: number; tinted: boolean } = { contrast: 0, after: 0, tinted: false };

/** Median-Farbabstand Fahrbahnmitte gegen zwei Streifen links/rechts (aus der Streckengeometrie) in den gerenderten GL-Pixeln (Zeilen unten beginnend). */
export function roadContrast(px: Uint8Array, size: number, ext: MapExt, pr: RoadProbe): number {
  const at = (x: number, z: number): number[] | null => {
    const u = (x - ext.cx) / ext.span + 0.5, v = (z - ext.cz) / ext.span + 0.5;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
    const o = ((size - 1 - Math.floor(v * size)) * size + Math.floor(u * size)) * 4;
    return [px[o], px[o + 1], px[o + 2]];
  };
  const ds: number[] = [];
  for (let s = 6; s < pr.length - 6; s += 4) {
    const c = at(...(pr.offset(s, 0).slice(0, 2) as [number, number]));
    if (!c) continue;
    let sum = 0, n = 0;
    for (const sd of [-1, 1]) {
      const o = pr.offset(s, sd * (pr.half + 2.2)), e = at(o[0], o[1]);
      if (e) { sum += Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]); n++; }
    }
    if (n) ds.push(sum / n);
  }
  if (!ds.length) return 255;
  ds.sort((a, b) => a - b); return ds[ds.length >> 1];
}

export function capturePhoto(renderer: THREE.WebGLRenderer, scene: THREE.Scene, ext: MapExt, size: number, hide: (THREE.Object3D | null | undefined)[], probe?: RoadProbe): HTMLCanvasElement | null {
  const off: THREE.Object3D[] = [], lights: (() => void)[] = [];
  const rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const fog = scene.fog as THREE.Fog | null, f0 = fog ? [fog.near, fog.far] : null, bg = scene.background;
  const prevRT = renderer.getRenderTarget();
  try {
    for (const o of hide) if (o && o.visible) { o.visible = false; off.push(o); }
    scene.traverse((o) => { if (o.visible && ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints)) { o.visible = false; off.push(o); } });
    scene.traverse((o) => {   // Tageslicht für das Foto (Abend/Nacht/Gold würden Sand und Wasser einfärben); danach zurück
      const h = o as THREE.HemisphereLight, d = o as THREE.DirectionalLight;
      if (h.isHemisphereLight) { const c = [h.color.getHex(), h.groundColor.getHex(), h.intensity]; h.color.set(0xffffff); h.groundColor.set(0xa8a498); h.intensity = 1.25; lights.push(() => { h.color.setHex(c[0]); h.groundColor.setHex(c[1]); h.intensity = c[2]; }); }
      else if (d.isDirectionalLight) { const c = [d.color.getHex(), d.intensity]; d.color.set(0xffffff); d.intensity = 1.0; lights.push(() => { d.color.setHex(c[0]); d.intensity = c[1]; }); }
    });
    if (fog) { fog.near = 1e6; fog.far = 2e6; }
    scene.background = new THREE.Color(0x203040);
    const h = ext.span / 2, cam = new THREE.OrthographicCamera(-h, h, h, -h, 1, 4000);
    cam.up.set(0, 0, -1); cam.position.set(ext.cx, 1500, ext.cz); cam.lookAt(ext.cx, 0, ext.cz); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    renderer.setRenderTarget(rt); renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    mapPhotoState.tinted = false;
    if (probe) {   // zu wenig Kontrast (Sand auf Sand) → Fahrbahn nur für diesen Schuss tönen, zweiter Schuss, danach zurück
      mapPhotoState.contrast = mapPhotoState.after = roadContrast(px, size, ext, probe);
      if (mapPhotoState.contrast < ROAD_CONTRAST_MIN) {
        const ms: THREE.Mesh[] = []; scene.traverse((o) => { const m = o as THREE.Mesh; if (o.userData.mapTint && m.isMesh && (m.material as THREE.MeshBasicMaterial).color) ms.push(m); });
        const was = ms.map((r) => (r.material as THREE.MeshBasicMaterial).color.getHex());
        try {
          for (const r of ms) (r.material as THREE.MeshBasicMaterial).color.setHex(ROAD_TINT);
          renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
          mapPhotoState.after = roadContrast(px, size, ext, probe); mapPhotoState.tinted = true;
        } finally { ms.forEach((r, i) => (r.material as THREE.MeshBasicMaterial).color.setHex(was[i])); }
      }
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'); if (!g) return null;
    const img = g.createImageData(size, size), row = size * 4;
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * row, (size - y) * row), y * row);   // GL-Zeilen stehen auf dem Kopf
    g.putImageData(img, 0, 0);
    return cv;
  } catch { return null; }
  finally {
    for (const r of lights) r();
    for (const o of off) o.visible = true;
    if (fog && f0) { fog.near = f0[0]; fog.far = f0[1]; }
    scene.background = bg; renderer.setRenderTarget(prevRT); rt.dispose();
  }
}
