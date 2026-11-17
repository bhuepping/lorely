#!/usr/bin/env python3
"""Level-Definitionen (Aufruf: python3 tools/gen_p_levels.py <id> [check]; PLOT_DIR=… für PNG). Siehe gen_p.py."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_p import *
import gen_p

def neonallee(only):
    d = load('neonallee'); d['v'] = 2
    p = Path(-300, 540, -90)
    p.go(280, 'br')                                   # Boulevard mit Kanalbrücke (schnell)
    p.turn(90, 18).go(90)                             # Ecke rechts
    p.turn(-90, 18).go(70).turn(-90, 18).go(110)      # Kehrenpaar (U-Wende im Raster)
    p.turn(90, 18).go(50).turn(90, 18).go(150)        # Doppel-Ecke, schneller Abschnitt
    p.turn(40, 45).turn(-80, 45).turn(40, 45).go(70)  # S-Schikane
    p.turn(90, 18).go(120)
    p.turn(-90, 18).go(70).turn(-90, 18).go(80)       # Zick-Zack nach Norden
    p.turn(90, 18).go(70).turn(90, 18).go(90)
    br = dict(s=p.mid('br'), len=56, canal=30, rise=1.6, reachL=70, reachR=70)
    d['bridge'] = br
    write(d, p.pts, 'neonallee', only, stars=130, bridge=br, minsep=70)

def hochhausring(only):
    d = load('hochhausring'); d['v'] = 2
    p = Path(-500, 560, -90)
    p.go(260, 'br')                                   # Auffahrt mit Kanalbrücke
    p.turn(30, 45).turn(-60, 45).turn(30, 45).go(70)   # Schikane hinter der Brücke
    p.turn(40, 60).turn(-80, 60).turn(40, 60).go(60)  # Schikane vor der Ecke
    p.turn(90, 90).go(30)
    for k in range(6): p.turn(50 if k % 2 == 0 else -50, 50)   # Slalom zwischen den Türmen
    p.go(70).turn(180, 36)                            # Kehre
    p.go(140).turn(-90, 22).go(90).turn(-90, 22)     # Zickzack zurück nach Osten
    p.go(120).turn(60, 100).turn(-60, 100)            # weicher Schwung
    p.go(60).turn(90, 20).go(80).turn(-90, 20).go(60)
    br = dict(s=p.mid('br'), len=56, canal=30, rise=1.6, reachL=70, reachR=70)
    d['bridge'] = br
    d['zones'] = [dict(surface='Nasser Asphalt', s=[round(p.len - 1000), round(p.len - 250)])]
    write(d, p.pts, 'hochhausring', only, stars=130, bridge=br, minsep=70)

def etappe_stadt(only):
    d = load('etappe_stadt'); d['v'] = 2
    R = 26
    p = Path(-560, 600, -90)
    p.go(560, 'j1')                                   # Sprunghügel auf der Westachse
    p.turn(90, R).go(230, 'br')                       # Kanalbrücke nach Osten
    p.turn(40, 50).turn(-80, 50).turn(40, 50).go(50)  # S-Schikane
    p.turn(90, R).go(90).turn(-90, R).go(120).turn(90, R).go(90)   # Treppe nach Südosten
    p.turn(-90, R).go(200, 'x1')                      # Bahnübergang
    p.turn(90, R).go(110).turn(90, R).go(300, 'wet')  # Kehre, nasser Abschnitt zurück nach Westen
    p.turn(-90, R).go(60).turn(-90, R).go(70).turn(90, R).go(80).turn(90, R).go(150)
    br = dict(s=p.mid('br'), len=56, canal=30, rise=1.6, reachL=70, reachR=70)
    d['bridge'] = br
    j = p.tags['j1'][0]; x = p.tags['x1']; w = p.tags['wet']
    d['jumps'] = [dict(up=30, down=40, h=1.8, s=round(j + 180), shape='ramp'), dict(up=30, down=40, h=1.8, s=round(j + 420), shape='ramp')]
    d['movers'] = [dict(kind='crossing', s=round((x[0] + x[1]) / 2), period=24, phase=14)]
    d['zones'] = [dict(surface='Nasser Asphalt', s=[round(w[0] - 150), round(w[1] + 150)])]
    write(d, p.pts, 'etappe_stadt', only, stars=130, bridge=br, minsep=70, half=800)

def promenade(only):
    d = load('promenade'); d['v'] = 2
    p = Path(-190, 570, -90)
    p.go(50)
    p.turn(-40, 100).turn(40, 100).go(50).turn(40, 100).turn(-40, 100).go(40)   # Schwung entlang der Brandung
    p.turn(-90, 24).go(72).turn(-90, 24)                                          # Kehre am Pier-Kopf
    p.go(50).turn(35, 90).turn(-35, 90).go(40).turn(-35, 90).turn(35, 90).go(30)
    p.turn(90, 24).go(72).turn(90, 24)                                            # zweite Kehre
    p.go(40).turn(-40, 80).turn(80, 80).turn(-40, 80).go(30)                     # Schikane um die Palmeninsel
    p.go(160, 'hill')
    d['jumps'] = [dict(s=round(p.len - 80), up=26, down=30, h=1.4, shape='hill')]
    write(d, p.pts, 'promenade', only, stars=95, minsep=70, half=640)

def translate(p, tag, target):
    """ganzen Pfad so verschieben, dass die Mitte der Gerade `tag` auf `target` (x,z) liegt"""
    m = p.mid(tag); c = cumlen(p.pts); i = min(range(len(c)), key=lambda k: abs(c[k] - m)); dx, dz = target[0] - p.pts[i][0], target[1] - p.pts[i][1]
    p.pts = [(x + dx, z + dz) for x, z in p.pts]

def uferstrasse(only):
    """v3: bleibt auf dem Nordufer (keine Rheinbrücke – die gehört der Etappe und dem Kölner Ufer): Ortsdurchfahrt, Kehren am Hang, Tunnel, Bahnübergang"""
    d = load('uferstrasse'); d['v'] = 3
    d.pop('bridge', None); d.pop('jumps', None)
    p = Path(-445, -90, 0)
    p.go(30).turn(-25, 90).turn(25, 90).go(10)                                   # am Ufer entlang
    p.go(20).turn(-90, 22).go(40).turn(90, 22).go(40).turn(90, 22).go(40).turn(-90, 22).go(20, 'dorf')   # Ortsdurchfahrt: enge Ecken
    p.turn(-90, 34).go(110).turn(180, 34).go(70).turn(-180, 34).go(100)          # Kehren am Hang
    kehre = p.len
    p.turn(90, 30).go(20)
    p.go(140, 'tun')                                                              # Tunnel durch den Fels
    p.turn(30, 60).turn(-60, 60).turn(30, 60).go(10)
    p.go(110, 'x1')                                                               # Bahnübergang
    p.go(10)
    dorf = p.tags['dorf']; tun = p.tags['tun']; x = p.tags['x1']
    d['zones'] = [dict(surface='Kopfstein', s=[round(dorf[0] - 200), round(dorf[1] + 100)])]
    d['tunnels'] = [dict(s0=round(tun[0] + 20), s1=round(tun[0] + 120), height=15)]
    d['movers'] = [dict(kind='crossing', s=round((x[0] + x[1]) / 2), period=26, phase=15)]
    cs = place_castle(p.pts, kehre - 60)
    d['objects']['castles'] = [dict(x=round(cs[0]), z=round(cs[1]), yaw=0.5, s=1.1)] if cs else []
    write(d, p.pts, 'uferstrasse', only, stars=95, river=d['river'], rignore=None, half=500, minsep=60)

def kehrenhang(only):
    d = load('kuppenstrecke'); d.update(id='kehrenhang', name='Kehrenhang', seed=2201, v=1)
    d['terrain'] = dict(n=281, cell=5, amp=18, wavelength=200, roadAmp=1.0, intro=150, smooth=36)
    d['terrain'].pop('lakes', None)
    p = Path(-560, 280, -45)
    p.go(40)
    for k in range(4): p.turn(180 if k % 2 == 0 else -180, 30).go(100 if k < 3 else 50, 'leg%d' % k)   # Kehren-Folge den Hang hinauf (diagonal)
    p.turn(60, 70).turn(-60, 70).go(30)
    p.turn(50, 90).turn(-50, 90).go(30).turn(-50, 90).turn(50, 90)                     # Kamm: schnelle S-Kurven
    ice = p.len; p.go(90)
    p.turn(-90, 34).go(40).turn(90, 34).go(30)                                          # Abfahrt: Doppelknick
    d['zones'] = [dict(surface='Eis', s=[round(ice), round(ice + 90)])]
    write(d, p.pts, 'kehrenhang', only, stars=85, minsep=60, half=700)

def kreiselviertel(only):
    d = load('hochhausring'); d.update(id='kreiselviertel', name='Kreiselviertel', seed=311, v=1)
    d.pop('bridge', None); d['zones'] = []
    p = Path(-570, 330, 0)
    isl = []
    p.go(120).turn(40, 50).turn(-80, 50).turn(40, 50).go(110)                     # Reihe 1 mit Schikane
    isl.append(p.center(45, -1)); p.turn(-180, 45)                                # Kreisel 1 (Halbkreis um die Insel)
    p.go(100).turn(-30, 40).turn(60, 40).turn(-30, 40).go(100)                   # Reihe 2
    isl.append(p.center(45, 1)); p.turn(180, 45)                                  # Kreisel 2
    p.go(180).turn(-40, 50).turn(80, 50).turn(-40, 50).go(60)                     # Reihe 3
    isl.append(p.center(45, -1)); p.turn(-180, 45)                                # Kreisel 3
    p.go(200)
    d['city']['fixed'] = [dict(x=round(x, 1), z=round(z, 1), hx=20, hz=20, h=7, yaw=0.4) for x, z in isl]
    write(d, p.pts, 'kreiselviertel', only, stars=110, minsep=62, half=640, extra=[(x, z, 20) for x, z in isl])

def muschelweg(only):
    d = load('duenenpfad'); d.update(id='muschelweg', name='Muschelweg', seed=531, v=1)
    p = Path(60, 580, -90)
    p.go(250, 'in')                                                   # Anfahrt mit Sandhügel
    for k, r in enumerate((210, 140, 88, 52)): p.turn(180, r)    # Spirale nach innen
    d['jumps'] = [dict(s=round(p.tags['in'][0] + 150), up=26, down=30, h=1.4, shape='hill')]
    L = p.len
    d['zones'] = [dict(surface='Weicher Sand', s=[300, 520]), dict(surface='Holz', s=[620, 860]), dict(surface='Weicher Sand', s=[960, 1150]), dict(surface='Holz', s=[1250, 1450])]
    write(d, p.pts, 'muschelweg', only, stars=100, minsep=60, half=640)

def burgweg(only):
    d = load('weinberg'); d.update(id='burgweg', name='Burgweg', seed=611, v=1)
    p = Path(-440, -120, 0)
    p.go(40).turn(-30, 70).turn(30, 70).go(30).turn(30, 70).turn(-30, 70).go(40)    # am Ufer entlang
    p.turn(-90, 30).go(40)
    p.turn(90, 30).go(130).turn(-180, 30).go(130).turn(180, 30).go(110).turn(-90, 30).go(30)   # Kehren zur Burg
    p.turn(90, 30).go(40).turn(90, 30).go(60)                                          # Burgtor
    p.turn(-40, 80).turn(80, 80).turn(-40, 80).go(70)
    p.go(140, 'tun')
    p.go(40)
    pts = p.pts; cut = next(i for i in range(len(pts)) if cumlen(pts)[i] > 1000 and pts[i][1] > -110); p.pts = pts[:cut + 1]
    tun = p.tags['tun']; d['tunnels'] = [dict(s0=round(tun[0] + 20), s1=round(tun[0] + 110), height=15)] if cumlen(p.pts)[-1] > tun[0] + 125 else []
    cs = place_castle(p.pts, 900, half=500)
    d['objects']['castles'] = [dict(x=round(cs[0]), z=round(cs[1]), yaw=0.4, s=1.1)] if cs else []
    write(d, p.pts, 'burgweg', only, stars=95, river=d['river'], rignore=None, half=500, minsep=60)

def koelner_ufer(only):
    """BBd v2: Deutzer Ufer-Zickzack (zwei Kehren) vor Bahnübergang + Brücke, dahinter längere Altstadtgassen zum Dom. Lädt das vorhandene JSON (Stadt/Fluss/Dom bleiben)."""
    d = load('koelner_ufer'); d['v'] = 2
    p = Path(0, 0, -90)
    p.go(60).turn(-30, 90).turn(60, 90).turn(-30, 90).go(30)                   # Rheinboulevard (Deutz) mit Schwüngen
    p.turn(-90, ZK_R).go(ZK_L, 'z1').turn(90, ZK_R).go(14).turn(90, ZK_R).go(ZK_L, 'z2').turn(-90, ZK_R)   # Ufer-Zickzack: zwei Kehren
    p.go(40)
    p.turn(-90, 26).go(130, 'x1')                                              # Bahnübergang vor der Brücke
    p.go(300, 'br')                                                            # Hohenzollern-artige Brücke, 3 Bögen
    br = p.mid('br')
    p.turn(90, 24).go(AG[0], 'g1')                                             # Altstadtgassen: enge 90°-Ecken in Kopfstein
    p.turn(-90, 24).go(AG[1]).turn(90, 24).go(AG[2], 'g2')
    p.turn(-90, 24).go(AG[3]).turn(-90, 24).go(AG[4]).turn(90, 24).go(AG[5], 'ziel')
    translate(p, 'br', (105, -120))
    d['bridge']['s'] = round(br)
    a = p.tags['br']; d['zones'] = [dict(surface='Kopfstein', s=[round(a[1]), round(p.len)])]
    x = p.tags['x1']; d['movers'] = [dict(kind='crossing', s=round((x[0] + x[1]) / 2), period=26, phase=15)]
    z1, z2 = p.tags['z1'], p.tags['z2']
    d['town']['streets'] = [[round(z1[0] - 20), round(z2[1] + 20)], [round(x[0] + 32), round(x[1] + 44)], [round(a[1] + 40), round(p.len)]]
    d['town']['churches'] = [[round(a[1] + 82), 1], [round(a[1] + 257), -1], [round(x[1] + 100), 1], [round(z1[0] + ZK_L / 2), -1]]
    end = p.pts[-1]; dom = d['landmarks'][0]; DS = dom['s']
    dom.update(x=round(end[0] - 60 - 45 * DS), z=round(end[1]))
    cs, sn = math.cos(dom['yaw']), math.sin(dom['yaw'])
    print('  Dom x', dom['x'], 'Ende', [round(v) for v in end])
    for lx, lz, hx, hz in [(0, 8, 14, 38), (0, 18, 21, 8), (0, -34, 21, 11), (0, 58, 9, 8)]:   # Abstand Straße <-> Dom-Grundfläche
        wx, wz = dom['x'] + cs * lx + sn * lz, dom['z'] - sn * lx + cs * lz
        for q in p.pts:
            dx, dz = q[0] - wx, q[1] - wz; u = dx * cs - dz * sn; v = dx * sn + dz * cs
            gap = math.hypot(max(0, abs(u - 0) - hx), max(0, abs(v) - hz))
            if gap < 30: print('  ! Dom zu nah an der Straße', round(gap)); break
    rv = d['river']
    write(d, p.pts, 'koelner_ufer', only, stars=90, river=rv, rignore=(a[0] - 60, a[1] + 70), half=500, minsep=60, extra=[(dom['x'], dom['z'], 50)])

ZK_R, ZK_L = 26, 90
AG = [60, 20, 70, 20, 30, 40]

def wasserlinie(only):
    """BBd v2 Brandung: Küstenfahrt, Felsriff mit zwei Haarnadeln, Priel mit Holzsteg, Holzpromenade, Furt, Dünenkuppe mit Schanze (Küste bleibt nah)"""
    d = load('wasserlinie'); d['v'] = 2
    d['objects']['rocks'] = dict(count=32)                         # Felsriff: mehr Felsen
    p = Path(-60, 560, -90)
    p.go(80)                                                       # Start: man schaut die Küste entlang
    p.turn(-20, 200).turn(20, 200)                                 # Schwung an der Wasserlinie
    p.go(90, 'sand1')                                              # Weichsand am Spülsaum
    R, W = 31, WL_W
    xs, zs = p.x, p.z
    p.turn(-90, R).go(W, 'r1').turn(180, R, 'h1').go(W + 10, 'r2').turn(-180, R, 'h2').go(W, 'r3').turn(90, R)   # Felsriff: zwei Haarnadeln
    # Felsriff: Mauern zwischen den Beinen (vom Meer bis in die Kehre), Westmauer und Nordmauer (weit nach Westen, mit Lücke an der Zufahrt) – der Umweg außen ist länger als das Becken
    z1 = zs - R; z2 = z1 - 2 * R; z3 = z2 - 2 * R; xa = xs - R - W            # Beine bei z1 (Mitte der ersten Kehre), z2, z3; xa = Westende von Bein 1
    zm1, zm2 = z1 - R, z1 - 3 * R                                               # Mauern zwischen den Beinen (Mitte)
    zso = z3 - 2 * R; ex = xa + 10 - R                                          # Südmauer; x der Ausfahrt (Bein 3 endet bei xa+10, dann Viertelkreis R nach Norden)
    xw = xa - R - 30; zn = zs + 22; ent = xs                                    # Westmauer, Nordmauer, Zufahrt-x
    sea = -2; xn = xw - WL_NW                                                   # Ostende der Mauern (am Wasser), Westende der Nordmauer
    d['objects']['reef'] = [
        [[sea, zm1], [xa - 12, zm1]],                                          # Mauer 1 zwischen Bein 1 und 2
        [[xs - R + 20, zm2], [xw, zm2]],                                       # Mauer 2 zwischen Bein 2 und 3 (beginnt in der zweiten Kehre)
        [[xw, zn], [xw, zm2]],                                                 # Westmauer
        [[xn, zn], [ent - 13, zn]], [[ent + 13, zn], [sea, zn]],               # Nordmauer mit Lücke an der Zufahrt
        [[ex + 17, zso], [sea, zso]],                                          # Südmauer bis zur Lücke an der Ausfahrt
    ]
    p.turn(50, 110).turn(-50, 110)                                 # zurück zur Küste
    p.go(90, 'br')                                                 # Priel mit Holzsteg
    p.go(70, 'holz')                                               # Holzpromenade
    p.turn(-25, 130).turn(25, 130)
    p.go(20).go(50, 'ford')                                        # Wasserdurchfahrt
    p.go(45, 'sand2')                                              # Weichsand hinter der Furt
    p.go(60, 'hill').go(40)                                        # Dünenkuppe mit Schanze, Ziel
    br = dict(s=round(p.mid('br')), len=60, canal=20, rise=0.6, wood=True, reachL=70, reachR=40)
    d['bridge'] = br
    z = lambda t, a=0, b=0: [round(p.tags[t][0] + a), round(p.tags[t][1] + b)]
    d['zones'] = [dict(surface='Weicher Sand', s=z('sand1', -10, 20)), dict(surface='Holz', s=z('holz', -20, 20)), dict(surface='Weicher Sand', s=z('sand2', 0, 10))]
    f = p.tags['ford']; d['fords'] = [dict(s0=round(f[0] + 8), s1=round(f[0] + 40))]
    h = p.tags['hill']; d['jumps'] = [dict(s=round(h[0] + 40), up=26, down=30, h=1.4, shape='hill')]
    write(d, p.pts, 'wasserlinie', only, stars=95, bridge=br, minsep=60, half=640)

WL_W = 75
WL_NW = int(os.environ.get('WL_NW', 100))

def waldweg(only):
    """BBc v2: Waldweg mit Auftakt, Weitschwung, Kehrenpaar auf der Lichtung, Holzbrücke, Tiefschnee-Spur, Zielhang mit Kuppen"""
    d = load('waldweg'); d['v'] = 2
    d['terrain'].update(n=361, cell=3, intro=200)
    p = Path(-330, 440, -90)
    p.go(110)                                              # Auftakt: man schaut den Weg entlang
    p.turn(30, 90).turn(-30, 90).go(20)                    # Weitschwung durch die Tannen
    p.turn(90, 60).go(70, 'k0')                           # Einbiegen zur Lichtung
    p.turn(-180, 38).go(30).turn(180, 38).go(20, 'k1')     # Kehrenpaar auf der Lichtung
    p.go(90, 'br')                                        # Holzbrücke über den Bach
    p.turn(-40, 100).turn(40, 100).go(10)
    p.go(50, 'deep')                                       # Tiefschnee-Spur
    p.turn(-60, 60).turn(60, 60).go(10)                    # Schwung nach der Spur
    p.go(70, 'hill')                                       # Zielhang
    p.go(10)
    br = dict(s=round(p.mid('br')), len=44, canal=14, rise=0.8, wood=True, reachL=40, reachR=40)
    d['bridge'] = br
    a = p.tags['deep']; d['zones'] = [dict(surface='Tiefschnee', s=[round(a[0]), round(a[1])])]
    h = p.tags['hill']
    d['jumps'] = [dict(s=round(h[0] - 10), up=16, down=18, h=1.6, shape='hill'), dict(s=round(h[0] + 45), up=16, down=18, h=1.6, shape='hill')]
    write(d, p.pts, 'waldweg', only, stars=65, bridge=br, half=540, minsep=60)

def kuppenstrecke(only):
    """BBc v2: Kuppen mit Anlauf, Kuppenkette (3 Hügel), Eisfleck in der Mulde, Kehrenfolge und Gipfelkehre"""
    d = load('kuppenstrecke'); d['v'] = 2
    d['terrain'].update(n=361, cell=3, intro=160, smooth=16)
    p = Path(330, 440, -90)
    p.go(110)
    p.turn(-30, 90).turn(30, 90).go(10)
    p.go(90, 'ch')                                        # Kuppenkette: 3 Hügel in 150 m
    p.go(60, 'ice')                                        # Mulde mit Eisfleck
    p.turn(-90, 45).go(30, 'k0')
    p.turn(180, 34).go(20).turn(-180, 34).go(10)           # zwei Kehren am Hang
    p.turn(90, 50).go(30)
    p.turn(-90, 38).go(40, 'top')
    p.turn(180, 28).go(30)                                 # Gipfelkehre
    c = p.tags['ch']; i = p.tags['ice']
    d['jumps'] = [dict(s=round(c[0] + 10 + 50 * k), up=24, down=26, h=1.7, shape='hill') for k in range(3)]
    d['zones'] = [dict(surface='Eis', s=[round(i[0] + 8), round(i[1] - 4)])]
    write(d, p.pts, 'kuppenstrecke', only, stars=65, half=540, minsep=60)

def see(only):
    """BBc v2: Eissee – Querung hin, Uferkehre, zweite Querung zurück, Tannen-Slalom ins Ziel"""
    d = load('see'); d['v'] = 2
    p = Path(40, 262, -90)
    p.go(30)
    p.turn(-20, 120).turn(20, 120)                         # Anlauf zur Eisfläche
    p.go(p.z - 88)                                         # bis zum Ufer
    p.go(205, 'x1')                                        # erste Querung (Eis) bis hinter das Nordufer
    p.turn(-180, 38, 'ufer')                               # Uferkehre
    p.go(20)
    p.go(195, 'x2')                                        # zweite Querung zurück
    p.turn(90, 60)                                         # Ausfahrt am Südufer nach Westen
    p.go(20)
    p.turn(-45, 50).turn(45, 50).turn(45, 50)                 # Tannen-Slalom
    p.go(20)
    write(d, p.pts, 'see', only, stars=65, half=361, minsep=60)

if __name__ == '__main__':
    name = sys.argv[1]; only = len(sys.argv) > 2 and sys.argv[2] == 'check'
    globals()[name](only)
