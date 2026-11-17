#!/usr/bin/env python3
"""Draufsicht des Vorstadt-Netzes (PNG, Ausrichtung wie die Skizze: Norden oben): Strassen (Breite massstaeblich), Kreuzungsflaechen,
Rennstrecke (rot, Pfeile), Start/Ziel, Au + Bruecken. Aufruf: python3 tools/vorstadt_plan.py out.png"""
import json, math, os, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

d = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'src', 'levels', 'etappe_vorstadt.json')))
net = d['net']; nodes = {n['id']: n for n in net['nodes']}
fig, ax = plt.subplots(figsize=(11, 9), dpi=110)
ax.set_facecolor('#e9e6cf')
SURF = {'Asphalt': '#55565c', 'Schotter': '#b89a64', 'Matsch': '#6a4a2e'}
def line(pts, w, col, z=2, **kw):
    ax.plot([p[0] for p in pts], [p[1] for p in pts], color=col, lw=w * 72 / 25.4 / 1000 * 0 + w * (ax.figure.dpi / 110) * 0, **kw) if False else None
# Breite in Datenmetern -> Punkte: Achsenmassstab nach dem Zeichnen setzen
ax.set_aspect('equal'); ax.invert_yaxis()
xs = [p[0] for e in net['edges'] for p in e['pts']]; zs = [p[1] for e in net['edges'] for p in e['pts']]
ax.set_xlim(min(xs) - 20, max(xs) + 20); ax.set_ylim(max(zs) + 20, min(zs) - 20)
fig.canvas.draw()
pt_per_m = ax.get_window_extent().width / (ax.get_xlim()[1] - ax.get_xlim()[0]) * 72 / fig.dpi
for e in net['edges']:
    zones = {}
    ax.plot([p[0] for p in e['pts']], [p[1] for p in e['pts']], color=SURF[e['surf']], lw=e['w'] * pt_per_m, solid_capstyle='butt', zorder=2)
    for z0, z1, sf in e.get('zones', []):
        if sf != 'Matsch' and sf != 'Holz': continue
        acc = 0; seg = []
        for i, p in enumerate(e['pts']):
            if i: acc += math.hypot(p[0] - e['pts'][i - 1][0], p[1] - e['pts'][i - 1][1])
            if z0 <= acc <= z1: seg.append(p)
        if len(seg) > 1: ax.plot([p[0] for p in seg], [p[1] for p in seg], color='#6a4a2e' if sf == 'Matsch' else '#8a6a44', lw=e['w'] * pt_per_m, solid_capstyle='butt', zorder=3)
deg = {}
for e in net['edges']:
    for n in (e['a'], e['b']): deg.setdefault(n, []).append(e)
for n, es in deg.items():
    if len(es) < 3: continue
    if nodes[n].get('signal'): ax.plot(nodes[n]['x'], nodes[n]['z'], 'o', color='#ffb41a', ms=7, zorder=6)
    else: ax.plot(nodes[n]['x'], nodes[n]['z'], 's', color='#ffffff', ms=3, zorder=6)
au = d['river']['points']; ax.plot([p[0] for p in au], [p[1] for p in au], color='#3f8fd8', lw=d['river']['width'] * pt_per_m, zorder=1, alpha=.9)
for b in d['bridges']:
    e = next(e for e in net['edges'] if e['id'] == b['edge']); acc = 0; seg = []
    for i, p in enumerate(e['pts']):
        if i: acc += math.hypot(p[0] - e['pts'][i - 1][0], p[1] - e['pts'][i - 1][1])
        if abs(acc - b['s']) <= b['len'] / 2: seg.append(p)
    ax.plot([p[0] for p in seg], [p[1] for p in seg], color='#8c8c94', lw=e['w'] * pt_per_m, solid_capstyle='butt', zorder=4)
r = d['road']['points']
ax.plot([p[0] for p in r], [p[1] for p in r], color='#e03030', lw=2.2, zorder=7)
for i in range(8, len(r) - 3, 14):
    a, b = r[i], r[i + 2]; ax.annotate('', xy=b, xytext=a, arrowprops=dict(arrowstyle='-|>', color='#e03030', lw=1.4), zorder=8)
ax.plot(*r[0], 's', color='black', ms=9, zorder=9); ax.annotate('Start/Ziel', r[0], xytext=(8, 14), textcoords='offset points', fontsize=9, weight='bold', zorder=9)
ax.set_title('Vorstadt: Strassennetz + Rundkurs (Norden oben, 1 Kaestchen = 50 m)', fontsize=10)
ax.grid(True, color='#00000022'); ax.set_xticks(range(-500, 501, 50)); ax.set_yticks(range(-500, 501, 50)); ax.tick_params(labelsize=6)
fig.tight_layout(); fig.savefig(sys.argv[1] if len(sys.argv) > 1 else 'plan.png')
