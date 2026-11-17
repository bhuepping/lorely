// Ton: alles per WebAudio synthetisiert (keine Samples). Ein fester Graph, nur Parameter werden gesetzt.
// Motor: 2 Oszillatoren -> Tiefpass; Reifen: ein geteiltes Rauschen -> Bandpass (Asphalt-Quietschen) / Tiefpass (Schotter).
import type { Vehicle } from './physics/vehicle';

const KEY = 'rs-sound';
const store = {
  get(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v: string) { try { localStorage.setItem(KEY, v); } catch { /* egal */ } },
};

/** Reifenquietschen: nur auf hartem Grund; Lautstärke steigt mit dem Schlupf (0…1), unter ~0,2 still. Reine Funktion (Test). */
const HARD: Record<string, { g: number; f: number }> = { 'Asphalt': { g: 1, f: 1 }, 'Nasser Asphalt': { g: 0.8, f: 0.93 }, 'Kopfstein': { g: 0.7, f: 0.85 }, 'Holz': { g: 0.6, f: 0.8 } };
export function squeal(surface: string, slip: number, speed: number): { gain: number; freq: number } {
  const h = HARD[surface]; if (!h) return { gain: 0, freq: 1800 };
  const u = Math.min(1, Math.max(0, (slip - 0.2) / 0.7));
  return { gain: u * u * (3 - 2 * u) * 0.12 * h.g, freq: (1500 + 520 * slip + 3 * Math.min(speed, 40)) * h.f };   // Reifenpfeifen ~1,5–2,5 kHz
}

/** Quietsch-Klang: ausschließlich gefiltertes Rauschen, kein Oszillator-Ton (der klang wie Pfeifen). Zwei breite Bandpässe (Körper unter, Kreischen über der Mitte),
 *  Haft-Gleit-Zittern = Amplitude + Filter von zwei unregelmäßigen LFOs (31/47 Hz), dazu etwas Reibrauschen oben; Hochpass nimmt die Stimmlage weg. `set` steuert Mitte + Gain. */
export function makeSqueal(ctx: BaseAudioContext, noise: AudioNode, dest: AudioNode): { set(freq: number, gain: number, t: number): void; start(): void } {
  const mix = ctx.createGain(), am = ctx.createGain(), hp = ctx.createBiquadFilter(), g = ctx.createGain(), lfos: OscillatorNode[] = [];
  const band = (k: number, q: number, v: number) => { const f = ctx.createBiquadFilter(), o = ctx.createGain(); f.type = 'bandpass'; f.Q.value = q; f.frequency.value = 1800 * k; o.gain.value = v; noise.connect(f); f.connect(o); o.connect(mix); return f; };
  const body = band(0.62, 3.2, 2.3), shriek = band(1.1, 5, 2.9);
  const grit = ctx.createBiquadFilter(), gg = ctx.createGain(); grit.type = 'highpass'; grit.frequency.value = 2600; gg.gain.value = 0.3; noise.connect(grit); grit.connect(gg); gg.connect(mix);
  hp.type = 'highpass'; hp.frequency.value = 450; hp.Q.value = 0.5; g.gain.value = 0; am.gain.value = 0.72;
  const lfo = (hz: number, to: AudioParam, depth: number) => { const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = hz; d.gain.value = depth; l.connect(d); d.connect(to); lfos.push(l); };
  lfo(31, am.gain, 0.22); lfo(47, am.gain, 0.16); lfo(6.5, shriek.detune, 70); lfo(11, body.detune, 55);
  mix.connect(am); am.connect(hp); hp.connect(g); g.connect(dest);
  return {
    set(freq, gain, t) { body.frequency.setTargetAtTime(freq * 0.62, t, 0.08); shriek.frequency.setTargetAtTime(freq * 1.1, t, 0.08); g.gain.setTargetAtTime(gain, t, 0.05); },
    start() { lfos.forEach((l) => l.start()); },
  };
}

export class GameAudio {
  enabled = store.get() !== '0';
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private o1!: OscillatorNode; private o2!: OscillatorNode; private o3!: OscillatorNode; private lfo!: OscillatorNode; private lfoG!: GainNode; private pg!: GainNode;
  private whistle!: OscillatorNode; private whG!: GainNode;
  private lp!: BiquadFilterNode; private eg!: GainNode;
  private sq!: ReturnType<typeof makeSqueal>; private rumbleF!: BiquadFilterNode; private rumbleG!: GainNode;
  private noise!: AudioBuffer;
  private lastThud = 0; private lastUpd = 0;
  /** Fahrgeräusche an (nur während einer laufenden Fahrt) */
  live = false;
  /** zuletzt gesetzte Summe der Fahr-Gains (Test: nach Rennende/im Menü 0) */
  level = 0;
  /** zuletzt gesetzter Quietsch-Gain (Test) */
  sqGain = 0;
  onChange: () => void = () => {};

  constructor() {
    const go = () => { this.unlock(); };
    for (const ev of ['keydown', 'pointerdown', 'touchend']) window.addEventListener(ev, go, { once: false, passive: true });
    document.addEventListener('visibilitychange', () => this.sync());
  }

  /** Nach der ersten Nutzergeste: Kontext anlegen (einmal) und starten, falls an. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      try { this.build(new AC()); } catch { return; }
    }
    this.sync();
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);
    // Motor: Sägezahn (Zündton) + Quadrat eine Oktave tiefer (Wumms) + Quadrat darüber (Knurren) -> Pulsgain (Zündtakt-Lope) -> Tiefpass.
    // Der Pulsgain wird von einem Dreieck-LFO nahe der halben Zündfrequenz moduliert, dazu zufälliges Verstimmen = unrunder Lauf (blubbert vor allem im Leerlauf).
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.5; const g3 = ctx.createGain(); g3.gain.value = 0.18;
    this.pg = ctx.createGain(); this.pg.gain.value = 0.7;
    this.lfo = ctx.createOscillator(); this.lfo.type = 'triangle'; this.lfoG = ctx.createGain(); this.lfoG.gain.value = 0.2;
    this.lfo.connect(this.lfoG); this.lfoG.connect(this.pg.gain);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2.2; this.lp.frequency.value = 400;
    this.eg = ctx.createGain(); this.eg.gain.value = 0;
    this.o1.connect(this.pg); this.o2.connect(g2); g2.connect(this.pg); this.o3.connect(g3); g3.connect(this.pg);
    this.pg.connect(this.lp); this.lp.connect(this.eg); this.eg.connect(this.master);
    this.whistle = ctx.createOscillator(); this.whistle.type = 'sine'; this.whG = ctx.createGain(); this.whG.gain.value = 0;
    this.whistle.connect(this.whG); this.whG.connect(this.master);
    this.o1.start(); this.o2.start(); this.o3.start(); this.lfo.start(); this.whistle.start();
    // Rauschen (1 s, geteilt)
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.sq = makeSqueal(ctx, src, this.master); this.sq.start();
    this.rumbleF = ctx.createBiquadFilter(); this.rumbleF.type = 'lowpass'; this.rumbleF.frequency.value = 900;
    this.rumbleG = ctx.createGain(); this.rumbleG.gain.value = 0;
    src.connect(this.rumbleF); this.rumbleF.connect(this.rumbleG); this.rumbleG.connect(this.master);
    src.start();
  }

  /** Läuft nur, wenn an UND Tab sichtbar; sonst angehalten (kostet nichts). */
  private sync(): void {
    const c = this.ctx; if (!c) return;
    if (this.enabled && !document.hidden) void c.resume().catch(() => {}); else void c.suspend().catch(() => {});
  }

  setEnabled(on: boolean): void {
    this.enabled = on; store.set(on ? '1' : '0');
    this.unlock(); this.sync(); this.onChange();
  }

  /** Fahrgeräusche ein/aus (Rennende, Menü: aus -> alles sanft auf 0). */
  setLive(on: boolean): void {
    this.live = on;
    if (on) return;
    this.level = 0;
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    for (const g of [this.eg, this.rumbleG, this.whG]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.08); }
    this.sq.set(1800, 0, t);
  }

  /** Pro Frame aufrufen (drosselt sich selbst auf ~30 Hz). */
  update(car: Vehicle, throttle: number, now: number): void {
    const c = this.ctx;
    if (!c || !this.live || c.state !== 'running' || now - this.lastUpd < 33) return;
    this.lastUpd = now;
    const t = c.currentTime, P = car.p, k = 0.05;
    const S = P.sound ?? { fire: 2, sub: 0.5, lope: 0.2, bright: 1, whistle: 0 };
    const f = car.rpm / 60 * S.fire;                               // Zündfrequenz
    const load = Math.min(1, throttle), rn = Math.min(1, car.rpm / P.redlineRpm);
    const idle = Math.max(0, 1 - (car.rpm - P.idleRpm) / 1800);    // 1 im Leerlauf -> 0 bei Drehzahl
    // Grundton tief (f * sub), Verstimmung schwankt zufällig -> Blubbern; im Leerlauf/Schub am stärksten
    const wob = (Math.random() - 0.5) * S.lope * (0.5 + idle) * 90;  // Cent
    this.o1.frequency.setTargetAtTime(f * S.sub * 2, t, k); this.o1.detune.setTargetAtTime(wob, t, 0.02);
    this.o2.frequency.setTargetAtTime(f * S.sub, t, k); this.o2.detune.setTargetAtTime(-wob * 0.6, t, 0.02);
    this.o3.frequency.setTargetAtTime(f * 1.5 * (1 + (Math.random() - 0.5) * 0.01), t, k);
    this.lfo.frequency.setTargetAtTime(f / 2 * (1 + (Math.random() - 0.5) * S.lope), t, 0.03);
    this.lfoG.gain.setTargetAtTime(S.lope * (0.35 + 0.65 * idle) * (1 - 0.5 * load), t, 0.05);
    this.lp.frequency.setTargetAtTime((160 + f * 3.2 + load * 600) * S.bright, t, k);
    const cut = car.shiftTimer > 0 ? 0.35 : 1;                     // Gangwechsel: Motor „fällt kurz weg“
    this.level = 0.06 + load;
    this.eg.gain.setTargetAtTime((0.06 + 0.07 * load + 0.03 * rn) * cut, t, 0.04);
    // Turbo: Pfeifen steigt mit Drehzahl, nur unter Last, kurzes Abblasen beim Gaswegnehmen bleibt aus (billig)
    this.whistle.frequency.setTargetAtTime(1500 + car.rpm * 0.55, t, 0.08);
    this.whG.gain.setTargetAtTime(S.whistle ? 0.012 * load * Math.max(0, (car.rpm - 2500) / 3500) * cut : 0, t, 0.1);
    // Reifen
    const fwd = Math.abs(car.forwardSpeed), sp = car.speed;
    const grounded = car.contact.some(Boolean);
    const lat = Math.max(0, (Math.abs(car.slipAngle) - 0.1) * 3) * Math.min(1, sp / 6);
    let wm = 0; for (let i = 0; i < 4; i++) wm += Math.abs(car.omega[i]) * P.wheelRadius; wm /= 4;
    const lon = Math.max(0, Math.abs(wm - fwd) / Math.max(fwd, 3) - 0.15) * 3 * Math.min(1, (sp + (throttle > 0.5 ? 3 : 0)) / 6);
    const slip = grounded ? Math.min(1, Math.max(lat, lon)) : 0;
    const sn = car.surfaceName;
    const gravel = sn === 'Schotter', sq = squeal(sn, slip, sp);
    this.sq.set(sq.freq, sq.gain, t);
    this.sqGain = sq.gain;
    const roll = grounded ? Math.min(1, sp / 25) : 0;
    this.rumbleG.gain.setTargetAtTime(gravel ? 0.03 * roll + 0.11 * slip : sn === 'Eis' ? 0.015 * roll + 0.03 * slip : 0.008 * roll, t, 0.06);
    this.rumbleF.frequency.setTargetAtTime(gravel ? 500 + 700 * slip : 1500, t, 0.1);
  }

  /** Aufprall-Plopp (Pfosten); selten genug, dass hier Knoten entstehen dürfen. */
  thud(strength: number, now: number): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || now - this.lastThud < 70) return;
    this.lastThud = now;
    const t = c.currentTime, v = Math.min(1, 0.25 + strength / 20);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    g.gain.setValueAtTime(0.28 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  /** Harte Landung nach einem Sprung: dumpfer Schlag + scheppernde Rauschsalve; strength = senkrechte Aufprallgeschwindigkeit (m/s) */
  land(strength: number, now: number): void {
    const c = this.ctx;
    if (!c || c.state !== 'running' || now - this.lastThud < 150) return;
    this.lastThud = now;
    const t = c.currentTime, v = Math.min(1, strength / 8);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    g.gain.setValueAtTime(0.4 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    if (strength > 3.5) {   // scheppert: Rauschen durch Bandpass + zwei verstimmte Blech-Töne
      const src = c.createBufferSource(), f = c.createBiquadFilter(), ng = c.createGain();
      src.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
      ng.gain.setValueAtTime(0.35 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      src.connect(f); f.connect(ng); ng.connect(this.master); src.start(t, Math.random() * 0.5); src.stop(t + 0.4);
      src.onended = () => { src.disconnect(); f.disconnect(); ng.disconnect(); };
      for (const fr of [310, 467]) {
        const q = c.createOscillator(), qg = c.createGain(); q.type = 'square'; q.frequency.setValueAtTime(fr, t); q.frequency.exponentialRampToValueAtTime(fr * 0.6, t + 0.12);
        qg.gain.setValueAtTime(0.06 * v, t); qg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        q.connect(qg); qg.connect(this.master); q.start(t); q.stop(t + 0.16); q.onended = () => { q.disconnect(); qg.disconnect(); };
      }
    }
  }

  /** Startampel: „tut“ (rot, tief, kurz) bzw. „piep“ (grün, höher, länger) */
  light(go: boolean): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime, f = go ? 880 : 440, len = go ? 0.6 : 0.22;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.01); g.gain.setValueAtTime(0.09, t + len - 0.05); g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + len + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  /** Checkpoint durchfahren: leises kurzes Tick. */
  cp(): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(990, t + 0.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  /** Stern eingesammelt: kurzes helles Ping, steigt mit der Sternzahl. */
  ping(n: number): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime, f = 880 * Math.pow(1.0595, Math.min(n, 12));
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.setValueAtTime(f * 1.5, t + 0.07);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  /** Ende der Fahrt: kurzer aufsteigender (Ziel) oder absteigender Zweiklang (Zeit um). */
  end(win: boolean): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime, fs = win ? [523, 784] : [392, 262];
    fs.forEach((f, k) => {
      const o = c.createOscillator(), g = c.createGain(), t0 = t + k * 0.16;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.14, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.45);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    });
  }
}
