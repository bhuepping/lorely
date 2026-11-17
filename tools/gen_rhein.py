#!/usr/bin/env python3
# Sterne: hier nur lat 0 (Platzhalter) – danach IMMER `LINES=1 WRITE=1 npx vitest run tools/lines.test.ts` (setzt sie auf die Ideallinie, src/ideal.ts)
"""Erzeugt die drei Rheinsteig-Level (src/levels/*.json). Aufruf: python3 tools/gen_rhein.py"""
import json, math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'levels')
SMOOTH = 70
RIVER = [[-520, 45], [-300, 35], [-80, 45], [120, 60], [300, 40], [520, 60]]
WIDTH, LEVEL = 90, 0.0

def catmull(pts, step=6):
    P = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(len(P) - 3):
        p0, p1, p2, p3 = P[i:i + 4]
        n = max(8, math.ceil(math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2))
        for k in range(n):
            t = k / n; t2 = t * t; t3 = t2 * t
            f = lambda a, b, c, d: 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
            out.append((f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])))
    out.append(tuple(pts[-1]))
    return out

def river_dist(x, z, dense):
    best = 1e9
    for i in range(len(dense) - 1):
        ax, az = dense[i]; bx, bz = dense[i + 1][0] - ax, dense[i + 1][1] - az
        t = max(0, min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz or 1)))
        best = min(best, math.hypot(x - ax - bx * t, z - az - bz * t))
    return best

RD = catmull(RIVER)

def arc(cx, cz, r, a0, a1, n=8):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

def stars_along(length, step, lats=(0, 0, 0)):
    return [[round(60 + i * step), lats[i % 3]] for i in range(int((length - 120) / step))]

def pal(rock='#566070'):
    return {"sky": "#8ec9f2", "surfaces": {"Asphalt": "#5b5e68", "Schotter": "#b8a67e", "Gras": "#5fa83e", "Weicher Sand": "#c9b48a", "Nasser Sand": "#a8946c", "Kopfstein": "#7d776e"},
            "tree": "#2f6a2a", "treeTop": "#8fcf5a", "rock": rock, "post": "#f2f2f2", "star": "#ffe135", "gate": "#e8e8f0"}

# Zeitkonten je Auto (tools/budgets.test.ts): überschreiben das Budget aus der Streckenlänge
import json, os
BUDGETS_ALL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'levels', 'budgets.json')))   # Zeitkonten je Strecke+Auto (Quelle: BUDGETS=1 WRITE=1 npx vitest run tools/budgets.test.ts)
CAR_BUDGET = BUDGETS_ALL

def level(id_, name, seed, pts, river_over=None, smooth=None, **kw):
    rv = {"points": RIVER, "width": WIDTH, "level": LEVEL, "flat": 30, "rise": 0.33, "cap": 110}
    if river_over: rv.update(river_over)
    d = {"id": id_, "name": name, "world": "rhein", "seed": seed, "palette": pal(), "fog": {"color": "#bcdcf5", "near": 80, "far": 380},
         "time": {"budget": CAR_BUDGET.get(id_, kw.pop('budget')), "starBonus": 4}, "chassis": {"setup": "standard"},
         "terrain": {"n": 201, "cell": 5, "amp": 7, "wavelength": 110, "roadAmp": 1.0, "intro": 60, "smooth": smooth or SMOOTH},
         "river": rv, "road": {"width": 8.5, "surface": "Asphalt", "verge": "Gras", "points": [[round(x, 1), round(z, 1)] for x, z in pts]},
         "zones": kw.pop('zones', []), "objects": kw.pop('objects')}
    d.update(kw)
    return d

def route_len(pts):
    return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))

def put(d):
    with open(os.path.join(OUT, d['id'] + '.json'), 'w') as f: json.dump(d, f, separators=(',', ':'), ensure_ascii=False)
    L = route_len(d['road']['points']); print(d['id'], round(L), 'm', len(d['road']['points']), 'Punkte')

# ── 1 Weinberg (5. Kehre + Weingut-Durchfahrt in Kopfstein) ──
def level1():
    R = 24; pts = [(-330, -56), (-290, -62)]   # Zufahrt vom Westen auf Ufer-Schelf-Höhe
    z = -62; east = True; x_l, x_r = -300, -85
    lanes = 5; shift = 32; RW = 12
    gut = None   # (Index des ersten Punkts, Index des letzten Punkts) der Weingut-Durchfahrt
    for k in range(lanes):
        xa, xb = (x_l + R, x_r - R) if east else (x_r - R, x_l + R)
        if k == 2:
            # Weingut: gerade bis zum Hof, enger 90°-Knick nach oben, kurz am Hof entlang, 90°-Knick zurück
            xm = (xa + xb) / 2 - 30
            pts += [(xa, z), (xm - RW - 12, z)]
            gut = [len(pts) - 1]
            pts += arc(xm - RW, z - RW, RW, math.pi / 2, 0, 4)[1:]
            pts += [(xm, z - shift + RW)]
            pts += arc(xm + RW, z - shift + RW, RW, math.pi, 3 * math.pi / 2, 4)
            gut.append(len(pts) - 1)
            pts += [(xm + RW + 14, z - shift), (xb, z - shift)]
        else:
            pts += [(xa, z), ((xa + xb) / 2, z - shift / 2), (xb, z - shift)]
        z -= shift
        if k < lanes - 1:
            sgn = 1 if east else -1
            c = (xb, z - R)
            for i in range(1, 8):
                a = math.pi / 2 - sgn * math.pi * i / 8
                pts.append((c[0] + R * math.cos(a), c[1] + R * math.sin(a)))
            z = c[1] - R
            east = not east
    # 5. Kehre am oberen Ende und kurzes Stück zurück nach Westen zum Ziel
    c = (xb, z - R)
    for i in range(1, 8):
        a = math.pi / 2 - math.pi * i / 8
        pts.append((c[0] + R * math.cos(a), c[1] + R * math.sin(a)))
    z = c[1] - R
    pts += [(xb - 15, z + 2), (xb - 2 * 15, z - 4)]
    # Länge s des Hofs (gleiche Spline wie im Spiel)
    dense = catmull([list(p) for p in pts]); cum = [0]
    for i in range(1, len(dense)): cum.append(cum[-1] + math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]))
    def s_of(pt):
        j = min(range(len(dense)), key=lambda i: math.hypot(dense[i][0] - pt[0], dense[i][1] - pt[1])); return cum[j]
    L = cum[-1]
    s0, s1 = (s_of(pts[gut[0]]), s_of(pts[gut[1]])) if gut else (0, 0)
    print('Weingut s', round(s0), round(s1), 'Länge', round(L))
    objs = {"stars": stars_along(L, 65), "posts": {"every": 35, "from": 30, "lateral": 5.9},
            "trees": {"count": 520, "near": 7, "far": 70, "kind": "mixed"}, "rocks": {"count": 60},
            "vines": {"rects": [[-310, -100, -20, -330]], "spacing": 3.4, "yaw": 2},
            "castles": [{"x": -150, "z": -340, "yaw": 0.3, "s": 1.0}]}
    d = level('weinberg', 'Weinberg', 4101, pts, budget=int(L / 12.5), objects=objs, smooth=150,
              zones=[{"surface": "Kopfstein", "s": [round(s0) - 4, round(s1) + 4]}] if gut else [])
    d['v'] = 3   # Bestzeit verfällt
    d['traffic'] = {"density": 3, "oncoming": 0, "speeds": [9, 14]}
    return d

# ── 2 Uferstraße: Schelf am Nordufer, dann über die Rheinbrücke ──
def level2():
    pts = []
    # entlang des Nordufers (Abstand ~66 m zur Mittellinie, mit Schwung), von West nach Ost
    for x in range(-470, -100, 30):
        zr = min(RD, key=lambda p: abs(p[0] - x))[1]
        pts.append((x, zr - 72 + 7 * math.sin(x / 38.0) + 4 * math.sin(x / 17.0)))
    # Schräge Querung (gerade Sehne, ~38° zum Fluss): erst Bogen vom Ufer weg, dann 190 m Brücke
    pts += [(-100, -27), (-60, -24), (-22, -15)]
    x0, z0, x1, z1 = -22, -15, 141, 111
    n = 8
    pts += [(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n) for i in range(1, n + 1)]
    pts += [(172, 124), (210, 130)]
    # Südufer: nach Osten, kurvig
    for k, x in enumerate(range(240, 520, 30)):
        zr = min(RD, key=lambda p: abs(p[0] - x))[1]
        pts.append((x, zr + 66 + 7 * math.sin(x / 33.0)))
    L = route_len(pts)
    # Überquerungs-Stelle: Punkt der gleichen Spline-Kurve wie im Spiel mit minimalem Flussabstand (Bogenlänge s)
    dense = catmull([list(p) for p in pts]); best = (1e9, 0); cum = 0
    for i in range(1, len(dense)):
        cum += math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1])
        dd = river_dist(dense[i][0], dense[i][1], RD)
        if dd < best[0]: best = (dd, cum)
    L = cum
    print('Querung bei s ~', round(best[1]), 'Abstand', round(best[0]), 'Länge', round(L))
    objs = {"stars": stars_along(L, 85), "posts": {"every": 40, "from": 30, "lateral": 5.9},
            "trees": {"count": 420, "near": 7, "far": 60, "kind": "mixed"}, "rocks": {"count": 70},
            "vines": {"rects": [[-420, -250, -120, -110]], "spacing": 3.4, "yaw": 3},
            "castles": [{"x": -250, "z": -200, "yaw": 0.5, "s": 1.1}]}
    zones = [{"surface": "Kopfstein", "s": [round(L * 0.52 + 190), round(L * 0.52 + 420)]}]
    d = level('uferstrasse', 'Uferstraße', 4202, pts, budget=int(L / 13.5), objects=objs, zones=zones)
    d['bridge'] = {"s": round(best[1]), "len": 190, "canal": WIDTH, "rise": 6, "arch": True}
    return d

# ── 3 Loreley-Plateau: steile Serpentinen, dann Kante des Plateaus ──
def level3():
    R = 24; z = -62; east = True; x_l, x_r = -330, -60; lanes = 5; shift = 40
    pts = [(-380, -58)]
    for k in range(lanes):
        xa, xb = (x_l + R, x_r - R) if east else (x_r - R, x_l + R)
        pts += [(xa, z), ((xa + xb) / 2, z - shift / 2), (xb, z - shift)]
        z -= shift
        if k < lanes - 1:
            sgn = 1 if east else -1; c = (xb, z - R)
            for i in range(1, 8):
                a = math.pi / 2 - sgn * math.pi * i / 8
                pts.append((c[0] + R * math.cos(a), c[1] + R * math.sin(a)))
            z = c[1] - R; east = not east
    # Plateau-Kante: nach Osten entlang der Klippe, Schleife um die Ruine
    x0 = pts[-1][0]
    pts += [(x0 + 60, z - 20), (x0 + 130, z - 50), (x0 + 200, z - 40), (x0 + 270, z - 10), (x0 + 330, z + 30), (x0 + 380, z + 0), (x0 + 420, z - 50), (x0 + 380, z - 100), (x0 + 300, z - 110)]
    L = route_len(pts)
    objs = {"stars": stars_along(L, 95), "posts": {"every": 35, "from": 30, "lateral": 5.9},
            "trees": {"count": 360, "near": 8, "far": 70, "kind": "mixed"}, "rocks": {"count": 110},
            "vines": {"rects": [[-380, -90, -40, -300]], "spacing": 3.4, "yaw": 2},
            "castles": [{"x": x0 + 330, "z": z + 90, "yaw": -0.4, "s": 1.3}]}
    zones = [{"surface": "Schotter", "s": [round(L * 0.68), round(L * 0.9)]}]
    return level('loreley', 'Loreley-Plateau', 4303, pts, river_over={"rise": 0.5, "cap": 70}, budget=int(L / 12), objects=objs, zones=zones, smooth=150)

import sys
want = sys.argv[1:] or ['weinberg', 'uferstrasse', 'loreley']   # Achtung: ohne Argument überschreibt das auch Sterne/Version der anderen
for name, f in (('weinberg', level1), ('uferstrasse', level2), ('loreley', level3)):
    if name in want: put(f())
