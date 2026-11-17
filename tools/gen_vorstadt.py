#!/usr/bin/env python3
# Sterne: hier nur lat 0 (Platzhalter) – danach IMMER `LINES=1 WRITE=1 npx vitest run tools/lines.test.ts` (setzt sie auf die Ideallinie, src/ideal.ts)
"""Vorstadt: Strassennetz + Rundkurs nach einer Handskizze. Keine Kartendaten: alle Punkte sind von Hand aus der Skizze
abgemessen (Bildpunkte der Skizze, 1 Kaestchen ~ 44 px ~ 30 m), neutrale Bezeichner. Ausgabe: src/levels/etappe_vorstadt.json.
Netz (nodes/edges) ist eigenstaendig; die Rennstrecke (road.points) ist nur ein Pfad durch dieses Netz."""
import json, math, os, sys

K = 0.65                 # m je Skizzen-Bildpunkt = 100 % des Skizzenmassstabs (1 Kaestchen ~ 44 px ~ 29 m)
CX, CY = 895, 650        # Bildpunkt der Weltmitte
def W(px, py): return (round((px - CX) * K, 2), round((py - CY) * K, 2))

# ---- Knoten: Name -> (Bildpunkt x, y, Hoehe m, Ampel) ----
NODES = {
  'x_do': (380, 190, 2.0, 1), 'x_dh': (388, 322, 3.3, 0), 'x_du': (455, 1140, 4.5, 1), 'x_hs': (655, 455, 1.5, 0),
  'x_bu': (588, 1048, 1.6, 0), 'x_hu': (775, 950, 0.0, 1), 'x_su': (1010, 938, 0.0, 0), 'x_fu': (1295, 925, 0.0, 0),
  'x_ku': (1470, 905, 0.1, 0), 'x_of': (1215, 95, 0.4, 1), 'x_ok': (1540, 235, 0.5, 0), 'x_oz': (608, 207, 1.5, 0),
  'x_dz': (362, 100, 1.9, 0), 'x_ob': (1318, 90, 0.4, 0),
  # Rand der Welt (Strassen laufen bis zum Rand)
  'r_dn': (338, -160, 1.5, 0), 'r_ds': (470, 1460, 4.5, 0), 'r_ow': (85, 188, 2.2, 0), 'r_oe': (1705, 345, 0.5, 0),
  'r_uw': (85, 1355, 5.5, 0), 'r_ue': (1705, 872, 0.1, 0), 'r_hs': (836, 1460, 0.0, 0), 'r_an': (1226, -160, 0.4, 0), 'r_bn': (1340, -160, 0.4, 0),
}
# Ampeln: alle grossen Ecken (x_of ohne: nur Fussgaenger-Einmuendung); ohne Ampel nur die Einmuendungen der mittleren Schleife (quer/schl/bogen: x_dh, x_hs, x_bu, x_su), der Fusswegknoten
# x_fu und die Strasse jenseits der Au (x_ku, x_ok, x_ob). Keine Kreisverkehre.
SIGNALS = {'x_hu', 'x_du', 'x_do', 'x_oz', 'x_dz'}   # x_dz liegt nach ausserhalb des Rands (entfaellt mit dem Knoten)
# ---- Strassen: Breite m, Belag, Art, Kontrollpunkte (Namen = Knoten, sonst Bildpunkte) ----
ROADS = {
  'damm':   (16, 'Asphalt', 'damm',  ['r_dn', (352, -20), (358, 60), 'x_dz', (372, 150), 'x_do', (385, 260), 'x_dh', (392, 500), (400, 700), (425, 950), 'x_du', (462, 1300), 'r_ds']),
  'obere':  (12, 'Asphalt', 'obere', ['r_ow', (240, 190), 'x_do', (480, 198), 'x_oz', (800, 225), (930, 205), (1050, 158), (1165, 128), 'x_of', (1260, 88), 'x_ob', (1420, 115), (1510, 195), 'x_ok', (1640, 300), 'r_oe']),
  'untere': (11, 'Asphalt', 'untere', ['r_uw', 'x_du', 'x_bu', (700, 985), 'x_hu', (900, 945), 'x_su', (1100, 942), (1250, 932), 'x_fu', 'x_ku', 'r_ue']),
  'quer':   (8, 'Asphalt', 'wohn',   ['x_dh', (520, 370), 'x_hs', (705, 640), (750, 850), 'x_hu', (800, 1070), (818, 1185), (830, 1330), 'r_hs']),
  'schl':   (7, 'Asphalt', 'wohn',   ['x_hs', (690, 372), (745, 318), (810, 300), (880, 308), (925, 350), (925, 410), (888, 490), (885, 620), (930, 760), (1000, 880), 'x_su']),
  'bogen':  (6.5, 'Asphalt', 'wohn', ['x_hs', (600, 478), (548, 545), (545, 620), (578, 690), (520, 745), (492, 800), (520, 880), (560, 985), 'x_bu']),
  'fuss':   (5.5, 'Schotter', 'fuss', ['x_of', (1232, 200), (1255, 330), (1268, 470), (1278, 620), (1288, 780), 'x_fu']),
  'kupfer': (7, 'Asphalt', 'wohn',   ['x_ku', (1466, 780), (1450, 600), (1428, 450), (1430, 370), (1470, 310), (1510, 262), 'x_ok']),
  'zuf':    (7, 'Asphalt', 'wohn',   ['x_oz', (611, 140), (616, 95), (550, 94), (487, 99), (420, 100), 'x_dz']),
  'spura':  (7, 'Asphalt', 'wohn',   ['x_of', (1222, -20), 'r_an']),
  'spurb':  (7, 'Asphalt', 'wohn',   ['x_ob', (1332, 0), 'r_bn']),
}
# Hoehen (m): untere Strasse ca. 6 % bergauf zum Damm; Damm -> obere Strasse -> Au gleichmaessig fallend; Au-Niederung eben, von der Au zum Start leicht ansteigend
UNT_Y = {'x_hu': 1.8, 'x_bu': 9.2, 'x_du': 15.0}
FALL = ['x_du', 'x_dh', 'x_do', 'x_oz', 'x_of']; FALL_Y = (15.0, 0.4)
FLAT = {'x_su': 0.9, 'x_fu': 0.0, 'x_ku': 0.1}   # tiefster Punkt an der Au; Au -> Start steigt leicht an
# Fussweg: leicht tiefer, nur lange sanfte Wellen (kein Hopsen); Matsch in den Senken (Streckenmeter ab Knoten x_of)
FUSS_DIP = [0.0, -0.35, -0.7, -0.4, 0.0]   # Anteil der Laenge 0, .25, .55, .8, 1 (Abweichung von der Gerade of -> fu)
FUSS_WAVES = {'amp': 0.3, 'len': 90}
FUSS_MUD = [[85, 125], [205, 255], [330, 370]]
# die Au (gestrichelt): Fluss, kreuzt obere + untere Strasse
AU = [(1096, -73), (1090, 40), (1135, 128), (1170, 300), (1215, 480), (1240, 700), (1248, 900), (1252, 1000), (1262, 1250), (1265.5, 1373)]
BRIDGE_LEN, BRIDGE_RISE = 18, 0.0   # ebenerdig, schlicht (Fussgaengerbruecken mit Buckel/Holz:, Platz am Ufer bleibt frei)
# Rundkurs: Knotenfolge (Start/Ziel 34 m oestlich von x_hu auf der unteren Strasse)
PATH = ['x_hu', 'x_bu', 'x_du', 'x_dh', 'x_do', 'x_oz', 'x_of', 'x_fu', 'x_su', 'x_hu']
START_OFF = 34.0
# Gebuescheang rechts am Damm (Ostseite, zwischen unterer Strasse und oberer Strasse): Kanten + Hoehe (m); undurchdringlich
HILL_EDGES = ['damm.2', 'damm.3']
# Au-Abzweig: Checkpoint AU_CP m vor dem Knoten x_of, Sterne (Meter ab Knoten, seitlich; + = links) aussen-innen-aussen, Pfeil dort nach AU_ARROW s (und ab 0,45 Strassenbreiten Abstand) statt 2 s
AU_CP = 22; AU_STARS = [(-20, 2.0), (-8, 1.0), (4, -1.5), (16, 0.5)]; AU_ARROW = 0.5
# Zeitkonten: Bot x 1,45, MIT Netzverkehr (Bot 118,3 / 126,6 / 102,1 s) -> 172 / 184 / 148
import json, os
BUDGETS_ALL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'levels', 'budgets.json')))   # Zeitkonten je Strecke+Auto (Quelle: BUDGETS=1 WRITE=1 npx vitest run tools/budgets.test.ts)
BUDGET = BUDGETS_ALL['etappe_vorstadt']

def catmull(pts, step=6.0):
    """zentripetaler Catmull-Rom wie Route in level.ts; liefert dichte Punkte + Index je Kontrollpunkt"""
    P = [pts[0]] + pts + [pts[-1]]; out = []; idx = []
    kn = lambda a, b: max(1e-3, math.sqrt(math.hypot(b[0] - a[0], b[1] - a[1])))
    for i in range(len(P) - 3):
        p0, p1, p2, p3 = P[i:i + 4]
        t0 = 0; t1 = t0 + kn(p0, p1); t2 = t1 + kn(p1, p2); t3 = t2 + kn(p2, p3)
        n = max(2, math.ceil(math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step)); idx.append(len(out))
        for k in range(n):
            t = t1 + (t2 - t1) * k / n
            mix = lambda a, b, ta, tb: ((t - ta) / (tb - ta) * (b[0] - a[0]) + a[0], (t - ta) / (tb - ta) * (b[1] - a[1]) + a[1])
            a1 = mix(p0, p1, t0, t1); a2 = mix(p1, p2, t1, t2); a3 = mix(p2, p3, t2, t3)
            b1 = mix(a1, a2, t0, t2); b2 = mix(a2, a3, t1, t3); out.append(mix(b1, b2, t1, t2))
    idx.append(len(out)); out.append(pts[-1]); return out, idx

def plen(p): return sum(math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) for i in range(len(p) - 1))

# Rand der Welt: die Strassen enden 40-60 m hinter der aeussersten Kreuzung, die die Runde beruehrt (x_do, x_of, x_fu, x_du); wer dort eine Einbiegung verpasst,
# wird zurueckgesetzt, bevor die naechste Kreuzung erreichbar ist. Rechteck + vier Sperrflaechen (NW: Damm nach x_dz, NO: obere Strasse nach x_ob, SW: untere Strasse westlich x_du, S: Querstraße).
EDGE_BOX = (-384, -411, 310, 361)
EDGE_CUTS = [(-10000, -10000, -250, -354), (250, -10000, 10000, -330), (-10000, 0, -330, 10000), (-190, 280, 10000, 10000)]   # NW, NO, SW (untere Strasse westlich x_du), S (Querstraße)
def allowed(x, z):
    return EDGE_BOX[0] <= x <= EDGE_BOX[2] and EDGE_BOX[1] <= z <= EDGE_BOX[3] and not any(c[0] <= x <= c[2] and c[1] <= z <= c[3] for c in EDGE_CUTS)

def clip_edges(nodes, edges):
    """Kanten am Rand abschneiden: Endpunkt auf die Grenze legen (neuer Randknoten r_<kante>), Kanten ganz ausserhalb und verwaiste Knoten entfernen"""
    def edge_pt(a, b):    # Grenzpunkt zwischen erlaubtem a und verbotenem b (Bisektion)
        lo, hi = 0.0, 1.0
        for _ in range(30):
            m = (lo + hi) / 2
            if allowed(a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m): lo = m
            else: hi = m
        return (a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo)
    out = []
    for e in edges:
        pts = [tuple(p) for p in e['pts']]; ins = [allowed(*p) for p in pts]
        if all(ins): out.append(e); continue
        if not any(ins): continue
        if ins[0]:
            k = ins.index(False); q = edge_pt(pts[k - 1], pts[k]); pts = pts[:k] + [q]; new = ('b', q)
        elif ins[-1]:
            k = len(ins) - 1 - ins[::-1].index(False); q = edge_pt(pts[k + 1], pts[k]); pts = [q] + pts[k + 1:]; new = ('a', q)
        else: raise SystemExit(f'Kante {e["id"]} verlaesst den erlaubten Bereich und kehrt zurueck')
        nid = 'r_' + e['id']; nodes[nid] = dict(id=nid, x=round(new[1][0], 2), z=round(new[1][1], 2), y=0.0)
        e[new[0]] = nid; e['pts'] = [[round(x, 1), round(z, 1)] for x, z in pts]; out.append(e)
    used = {e['a'] for e in out} | {e['b'] for e in out}
    for n in [n for n in nodes if n not in used]: del nodes[n]
    edges[:] = out

def solve_heights(nodes, edges):
    """Hoehen: untere Strasse steigt zum Damm (UNT_Y), Damm -> obere Strasse fallen gleichmaessig bis zur Au (nach Strassenlaenge),
    Au-Niederung eben; alle uebrigen Knoten nehmen den laengengewichteten Mittelwert ihrer Nachbarn (Relaxation) -> passen sich dem Gelaende an."""
    E = {}
    for e in edges: E.setdefault(e['a'], []).append((e['b'], e['len'])); E.setdefault(e['b'], []).append((e['a'], e['len']))
    def dist(a, b):
        e = next(e for e in edges if (e['a'], e['b']) in ((a, b), (b, a))); return e['len']
    fixed = dict(UNT_Y)
    cum = 0; tot = sum(dist(a, b) for a, b in zip(FALL, FALL[1:]))
    for a, b in zip(FALL, FALL[1:]):
        fixed[a] = round(FALL_Y[0] + (FALL_Y[1] - FALL_Y[0]) * cum / tot, 2); cum += dist(a, b)
    fixed[FALL[-1]] = FALL_Y[1]
    fixed.update(FLAT)
    fixed = {k: v for k, v in fixed.items() if k in nodes}
    for k, v in fixed.items(): nodes[k]['y'] = v
    for _ in range(400):
        for k, nd in nodes.items():
            if k in fixed: continue
            w = [(nodes[o]['y'], 1 / l) for o, l in E[k]]; nd['y'] = sum(y * q for y, q in w) / sum(q for _, q in w)
    for nd in nodes.values(): nd['y'] = round(nd['y'], 2)

def build():
    nodes = {n: dict(id=n, x=W(v[0], v[1])[0], z=W(v[0], v[1])[1], y=v[2], **({'signal': True} if n in SIGNALS else {})) for n, v in NODES.items()}
    edges = []
    for rid, (w, surf, kind, ctrl) in ROADS.items():
        pts = []; names = []
        for c in ctrl:
            if isinstance(c, str): pts.append((nodes[c]['x'], nodes[c]['z'])); names.append(c)
            else: pts.append(W(*c)); names.append(None)
        dense, idx = catmull(pts)
        last = 0; lastname = names[0]; k = 0
        for i in range(1, len(ctrl)):
            if names[i] is None: continue
            seg = dense[idx[last]:idx[i] + 1]
            e = dict(id=f'{rid}.{k}', a=lastname, b=names[i], w=w, surf=surf, kind=kind, pts=[[round(x, 1), round(z, 1)] for x, z in seg])
            edges.append(e); k += 1; last = i; lastname = names[i]
    return nodes, edges

def main():
    nodes, edges = build()
    clip_edges(nodes, edges)
    E = {e['id']: e for e in edges}
    for e in edges: e['len'] = round(plen(e['pts']), 1)
    solve_heights(nodes, edges)
    # Hoehenprofile je Kante
    for e in edges:
        ya, yb = nodes[e['a']]['y'], nodes[e['b']]['y']
        e['prof'] = [[0, ya], [1, yb]]
    for e in edges:
        if e['id'] == 'quer.1': e['ped'] = [22.0]   # kleine Fussgaengerampel direkt suedlich von x_hs (Bogen/Diagonale), Bedarfsampel
    fe = next(e for e in edges if e['id'].startswith('fuss'))
    ya, yb = nodes[fe['a']]['y'], nodes[fe['b']]['y']; fe['prof'] = [[t, round(ya + (yb - ya) * t + d, 2)] for t, d in zip((0, .25, .55, .8, 1), FUSS_DIP)]; fe['waves'] = dict(FUSS_WAVES, phase=0.7)
    fe['zones'] = [[a, min(b, fe['len'] - 20), 'Matsch'] for a, b in FUSS_MUD]
    # Au: Kreuzungen mit Kanten (Naehe der Flusslinie zur Kantenpolylinie -> Brueckenmitte)
    au = [W(*p) for p in AU]; au_d, _ = catmull(au, 3.0)
    bridges = []
    for e in edges:
        if e['kind'] not in ('obere', 'untere'): continue
        best = None; s = 0
        for i, p in enumerate(e['pts']):
            if i: s += math.hypot(p[0] - e['pts'][i - 1][0], p[1] - e['pts'][i - 1][1])
            d = min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in au_d)
            if d < 4 and (best is None or d < best[0]): best = (d, s)
        if best:
            bridges.append(dict(edge=e['id'], s=round(best[1], 1), len=BRIDGE_LEN, rise=BRIDGE_RISE, canal=7, plain=True))
    # Rundkurs
    def chain(a, b):
        for e in edges:
            if e['a'] == a and e['b'] == b: return [tuple(p) for p in e['pts']]
            if e['a'] == b and e['b'] == a: return [tuple(p) for p in reversed(e['pts'])]
        raise SystemExit(f'keine Kante {a}-{b}')
    path = []
    for a, b in zip(PATH, PATH[1:]):
        c = chain(a, b)
        path += c if not path else c[1:]
    # Start 34 m oestlich von x_hu auf der unteren Strasse (Gegenrichtung der ersten Kante x_hu->x_su) ; Ziel = derselbe Punkt
    east = chain('x_hu', 'x_su'); acc = 0; P0 = east[-1]
    for i in range(1, len(east)):
        d = math.hypot(east[i][0] - east[i - 1][0], east[i][1] - east[i - 1][1])
        if acc + d >= START_OFF:
            u = (START_OFF - acc) / d; P0 = (east[i - 1][0] + (east[i][0] - east[i - 1][0]) * u, east[i - 1][1] + (east[i][1] - east[i - 1][1]) * u); iP0 = i; break
        acc += d
    head = [P0] + list(reversed(east[:iP0])) if False else None
    first = [P0] + list(reversed(east[:iP0]))               # P0 -> x_hu
    # Ende: letzte Kante x_su -> x_hu bis P0
    last_edge = chain('x_su', 'x_hu'); k = max(i for i, p in enumerate(last_edge) if math.hypot(p[0] - P0[0], p[1] - P0[1]) < 1.5 or False) if False else None
    cut = None
    for i, p in enumerate(last_edge):
        if i and math.hypot(p[0] - P0[0], p[1] - P0[1]) < 3.5 and (cut is None): cut = i
    # der letzte Pfadabschnitt: path endet bei x_hu; kappe bei der Stelle nahe P0
    nend = len(path)
    j = min(range(max(0, nend - 80), nend), key=lambda i: math.hypot(path[i][0] - P0[0], path[i][1] - P0[1]))
    # ersten Punkt von path (x_hu) ersetzen durch first
    route = first[:-1] + path[:j] + [P0]
    # Ausrundungen an Abbiegungen
    def deg(a, b): return math.degrees(math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]))
    nodepos = {n: (nodes[n]['x'], nodes[n]['z']) for n in PATH}
    out = list(route)
    for n in set(PATH):
        C = nodepos[n]
        # naechster Punkt der Route zum Knoten
        ci = min(range(len(out)), key=lambda i: math.hypot(out[i][0] - C[0], out[i][1] - C[1]))
        if math.hypot(out[ci][0] - C[0], out[ci][1] - C[1]) > 3.5 or ci < 3 or ci > len(out) - 4: continue
        def back(i, dist):
            acc = 0
            while i > 0 and acc < dist: acc += math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]); i -= 1
            return i
        def fwd(i, dist):
            acc = 0
            while i < len(out) - 1 and acc < dist: acc += math.hypot(out[i + 1][0] - out[i][0], out[i + 1][1] - out[i][1]); i += 1
            return i
        ia = back(ci, 14); ib = fwd(ci, 14)
        u = (C[0] - out[ia][0], C[1] - out[ia][1]); v = (out[ib][0] - C[0], out[ib][1] - C[1])
        ul = math.hypot(*u); vl = math.hypot(*v); u = (u[0] / ul, u[1] / ul); v = (v[0] / vl, v[1] / vl)
        ang = deg(u, v)
        if abs(ang) < 25: continue
        mw = max(e['w'] for e in edges if e['a'] == n or e['b'] == n)
        R = max(6.0, mw / 2 + 2.0)          # Kurvenradius ~ Kreuzungsflaeche
        th = math.radians(abs(ang)); t = R * math.tan(th / 2)
        ia = back(ci, t); ib = fwd(ci, t)
        P1 = (C[0] - u[0] * t, C[1] - u[1] * t); P2 = (C[0] + v[0] * t, C[1] + v[1] * t)
        sg = 1 if ang > 0 else -1
        O = (P1[0] + (-u[1]) * sg * R, P1[1] + (u[0]) * sg * R)
        a0 = math.atan2(P1[1] - O[1], P1[0] - O[0]); arc = []
        nseg = max(3, int(abs(ang) / 12))
        for q in range(nseg + 1):
            aa = a0 + sg * th * q / nseg; arc.append((O[0] + R * math.cos(aa), O[1] + R * math.sin(aa)))
        out = out[:ia] + arc + out[ib + 1:]
    # Route ausduennen (alle ~6 m)
    pts = [out[0]]
    for p in out[1:]:
        if math.hypot(p[0] - pts[-1][0], p[1] - pts[-1][1]) >= 5.5: pts.append(p)
    if math.hypot(out[-1][0] - pts[-1][0], out[-1][1] - pts[-1][1]) > 0.5: pts.append(out[-1])
    pts = [[round(x, 1), round(z, 1)] for x, z in pts]
    L = plen(pts)
    net = dict(nodes=[nodes[n] for n in nodes], edges=[{k2: v for k2, v in e.items() if k2 != 'len'} for e in edges])
    budget = BUDGET
    stars = [[round(70 + 118 * i, 0), 0] for i in range(int((L - 150) // 118))]
    # Au-Abzweig (x_of -> Fussweg): Checkpoint kurz vor dem Bogen, 4 Sterne in den Bogen hinein (aussen, innen, aussen), Pfeil dort frueh
    cum = [0.0]
    for a, b in zip(pts, pts[1:]): cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    xo = nodes['x_of']; kof = min(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - xo['x'], pts[i][1] - xo['z'])); s_of = cum[kof]
    stars = [st for st in stars if abs(st[0] - s_of) > 32] + [[round(s_of + o, 0), lat] for o, lat in AU_STARS]
    stars.sort()
    hints = {'cp': [round(s_of - AU_CP, 0)], 'arrow': [[round(s_of - 70, 0), round(s_of + 40, 0), AU_ARROW]]}
    d = dict(id='etappe_vorstadt', name='Runde', world='vorstadt', seed=4711, v=4, hints=hints,
      palette={'sky': '#3d7fd4', 'surfaces': {'Asphalt': '#4c4c52', 'Gras': '#a29a3e', 'Schotter': '#b8a47e', 'Matsch': '#6a4a2e', 'Furt': '#6b5f4a', 'Holz': '#8a6a44'}, 'tree': '#e2b02a', 'treeTop': '#f2cc4c', 'rock': '#8a7a6a', 'post': '#ff8a1a', 'star': '#ffe135', 'gate': '#f2f0e6'},
      fog={'color': '#cfd6c6', 'near': 120, 'far': 520}, time={'budget': budget, 'starBonus': 4}, chassis={'setup': 'standard'},
      terrain={'n': 193, 'cell': 5, 'amp': 1.4, 'wavelength': 240, 'roadAmp': 0, 'intro': 6, 'smooth': 50, 'base': 0, 'tilt': [-0.0038, 0.0011, 1.4]},
      road={'width': 10, 'surface': 'Asphalt', 'verge': 'Gras', 'points': pts},
      edge='respawn', edgeBox=list(EDGE_BOX), edgeCuts=[list(c) for c in EDGE_CUTS], net=net, bridges=bridges, traffic={'density': 1},
      river={'points': [[x, z] for x, z in au], 'width': 8, 'level': -2.0, 'depth': 1.6, 'bank': 1.2, 'wall': 3.0, 'rise': 0, 'flat': 8, 'boat': False},
      objects={'stars': stars, 'posts': [], 'trees': {'count': 140, 'near': 6, 'far': 90, 'kind': 'autumn'}},
      suburb={'special': [], 'rows': [], 'signals': [], 'signs': [], 'bus': [], 'cross': [], 'lit': [], 'litTrees': False, 'net': True, 'landmarks': True, 'hill': {'edges': HILL_EDGES, 'h': 6.5}})
    out_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'levels', 'etappe_vorstadt.json')
    json.dump(d, open(out_path, 'w'), separators=(',', ':'))
    print(f'Route {L:.0f} m, {len(pts)} Punkte; Netz {len(edges)} Kanten, {sum(plen(e["pts"]) for e in edges):.0f} m; Bruecken {bridges}')
main()
