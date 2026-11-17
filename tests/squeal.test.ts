import { describe, it, expect } from 'vitest';
import { squeal } from '../src/audio';

describe('Reifenquietschen', () => {
  it('hoher Schlupf: laut auf hartem Grund, still auf losem/glattem', () => {
    for (const hard of ['Asphalt', 'Nasser Asphalt', 'Kopfstein', 'Holz']) expect(squeal(hard, 0.9, 20).gain, hard).toBeGreaterThan(0.03);
    for (const soft of ['Schnee', 'Tiefschnee', 'Eis', 'Weicher Sand', 'Schotter', 'Gras', 'Nasser Sand', 'Furt']) expect(squeal(soft, 0.9, 20).gain, soft).toBe(0);
  });
  it('steigt mit dem Schlupf, leichter Schlupf bleibt still, Tonlage mittel', () => {
    expect(squeal('Asphalt', 0.1, 20).gain).toBe(0);
    expect(squeal('Asphalt', 0.5, 20).gain).toBeLessThan(squeal('Asphalt', 0.9, 20).gain);
    const f = squeal('Asphalt', 1, 40).freq; expect(f).toBeGreaterThan(1400); expect(f).toBeLessThan(3000);
  });
});
