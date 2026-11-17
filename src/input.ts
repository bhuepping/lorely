// Eingabeschicht: liefert NUR {steer, throttle, brake, handbrake}. Tastatur, Touch, Neigen.
import type { Input } from './physics/vehicle';

/** träges Gas: 0 → 1 in GAS_UP_S, 1 → 0 in GAS_DOWN_S (Tastatur und Touch gleich) */
const GAS_UP_S = 0.5, GAS_DOWN_S = 0.2;
/** längster Zeitschritt zwischen zwei read()-Aufrufen (Pause, Tab im Hintergrund) */
const GAS_DT_MAX = 0.1;
type Btn = 'left' | 'right' | 'gas' | 'brake' | 'hand';

export class Controls {
  private keys = new Set<string>();
  private touch: Record<Btn, Set<number>> = { left: new Set(), right: new Set(), gas: new Set(), brake: new Set(), hand: new Set() };
  tiltOn = false;
  private tilt = 0;
  /** Zeitquelle in Sekunden (Tests setzen sie auf eine gesteuerte Uhr) */
  clock: () => number = () => performance.now() / 1000;
  /** aktuelles Gas 0–1 (rampt in read()); der Gasbalken liest es */
  private gas = 0;
  private gasT: number | null = null;
  onReset: () => void = () => {};
  onView: () => void = () => {};

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyR') { this.onReset(); return; }
      if (e.code === 'KeyC') { this.onView(); return; }
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('gesturestart', (e) => e.preventDefault());   // iOS-Pinch
    window.addEventListener('blur', () => this.releaseAll());
  }

  private btns: { el: HTMLElement; b: Btn }[] = [];
  /** Zeiger (pointerId, Maus wie Finger) -> Taste, die er gerade hält */
  private owner = new Map<number, Btn>();
  /** alle gedrückten Tasten und Touch-Tasten loslassen (Pause/Fortsetzen) */
  releaseAll(): void { this.keys.clear(); this.owner.clear(); for (const k of Object.keys(this.touch)) this.touch[k as Btn].clear(); this.paint(); this.resetGas(); }

  /** Gas auf 0 und Zeitbasis neu (Pause, Reset): nach dem Weitermachen kein Restgas */
  resetGas(): void { this.gas = 0; this.gasT = null; }

  /** aktuelles Gas 0–1 (Stand des letzten read()) */
  get gasLevel(): number { return this.gas; }

  /** Taste per Pointer-Events (Maus und Finger gleich). Ein Lenkfinger darf ohne Loslassen zwischen ◀ und ▶ rutschen. */
  bindButton(el: HTMLElement, b: Btn): void {
    this.btns.push({ el, b });
    const hold = (id: number, to: Btn | null) => {
      const from = this.owner.get(id);
      if (from === to) return;
      if (from) this.touch[from].delete(id);
      if (to) { this.owner.set(id, to); this.touch[to].add(id); } else this.owner.delete(id);
      this.paint();
    };
    el.addEventListener('pointerdown', (e) => { hold(e.pointerId, b); try { el.setPointerCapture(e.pointerId); } catch { /* Pointer schon weg */ } e.preventDefault(); });
    const up = (e: PointerEvent) => hold(e.pointerId, null);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    if (b === 'left' || b === 'right') el.addEventListener('pointermove', (e) => {
      const cur = this.owner.get(e.pointerId);
      if (cur !== 'left' && cur !== 'right') return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const o = this.btns.find((x) => (x.b === 'left' || x.b === 'right') && x.el.contains(hit));
      if (o && o.b !== cur) hold(e.pointerId, o.b);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private paint(): void { for (const { el, b } of this.btns) el.classList.toggle('on', this.touch[b].size > 0); }

  /** Neigen-Modus ein/aus. Gibt den neuen Zustand zurück. iOS verlangt eine Erlaubnis. */
  async setTilt(on: boolean): Promise<boolean> {
    if (!on) { this.tiltOn = false; this.tilt = 0; window.removeEventListener('devicemotion', this.motion); return false; }
    const DM = (window as any).DeviceMotionEvent;
    if (!DM) return false;
    try {
      if (typeof DM.requestPermission === 'function' && (await DM.requestPermission()) !== 'granted') return false;
    } catch { return false; }
    window.addEventListener('devicemotion', this.motion);
    this.tiltOn = true;
    return true;
  }

  // Rollwinkel des Geräts in Bildschirmkoordinaten (Lenkrad-Drehung), aus der Schwerkraft.
  private motion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null) return;
    const ang = ((screen.orientation?.angle ?? (window as any).orientation ?? 0) + 360) % 360;
    let sx = a.x, sy = a.y;
    if (ang === 90) { sx = -a.y; sy = a.x; } else if (ang === 180) { sx = -a.x; sy = -a.y; } else if (ang === 270) { sx = a.y; sy = -a.x; }
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    if (ios) { sx = -sx; sy = -sy; }
    const roll = -Math.atan2(sx, sy) * 180 / Math.PI;   // + = im Uhrzeigersinn = rechts
    const dead = 3, full = 31;   // Grad: Totzone, Vollausschlag
    const m = Math.max(0, Math.abs(roll) - dead) / (full - dead);
    this.tilt = Math.sign(roll) * Math.min(1, m);
  };

  get tiltSteer(): number { return this.tilt; }

  /** Gas rampen: gedrückt steigt es linear, losgelassen fällt es; dt aus der Uhr, begrenzt */
  private stepGas(pressed: boolean): number {
    const now = this.clock();
    const dt = this.gasT === null ? 0 : Math.min(GAS_DT_MAX, Math.max(0, now - this.gasT));
    this.gasT = now;
    const rate = pressed ? 1 / GAS_UP_S : -1 / GAS_DOWN_S;
    this.gas = Math.min(1, Math.max(0, this.gas + rate * dt));
    return this.gas;
  }

  read(): Input {
    const k = this.keys, t = this.touch;
    const L = k.has('ArrowLeft') || k.has('KeyA') || t.left.size > 0;
    const R = k.has('ArrowRight') || k.has('KeyD') || t.right.size > 0;
    let steer = (R ? 1 : 0) - (L ? 1 : 0);
    if (this.tiltOn) steer = Math.max(-1, Math.min(1, steer + this.tilt));
    const gasKey = k.has('ArrowUp') || k.has('KeyW') || t.gas.size > 0;
    return {
      steer,
      throttle: this.stepGas(gasKey),
      brake: k.has('ArrowDown') || k.has('KeyS') || t.brake.size > 0 ? 1 : 0,
      handbrake: k.has('Space') || t.hand.size > 0,
    };
  }
}
