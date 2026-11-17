// Testwiese als Strecke (nur Tests; der Übungsplatz ist aus dem Spiel): kurze Gerade über die Asphaltstraße.
import { Route, type Course } from '../src/level';
import { makeTestMeadow } from '../src/physics/terrain';
import { PYLON_SPOTS } from '../src/physics/props';

export function makeMeadowCourse(): Course {
  const route = new Route([[0, 8], [0, -150]]);
  const terrain = makeTestMeadow();
  const goalS = 138, g = route.at(goalS);
  return {
    id: 'uebungsplatz', saveKey: 'uebungsplatz', name: 'Übungsplatz', world: 'offroad', route, net: null, bridges: [], bridgeSpans: [], terrain, length: route.length, roadWidth: 14,
    start: { x: 0, z: 8, yaw: 0 },
    goal: { s: goalS, x: g.x, z: g.z, yaw: 0 },
    city: null, suburb: null, signals: null, town: [], rainAlways: false, rainS: [], bridge: null, river: null, jumps: [], fords: [], tunnels: [], moverDefs: [], rails: [], traffic: null, bays: [], bayExt: () => 0, shallowAt: () => 0, vines: [], castles: [], landmarks: [], waterAt: () => -1e9, sea: null, sun: null, treeKind: 'fir', boardwalk: [], obstacles: { circles: [], boxes: [] },
    stars: [[0, -10], [0, -34], [3, -58], [-3, -84], [0, -108], [2, -124]],
    posts: PYLON_SPOTS, trees: [], rocks: [],
    timeBudget: 24, starBonus: 3, hints: { cp: [], arrow: [] }, chassis: { setup: 'standard' },
    surfaceColors: [0x4b4e57, 0xb89d6c, 0xbfe6f2, 0xdbe8f2, 0xf5f8fb],
    sky: 0xa9c4d6, fog: { color: 0xa9c4d6, near: 50, far: 230 },
    colors: { tree: 0x14231d, treeTop: 0xdfe9f0, rock: 0x7d838b, post: 0xff7a1a, star: 0xffd93b, gate: 0xd8342a },
    recover: () => null,
  };
}
