// Bestwerte: je Strecke und Auto die schnellste Fahrzeit (Zeitfahren) und die meisten Sterne (Sammeln).
import { describe, it, expect, beforeEach } from 'vitest';
import { recordResult, loadSave, bestOf } from '../src/save';
import { CARS } from '../src/physics/params';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
});
const ids = Object.keys(CARS);

describe('Bestwerte je Auto', () => {
  it('Altstand: Sterne-Maximum wird Startwert jedes Autos, Restzeiten/Bestzeiten verfallen, Übungsplatz fällt weg, Version 4', () => {
    mem.set('rs-save', JSON.stringify({ _v: 3, uebungsplatz: { stars: 4 }, waldweg: { stars: 3, rest: { hatch: 12 }, run: { hatch: [50, 3] } }, see: { best: 70.5, car: 'buggy', stars: 2 }, leer: { rest: { hatch: 5 } } }));
    const s = loadSave();
    expect(Object.keys(s).sort()).toEqual(['leer', 'see', 'waldweg']);
    for (const id of ids) { expect(bestOf(s.waldweg, id, 'stars')).toBe(3); expect(bestOf(s.waldweg, id, 'time')).toBeUndefined(); expect(bestOf(s.see, id, 'stars')).toBe(2); }
    expect(bestOf(s.leer, 'hatch', 'stars')).toBeUndefined();
    expect(JSON.parse(mem.get('rs-save')!)._v).toBe(4);
    expect(loadSave()).toEqual(s);   // zweites Laden ändert nichts
  });
  it('Zeitfahren: kleinere Fahrzeit ersetzt, größere nicht, je Auto getrennt; verlorene Fahrt zählt nicht', () => {
    const rec = (car: string, elapsed: number, won = true) => recordResult('waldweg', { won, mode: 'time', stars: 0, car, elapsed }).newBest;
    expect(rec('hatch', 64.04)).toBe(true);      // erster Wert = Rekord
    expect(rec('buggy', 90)).toBe(true);         // anderes Auto, eigener Wert
    expect(rec('hatch', 70)).toBe(false);
    expect(rec('hatch', 61.26)).toBe(true);
    expect(rec('hatch', 50, false)).toBe(false);
    const s = loadSave().waldweg;
    expect(bestOf(s, 'hatch', 'time')).toBe(61.3); expect(bestOf(s, 'buggy', 'time')).toBe(90); expect(bestOf(s, 'jeep', 'time')).toBeUndefined();
  });
  it('Sammeln: mehr Sterne ersetzt, weniger nicht; Zeit und Sterne stören sich nicht', () => {
    const rec = (car: string, stars: number) => recordResult('waldweg', { won: true, mode: 'stars', stars, car }).newBest;
    expect(rec('hatch', 4)).toBe(true); expect(rec('hatch', 4)).toBe(false); expect(rec('hatch', 2)).toBe(false); expect(rec('hatch', 7)).toBe(true);
    expect(rec('hatch', 0)).toBe(false);
    recordResult('waldweg', { won: true, mode: 'time', stars: 0, car: 'hatch', elapsed: 80 });
    const s = loadSave().waldweg;
    expect(bestOf(s, 'hatch', 'stars')).toBe(7); expect(bestOf(s, 'hatch', 'time')).toBe(80); expect(bestOf(s, 'buggy', 'stars')).toBeUndefined();
  });
  it('Altes Sterne-Maximum ist Startwert: erst mehr Sterne ist ein Rekord', () => {
    mem.set('rs-save', JSON.stringify({ _v: 3, waldweg: { stars: 5 } }));
    expect(recordResult('waldweg', { won: true, mode: 'stars', stars: 5, car: 'jeep' }).newBest).toBe(false);
    expect(recordResult('waldweg', { won: true, mode: 'stars', stars: 6, car: 'jeep' }).newBest).toBe(true);
    expect(bestOf(loadSave().waldweg, 'hatch', 'stars')).toBe(5);
  });
});
