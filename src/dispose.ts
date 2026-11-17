import * as THREE from 'three';

/** Gibt Geometrien, Materialien und deren Texturen eines Teilbaums auf der GPU frei. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = m.material as THREE.Material | THREE.Material[] | undefined;
    if (!mats) return;
    for (const mat of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
      mat.dispose();
    }
  });
}
