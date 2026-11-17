# Draufsicht für tools/detour.test.ts: python3 tools/detour_plot.py <ordner> (liest <level>.json, schreibt <level>.png)
import json, sys, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = sys.argv[1]
for lv in sys.argv[2:] or ['matschgrube', 'huegel', 'furtwald', 'steilhang', 'moorwald']:
    j = json.load(open(f'{d}/{lv}.json')); h = j['half']
    fig, ax = plt.subplots(figsize=(8, 8)); ax.contourf([[ -h+(i+.5)*2*h/100 for i in range(100)]]*100 if False else None or [(-h+(i+.5)*2*h/100) for i in range(100)], [(-h+(i+.5)*2*h/100) for i in range(100)], j['h'], 30, cmap='terrain')
    for x, z, r in j['circles']: ax.add_patch(plt.Circle((x, z), r, color='darkgreen', alpha=.7))
    for x, z, hx, hz, yaw in j['boxes']: ax.plot([x - math.sin(yaw)*hz, x + math.sin(yaw)*hz], [z - math.cos(yaw)*hz, z + math.cos(yaw)*hz], 'brown', lw=3)
    ax.plot(*zip(*j['route']), 'y-', lw=2, label='Weg')
    if j['path']: ax.plot(*zip(*j['path']), 'r-', lw=1.5, label='kürzester')
    if j['pathMud']: ax.plot(*zip(*j['pathMud']), 'm--', lw=1.2, label='mit Matsch')
    ax.plot(*j['start'], 'ko'); ax.plot(*j['goal'], 'k*', ms=14); ax.set_aspect('equal'); ax.legend(); fig.savefig(f'{d}/{lv}.png', dpi=80); plt.close(fig)
