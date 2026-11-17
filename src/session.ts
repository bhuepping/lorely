// Sitzung: Level -> Welt, Auto, Lauf, Szene (für die Fahrt und für den Titel-Kameraflug). Kennt weder Oberfläche noch Schleife.
import * as THREE from 'three';
import { Vehicle } from './physics/vehicle';
import { CARS, HATCHBACK_80S } from './physics/params';
import { GameAudio } from './audio';
import { Props } from './physics/props';
import { Obstacles } from './physics/obstacles';
import { buildTerrainMesh, PylonMesh, CarMesh, StarMesh, ForestMesh, buildCity, BridgeMesh, RiverMesh, buildVines, buildCastles, buildDom, buildRocks, buildGate, buildBoardwalk, BeachScene, buildRoadMesh, buildMarks } from './world';
import { buildJumps, buildTunnels, FordMesh, MoverMesh } from './featuremesh';
import { aidField } from './features';
import { buildFlag, buildBrook, buildLogs, buildGoalCircle } from './offroadmesh';
import { Movers, barrierParking } from './movers';
import { CheckMesh } from './cpmesh';
import { buildNetRoad } from './netmesh';
import { buildSuburb, StartLight } from './suburbmesh';
import { makeTraffic, type TrafficLike } from './traffic';
import { TrafficMesh } from './trafficmesh';
import { Fx } from './fx';
import { RainMesh } from './rain';
import { disposeTree } from './dispose';
import { store } from './dom';
import { Run, type Mode } from './run';
import { buildSky, SKIES } from './sky';
import { type Course } from './level';
import { EdgeGuard } from './edge';
import { type LevelEntry } from './levels';

export const CD_GO = 2;   // s bis Grün (rot bei 0 und 1)

export interface Session {
  entry: LevelEntry; carId: string; course: Course; run: Run; car: Vehicle; props: Props; obst: Obstacles; forest: ForestMesh | null; beach: BeachScene | null;
  bridgeMesh: BridgeMesh | null; riverMesh: RiverMesh | null; pylons: PylonMesh; carMesh: CarMesh; starMesh: StarMesh; cpMesh: CheckMesh | null; scene: THREE.Scene;
  sky: THREE.Mesh; movers: Movers | null; moverMesh: MoverMesh | null; traffic: TrafficLike | null; trafficMesh: TrafficMesh | null; ford: FordMesh | null; startLight: StartLight | null; fx: Fx; hemi: THREE.HemisphereLight; sunL: THREE.DirectionalLight; base: [number, number]; dark: boolean; tunnelF: number; cd: number; sigT: number; rain: RainMesh | null;
  endAt: number; endHandled: boolean; newBest: boolean;
  /** Rand der Welt (nur Level mit `edge`): Wächter + Restzeit (s), in der das Auto beim Wiederauftauchen noch unsichtbar ist */
  edge: EdgeGuard | null;
  /** Fahrhilfe nach Ort (Gelände aus, Straße schwach, Schanzen stärker) */
  aidAt: (x: number, z: number) => number;
}

/** Welt + Auto + Lauf aufbauen */
export function buildSession(entry: LevelEntry, m: Mode, cid: string, audio: GameAudio, camera: THREE.PerspectiveCamera): Session {
  const CP = CARS[cid] ?? HATCHBACK_80S;
  const lt: Record<string, number> = {}; let lt0 = performance.now();   // Ladezeit je Abschnitt (ms), window.__rsLoad – Messung tools/loadtime.mjs
  const lap = (k: string) => { const t = performance.now(); lt[k] = (lt[k] ?? 0) + t - lt0; lt0 = t; };
  const course = entry.make(); lap('welt');
  const car = new Vehicle(CP, course.terrain);
  car.water = course.sea ? course.sea.level : -1e9;
  car.reset(course.start.x, course.start.z, course.start.yaw);
  const props = new Props(course.terrain, [...course.posts, ...barrierParking(course.moverDefs)]);
  props.onImpact = (v) => audio.thud(v, performance.now());
  const pylons = new PylonMesh(props, course.colors.post, barrierParking(course.moverDefs).length);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(course.sky);
  scene.fog = new THREE.Fog(course.fog.color, course.fog.near, course.fog.far);
  const snow = course.world === 'snow';
  const night = !!course.city, dusk = !!course.sea, gold = course.world === 'vorstadt';
  // Himmels- + Sonnenlicht: kühles Himmelslicht von oben, warmes Sonnenlicht schräg (Hänge modelliert statt flach); Nacht/Dämmerung eigene Stimmung
  const hemi = new THREE.HemisphereLight(night ? 0x8e96d8 : dusk ? 0xffb98a : gold ? 0xc4dcf6 : snow ? 0xdbe8ff : 0xcfe4ff, night ? 0x2a2848 : dusk ? 0x8a5a78 : gold ? 0x9a7a48 : snow ? 0x9fb0c6 : 0x86775f, (night ? 1.5 : dusk ? 1.25 : gold ? 1.2 : snow ? 0.95 : 1.05) * (course.mood?.light ?? 1)); scene.add(hemi);
  const sun = new THREE.DirectionalLight(night ? 0x93a4ff : dusk ? 0xff9a55 : gold ? 0xffc77a : snow ? 0xfff4e0 : 0xfff0d2, (night ? 0.6 : dusk ? 1.7 : gold ? 2.3 : snow ? 1.3 : 2.2) * (course.mood?.light ?? 1));
  if (dusk && course.sun) sun.position.set(course.sun.dx, 0.35, course.sun.dz); else if (gold) sun.position.set(-0.8, 0.5, 0.4); else sun.position.set(-0.6, 0.8, 0.4);
  scene.add(sun);
  const farCam = course.fog.far * 1.6 + 40;
  const sky = buildSky({ ...(SKIES[course.world] ?? SKIES.practice), ...(course.mood ? { zenith: course.mood.zenith, mid: course.mood.mid, ringTop: course.mood.ringTop } : {}), horizon: course.fog.color, seed: course.id.length * 7919 + course.id.charCodeAt(0), sun: dusk && course.sun ? { ...course.sun, col: 0xfff0c0, glow: 0xff8a40 } : undefined }, farCam * 0.9, course.fog.far * 1.25);
  scene.add(sky);
  const beach = dusk ? new BeachScene(course) : null;
  if (beach) scene.add(beach.group);
  const deck = buildBoardwalk(course); if (deck) { deck.userData.mapTint = true; scene.add(deck); }
  if (night) scene.add(buildCity(course));
  lap('szene');
  const sb = course.suburb ? buildSuburb(course) : null; if (sb) scene.add(sb.group);
  lap('vorstadt');
  const startLight = sb ? sb.light : null;
  const jumpMesh = buildJumps(course); if (jumpMesh) scene.add(jumpMesh);
  const tunnelMesh = buildTunnels(course, night); if (tunnelMesh) scene.add(tunnelMesh);
  const ford = course.fords.length ? new FordMesh(course) : null; if (ford) scene.add(ford.group);
  const movers = course.moverDefs.length ? new Movers(course.route, course.roadWidth / 2, course.moverDefs, course.posts.length, course.rails) : null;
  const moverMesh = movers ? new MoverMesh(course, movers) : null; if (moverMesh) scene.add(moverMesh.group);
  const traffic = makeTraffic(course, movers);
  const trafficMesh = traffic ? new TrafficMesh(course, traffic) : null; if (trafficMesh) { trafficMesh.setNight(night || dusk); scene.add(trafficMesh.group); }
  const riverMesh = course.river ? new RiverMesh(course) : null; if (riverMesh) scene.add(riverMesh.group);
  if (course.vines.length) scene.add(buildVines(course));
  if (course.castles.length) scene.add(buildCastles(course));
  if (course.landmarks.length || course.town.length) scene.add(buildDom(course));
  const bridgeMesh = course.bridge ? new BridgeMesh(course) : null; if (bridgeMesh) scene.add(bridgeMesh.group);
  for (const b of course.bridges) if (b !== course.bridge) scene.add(new BridgeMesh(course, b).group);   // Netz-Level: Brücken auf Kanten
  lap('verkehr+rest');
  scene.add(buildTerrainMesh(course.terrain, course.surfaceColors, night || dusk || gold ? 3 : 4, course.meshSurf), pylons.mesh);
  lap('gelaende');
  const road = course.net ? buildNetRoad(course) : buildRoadMesh(course); if (road) { road.userData.mapTint = true; scene.add(road); }
  lap('strasse');
  const obst = new Obstacles(course.obstacles.circles, course.obstacles.boxes);
  const fx = new Fx(course, night || dusk); scene.add(fx.points);
  const rain = course.rainAlways || course.rainS.length ? new RainMesh(night, course.fog.color) : null; if (rain) scene.add(rain.mesh);
  if (traffic && trafficMesh) traffic.onFx = (c, mode) => fx.carBurst(c, trafficMesh.paintOf(c), mode);
  obst.onImpact = (v) => { audio.thud(v, performance.now()); fx.impact(car, v); };
  if (movers) { obst.dynBoxes = movers.boxes; obst.dynCircles = movers.circles; }
  if (traffic) obst.dynBoxes = [...obst.dynBoxes, ...traffic.cars];
  const forest = course.trees.length ? new ForestMesh(course.trees, course.terrain, course.colors, course.treeKind) : null;
  if (forest) scene.add(forest.mesh);
  if (course.marks?.length) scene.add(buildMarks(course.marks, course.terrain));
  if (course.rocks.length) scene.add(buildRocks(course.rocks, course.terrain, course.colors.rock));
  lap('wald');
  if (course.brook) scene.add(buildBrook(course));
  if (course.logs?.length) scene.add(buildLogs(course));
  if (course.goal && course.free) scene.add(buildFlag(course.goal.x, course.terrain.height(course.goal.x, course.goal.z), course.goal.z));   // Offroad: hohe Zielfahne, immer sichtbar
  if (course.goal && course.free) scene.add(buildGoalCircle(course.goal.x, course.goal.z, course.terrain));   // Offroad: Zielkreis statt Tor
  else if (course.goal) {
    const g = buildGate(course.roadWidth, course.colors.gate);
    g.position.set(course.goal.x, course.terrain.height(course.goal.x, course.goal.z), course.goal.z); g.rotation.y = course.goal.yaw;
    scene.add(g);
  }
  const run = new Run(course, m);
  const cpMesh = run.cps && run.cps.list.length ? new CheckMesh(course, run.cps) : null; if (cpMesh) scene.add(cpMesh.mesh);
  const starMesh = new StarMesh(course.stars, course.terrain, course.colors.star);
  scene.add(starMesh.mesh);
  const carMesh = new CarMesh(car, CP); carMesh.setNight(night || dusk); scene.add(carMesh.root);
  camera.far = course.fog.far * 1.6 + 40; camera.updateProjectionMatrix();
  lap('ende'); (window as unknown as { __rsLoad: Record<string, number> }).__rsLoad = lt;
  return { aidAt: aidField(course), entry, carId: cid, course, run, car, props, obst, forest, beach, sky, movers, moverMesh, traffic, trafficMesh, ford, startLight, fx, hemi, sunL: sun, base: [hemi.intensity, sun.intensity], dark: night, tunnelF: 0, rain, cd: store.get('rs-cd') === '0' ? 9 : -0.5, sigT: 0, bridgeMesh, riverMesh, pylons, carMesh, starMesh, cpMesh, scene, endAt: 0, endHandled: false, newBest: false, edge: course.edge ? new EdgeGuard(course.edge) : null };
}

/** Szene freigeben (Geometrien, Materialien, Texturen) */
export const disposeSession = (s: Session): void => disposeTree(s.scene);
