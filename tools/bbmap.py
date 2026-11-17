#!/usr/bin/env python3
# Prüfbericht: Karte (Draufsicht + Höhenprofil) je Strecke und Kennzahlen. Aufruf: python3 tools/bbmap.py <geo.json> <ausgabe-ordner>
# geo.json kommt aus `BBDUMP=geo.json npx vitest run tools/bbdump.test.ts`
import json, math, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
g = json.load(open(sys.argv[1])); out = sys.argv[2]
COL = {'Asphalt': '#555', 'Nasser Asphalt': '#2a5d9f', 'Schotter': '#a08050', 'Schnee': '#9ac', 'Eis': '#0cf', 'Matsch': '#6b4423', 'Holz': '#c93', 'Weicher Sand': '#e8d070', 'Nasser Sand': '#b9a04a', 'Furt': '#27c', 'Kopfstein': '#999', 'Gras': '#4a4'}

def stats(v):
    P = v['pts']; n = len(P); L = v['length']
    hd = [math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]) for i in range(n - 1)]
    dh = [(hd[i + 1] - hd[i] + math.pi) % (2 * math.pi) - math.pi for i in range(n - 2)]
    tight = sum(1 for d in dh if abs(d) > 4 / 22)   # Radius < 22 m auf 4-m-Schritt
    # Kehren: zusammenhängende Kurven mit > 100° Richtungsänderung
    kehren, acc = 0, 0
    for d in dh:
        if acc * d >= 0: acc += d
        else:
            if abs(acc) > math.radians(100): kehren += 1
            acc = d
    if abs(acc) > math.radians(100): kehren += 1
    ys = [p[2] for p in P]; surf = {}
    for p in P: surf[p[3]] = surf.get(p[3], 0) + 4
    # Sterne: seitlicher Versatz zur Mitte
    lat = []
    for sx, sz in v['stars']:
        i = min(range(n), key=lambda k: (P[k][0] - sx) ** 2 + (P[k][1] - sz) ** 2)
        a = P[max(0, i - 1)]; b = P[min(n - 1, i + 1)]; dx, dz = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dz) or 1
        lat.append(((sx - P[i][0]) * dz - (sz - P[i][1]) * dx) / l)
    return dict(kehren=kehren, tight=tight, hmin=min(ys), hmax=max(ys), surf=surf, lat=lat)

res = {}
for k, v in g.items():
    st = stats(v); res[k] = st
    fig = plt.figure(figsize=(8, 6.4)); ax = fig.add_axes([0.06, 0.26, 0.9, 0.7]); ay = fig.add_axes([0.06, 0.06, 0.9, 0.14])
    P = v['pts']
    for i in range(len(P) - 1):
        ax.plot([P[i][0], P[i + 1][0]], [P[i][1], P[i + 1][1]], color=COL.get(P[i][3], '#555'), lw=3.2, solid_capstyle='round')
    for b in v['branches']:
        ax.plot([p[0] for p in b['pts']], [p[1] for p in b['pts']], color='#d60', lw=2, ls='--')
    if v['jeepLine']: ax.plot([p[0] for p in v['jeepLine']], [p[1] for p in v['jeepLine']], color='#0a0', lw=1, ls=':')
    ax.scatter([s[0] for s in v['stars']], [s[1] for s in v['stars']], marker='*', s=60, color='gold', edgecolor='k', linewidth=.4, zorder=5)
    ax.scatter([j['x'] for j in v['jumps']], [j['z'] for j in v['jumps']], marker='^', s=60, color='red', zorder=6)
    s0 = v['start']; ax.annotate('Start', (s0['x'], s0['z']), color='green', weight='bold', zorder=7, xytext=(6, 6), textcoords='offset points')
    if v['goal']: ax.annotate('Ziel', (v['goal']['x'], v['goal']['z']), color='red', weight='bold', zorder=7, xytext=(6, 6), textcoords='offset points')
    ax.set_aspect('equal'); ax.invert_yaxis(); ax.grid(alpha=.2)
    ax.set_title(f"{k} ({v['world']}) {v['length']:.0f} m, Sterne {len(v['stars'])}, Schanzen {len(v['jumps'])}, Kehren {st['kehren']}")
    ax.legend(handles=[plt.Line2D([], [], color=COL.get(n, '#555'), lw=3, label=n) for n in st['surf']] + ([plt.Line2D([], [], color='#d60', ls='--', label='Umweg')] if v['branches'] else []), fontsize=7, loc='best')
    ay.plot([i * 4 for i in range(len(P))], [p[2] for p in P], color='#333'); ay.set_ylabel('Höhe m', fontsize=7); ay.set_xlabel('Meter', fontsize=7); ay.grid(alpha=.2)
    for t in v['tunnels']: ay.axvspan(t['s0'], t['s1'], color='gray', alpha=.3)
    for t in v['fords']: ay.axvspan(t['s0'], t['s1'], color='#27c', alpha=.3)
    for j in v['jumps']: pass
    fig.savefig(f'{out}/{k}-map.png', dpi=80); plt.close(fig)
    print(f"{k:16} L{v['length']:.0f} kehren {st['kehren']} enge {st['tight']} Höhe {st['hmin']:.0f}..{st['hmax']:.0f} Furt {len(v['fords'])} Tunnel {len(v['tunnels'])} Brücke {len(v['bridges'])} Schanze {len(v['jumps'])} Beläge {st['surf']} Stern-lat min/max {min(st['lat']):.1f}/{max(st['lat']):.1f} Weite {v['width']}")
json.dump(res, open(f'{out}/stats.json', 'w'))

# optional: python3 tools/bbmap.py geo.json ordner id1,id2 -> bb-<id>.png = Karte + Startbild (tools/bbshots.mjs, <id>-start.png im selben Ordner) nebeneinander
if len(sys.argv) > 3:
    from PIL import Image
    for k in sys.argv[3].split(','):
        m = Image.open(f'{out}/{k}-map.png'); s = Image.open(f'{out}/{k}-start.png'); H = 480
        m = m.resize((int(m.width * H / m.height), H)); s = s.resize((int(s.width * H / s.height * 0.9), int(H * 0.9)))
        c = Image.new('RGB', (m.width + s.width, H), 'white'); c.paste(m, (0, 0)); c.paste(s, (m.width, (H - s.height) // 2)); c.save(f'{out}/bb-{k}.png')
