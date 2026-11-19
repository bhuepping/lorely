# Auswertung zu zfight.mjs: Pixelinseln, die sich zwischen a und b (Kamera 4 mm verschoben) stark ändern, aber zwischen a und c (gleich) nicht.
import sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage
d = sys.argv[1]; thr = int(sys.argv[2]) if len(sys.argv) > 2 else 40
rows = []
for fa in sorted(glob.glob(os.path.join(d, '*-a.png'))):
    n = fa[:-6]
    a, b, c = (np.asarray(Image.open(f'{n}-{k}.png').convert('RGB')).astype(int) for k in 'abc')
    noise = np.abs(a - c).max(2) > thr
    diff = (np.abs(a - b).max(2) > thr) & ~ndimage.binary_dilation(noise, iterations=2)
    diff = ndimage.binary_opening(diff, structure=np.ones((2, 2)))   # Kanten verschieben sich nur linienhaft (1 px breit); Flimmern gibt Flecken >= 2x2
    lab, k = ndimage.label(ndimage.binary_dilation(diff, iterations=1))
    if k == 0: continue
    sizes = ndimage.sum(diff, lab, range(1, k + 1))
    big = [i + 1 for i, s in enumerate(sizes) if s >= 4]
    if not big: continue
    tot = int(sum(sizes[i - 1] for i in big))
    rows.append((tot, os.path.basename(n), len(big)))
for tot, n, k in sorted(rows, reverse=True): print(f'{tot:6d} px  {k:3d} Inseln  {n}')
print('Posen mit Flimmern:', len(rows), 'von', len(glob.glob(os.path.join(d, '*-a.png'))))
