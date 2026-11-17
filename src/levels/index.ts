// Welten und Levels (name = deutscher Anzeigename; angezeigt wird über i18n worldName/levelName). Neue Level: JSON in src/levels/ ablegen und hier eintragen.
import { buildCourse, saveKeyOf, type Course, type LevelDef } from '../level';
import { makeHuegel } from './huegel';
import { makeFurtwald } from './furtwald';
import { makeMatschgrube } from './matschgrube';
import { makeSteilhang } from './steilhang';
import { makeMoorwald } from './moorwald';
import BUDGETS from './budgets.json';
import waldweg from './waldweg.json';
import kuppen from './kuppenstrecke.json';
import see from './see.json';
import neonallee from './neonallee.json';
import hochhausring from './hochhausring.json';
import regenfahrt from './regenfahrt.json';
import promenade from './promenade.json';
import wasserlinie from './wasserlinie.json';
import duenenpfad from './duenenpfad.json';
import weinberg from './weinberg.json';
import uferstrasse from './uferstrasse.json';
import loreley from './loreley.json';
import kehrenhang from './kehrenhang.json';
import etappeSchnee from './etappe_schnee.json';
import kreiselviertel from './kreiselviertel.json';
import etappeStadt from './etappe_stadt.json';
import muschelweg from './muschelweg.json';
import etappeStrand from './etappe_strand.json';
import burgweg from './burgweg.json';
import koelnerUfer from './koelner_ufer.json';
import etappeRhein from './etappe_rhein.json';
import etappeVorstadt from './etappe_vorstadt.json';

export interface LevelEntry { id: string; name: string; key: string; stars: number; make: () => Course;
  /** Zeitkonto des Autos (ohne das Level zu bauen): für die Restzeit im Menü */
  budget: (car: string) => number | undefined }
export interface WorldEntry { id: string; icon: string; name: string; levels: LevelEntry[] }

const json = (d: unknown): LevelEntry => { const def = d as LevelDef; return { id: def.id, name: def.name, key: saveKeyOf(def), stars: def.objects.stars.length, make: () => buildCourse(def), budget: (car) => { const b = def.time.budget; return typeof b === 'number' ? b : (b[car] ?? b.hatch); } }; };
const offBudget = (id: string) => (car: string): number | undefined => { const b = (BUDGETS as Record<string, Record<string, number>>)[id]; return b?.[car] ?? b?.hatch; };

const ALL_WORLDS: WorldEntry[] = [
  { id: 'snow', icon: 'snow', name: 'Schnee', levels: [json(waldweg), json(kuppen), json(see), json(kehrenhang), json(etappeSchnee)] },
  { id: 'city', icon: 'city', name: 'City', levels: [json(neonallee), json(hochhausring), json(regenfahrt), json(kreiselviertel), json(etappeStadt)] },
  { id: 'beach', icon: 'beach', name: 'Strand', levels: [json(promenade), json(wasserlinie), json(duenenpfad), json(muschelweg), json(etappeStrand)] },
  { id: 'rhein', icon: 'rhein', name: 'Rhein', levels: [json(weinberg), json(uferstrasse), json(loreley), json(burgweg), json(etappeRhein), json(koelnerUfer)] },
  // Vorstadt: Straßennetz + Rundkurs nach einer Handskizze (tools/gen_vorstadt.py)
  { id: 'vorstadt', icon: 'suburb', name: 'Vorstadt', levels: [json(etappeVorstadt)] },
  // Offroad: drei freie Geländelevel, prozedural (offroad.ts); alle Autos, kein Verkehr
  { id: 'offroad', icon: 'offroad', name: 'Offroad', levels: [
    { id: 'matschgrube', name: 'Matschgrube', key: 'matschgrube', stars: 15, make: makeMatschgrube, budget: offBudget('matschgrube') },
    { id: 'huegel', name: 'Hügel', key: 'huegel#2', stars: 12, make: makeHuegel, budget: offBudget('huegel') },
    { id: 'furtwald', name: 'Furtwald', key: 'furtwald#2', stars: 13, make: makeFurtwald, budget: offBudget('furtwald') },
    { id: 'steilhang', name: 'Steilhang', key: 'steilhang', stars: 14, make: makeSteilhang, budget: offBudget('steilhang') },
    { id: 'moorwald', name: 'Moorwald', key: 'moorwald', stars: 13, make: makeMoorwald, budget: offBudget('moorwald') },
  ] },
];
export const WORLDS: WorldEntry[] = ALL_WORLDS;
