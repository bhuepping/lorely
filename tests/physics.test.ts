import { describe, it, expect } from 'vitest';
import { Vehicle, DT, type Input } from '../src/physics/vehicle';
import { HATCHBACK_80S, BUGGY, RALLY, CARS } from '../src/physics/params';
import { Props } from '../src/physics/props';
import { Obstacles } from '../src/physics/obstacles';
import { FlatTerrain, ASPHALT, GRAVEL, ICE, SNOW, WET_ASPHALT, type Surface } from '../src/physics/terrain';

const mk = (s: Surface) => new Vehicle(HATCHBACK_80S, new FlatTerrain(s));
const run = (c: Vehicle, secs: number, inp: Input | ((t: number) => Input), each?: (t: number) => void) => {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) { c.step(typeof inp === 'function' ? inp(i * DT) : inp, DT); each?.(i * DT); }
};

const I = (o: Partial<Input>): Input => ({ steer: 0, throttle: 0, brake: 0, handbrake: false, ...o });

describe('Fahrphysik', () => {
  it('kommt auf ebenem Boden ohne Zittern zur Ruhe (auch ohne Einschlafen)', () => {
    const c = mk(ASPHALT); c.allowSleep = false;
    run(c, 4, I({}));
    const y0 = c.pos[1], p0 = [...c.pos];
    let maxV = 0, minY = 9, maxY = -9;
    run(c, 2, I({}), () => { maxV = Math.max(maxV, c.speed, Math.hypot(...c.angVel)); minY = Math.min(minY, c.pos[1]); maxY = Math.max(maxY, c.pos[1]); });
    expect(maxV).toBeLessThan(0.01);
    expect(maxY - minY).toBeLessThan(0.0005);
    expect(Math.hypot(c.pos[0] - p0[0], c.pos[2] - p0[2])).toBeLessThan(0.01);
    expect(Math.abs(y0 - (HATCHBACK_80S.cgHeight))).toBeLessThan(0.1); // Ruhelage nahe Soll
  });

  it('beschleunigt mit Vollgas geradeaus', () => {
    const c = mk(ASPHALT);
    run(c, 6, I({ throttle: 1 }));
    expect(c.forwardSpeed).toBeGreaterThan(20);
    expect(c.pos[2]).toBeLessThan(-40);                 // vorwärts = -z
    expect(Math.abs(c.pos[0])).toBeLessThan(0.5);       // bleibt auf der Spur
    expect(c.gear).toBeGreaterThan(0);                  // Automatik hat geschaltet
  });

  it('Bremsen hält an, danach Rückwärtsgang', () => {
    const c = mk(ASPHALT); c.launch(20);
    run(c, 4, I({ brake: 1 }));
    expect(c.forwardSpeed).toBeLessThan(0.5);
    run(c, 3, I({ brake: 1 }));
    expect(c.forwardSpeed).toBeLessThan(-2);
  });
  for (const [name, P] of Object.entries(CARS)) it(`${name}: rückwärts antippen und loslassen -> rollt aus, Drehzahl steigt nicht`, () => {
    const c = new Vehicle(P, new FlatTerrain(ASPHALT)); c.allowSleep = false;
    run(c, 0.6, I({ brake: 1 }));
    const v0 = -c.forwardSpeed, r0 = c.rpm;
    run(c, 3, I({}));
    expect(v0, name).toBeGreaterThan(0.5);                    // fuhr wirklich rückwärts
    expect(-c.forwardSpeed, name).toBeLessThan(v0);           // rollt aus statt zu beschleunigen
    expect(c.rpm, name).toBeLessThanOrEqual(r0);
  });

  const lateral = (s: Surface) => {
    const c = mk(s); c.launch(15);
    let peak = 0;
    run(c, 3, I({ steer: 1, throttle: 0.25 }), (t) => { if (t > 1) peak = Math.max(peak, Math.abs(c.yawRate) * c.speed); });
    return peak;
  };
  it('auf Eis ist die Querbeschleunigung deutlich kleiner als auf Asphalt', () => {
    const a = lateral(ASPHALT), g = lateral(GRAVEL), e = lateral(ICE);
    console.log(`Querbeschl. m/s²: Asphalt ${a.toFixed(1)}, Schotter ${g.toFixed(1)}, Eis ${e.toFixed(1)}`);
    expect(a).toBeGreaterThan(7);
    expect(g).toBeLessThan(a * 0.8);
    expect(e).toBeLessThan(a * 0.25);
  });

  it('nasser Asphalt: spürbar weniger Querbeschleunigung als trocken, aber deutlich mehr als Schotter', () => {
    const a = lateral(ASPHALT), w = lateral(WET_ASPHALT), g = lateral(GRAVEL);
    console.log(`Querbeschl. m/s²: trocken ${a.toFixed(1)}, nass ${w.toFixed(1)}, Schotter ${g.toFixed(1)}`);
    expect(w).toBeLessThan(a * 0.9);
    expect(w).toBeGreaterThan(g * 1.3);
  });

  const maxSlip = (hb: boolean) => {
    const c = mk(GRAVEL); c.launch(20);
    let m = 0;
    run(c, 3, (t) => I({ steer: t < 0.6 ? 0.6 : 1, throttle: 0.2, handbrake: hb && t > 0.6 && t < 1.8 }),
      () => { m = Math.max(m, Math.abs(c.slipAngle)); });
    return m;
  };
  it('Handbremse in der Kurve erzeugt einen Driftwinkel', () => {
    const with_ = maxSlip(true), without = maxSlip(false);
    console.log(`max. Driftwinkel: mit Handbremse ${(with_ * 57.3).toFixed(0)}°, ohne ${(without * 57.3).toFixed(0)}°`);
    expect(with_).toBeGreaterThan(0.35);               // > 20°
    expect(with_).toBeGreaterThan(without * 1.6);
  });

  // Handbremsdrift lösen: Gierrate nach dem Loslassen darf nicht ins Gegenteil schnalzen
  const hbRelease = (sf: Surface, steerAfter: number) => {
    const c = mk(sf); c.launch(20);
    let rel = 0, w0 = 0, over = 0, peak = 0, started = false;
    const yaw = () => c.yawRate;
    run(c, 3.5, (t) => I({ steer: t < 0.6 ? 0.6 : t < 1.4 ? 1 : steerAfter, throttle: 0.2, handbrake: t > 0.6 && t < 1.4 }),
      (t) => {
        if (!started && t >= 1.4) { started = true; rel = t; w0 = yaw(); }
        if (started) { const s = Math.sign(w0) || 1; over = Math.max(over, -s * yaw()); peak = Math.max(peak, Math.abs(yaw())); }
      });
    return { w0, over, peak };
  };
  it('Handbremse lösen: kein übertriebenes Zurückschnalzen (Gierrate)', () => {
    for (const [n, sf] of [['Asphalt', ASPHALT], ['Schnee', SNOW]] as [string, Surface][]) {
      const r = hbRelease(sf, 1);
      console.log(`Handbremse lösen ${n}: Gierrate beim Lösen ${r.w0.toFixed(2)} rad/s, Gegen-Überschwinger ${r.over.toFixed(2)}, Spitze danach ${r.peak.toFixed(2)}`);
      expect(r.over).toBeLessThan(n === 'Asphalt' ? 2.0 : 1.3);
    }
  });

  it('schlägt auf Kuppen nicht durch / bleibt endlich (Sprung)', () => {
    const c = new Vehicle(HATCHBACK_80S, new FlatTerrain(ASPHALT, 0)); c.pos[1] = 2; // Fall aus 1,5 m
    let maxV = 0;
    run(c, 4, I({}), () => { maxV = Math.max(maxV, c.speed); });
    expect(Number.isFinite(c.pos[1])).toBe(true);
    expect(c.pos[1]).toBeGreaterThan(0.3);
    expect(c.pos[1]).toBeLessThan(1);
  });
});

describe('Fahrgefühl: kräftig, griffig, stabil – alle Autos', () => {
  const cases: [string, typeof HATCHBACK_80S, number, number, number][] = [['Kompakter', HATCHBACK_80S, 2.6, 8.8, 13.5], ['Buggy', BUGGY, 2.2, 8.8, 13], ['Rallye', RALLY, 2.0, 8.5, 13.5]];
  for (const [name, P, t50max, brakeMax, latMin] of cases) {
    it(`${name}: Gas/Bremse direkt, viel Grip, dreht sich bei Volllenkung nicht weg`, () => {
      const mkc = () => new Vehicle(P, new FlatTerrain(ASPHALT));
      let c = mkc(), t50 = 99;
      for (let i = 0; i < 10 / DT; i++) { c.step(I({ throttle: 1 }), DT); if (c.forwardSpeed > 50 / 3.6) { t50 = i * DT; break; } }
      c = mkc(); c.launch(50 / 3.6); let d = 0;
      for (let i = 0; i < 6 / DT && c.forwardSpeed > 0.3; i++) { c.step(I({ brake: 1 }), DT); d -= c.vel[2] * DT; }
      c = mkc(); c.launch(15); let lat = 0;
      for (let i = 0; i < 3 / DT; i++) { c.step(I({ steer: 1, throttle: 0.25 }), DT); if (i * DT > 1) lat = Math.max(lat, Math.abs(c.yawRate) * c.speed); }
      c = mkc(); c.launch(25); let yr = 0;
      for (let i = 0; i < 3 / DT; i++) { c.step(I({ steer: 1, throttle: 0.3 }), DT); yr = Math.max(yr, Math.abs(c.yawRate)); }
      console.log(`${name}: 0-50 ${t50.toFixed(2)} s, Bremsweg ${d.toFixed(1)} m, Querbeschl. ${lat.toFixed(1)} m/s², Gierrate ${yr.toFixed(2)}`);
      expect(t50).toBeLessThan(t50max); expect(d).toBeLessThan(brakeMax); expect(lat).toBeGreaterThan(latMin);
      expect(yr).toBeLessThan(0.8); expect(c.axes().u[1]).toBeGreaterThan(0.95);
    });
  }
  it('Slalom bei 22 m/s auf Schotter: Heck bricht nicht weg (Buggy ≤ 30°, andere ≤ 15°), kein Umkippen', () => {
    for (const [P, lim] of [[HATCHBACK_80S, 15], [BUGGY, 30], [RALLY, 15]] as const) {
      const c = new Vehicle(P, new FlatTerrain(GRAVEL)); c.launch(22); let m = 0, up = 1;
      for (let i = 0; i < 5 / DT; i++) { const t = i * DT; c.step(I({ steer: Math.floor(t / 0.45) % 2 ? -1 : 1, throttle: 0.5 }), DT); m = Math.max(m, Math.abs(c.slipAngle)); up = Math.min(up, c.axes().u[1]); }
      expect(m * 57.3).toBeLessThan(lim); expect(up).toBeGreaterThan(0.9);
    }
  });
});

describe('Lichter-Zustand (H7)', () => {
  it('Bremslicht beim Bremsen, Rückfahrlicht beim Rückwärtsfahren, sonst aus', () => {
    const c = mk(ASPHALT); c.launch(15);
    run(c, 0.3, I({ throttle: 1 })); expect(c.brakeOn).toBe(false); expect(c.reverseOn).toBe(false);
    run(c, 0.3, I({ brake: 1 })); expect(c.brakeOn).toBe(true); expect(c.reverseOn).toBe(false);
    run(c, 6, I({ brake: 1 })); expect(c.forwardSpeed).toBeLessThan(-1); expect(c.reverseOn).toBe(true);
    run(c, 0.3, I({})); expect(c.brakeOn).toBe(false);
  });
});

describe('Wasser (H8)', () => {
  const go = (water: number) => { const c = mk(ASPHALT); c.water = water; c.launch(20); run(c, 2, I({ throttle: 1 })); return c; };
  it('tiefer = zäher; ab 75 % Karosserie unter Wasser abgesoffen: steht, Eingabe wirkungslos, bis reset', () => {
    const dry = go(-1e9), low = go(0.12), mid = go(0.45), deep = go(1.3);
    console.log(`Wasser: 20 m/s -> trocken ${dry.speed.toFixed(1)}, 10 % ${low.speed.toFixed(1)}, 35 % ${mid.speed.toFixed(1)}, 100 % ${deep.speed.toFixed(1)}`);
    expect(low.speed).toBeLessThan(dry.speed - 2); expect(mid.speed).toBeLessThan(low.speed - 2);
    expect(low.drowned).toBe(false); expect(mid.drowned).toBe(false);
    expect(deep.drowned).toBe(true); expect(deep.speed).toBeLessThan(0.5);
    run(deep, 2, I({ throttle: 1, steer: 1 })); expect(deep.speed).toBeLessThan(0.5);
    deep.water = -1e9; run(deep, 1, I({ throttle: 1 })); expect(deep.speed).toBeLessThan(0.5);   // auch ohne Wasser: bleibt liegen
    deep.reset(0, 0, 0); run(deep, 2, I({ throttle: 1 })); expect(deep.speed).toBeGreaterThan(3);
  });
});

describe('Pylonen', () => {
  const setup = (x: number) => {
    const t = new FlatTerrain(ASPHALT), c = new Vehicle(HATCHBACK_80S, t);
    c.launch(15);
    return { c, props: new Props(t, [[x, -22], [30, -22]]) };
  };
  let snap = 0;
  const drive = (c: Vehicle, props: Props, secs: number) => {
    let hits = 0; props.onImpact = () => hits++; snap = 0;
    for (let i = 0; i < secs / DT; i++) { c.step(i * DT < 1.6 ? I({ throttle: 0.4 }) : I({ brake: 1 }), DT); props.step(c, DT); if (i === Math.round(1.7 / DT)) snap = c.forwardSpeed; }
    return hits;
  };
  it('angefahrener Pfosten fliegt weg und fällt um, das Auto wird etwas langsamer', () => {
    const { c, props } = setup(0);
    const v0 = c.forwardSpeed, p0 = [props.pos[0], props.pos[1], props.pos[2]];
    // Referenz ohne Pfosten
    const { c: c2, props: far } = setup(50); drive(c2, far, 12); const ref = snap;
    const hits = drive(c, props, 12);
    expect(hits).toBeGreaterThan(0);
    expect(Math.hypot(props.pos[0] - p0[0], props.pos[2] - p0[2])).toBeGreaterThan(3);   // weggeschleudert
    const upDot = 1 - 2 * (props.q[0] ** 2 + props.q[2] ** 2);
    expect(upDot).toBeLessThan(0.5);                                                      // gekippt (> 60 Grad)
    expect(props.pos[1]).toBeLessThan(0.6);                                               // liegt am Boden
    expect(snap).toBeLessThan(ref - 0.1);                                           // spürbar gebremst
    expect(snap).toBeGreaterThan(v0 * 0.7);                                          // aber nur wenig
    expect(props.pos[0 + 3]).toBe(30);                                                    // der andere Pfosten steht noch
  });
  it('liegt am Ende still (schläft) und steht nach reset wieder', () => {
    const { c, props } = setup(0);
    drive(c, props, 2); for (let i = 0; i < 10 / DT; i++) props.step(c, DT);
    expect(props.asleep[0]).toBe(1);
    props.reset();
    expect(props.pos[0]).toBe(0); expect(props.pos[1]).toBeCloseTo(0.75, 2); expect(props.q[3]).toBe(1);
  });
});

describe('Buggy', () => {
  const mkB = (s: Surface) => new Vehicle(BUGGY, new FlatTerrain(s));
  it('steht ruhig, beschleunigt, kippt in der Kurve nicht um', () => {
    const c = mkB(GRAVEL); c.allowSleep = false;
    run(c, 3, I({}));
    expect(c.speed).toBeLessThan(0.05);
    run(c, 6, I({ throttle: 1 }));
    expect(c.forwardSpeed).toBeGreaterThan(15);
    run(c, 3, I({ throttle: 1, steer: 1 }));
    expect(c.axes().u[1]).toBeGreaterThan(0.6);
  });
});

describe('Rallye 4x4', () => {
  const mkR = (s: Surface, P = RALLY) => new Vehicle(P, new FlatTerrain(s));
  it('Allradler im Menü-Katalog: steht ruhig, fährt, alle vier Räder treiben an, bleibt in der Spur', () => {
    expect(CARS.rally).toBe(RALLY); expect(RALLY.drive).toBe('AWD');
    const c = mkR(ASPHALT); c.allowSleep = false;
    run(c, 3, I({})); expect(c.speed).toBeLessThan(0.05);
    let slip = [0, 0, 0, 0];
    run(c, 1.5, I({ throttle: 1 }), () => { for (let i = 0; i < 4; i++) slip[i] = Math.max(slip[i], c.omega[i] * RALLY.wheelRadius - c.forwardSpeed); });
    expect(slip.every((v) => v > 0.05)).toBe(true);
    run(c, 6, I({ throttle: 1 }));
    expect(c.forwardSpeed).toBeGreaterThan(30);
    expect(Math.abs(c.pos[0])).toBeLessThan(1);
  });
  it('beschleunigt deutlich schneller als der Kompakte (Asphalt und Schotter)', () => {
    for (const s of [ASPHALT, GRAVEL]) {
      const a = mkR(s), b = mkR(s, HATCHBACK_80S);
      run(a, 5, I({ throttle: 1 })); run(b, 5, I({ throttle: 1 }));
      console.log(`${s.name}: Rallye ${a.forwardSpeed.toFixed(1)} m/s, Kompakter ${b.forwardSpeed.toFixed(1)} m/s nach 5 s`);
      expect(a.forwardSpeed).toBeGreaterThan(b.forwardSpeed * 1.15);
    }
  });
  it('Turbo-Charakter: unter 3000 U/min deutlich weniger Moment als ab 4500', () => {
    const at = (r: number) => { let t = 0; for (let i = 1; i < RALLY.torqueCurve.length; i++) if (r <= RALLY.torqueCurve[i][0]) { const [r0, t0] = RALLY.torqueCurve[i - 1], [r1, t1] = RALLY.torqueCurve[i]; t = t0 + (t1 - t0) * (r - r0) / (r1 - r0); break; } return t; };
    expect(at(2000)).toBeLessThan(at(5000) * 0.5);
    expect(Math.max(...RALLY.torqueCurve.map((p) => p[1]))).toBeGreaterThanOrEqual(270);
  });
});

describe('Motorklang', () => {
  it('jedes Auto hat einen eigenen Klang (Zünd-/Lope-/Pfeif-Parameter verschieden)', () => {
    const sig = Object.values(CARS).map((p) => JSON.stringify(p.sound));
    expect(sig.every((x) => x !== undefined)).toBe(true);
    expect(new Set(sig).size).toBe(sig.length);
  });
});

describe('Feste Hindernisse', () => {
  const run = (ob: Obstacles, v: number, yaw: number, secs: number, throttle = 1) => {
    const t = new FlatTerrain(ASPHALT), c = new Vehicle(HATCHBACK_80S, t);
    c.reset(0, 0, yaw); c.launch(v);
    let minZ = 0, hits = 0, peak = 0; ob.onImpact = (s) => { hits++; peak = Math.max(peak, s); };
    const pts: number[][] = [];
    for (let i = 0; i < secs / DT; i++) {
      c.step(I({ throttle }), DT); ob.step(c); ob.decay(DT);
      minZ = Math.min(minZ, c.pos[2] - 2.1 * Math.abs(c.forwardAxis()[2]));   // vordere Kante grob
      if (i % 40 === 0) pts.push([c.pos[0], c.pos[2]]);
    }
    return { c, minZ, hits, peak, pts };
  };
  it('Wand hält das Auto bei 25 m/s und Vollgas komplett auf, es dringt nie durch', () => {
    const wall = new Obstacles([], [{ x: 0, z: -40, hx: 30, hz: 2, yaw: 0 }]);
    const { c, hits } = run(wall, 25, 0, 6);
    expect(hits).toBeGreaterThan(0);
    expect(c.pos[2]).toBeGreaterThan(-38 + HATCHBACK_80S.size.l / 2 - 0.1);   // vordere Kante nicht hinter der Wandfläche (z=-38)
    expect(Math.abs(c.forwardSpeed)).toBeLessThan(1);              // steht
  });
  it('Schräger Wandkontakt bei Tempo 50 m/s: nie durch die Wand, wird abgelenkt', () => {
    const wall = new Obstacles([], [{ x: 0, z: -60, hx: 60, hz: 2, yaw: 0 }]);
    const t = new FlatTerrain(ASPHALT), c = new Vehicle(HATCHBACK_80S, t);
    c.reset(0, 0, 0.5); c.launch(50);
    let deepest = 0;
    for (let i = 0; i < 5 / DT; i++) { c.step(I({ throttle: 1 }), DT); wall.step(c); deepest = Math.min(deepest, c.pos[2]); }
    expect(deepest).toBeGreaterThan(-58);
    expect(c.speed).toBeLessThan(35);                              // Wand hat stark gebremst
  });
  it('Baum prallt das Auto ab (Tempo wird abgebaut, Auto läuft nicht durch), der Baum wackelt und bleibt stehen', () => {
    const tree = new Obstacles([{ x: 0, z: -30, r: 0.7, wobble: true }]);
    const { c, hits, peak } = run(tree, 20, 0, 3, 0);
    expect(hits).toBeGreaterThan(0); expect(peak).toBeGreaterThan(10);
    expect(c.pos[2]).toBeGreaterThan(-30 + 0.7);                   // Mittelpunkt nie hinter der Baumvorderseite
    expect(c.forwardSpeed).toBeLessThan(5);                        // Schwung weg (zurückgeprallt oder gebremst)
    expect(tree.circles[0].x).toBe(0); expect(tree.circles[0].z).toBe(-30);   // Baum steht
    const t2 = new Obstacles([{ x: 0, z: -30, r: 0.7, wobble: true }]);
    const c2 = new Vehicle(HATCHBACK_80S, new FlatTerrain(ASPHALT)); c2.reset(0, 0, 0); c2.launch(20);
    for (let i = 0; i < 2 / DT; i++) { c2.step(I({}), DT); t2.step(c2); }
    expect(t2.wob[0]).toBeGreaterThan(0.3);                               // wackelt nach dem Treffer
    for (let i = 0; i < 2 / DT; i++) tree.decay(DT);
    expect(tree.wob[0]).toBe(0);                                   // Wackeln klingt ab
  });
  it('Frontal gegen Wand/Baum: ≈ Stillstand, kaum Rückprall', () => {
    for (const ob of [new Obstacles([], [{ x: 0, z: -40, hx: 30, hz: 2, yaw: 0 }]), new Obstacles([{ x: 0, z: -40, r: 0.7, wobble: true }])]) {
      const t = new FlatTerrain(ASPHALT), c = new Vehicle(HATCHBACK_80S, t); c.reset(0, 0, 0); c.launch(25);
      let back = 0;
      for (let i = 0; i < 3 / DT; i++) { c.step(I({}), DT); ob.step(c); if (c.pos[2] < -20) back = Math.min(back, c.forwardSpeed); }
      expect(back).toBeGreaterThan(-3);
      expect(Math.abs(c.forwardSpeed)).toBeLessThan(2);
    }
  });
  it('Kein Pinball: hohes Tempo gegen Haus/Baum (mittig und am Rand, alle Autos, mit/ohne Gas) -> steht, kein Rückwärts-Wegfahren', () => {
    for (const P of [HATCHBACK_80S, BUGGY, RALLY]) for (const kind of ['wall', 'tree', 'treeEdge', 'wallAngle']) for (const thr of [0, 1]) {
      const ob = kind.startsWith('wall') ? new Obstacles([], [{ x: 0, z: -40, hx: 30, hz: 2, yaw: 0 }]) : new Obstacles([{ x: kind === 'treeEdge' ? 0.8 : 0, z: -40, r: 0.7, wobble: true }]);
      const c = new Vehicle(P, new FlatTerrain(ASPHALT)); c.reset(0, 0, kind === 'wallAngle' ? 0.4 : 0); c.launch(45);
      let back = 0, spin = 0;
      for (let i = 0; i < 4 / DT; i++) { c.step(I({ throttle: thr }), DT); ob.step(c); if (c.pos[2] < -20) { back = Math.max(back, c.vel[2]); spin = Math.max(spin, Math.abs(c.angVel[1])); } }
      expect(back, `${P.name} ${kind} ${thr}`).toBeLessThan(kind === 'wallAngle' ? 5 : 1);   // schräg: darf abdrehen, nicht abprallen
      expect(spin, `${P.name} ${kind} ${thr}`).toBeLessThan(6);
      if (kind === 'wall') expect(c.speed).toBeLessThan(1);
    }
  });
  it('Entlangschrammen an der Wand kostet viel Tempo (30 m/s -> unter 15 m/s binnen 1,2 s), auch bei Vollgas', () => {
    for (const P of [HATCHBACK_80S, BUGGY, RALLY]) {
      const wall = new Obstacles([], [{ x: 3, z: -300, hx: 2, hz: 300, yaw: 0 }]);
      const c = new Vehicle(P, new FlatTerrain(ASPHALT)); c.reset(0, 0, -0.05); c.launch(30);
      let hit = -1, tt = 0, v1 = 99; wall.onImpact = () => { if (hit < 0) hit = tt; };
      for (let i = 0; i < 6 / DT; i++) { tt = i * DT; c.step(I({ throttle: 1 }), DT); wall.step(c); if (hit >= 0) { if (tt > hit + 1.2) break; v1 = Math.min(v1, c.speed); } }
      expect(hit).toBeGreaterThan(0); expect(v1).toBeLessThan(15);
    }
  });
  it('Fahren ohne Hindernis in der Nähe bleibt unverändert', () => {
    const ob = new Obstacles([{ x: 200, z: 200, r: 1 }], [{ x: -300, z: 0, hx: 10, hz: 10, yaw: 0.3 }]);
    const { c, hits } = run(ob, 10, 0, 2);
    expect(hits).toBe(0); expect(c.speed).toBeGreaterThan(10);
  });
});

// Traktionskontrolle: Vollgas-Anfahren – Schlupf der angetriebenen Räder bleibt nahe dem Ziel, Beschleunigung leidet nicht
describe('Traktionskontrolle', () => {
  const launch = (car: typeof BUGGY, sf: Surface) => {
    const c = new Vehicle(car, new FlatTerrain(sf));
    const dr = car.drive === 'FWD' ? [0, 1] : car.drive === 'RWD' ? [2, 3] : [0, 1, 2, 3];
    let sum = 0, n = 0, mx = 0;
    run(c, 4, I({ throttle: 1 }), (t) => {
      if (t < 0.5) return;
      const f = Math.max(0, c.forwardSpeed);
      const k = Math.max(...dr.map((i) => (c.omega[i] * car.wheelRadius - f) / Math.max(f, 2.5)));
      sum += k; n++; mx = Math.max(mx, k);
    });
    return { v: c.forwardSpeed, s: -c.pos[2], mean: sum / n, mx };
  };
  // Strecke nach 4 s ohne Traktionskontrolle (Referenzwerte): [Schnee, Eis, Asphalt]
  const BEFORE: Record<string, number[]> = { hatch: [23.7, 5.1, 51.5], buggy: [21.5, 4.4, 55.5], rally: [41.8, 9.5, 65.5], jeep: [48, 8, 60] };
  // Die TC ist schwach (nimmt höchstens die Hälfte des Moments weg): Räder drehen auf losem Grund sichtbar durch, die Beschleunigung ist trotzdem nicht schlechter als ohne TC.
  it('Vollgas-Anfahren: TC schwach, Räder drehen durch, Beschleunigung höchstens 10 % unter "ohne TC"', () => {
    for (const [id, car] of Object.entries(CARS)) [SNOW, ICE, ASPHALT].forEach((sf, k) => {
      const r = launch(car as typeof BUGGY, sf);
      console.log(`TC ${car.name} ${sf.name}: Strecke 4 s ${r.s.toFixed(1)} m (ohne TC ${BEFORE[id][k]}), Schlupf mittel ${r.mean.toFixed(2)}, max ${r.mx.toFixed(2)}`);
      expect(r.s, `${car.name} ${sf.name}`).toBeGreaterThan(BEFORE[id][k] * 0.9);   // schwache TC: etwas Verlust gegen "ohne TC" ist natürlich (Durchdrehen kostet Vortrieb)
      expect(Number.isFinite(r.mx) && r.mx < 12, `${car.name} ${sf.name} max ${r.mx}`).toBe(true);
    });
  });
});
