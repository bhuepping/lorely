import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { Tracker, saveKeyOf } from '../src/level';
import { Vehicle, DT, type Input } from '../src/physics/vehicle';
import { HATCHBACK_80S } from '../src/physics/params';
import { Obstacles } from '../src/physics/obstacles';
import { SNOW, DEEP_SNOW, GRAVEL, ICE, WET_SAND, SOFT_SAND, WOOD, ASPHALT, WET_ASPHALT, SURFACES } from '../src/physics/terrain';
import { pick } from './slow';

const waldweg = WORLDS[0].levels[0].make();
const I = (o: Partial<Input>): Input => ({ steer: 0, throttle: 0, brake: 0, handbrake: false, ...o });

describe('Level Waldweg', () => {
  it('lädt: Strecke, Start, Ziel, Objekte', () => {
    expect(waldweg.length).toBeGreaterThan(500);
    expect(waldweg.stars.length).toBeGreaterThanOrEqual(10);
    expect(waldweg.posts.length).toBeGreaterThan(40);
    expect(waldweg.trees.length).toBe(520);
    expect(waldweg.goal!.s).toBeGreaterThan(waldweg.length - 20);
  });
  it('Straße ist glatt (Steigung unter 12 %, Querneigung null), daneben anderer Untergrund', () => {
    const r = waldweg.route, t = waldweg.terrain;
    let prev = t.height(r.at(0).x, r.at(0).z), maxSlope = 0, maxCross = 0, deep = 0;
    for (let s = 1; s < waldweg.length; s++) {
      const a = r.at(s), h = t.height(a.x, a.z);
      maxSlope = Math.max(maxSlope, Math.abs(h - prev)); prev = h;
      const [lx, lz] = r.offset(s, 3.5), [rx, rz] = r.offset(s, -3.5);
      maxCross = Math.max(maxCross, Math.abs(t.height(lx, lz) - t.height(rx, rz)));
      const sf = t.surface(a.x, a.z); if (sf === DEEP_SNOW) deep++; else expect(sf).toBe(SNOW);   // eine Tiefschnee-Spur auf der Strecke
    }
    expect(deep).toBeGreaterThan(30); expect(deep).toBeLessThan(90);
    expect(maxSlope).toBeLessThan(0.16);   // Zielhang mit zwei Kuppen
    expect(maxCross).toBeLessThan(0.25);
    const [ex, ez] = r.offset(150, 12);
    expect(t.surface(ex, ez)).toBe(DEEP_SNOW);
  });
  it('Höhe und Untergrund über die Physik-Schnittstelle: Auto steht auf der Straße', () => {
    const c = new Vehicle(HATCHBACK_80S, waldweg.terrain);
    c.reset(waldweg.start.x, waldweg.start.z, waldweg.start.yaw);
    for (let i = 0; i < 240; i++) c.step(I({}), DT);
    expect(c.surfaceName).toBe('Schnee');
    expect(Math.abs(c.pos[1] - waldweg.terrain.height(c.pos[0], c.pos[2]) - HATCHBACK_80S.cgHeight)).toBeLessThan(0.15);
  });
  it('Fortschritt steigt beim Geradeausfahren', () => {
    const c = new Vehicle(HATCHBACK_80S, waldweg.terrain), tr = new Tracker(waldweg.route);
    c.reset(waldweg.start.x, waldweg.start.z, waldweg.start.yaw);
    const s0 = tr.update(c.pos[0], c.pos[2]);
    for (let i = 0; i < 720; i++) c.step(I({ throttle: 1 }), DT);
    const s1 = tr.update(c.pos[0], c.pos[2]);
    expect(s1).toBeGreaterThan(s0 + 25);
    expect(tr.lat).toBeLessThan(3);
  });
  it('Untergründe: Schnee zwischen Schotter und Eis', () => {
    expect(SNOW.mu).toBeLessThan(GRAVEL.mu);
    expect(SNOW.mu).toBeGreaterThan(ICE.mu);
  });
});

describe('alle Schnee-Level', () => {
  for (const lv of WORLDS[0].levels.slice(0, 3)) it(`${lv.name}: lädt, Straße befahrbar, Sterne auf der Straße`, () => {
    const c = lv.make(), r = c.route, t = c.terrain;
    let prev = t.height(r.at(0).x, r.at(0).z), maxSlope = 0;
    for (let s = 1; s < c.length; s++) { const a = r.at(s), h = t.height(a.x, a.z); maxSlope = Math.max(maxSlope, Math.abs(h - prev)); prev = h; }
    expect(maxSlope).toBeLessThan(0.25);
    for (const [x, z] of c.stars) expect(r.nearest(x, z).d).toBeLessThan(4);
    for (const [x, z] of c.stars) expect(Math.abs(x)).toBeLessThan(t.half);
    expect(c.length).toBeGreaterThan(500);
    expect(c.length).toBeLessThan(1300);
    expect(c.stars.length).toBeGreaterThanOrEqual(8);
  });
  it('See: Eis auf der Fläche, Schnee davor', () => {
    const c = WORLDS[0].levels[2].make();
    expect(c.terrain.surface(0, 0).name).toBe('Eis');
    expect(c.terrain.surface(c.start.x, c.start.z).name).toBe('Schnee');
  });
});

describe('Welt Nachtstadt', () => {
  const city = WORLDS.find((w) => w.id === 'city')!;
  it('hat 3 Level mit Gebäuden, Laternen, Schildern; Straße ist frei, Gebäude stehen als feste Boxen', () => {
    expect(city.levels.length).toBeGreaterThanOrEqual(3);
    for (const lv of city.levels.slice(0, 3)) {
      const c = lv.make();
      expect(c.length).toBeGreaterThan(1500);
      expect(c.city!.buildings.length).toBeGreaterThan(100);
      expect(c.city!.lamps.length).toBeGreaterThan(30);
      expect(c.city!.signs.length).toBeGreaterThan(10);
      expect(c.obstacles.boxes.length).toBe(c.city!.buildings.length + (c.bridge ? c.bridge.obstacles().boxes.length : 0));
      for (const b of c.obstacles.boxes.slice(0, c.city!.buildings.length)) expect(c.route.nearestWithin(b.x, b.z, c.roadWidth / 2 + 3)).toBeNull();
      for (let s = 0; s < c.length; s += 5) { const a = c.route.at(s); expect(c.terrain.surface(a.x, a.z).name).toMatch(/Asphalt/); }
    }
  });
  it('Regenfahrt: Straße teils nass; das Auto meldet den Untergrund beim Fahren', () => {
    const c = city.levels[2].make(), a = c.route.at(800), b = c.route.at(100);
    expect(c.terrain.surface(a.x, a.z).name).toBe('Nasser Asphalt');
    expect(c.terrain.surface(b.x, b.z).name).toBe('Asphalt');
    const car = new Vehicle(HATCHBACK_80S, c.terrain), s0 = c.route.at(780);
    car.reset(s0.x, s0.z, c.route.yawAt(780)); for (let i = 0; i < 240; i++) car.step(I({}), DT);
    expect(car.surfaceName).toBe('Nasser Asphalt');
  });
  it('auf der Straße geradeaus fahren trifft nie ein Gebäude; quer in einen Block gefahren wird das Auto gestoppt', () => {
    const c = city.levels[0].make(), ob = new Obstacles(c.obstacles.circles, c.obstacles.boxes);
    const car = new Vehicle(HATCHBACK_80S, c.terrain); car.reset(c.start.x, c.start.z, c.start.yaw);
    let hits = 0; ob.onImpact = () => hits++;
    for (let i = 0; i < 360; i++) { car.step(I({ throttle: 1 }), DT); ob.step(car); }
    expect(hits).toBe(0);
    const b = c.city!.buildings[0], t = c.route.nearest(b.x, b.z);
    const [sx, sz] = c.route.offset(t.s, 0);
    car.reset(sx, sz, Math.atan2(-(b.x - sx), -(b.z - sz))); car.launch(30);
    for (let i = 0; i < 600; i++) { car.step(I({ throttle: 1 }), DT); ob.step(car); }
    expect(hits).toBeGreaterThan(0);
    expect(Math.hypot(car.pos[0] - b.x, car.pos[2] - b.z)).toBeGreaterThan(Math.min(b.hx, b.hz));   // nicht im Block gelandet
    expect(car.speed).toBeLessThan(3);
  });
});

describe('Welt Strand', () => {
  const beach = WORLDS.find((w) => w.id === 'beach')!;
  it('hat 3 Level; Straße liegt über dem Wasser, ist befahrbar, Sterne/Palmen stehen trocken', () => {
    expect(beach.levels.length).toBeGreaterThanOrEqual(3);
    for (const lv of beach.levels.slice(0, 3)) {
      const c = lv.make(), t = c.terrain, r = c.route;
      expect(c.sea!.level).toBeLessThan(0); expect(c.treeKind).toBe('palm'); expect(c.sun).not.toBeNull();
      let prev = t.height(r.at(0).x, r.at(0).z), slope = 0;
      for (let s = 1; s < c.length; s++) { const a = r.at(s), h = t.height(a.x, a.z); slope = Math.max(slope, Math.abs(h - prev)); prev = h; expect(h).toBeGreaterThan(c.sea!.level + 0.4); }
      expect(slope).toBeLessThan(0.25);
      for (const [x, z] of c.stars) expect(r.nearest(x, z).d).toBeLessThan(4);
      expect(c.trees.length).toBeGreaterThan(50);
      for (const p of c.trees) expect(t.height(p.x, p.z)).toBeGreaterThan(c.sea!.level + 0.8);
      expect(c.obstacles.circles.length).toBeGreaterThanOrEqual(c.trees.length);
      expect(c.obstacles.circles[0].r).toBeLessThan(0.7);
    }
  });
  it('Untergründe auf den Strecken: Promenade = Holz mit Steg, Wasserlinie = nasser Sand + weiche/Holz-Abschnitte, Küste hat nassen Streifen', () => {
    const [prom, wl, dun] = beach.levels.slice(0, 3).map((l) => l.make());
    expect(prom.boardwalk).toEqual([[0, prom.length]]);
    const at = (c: typeof prom, s: number) => { const a = c.route.at(s); return c.terrain.surface(a.x, a.z); };
    expect(at(prom, 300)).toBe(WOOD);
    expect(at(wl, 100)).toBe(WET_SAND); expect(at(wl, 270)).toBe(SOFT_SAND); expect(at(wl, 1150)).toBe(WOOD);
    expect(wl.boardwalk.length).toBe(1);
    expect(at(dun, 300)).toBe(SOFT_SAND); expect(at(dun, 540)).toBe(WOOD); expect(dun.boardwalk.length).toBe(2);
    const names = new Set<string>(); for (let i = 0; i < wl.terrain.surf.length; i++) names.add(SURFACES[wl.terrain.surf[i]].name);
    expect(names.has('Nasser Sand') && names.has('Weicher Sand')).toBe(true);
  });
  it('Untergründe: nasser Sand fest und schnell, weicher Sand zäh, Holz griffig; alte Werte unverändert', () => {
    expect(WET_SAND.mu).toBeGreaterThan(SOFT_SAND.mu * 1.6); expect(WET_SAND.rolling).toBeLessThan(SOFT_SAND.rolling / 3);
    expect(SOFT_SAND.rolling).toBeGreaterThanOrEqual(DEEP_SNOW.rolling); expect(WOOD.mu).toBeGreaterThan(WET_ASPHALT.mu);
    expect(ASPHALT.mu).toBe(1.15); expect(SNOW.mu).toBe(0.45); expect(DEEP_SNOW.rolling).toBe(0.09); expect(WET_ASPHALT.mu).toBe(0.95);
  });
  it('Auto fährt auf allen drei Sand-/Holz-Untergründen; weicher Sand ist deutlich langsamer', () => {
    const [prom, wl] = beach.levels.map((l) => l.make());
    const drive = (c: typeof prom, s: number) => {
      const a = c.route.at(s), car = new Vehicle(HATCHBACK_80S, c.terrain);
      car.reset(a.x, a.z, c.route.yawAt(s));
      for (let i = 0; i < 360; i++) car.step(I({ throttle: 1 }), DT);
      return [car.surfaceName, car.forwardSpeed] as const;
    };
    const w = drive(prom, 6), n = drive(wl, 60), so = drive(wl, 230);
    console.log('Hatch 3 s Vollgas:', w, n, so);
    expect(w[0]).toBe('Holz'); expect(n[0]).toBe('Nasser Sand'); expect(so[0]).toBe('Weicher Sand');
    expect(so[1]).toBeGreaterThan(5); expect(n[1]).toBeGreaterThan(so[1] * 1.2);
  });
});

describe('Strand lesbar', () => {
  const beach = WORLDS.find((w) => w.id === 'beach')!;
  it('alle Strandstrecken: Randpfähle abseits der Fahrbahn, Fahrbahnstreifen dunkler als der Sand (Straßenband)', async () => {
    const { buildRoadMesh } = await import('../src/world');
    for (const lv of beach.levels) {
      const c = lv.make(); expect(c.marks!.length, lv.id).toBeGreaterThan(c.length / 12);
      for (const m of c.marks!) { const h = c.route.nearest(m.x, m.z); expect(Math.abs(h.lat), lv.id).toBeGreaterThan(c.roadWidth / 2 + 0.5); }
      const g = buildRoadMesh(c)!.geometry, col = g.getAttribute('color'), pos = g.getAttribute('position'), lum = (i: number) => col.getX(i) + col.getY(i) + col.getZ(i), W = 11;   // 11 Stützpunkte je Querschnitt: 5 = Mitte, 4/6 = Reifenspur, 2 = Rand
      let dark = 0, n = 0;
      for (let k = 0; k + W <= col.count; k += W * 5) {
        if (c.roadSurfAt!(c.route.nearest(pos.getX(k + 5), pos.getZ(k + 5)).s).name === 'Holz') continue;   // Holzdeck: ohne Spur
        n++; if (lum(k + 4) < 0.7 * lum(k + 2) && lum(k + 6) < 0.7 * lum(k + 2) && lum(k + 4) < lum(k + 5)) dark++;
      }
      if (lv.id !== 'promenade') { expect(n, lv.id).toBeGreaterThan(20); expect(dark / n, lv.id).toBeGreaterThan(0.95); }
    }
  });
  it('Brandung: Felsriff mit Mauern zwischen den Beinen – kürzester befahrbarer Weg nicht unter 85 % der Strecke, keine Felsen auf der Fahrbahn', async () => {
    const { shortestPath } = await import('../tools/detour');
    const c = beach.levels.find((l) => l.id === 'wasserlinie')!.make();
    expect(c.rocks.length).toBeGreaterThan(200);
    for (const r of c.rocks) expect(c.route.nearestWithin(r.x, r.z, c.roadWidth / 2 + r.s + 1.5)).toBeNull();
    const sp = shortestPath(c); expect(sp.len / c.length).toBeGreaterThan(0.85);
  }, 60000);
});

describe('Brücke (Neonallee)', () => {
  const course = WORLDS[1].levels[0].make();
  const br = course.bridge!;
  const mkCar = (s: number, lat: number, v: number) => {
    const car = new Vehicle(HATCHBACK_80S, course.terrain), a = course.route.at(s), [x, z] = course.route.offset(s, lat);
    car.reset(x, z, course.route.yawAt(s)); car.launch(v);
    return { car, a };
  };
  it('Kanal kreuzt nur die Brücke, nie einen anderen Teil der Strecke (alle Stadt-Level)', () => {
    for (const lv of WORLDS[1].levels.slice(0, 3)) {
      const c = lv.make(), b = c.bridge!;
      for (let s = 0; s < c.length; s += 2) { const a = c.route.at(s); if (s < b.s0 - 1 || s > b.s1 + 1) expect(b.inCanal(a.x, a.z, 10), lv.id + ' s=' + s).toBe(false); }
    }
    for (let s = 0; s < course.length; s += 2) {
      const a = course.route.at(s);
      if (s < br.s0 - 1 || s > br.s1 + 1) expect(br.inCanal(a.x, a.z, 10), 's=' + s).toBe(false);
    }
  });
  it('Auto fährt mit Tempo aufs Deck, drüber und wieder runter: Deck trägt, Steigung sanft, kein Absaufen', () => {
    const { car } = mkCar(br.s0 - 40, 0, 30);
    const ob = new Obstacles(course.obstacles.circles, course.obstacles.boxes);
    let minAbove = 9, maxY = -9, vmax = 0, hits = 0; ob.onImpact = () => hits++;
    car.water = br.level;
    const tr = new Tracker(course.route); let s = 0;
    for (let i = 0; i < 6 / DT && s < br.s1 + 30; i++) {
      car.step(I({ throttle: 0.5 }), DT); ob.step(car); tr.update(car.pos[0], car.pos[2]); s = tr.s;
      if (s > br.s0 + 2 && s < br.s1 - 2) minAbove = Math.min(minAbove, car.pos[1] - br.deckY(s));
      maxY = Math.max(maxY, car.pos[1]); vmax = Math.max(vmax, car.speed);
    }
    expect(s).toBeGreaterThan(br.s1 + 25);
    expect(hits).toBe(0);
    expect(car.drowned).toBe(false);
    expect(minAbove).toBeGreaterThan(0.2);
    expect(minAbove).toBeLessThan(1.2);     // sitzt auf dem Deck, springt nicht
    expect(car.speed).toBeGreaterThan(15);
  });
  it('Geländer: schräg und frontal mit Tempo dagegen -> bleibt auf der Brücke, kein Rückprall', () => {
    for (const yawOff of [0.35, Math.PI / 2 - 0.05]) {
      const { car } = mkCar(br.def.s - 8, 3, 30);
      car.reset(car.pos[0], car.pos[2], course.route.yawAt(br.def.s) + yawOff); car.launch(30);
      const ob = new Obstacles(course.obstacles.circles, course.obstacles.boxes);
      car.water = br.level;
      for (let i = 0; i < 4 / DT; i++) { car.step(I({ throttle: 1 }), DT); ob.step(car); }
      expect(car.drowned).toBe(false);
      expect(car.pos[1]).toBeGreaterThan(br.level + 1);                 // nie ins Wasser gefallen
      expect(Math.abs(br.lat(car.pos[0], car.pos[2]))).toBeLessThan(course.roadWidth / 2 + 0.3);
    }
  });
  it('neben der Brücke im Kanal: abgesoffen', () => {
    const car = new Vehicle(HATCHBACK_80S, course.terrain), [x, z] = course.route.offset(br.def.s, 25);
    car.reset(x, z, 0); car.water = br.level;
    for (let i = 0; i < 3 / DT; i++) car.step(I({}), DT);
    expect(car.drowned).toBe(true);
  });
});

describe('Welt Rheinsteig', () => {
  const rhein = WORLDS.find((w) => w.id === 'rhein')!;
  it('3 Level, Straße liegt über dem Wasser, Steigung fahrbar, Fluss ist Wasser', () => {
    expect(rhein.levels.length).toBeGreaterThanOrEqual(3);
    for (const lv of rhein.levels.slice(0, 3)) {
      const c = lv.make(), r = c.route, T = c.terrain;
      let prev = T.height(r.at(0).x, r.at(0).z), maxG = 0, minH = 1e9;
      for (let s = 1; s < c.length; s++) { const a = r.at(s), h = T.height(a.x, a.z); maxG = Math.max(maxG, Math.abs(h - prev)); prev = h; minH = Math.min(minH, h); }
      expect(minH, lv.id).toBeGreaterThan(c.river!.level + 0.2);
      expect(maxG, lv.id).toBeLessThan(0.3);
      const m = c.river!.route.at(c.river!.route.length / 2);
      expect(c.waterAt(m.x, m.z)).toBe(c.river!.level);
      expect(c.waterAt(r.at(5).x, r.at(5).z)).toBe(-1e9);
    }
  });
  const ufer = rhein.levels.find((l) => l.id === 'etappe_rhein')!.make(), br = ufer.bridge!;   // Rheinbrücke der Etappe (die Uferstraße hat keine mehr)
  it('Rheinbrücke: mit Tempo drüber, Deck trägt, Geländer hält, Fluss darunter = Wasser', () => {
    const car = new Vehicle(HATCHBACK_80S, ufer.terrain), a = ufer.route.at(br.s0 + 4);
    car.reset(a.x, a.z, ufer.route.yawAt(br.s0 + 4)); car.launch(25);
    const ob = new Obstacles(ufer.obstacles.circles, ufer.obstacles.boxes), tr = new Tracker(ufer.route);
    let hits = 0, s = 0; ob.onImpact = () => hits++;
    for (let i = 0; i < 14 / DT && s < br.s1 + 20; i++) {
      car.water = ufer.waterAt(car.pos[0], car.pos[2]);
      car.step(I({ throttle: 0.6 }), DT); ob.step(car); tr.update(car.pos[0], car.pos[2]); s = tr.s;
    }
    expect(s).toBeGreaterThan(br.s1 + 15); expect(car.drowned).toBe(false);
    expect(hits).toBe(0);
  });
  it('neben der Brücke im Fluss: abgesoffen', () => {
    const car = new Vehicle(HATCHBACK_80S, ufer.terrain), [x, z] = ufer.route.offset(br.def.s, 14);
    car.reset(x, z, 0);
    for (let i = 0; i < 4 / DT; i++) { car.water = ufer.waterAt(car.pos[0], car.pos[2]); car.step(I({}), DT); }
    expect(car.drowned).toBe(true);
  });
});

describe('Etappen', () => {
  const ET = pick(WORLDS.flatMap((w) => w.levels).filter((l) => l.id.startsWith('etappe_')), ['etappe_stadt']);
  it('jede Etappe: Finale ihrer Welt (Rhein: vorletzt), lang, Sterne auf der Straße, Bot (Kompakter) schafft sie im Zeitkonto mit Reserve', async () => {
    const { driveBot } = await import('../tools/bot');
    for (const lv of ET) {
      const w = WORLDS.find((x) => x.levels.includes(lv))!, c = lv.make();
      if (w.levels.length > 1) { expect(w.levels.indexOf(lv), lv.id).toBeGreaterThanOrEqual(3); expect(w.levels.length - w.levels.indexOf(lv), lv.id).toBeLessThanOrEqual(2); }   // Finale (am Rhein folgt K1); Vorstadt hat nur die Etappe
      expect(c.length, lv.id).toBeGreaterThan(1400);
      for (const [x, z] of c.stars) expect(c.route.nearest(x, z).d, lv.id).toBeLessThan(c.roadWidth / 2);
      const r = driveBot(c, HATCHBACK_80S);
      expect(r.finished, lv.id + ' @' + Math.round(r.s)).toBe(true);
      expect(r.drowned, lv.id).toBe(0);
      expect(r.time, lv.id).toBeGreaterThan(80); expect(r.time, lv.id).toBeLessThan(125);   // ~1,5–2 min Fahrzeit
      expect(r.time * 1.25, lv.id).toBeLessThan(c.timeBudget);
    }
  }, 120000);
});

describe('Save-Schlüssel', () => {
  it('v>1 trennt die Bestzeit (id#v), alle Schlüssel eindeutig, Course.saveKey = LevelEntry.key', () => {
    const all = WORLDS.flatMap((w) => w.levels);
    expect(new Set(all.map((l) => l.key)).size).toBe(all.length);
    for (const l of all) expect(l.make().saveKey).toBe(l.key);
    expect(saveKeyOf({ id: 'x' })).toBe('x'); expect(saveKeyOf({ id: 'x', v: 1 })).toBe('x'); expect(saveKeyOf({ id: 'x', v: 2 })).toBe('x#2');
  });
});

describe('Kölner Ufer (K1)', () => {
  const rhein = WORLDS.find((w) => w.id === 'rhein')!;
  it('Finale der Welt: Brücke mit 3 Bögen + Schlössern, Dom als feste Kulisse abseits der Straße, Bot schafft es im Zeitkonto', async () => {
    const lv = rhein.levels[rhein.levels.length - 1]; expect(lv.id).toBe('koelner_ufer');
    const c = lv.make();
    expect(c.bridge!.def.arches).toBe(3); expect(c.bridge!.def.locks).toBe(true);
    expect(c.landmarks.length).toBe(1);
    const ob = new Obstacles(c.obstacles.circles, c.obstacles.boxes);
    for (let s = 0; s < c.length; s += 4) { const a = c.route.at(s); expect(ob.boxes.some((b) => Math.hypot(b.x - a.x, b.z - a.z) < 3 && b.hx > 8), 's=' + s).toBe(false); }
    const { driveBot } = await import('../tools/bot');
    const r = driveBot(c, HATCHBACK_80S); expect(r.finished).toBe(true); expect(r.drowned).toBe(0); expect(r.time).toBeLessThan(c.timeBudget);
  }, 60000);
});
