// Kurzer Hinweis mitten im Spiel (z. B. „Kopiert“), verschwindet von selbst.
import { px } from './pixel';

export function toast(text: string): void {
  const root = document.querySelector<HTMLElement>('.rs-root');
  if (!root) return;
  const box = document.createElement('div'); box.className = 'rs-toast';
  px(box, text, { k: 0.75, color: '#ffffff', shadow: false });
  root.appendChild(box);
  setTimeout(() => box.remove(), 1600);
}
