#!/usr/bin/env python3
# Sterne: hier nur lat 0 (Platzhalter) – danach IMMER `LINES=1 WRITE=1 npx vitest run tools/lines.test.ts` (setzt sie auf die Ideallinie, src/ideal.ts)
"""Erzeugt die langen Etappen (src/levels/etappe_*.json) aus den vorhandenen Leveln als Vorlage.
Aufruf: python3 tools/gen_etappen.py snow|city|beach|rhein   (Zeitkonte je Auto per tools/budgets.test.ts eintragen: BUDGET unten)
Reine Grundversion; Schanzen/Bewegtes/Tunnel/Furt kommen als eigene Punkte (TODO L2–L4) und stehen in ELEMENTS."""
import json, math, os, random, sys

D = os.path.join(os.path.dirname(__file__), '..', 'src', 'levels')
load = lambda n: json.load(open(os.path.join(D, n + '.json')))

# Kalibrierte Zeitkonten (s) je Etappe – aus tools/calibrate.test.ts (Bot Kompakter x 1,45)
import json, os
BUDGETS_ALL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'levels', 'budgets.json')))   # Zeitkonten je Strecke+Auto (Quelle: BUDGETS=1 WRITE=1 npx vitest run tools/budgets.test.ts)
BUDGET = BUDGETS_ALL
# Streckenelemente je Etappe: an den geradesten Stellen (straight_windows). Schalter je Element (Schanzen, Bewegtes, Tunnel/Furt)
ON = {'jumps': True, 'movers': True, 'tunnels': True, 'fords': True}
JUMP = dict(up=30, down=40, h=1.8)

def elements(d, L):
    pts = d['road']['points']; out = {}; used = []
    def pick(n, wlen, lo, hi):
        w = straight_windows(pts, n, wlen, lo, hi, used); used.extend((a, a + wlen) for a in w); return w
    br = d.get('bridge'); 
    if br: used.append((br['s'] - br['len'] / 2 - 40, br['s'] + br['len'] / 2 + 40))
    for z in d.get('zones', []):
        if z['surface'] in ('Eis', 'Kopfstein') and 's' in z: used.append((z['s'][0], z['s'][1]))
    id_ = d['id']; w = d['world']
    if ON['tunnels'] and id_ in ('etappe_schnee', 'etappe_rhein'):
        t = pick(1, 340, 150, L - 350)[0]; out["tunnels"] = [{"s0": t + 80, "s1": t + 180, "height": 15}]
    if ON['fords'] and id_ == 'etappe_strand':
        f = pick(1, 90, 700, L - 300)[0]; out['fords'] = [{"s0": f + 20, "s1": f + 62}]
    if ON['jumps']:
        n = 2; shape = 'hill' if w == 'beach' else 'ramp'
        ws = pick(n, 140, 250, L - 250)
        out['jumps'] = [dict(JUMP, s=a + 40, shape=shape) | ({"h": 1.4, "up": 26, "down": 30} if shape == 'hill' else {}) for a in ws]
    if ON['movers']:
        mv = []
        if id_ == 'etappe_schnee':
            cand = [s0 for s0 in range(480, int(L) - 220, 90) if not any(s0 > a - 40 and s0 < b + 40 for a, b in used)]
            for s0, ph, sd in zip(cand[:: max(1, len(cand) // 3)][:3], (0, 3.5, 7), (1, -1, 1)): mv.append({"kind": "balls", "s": s0, "side": sd, "period": 11, "phase": ph, "r": 1.7, "speed": 12, "reach": 32})
            mv.append({"kind": "convoy", "look": "plow", "s0": 130, "s1": 700, "speed": 8, "lat": 2.0})
            out['bays'] = [{"s0": a, "s1": a + 24, "side": 1, "w": 4.5, "taper": 20} for a in (196, 284, 450, 535, 596)]   # Ausweichbuchten vor dem Pflug (Gegenspur), nicht im Tunnel 330-430 / vor der Schanze 660
        elif id_ == 'etappe_stadt':
            c = pick(1, 100, 1300, L - 600)[0]; mv.append({"kind": "crossing", "s": c + 50, "period": 24, "phase": 14})
        elif id_ == 'etappe_strand':
            mv.append({"kind": "convoy", "look": "buggy", "s0": 110, "s1": 900, "speed": 13, "lat": 2.3})
            mv += [{"kind": "gulls", "x": -150, "z": 420, "r": 60, "n": 9, "h": 22}, {"kind": "gulls", "x": -170, "z": -250, "r": 70, "n": 8, "h": 26}]
        elif id_ == 'etappe_rhein':
            c = pick(1, 100, 250, 700)[0]; mv.append({"kind": "crossing", "s": c + 50, "period": 26, "phase": 15})
            mv.append({"kind": "ferry", "path": [[-420, -15], [-420, 95]], "speed": 3.2, "wait": 9})
        out['movers'] = mv
    return out

def length(pts): return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))

def stars_along(L, step, lats=(0, 0, 0)):
    return [[round(60 + i * step), lats[i % 3]] for i in range(int((L - 140) / step))]

def put(d, pts_len=None):
    d['road']['points'] = [[round(x, 1), round(z, 1)] for x, z in d['road']['points']]
    L = length(d['road']['points'])
    d['time']['budget'] = BUDGET[d['id']]
    d['objects']['stars'] = stars_along(L, 95 if d['world'] != 'city' else 150)
    d.update(elements(d, L))
    with open(os.path.join(D, d['id'] + '.json'), 'w') as f: json.dump(d, f, separators=(',', ':'), ensure_ascii=False)
    print(d['id'], round(L), 'm', len(d['road']['points']), 'Punkte')

def straight_windows(pts, n, wlen, lo, hi, avoid=()):
    """n gerade Abschnitte (Länge wlen) zwischen s=lo..hi: kleinste Richtungsänderung, ohne Überlappung (für Eis/Elemente)"""
    cum = [0]; hd = []
    for i in range(1, len(pts)):
        cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); hd.append(math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]))
    cand = []
    for s0 in range(int(lo), int(hi - wlen), 10):
        idx = [i for i in range(len(hd)) if s0 <= cum[i] <= s0 + wlen]
        if len(idx) < 2: continue
        tot = sum(abs((hd[idx[k + 1]] - hd[idx[k]] + math.pi) % (2 * math.pi) - math.pi) for k in range(len(idx) - 1))
        cand.append((tot, s0))
    cand.sort(); out = []
    for tot, s0 in cand:
        if any(s0 < b + 30 and s0 + wlen > a - 30 for a, b in avoid): continue
        if all(abs(s0 - o) > wlen + 80 for o in out): out.append(s0)
        if len(out) == n: break
    return sorted(out)

def wander(L, seed, start, phi0, lim, rmin, ds=40.0):
    """Zufällige glatte Strecke der Länge L: Kurvenrate = Summe von Sinus, Rückholung zur Mitte, Mindestradius rmin, kein Selbstkontakt."""
    for attempt in range(4000):
        r = random.Random(seed * 1000 + attempt)
        ph = [r.uniform(0, 6.28) for _ in range(3)]; la = [r.uniform(160, 260), r.uniform(70, 120), r.uniform(400, 700)]; am = [0.55, 0.45, 0.5]
        x, z = start; phi = phi0; pts = [(x, z)]; ok = True
        for i in range(int(L / ds)):
            s = i * ds
            k = sum(a * math.sin(s / l * 2 + p) for a, l, p in zip(am, la, ph)) / 160.0
            # zur Mitte zurück, wenn zu nah am Rand
            d = math.hypot(x, z)
            if d > lim * 0.6:
                want = math.atan2(-z, -x); dphi = (want - phi + math.pi) % (2 * math.pi) - math.pi
                k += 0.9 * dphi / 160.0 * min(1, (d - lim * 0.6) / (lim * 0.3))
            k = max(-1 / rmin, min(1 / rmin, k))
            phi += k * ds; x += math.cos(phi) * ds; z += math.sin(phi) * ds
            if abs(x) > lim or abs(z) > lim: ok = False; break
            pts.append((x, z))
        if not ok: continue
        # Selbstkontakt
        for i in range(len(pts)):
            for j in range(i + 7, len(pts)):
                if math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < 90: ok = False; break
            if not ok: break
        if ok: print('wander seed', seed, 'Versuch', attempt); return pts
    raise SystemExit('keine Strecke gefunden')

def snow():
    d = load('kuppenstrecke')
    d.update(id='etappe_schnee', name='Etappe Gipfelpass', seed=2101)
    pts = wander(1500, 21, (-560, 560), -math.pi / 2, 640, 55)
    d['terrain'].update(n=281, cell=5, amp=11, wavelength=120, roadAmp=1.3, intro=200, smooth=24)
    d['terrain'].pop('lakes', None)
    d['road']['points'] = pts
    d['zones'] = [{"surface": "Eis", "s": [a, a + 90]} for a in straight_windows(pts, 1, 90, 350, 1250)]
    d['objects'].update(trees={"count": 900, "near": 5, "far": 55}, rocks={"count": 90}, posts={"every": 30, "from": 24, "lateral": 5.7})
    d['fog'] = {"color": "#eef3f7", "near": 25, "far": 170}
    put(d)

def rounded_rect(cx, cz, hx, hz, R, start_frac, step=30):
    """Geschlossener Pfad (im Uhrzeigersinn) als Punkte, beginnend an der linken Kante"""
    segs = []
    # Eckpunkte der Mittellinien: links runter … (x,z) mit z nach unten positiv im Spiel
    P = lambda x, z: (cx + x, cz + z)
    pts = []
    def line(a, b):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for i in range(n): pts.append((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n))
    def arc(c, a0, a1):
        n = max(4, int(abs(a1 - a0) * R / step * 1.2))
        for i in range(n): a = a0 + (a1 - a0) * i / n; pts.append((c[0] + R * math.cos(a), c[1] + R * math.sin(a)))
    # Start links Mitte, nach "oben" (z klein), dann rechts herum
    line(P(-hx, 60), P(-hx, -hz + R))
    arc(P(-hx + R, -hz + R), math.pi, 1.5 * math.pi)
    line(P(-hx + R, -hz), P(hx - R, -hz))
    arc(P(hx - R, -hz + R), 1.5 * math.pi, 2 * math.pi)
    line(P(hx, -hz + R), P(hx, hz - R))
    arc(P(hx - R, hz - R), 0, 0.5 * math.pi)
    line(P(hx - R, hz), P(-hx + R, hz))
    arc(P(-hx + R, hz - R), 0.5 * math.pi, math.pi)
    line(P(-hx, hz - R), P(-hx, 200))
    return pts

def city():
    d = load('hochhausring')
    d.update(id='etappe_stadt', name='Etappe Stadtring', seed=3101)
    pts = rounded_rect(0, 0, 500, 390, 170, 0)
    d['terrain'].update(n=201, cell=8)
    d['road']['points'] = pts
    # Brücke mitten auf der oberen Geraden (x = 0)
    cum = 0; s_br = None
    for i in range(1, len(pts)):
        cum += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        if s_br is None and pts[i][0] >= 0 and abs(pts[i][1] + 390) < 1: s_br = cum
    d['bridge'] = {"s": round(s_br), "len": 56, "canal": 30, "rise": 1.6, "reachL": 150, "reachR": 150}
    L = length(pts)
    d['zones'] = [{"surface": "Nasser Asphalt", "s": [round(L * 0.45), round(L * 0.75)]}]
    d['city'] = dict(d['city'], height=[22, 90])
    put(d)

def beach():
    d = load('wasserlinie')
    d.update(id='etappe_strand', name='Etappe Küstenband', seed=5101)
    pts = []
    for z in range(780, -700, -40): pts.append((-215 + 22 * math.sin(z / 85.0) + 10 * math.sin(z / 37.0), z))
    cx, cz, R = -215 - 110, -700, 110   # Haarnadel im Süden nach links (landeinwärts)
    for i in range(1, 9):
        th = -math.pi * i / 8; pts.append((cx + R * math.cos(th), cz + R * math.sin(th)))
    # Rückweg nach Norden bei x ≈ -430
    for z in range(-660, -300, 40): pts.append((-435 + 25 * math.sin(z / 70.0) + 10 * math.sin(z / 29.0), z))
    d['terrain'].update(n=241, cell=8)
    d['sea']['shore'].update(nx=1, nz=0, d0=-125, w=40, depth=6, wob=14)
    d['sea']['level'] = -1.3
    d['road']['points'] = pts
    L = length(pts)
    d['zones'] = [{"surface": "Holz", "s": [0, 330]}, {"surface": "Weicher Sand", "s": [820, 1050]}, {"surface": "Holz", "s": [1250, 1380]}, {"surface": "Weicher Sand", "s": [1600, 1800]}, {"surface": "Holz", "s": [2050, 2200]}]
    d['road'].update(surface='Nasser Sand', verge='Weicher Sand')
    d['palette']['surfaces'] = dict(d['palette']['surfaces'])
    d['objects'].update(trees={"count": 300, "near": 3, "far": 45, "kind": "palm"}, rocks={"count": 30})
    put(d)

def rhein():
    d = load('uferstrasse')
    d.update(id='etappe_rhein', name='Etappe Rheinbogen', seed=4401)
    RIVER = [[-700, 45], [-300, 35], [-80, 45], [120, 60], [300, 40], [700, 60]]
    d['river']['points'] = RIVER
    def zr(x):
        # Fluss-z an Stelle x (linear zwischen Stützpunkten)
        for i in range(len(RIVER) - 1):
            if RIVER[i][0] <= x <= RIVER[i + 1][0]:
                t = (x - RIVER[i][0]) / (RIVER[i + 1][0] - RIVER[i][0]); return RIVER[i][1] + t * (RIVER[i + 1][1] - RIVER[i][1])
        return RIVER[-1][1]
    pts = []
    for x in range(-640, -100, 30): pts.append((x, zr(x) - 72 + 7 * math.sin(x / 38.0) + 4 * math.sin(x / 17.0)))
    pts += [(-100, -27), (-60, -24), (-22, -15)]
    x0, z0, x1, z1 = -22, -15, 141, 111
    pts += [(x0 + (x1 - x0) * i / 8, z0 + (z1 - z0) * i / 8) for i in range(1, 9)]
    pts += [(172, 124), (210, 130)]
    for x in range(240, 560, 30): pts.append((x, zr(x) + 66 + 7 * math.sin(x / 33.0)))
    zs = pts[-1][1]   # Haarnadel am Ostende, Rückweg am Hang (Weinberg, Kopfsteinpflaster-Ort)
    pts += [(575, zs + 18), (608, zs + 60), (600, zs + 105), (560, zs + 140)]
    for x in range(520, -100, -30): pts.append((x, zr(x) + 150 + 12 * math.sin(x / 45.0)))
    d['terrain'].update(n=281, cell=5)
    d['road']['points'] = pts
    L = length(pts)
    dense_cum = 0
    # Brücken-Lage: Punkt kleinster Flussnähe über Polyline (grob)
    best = (1e9, 0); cum = 0
    for i in range(1, len(pts)):
        cum += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        if cum < 700 or cum > 1100: continue
        dd = abs(pts[i][1] - zr(pts[i][0]))
        if dd < best[0]: best = (dd, cum)
    d['bridge'] = {"s": round(best[1]), "len": 190, "canal": 90, "rise": 6, "arch": True}
    print('Brücke bei s ~', round(best[1]), 'Länge', round(L))
    d['zones'] = [{"surface": "Kopfstein", "s": [round(L * 0.78), round(L * 0.86)]}]
    d['objects'].update(vines={"rects": [[-500, 100, -150, 330]], "spacing": 3.4, "yaw": 3}, castles=[{"x": -250, "z": -200, "yaw": 0.5, "s": 1.1}, {"x": 380, "z": 300, "yaw": 2.0, "s": 1.2}], trees={"count": 700, "near": 7, "far": 60, "kind": "mixed"}, rocks={"count": 90})
    put(d)

if __name__ == '__main__':
    for w in sys.argv[1:] or ['snow', 'city', 'beach', 'rhein']: globals()[w]()
