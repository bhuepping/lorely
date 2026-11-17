#!/usr/bin/env python3
# Sterne: hier nur lat 0 (Platzhalter) – danach IMMER `LINES=1 WRITE=1 npx vitest run tools/lines.test.ts` (setzt sie auf die Ideallinie, src/ideal.ts)
"""Strecken per Turtle erzeugen (Gerade / Kurve / Kreis) und in src/levels/*.json schreiben.
Aufruf: python3 tools/gen_p.py <level> [plot]   (plot = nur prüfen + PNG in $PLOT_DIR, nichts schreiben)
Prüft: Rand, Selbstabstand, engster Radius, Kanal der Brücke frei. Zeitkonto steht in BUDGET (per tools/calibrate.test.ts eintragen)."""
import json, math, os, sys
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'levels')
load = lambda n: json.load(open(os.path.join(D, n + '.json')))
import json, os
BUDGETS_ALL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'levels', 'budgets.json')))   # Zeitkonten je Strecke+Auto (Quelle: BUDGETS=1 WRITE=1 npx vitest run tools/budgets.test.ts)
BUDGET = BUDGETS_ALL

class Path:
    """x/z wie im Spiel (z nach unten). deg>0 = rechts abbiegen (phi wächst). phi=-90: Richtung -z (nach oben)."""
    def __init__(s, x, z, deg): s.x, s.z, s.phi = x, z, math.radians(deg); s.pts = [(x, z)]; s.len = 0.0; s.tags = {}
    def go(s, L, tag=None, step=14):
        n = max(1, math.ceil(L / step)); s0 = s.len
        for i in range(n):
            s.x += math.cos(s.phi) * L / n; s.z += math.sin(s.phi) * L / n; s.pts.append((s.x, s.z))
        s.len += L
        if tag: s.tags[tag] = (s0, s.len)
        return s
    def turn(s, deg, r, tag=None):
        a = math.radians(deg); sg = 1 if deg > 0 else -1; s0 = s.len
        cx, cz = s.x + sg * r * -math.sin(s.phi), s.z + sg * r * math.cos(s.phi)
        n = max(2, math.ceil(abs(deg) / 10), math.ceil(abs(a) * r / 7)); p0 = s.phi
        for i in range(1, n + 1):
            ph = p0 + a * i / n
            s.pts.append((cx - sg * r * -math.sin(ph), cz - sg * r * math.cos(ph)))
        s.phi = p0 + a; s.x, s.z = s.pts[-1]; s.len += abs(a) * r
        if tag: s.tags[tag] = (s0, s.len)
        return s
    def center(s, r, sg=1): return (s.x + sg * r * -math.sin(s.phi), s.z + sg * r * math.cos(s.phi))
    def mid(s, tag): a, b = s.tags[tag]; return (a + b) / 2
    def at(s, tag): a, b = s.tags[tag]; return a
    def here(s): return (s.x, s.z, math.degrees(s.phi))

def cumlen(pts):
    c = [0.0]
    for i in range(1, len(pts)): c.append(c[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return c

def check(pts, half, minsep=60, bridge=None, width=10, name='', river=None, rignore=None):
    """Meldungen (leer = ok) + Kennzahlen"""
    c = cumlen(pts); L = c[-1]; msg = []
    for i, (x, z) in enumerate(pts):
        if abs(x) > half - 50 or abs(z) > half - 50: msg.append(f'Rand bei s={c[i]:.0f}'); break
    worst = (1e9, 0, 0)
    for i in range(0, len(pts), 2):
        for j in range(i + 1, len(pts), 2):
            if c[j] - c[i] < 150: continue
            d = math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
            if d < worst[0]: worst = (d, c[i], c[j])
    if worst[0] < minsep: msg.append(f'Selbstabstand {worst[0]:.0f} m bei s={worst[1]:.0f}/{worst[2]:.0f}')
    rmin = 1e9
    for i in range(3, len(pts) - 3):
        a, b, d = pts[i - 3], pts[i], pts[i + 3]
        ab, bd, ad = math.dist(a, b), math.dist(b, d), math.dist(a, d)
        ar = abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]))
        if ar > 1e-6: rmin = min(rmin, ab * bd * ad / (2 * ar))
    if bridge:   # Kanal-Rechteck (quer zur Strecke ±canal/2+10, seitlich ±reach): keine andere Straße darin
        s = bridge['s']; i = min(range(len(c)), key=lambda k: abs(c[k] - s)); px, pz = pts[i]; j = min(i + 1, len(pts) - 1); k = max(i - 1, 0)
        tx, tz = pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]; tl = math.hypot(tx, tz); tx, tz = tx / tl, tz / tl
        for m, (x, z) in enumerate(pts):
            if abs(c[m] - s) < bridge['len'] / 2 + 60: continue
            al = (x - px) * tx + (z - pz) * tz; la = (x - px) * tz - (z - pz) * tx
            if abs(al) < bridge['canal'] / 2 + 14 + width and -bridge.get('reachR', 150) - width < la < bridge.get('reachL', 150) + width: msg.append(f'Kanal frei? s={c[m]:.0f}'); break
    if river:   # Abstand zur Flussmittellinie (Kontrollpunkte als Linienzug), außer an der Brücke
        rp = river['points']; rw = river['width'] / 2 + 22; dmin = 1e9
        for m, (x, z) in enumerate(pts):
            if rignore and rignore[0] <= c[m] <= rignore[1]: continue
            for q in range(len(rp) - 1):
                ax, az = rp[q]; bx, bz = rp[q + 1]; ex, ez = bx - ax, bz - az; u = max(0, min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)))
                dmin = min(dmin, math.hypot(x - ax - ex * u, z - az - ez * u))
        if dmin < rw: msg.append(f'Fluss zu nah: {dmin:.0f} m < {rw:.0f}')
    # Kurven
    yaw = [math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) for i in range(len(pts) - 1)]
    tot = 0; big = 0; cur = 0
    for i in range(1, len(yaw)):
        d = (yaw[i] - yaw[i - 1] + math.pi) % (2 * math.pi) - math.pi; tot += abs(d)
        if cur and (d * cur < 0 or abs(d) < 0.002):
            if abs(cur) > 0.78: big += 1
            cur = 0
        if abs(d) >= 0.002: cur += d
    if abs(cur) > 0.78: big += 1
    info = f'{name}: {L:.0f} m, {math.degrees(tot) / L * 100:.0f} deg/100m, >45deg: {big}, rmin {rmin:.0f} m, Selbstabstand {worst[0]:.0f} m'
    return msg, info

def plot(pts, path, bridge=None, half=640, extra=(), river=None):
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(7, 7)); ax.plot([p[0] for p in pts], [p[1] for p in pts], '-', lw=1.5)
    ax.plot(*pts[0], 'go'); ax.plot(*pts[-1], 'ro')
    c = cumlen(pts)
    for s in range(0, int(c[-1]), 200):
        i = min(range(len(c)), key=lambda k: abs(c[k] - s)); ax.annotate(str(s), pts[i], fontsize=7)
    if bridge:
        i = min(range(len(c)), key=lambda k: abs(c[k] - bridge['s'])); ax.plot(*pts[i], 'ms', ms=8)
    if river: ax.plot([q[0] for q in river['points']], [q[1] for q in river['points']], 'c-', lw=river['width'] / 3.5, alpha=.4)
    for e in extra: ax.add_patch(plt.Circle((e[0], e[1]), e[2], color='gray', alpha=.5))
    ax.set_xlim(-half, half); ax.set_ylim(half, -half); ax.set_aspect('equal'); ax.grid(alpha=.3); fig.savefig(path, dpi=80); plt.close(fig)

def place_castle(pts, s, half=500, clear=38):
    """Burgruine abseits der Strecke bei s: Seite/Abstand so, dass keine Straße näher als `clear` m liegt (None = nichts gefunden)"""
    c = cumlen(pts); i = min(range(len(c)), key=lambda k: abs(c[k] - s)); a, b = pts[max(0, i - 2)], pts[min(len(pts) - 1, i + 2)]
    tx, tz = b[0] - a[0], b[1] - a[1]; tl = math.hypot(tx, tz); tx, tz = tx / tl, tz / tl
    for dist in (45, 55, 70, 90):
        for sg in (1, -1):
            x, z = pts[i][0] - tz * sg * dist, pts[i][1] + tx * sg * dist
            if abs(x) < half - 40 and abs(z) < half - 40 and min(math.hypot(x - q[0], z - q[1]) for q in pts) > clear: return x, z
    return None

def stars_along(L, step, lats=(0, 0, 0), first=60, end=140):
    return [[round(first + i * step), lats[i % 3]] for i in range(int((L - end) / step))]

def write(d, pts, name, plot_only=False, stars=95, bridge=None, half=640, minsep=60, extra=(), river=None, rignore=None, **kw):
    pts = [[round(x, 1), round(z, 1)] for x, z in pts]
    msg, info = check(pts, half, minsep, bridge if not river else None, d['road']['width'], name, river, rignore); print(info)
    for m in msg: print('  !', m)
    pd = os.environ.get('PLOT_DIR')
    if pd: plot(pts, os.path.join(pd, name + '.png'), bridge, half, extra, river)
    if msg or plot_only: return
    L = cumlen(pts)[-1]
    d['road']['points'] = pts; d['objects']['stars'] = stars_along(L, stars)
    if name in BUDGET: d['time']['budget'] = BUDGET[name]
    with open(os.path.join(D, name + '.json'), 'w') as f: json.dump(d, f, separators=(',', ':'), ensure_ascii=False)
    print('geschrieben', name)
