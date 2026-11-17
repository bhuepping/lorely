// Tastatur-Fokus: Rahmen (.kf) nur sichtbar, solange zuletzt eine Taste benutzt wurde (Klasse .kb am Wurzelelement)
let done = false;
export function initKb(root: HTMLElement) {
  if (done) return; done = true;
  const NAV = /^(Arrow|Enter|NumpadEnter|Space|Escape|Key[WASDP])/;
  window.addEventListener('keydown', (e) => { if (NAV.test(e.code)) root.classList.add('kb'); }, true);
  window.addEventListener('pointerdown', () => root.classList.remove('kb'), true);
}
