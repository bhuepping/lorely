// Spiel: Schleife (120-Hz-Physik, entkoppelt gerendert), Kamera, Oberfläche. Kennt kein piGallery.
import * as THREE from 'three';
import './style.css';
import { DT } from './physics/vehicle';
import { CARS } from './physics/params';
import { GameAudio } from './audio';
import { Controls } from './input';
import { sigPhase } from './suburb';
import { el, store, fmtClock } from './dom';
import { pxSet } from './pixel';
import { type Mode } from './run';
import { Minimap, mapExtent, photoSize } from './minimap';
import { capturePhoto, mapPhotoState, type MapExt } from './mapphoto';
import { recordResult } from './save';
import { buildMenu } from './menu';
import { installCarIcons } from './caricons';
import { dbg } from './debuglog';
import { WORLDS, type LevelEntry } from './levels';
import { t, lang, onLang } from './i18n';
import { buildHud } from './hud';
import { buildSession, disposeSession, CD_GO, type Session } from './session';
import { onBack } from './native';

/** Größe eines UI-Pixels (CSS px): nur von der kürzeren Viewportseite abhängig */
export const uiUnit = (root: HTMLElement) => Math.max(2, Math.round(Math.min(root.clientWidth, root.clientHeight) / 240));

export function mountGame(root: HTMLElement): void {
  root.classList.add('rs-root', 'in-menu');
  document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');   // kein Pinch-Zoom während des Spiels (Touch-Abbrüche)
  const canvas = el('canvas', 'rs-canvas', root);

  const hud = buildHud(root, { onFsLeave: () => setPaused(true) });
  const { langFns, fpsEl, goalBox, cpEl, gasFill, lights, endBox, finBox, pauseBox, coarse, bPause, bReset, bL, bR, bHb, bBrk, bGas, bResume, bRestart, bToMenu, bRes, resIc, bTilt, bSnd, sndIc, bCrane } = hud;
  onLang(() => { langFns.forEach((f) => f()); mapTips?.(); }); langFns.forEach((f) => f());
  const controls = new Controls();
  controls.bindButton(bL, 'left'); controls.bindButton(bR, 'right');
  controls.bindButton(bGas, 'gas'); controls.bindButton(bBrk, 'brake'); controls.bindButton(bHb, 'hand');
  if (!(window as any).DeviceMotionEvent) bTilt.style.display = 'none';
  bTilt.onclick = async () => {
    const on = await controls.setTilt(!controls.tiltOn);
    bTilt.classList.toggle('on', on); bL.classList.toggle('hidden', on); bR.classList.toggle('hidden', on);
  };

  const audio = new GameAudio();
  const showSnd = () => { pxSet(sndIc, audio.enabled ? '{snd}' : '{mute}', '#ffffff', false); };
  audio.onChange = showSnd; showSnd();
  bSnd.onclick = () => audio.setEnabled(!audio.enabled);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  installCarIcons(renderer);   // Auto-Symbole aus den 3D-Modellen (vor dem Menü)
  const camera = new THREE.PerspectiveCamera(62, 1.6, 0.3, 320);

  // ── Auflösung: intern klein, per CSS hochskaliert (pixelated) ──
  let scale = Number(store.get('rs-scale')) || 0;
  const autoScale = () => Math.max(1, Math.round(root.clientWidth / 640));
  let refitEnd: (() => void) | null = null;
  const resize = () => {
    const s = scale || autoScale();
    const w = Math.max(64, Math.floor(root.clientWidth / s)), h = Math.max(48, Math.floor(root.clientHeight / s));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    pxSet(resIc, '{grid}' + s, '#ffffff', false);
    root.style.setProperty('--u', uiUnit(root) + 'px'); root.style.setProperty('--ok', String(uiUnit(root) < 3 ? 1.5 : 1));   // Symbole im Pause-Menü: Zellen 3 px   // UI-Pixel nur vom Gerät/Viewport, nicht vom ▦-Faktor
    refitEnd?.();
  };
  bRes.onclick = () => { const s = (scale || autoScale()) % 4 + 1; scale = s; store.set('rs-scale', String(s)); resize(); };
  new ResizeObserver(resize).observe(root);
  resize();

  // ── Sitzung: eine Fahrt auf einem Level ──
  let S: Session | null = null;
  let mode: Mode = store.get('rs-mode') === 'stars' ? 'stars' : 'time';
  let carId = (store.get('rs-car') ?? '') in CARS ? store.get('rs-car')! : 'hatch';
  const menu = buildMenu(root, { mode, onMode: (m) => { mode = m; store.set('rs-mode', m); }, onStart: (lv, m, c) => start(lv, m, c), onWorld: (w) => pinAttract(w), car: carId, onCar: (c) => { carId = c; store.set('rs-car', c); } });

  // ── Titel: Kameraflug über echte Strecken, wechselnd zwischen den Welten (nichts wird gefahren) ──
  let A: Session | null = null, attractT = 0, attractN = 0, attractS = 0, attractBlack = 0, attractPin: string | null = null;
  const fade = el('div', 'rs-fade'); root.insertBefore(fade, menu.el);
  const ATTRACT_SECS = 15, ATTRACT_V = 26;
  const attractLevels = () => WORLDS.filter((w) => w.id !== 'offroad');
  const startAttract = () => {
    if (A) { disposeSession(A); A = null; }
    const ws = attractLevels(), pin = attractPin ? WORLDS.find((x) => x.id === attractPin) : null;
    const w = pin ?? ws[attractN % ws.length], lv = pin ? pin.levels[attractN % pin.levels.length] : w.levels[Math.floor(attractN / ws.length) % w.levels.length];
    attractN++;
    A = buildSession(lv, 'stars', carId, audio, camera);
    A.carMesh.root.visible = false;
    const br = A.course.bridge;
    attractS = br ? Math.max(20, br.s0 - 110) : 40 + (attractN * 97) % 200;
    attractT = 0;
    fade.classList.remove('on');
  };
  /** Welt gewählt: Titel-Hintergrund blendet (Fade) zu dieser Welt um; der Wechsel zwischen den Welten pausiert */
  const pinAttract = (worldId: string) => { if (attractPin === worldId) return; attractPin = worldId; attractN = 0; attractT = ATTRACT_SECS + 1; };
  const stopAttract = () => { if (A) { disposeSession(A); A = null; } fade.classList.remove('on'); };
  const attractFrame = (now: number, dt: number) => {
    if (!A) startAttract();
    const a = A!, c = a.course, r = c.route;
    attractT += dt;
    if (attractT > ATTRACT_SECS && !attractBlack) { fade.classList.add('on'); attractBlack = now + 700; }
    if (attractBlack && now > attractBlack) { attractBlack = 0; startAttract(); return; }
    const s = Math.min(r.length - 60, attractS + attractT * ATTRACT_V);
    const q = r.at(Math.min(r.length, s + 38));
    const lat = Math.sin(attractT * 0.35) * 7, [cx, cz] = r.offset(s, lat);
    const ground = c.terrain.height(cx, cz);
    camera.position.set(cx, ground + 3.2 + 1.8 * (1 + Math.sin(attractT * 0.5)), cz);
    camera.lookAt(q.x, c.terrain.height(q.x, q.z) + 1.2, q.z);
    if (camera.fov !== 70) { camera.fov = 70; camera.updateProjectionMatrix(); }
    a.beach?.update(now / 1000, camera.position); a.bridgeMesh?.update(now / 1000); a.riverMesh?.update(now / 1000);
    a.sky.position.copy(camera.position);
    renderer.render(a.scene, camera);
  };
  refitEnd = () => { if (S && !endBox.classList.contains('hidden')) showEnd(S); };   // Endkarte bei neuer Fenstergröße neu einpassen
  (window as any).__rsAttract = () => A?.course.id ?? null;
  (window as any).__rsAttractWorld = () => A?.course.world ?? null;
  // ── Pause: friert Physik, Uhr, Ton und Kamera ein; beim Fortsetzen kein Zeitsprung, gedrückte Eingaben werden losgelassen ──
  let paused = false;
  let mini: Minimap | null = null;
  let mapTips: (() => void) | null = null;   // nur für die aktuelle Karte, sonst hielte jede alte Karte ihre Strecke fest
  const MAP_PHOTO = store.get('rs-mapphoto') === null ? -1 : Number(store.get('rs-mapphoto'));   // Kantenlänge des Kartenfotos in px (0 = kein Foto, gezeichneter Plan; Messschalter; ohne Wert: 1024, große Welten 2048)
  // Karte wächst in der Ecke, das Spiel läuft weiter (kein Pausieren)
  const openMap = () => { if (!mini || !S || S.run.over || paused || mini.isOpen) return; mini.open(); dbg.ev('karte auf'); };
  const closeMap = () => { if (!mini?.isOpen) return; mini.close(); const k = mini.cost; dbg.ev('karte zu', `${k.n} Bilder, Ø ${(k.ms / Math.max(1, k.n)).toFixed(1)} ms, max ${k.max.toFixed(1)} ms`); };
  const setPaused = (on: boolean) => {
    if (on === paused || (on && (!S || S.run.over))) return;
    if (on) closeMap();
    paused = on; pauseBox.classList.toggle('hidden', !on); bPause.classList.toggle('on', on);
    dbg.ev(on ? 'pause' : 'weiter');
    controls.releaseAll();
    if (on) audio.setLive(false); else { audio.setLive(true); acc = 0; last = performance.now(); }
  };
  (window as any).__rsPaused = () => paused;
  (window as any).__rsMem = () => ({ ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0, heap: (performance as any).memory?.usedJSHeapSize ?? 0 });   // Leck-Messung tools/leak.mjs
  (window as any).__rsDbgText = () => dbg.text();   // nur lokal lesbar (Tests); gesendet wird nie etwas
  bPause.onclick = () => setPaused(!paused); bResume.onclick = () => setPaused(false);
  bRestart.onclick = () => { if (!S) return; const s0 = S; paused = false; pauseBox.classList.add('hidden'); bPause.classList.remove('on'); start(s0.entry, s0.run.mode, s0.carId); };
  bToMenu.onclick = () => showMenu();
  // Tastatur: Pause ↑↓/←→ + Enter, Endkarte ←→ + Enter (Esc = Menü); Rahmen (.kf) nur nach Tastenbenutzung sichtbar
  let pi = 0;
  const kfSet = (bs: HTMLElement[], i: number) => bs.forEach((b, j) => b.classList.toggle('kf', j === i));
  const pbtns = () => [bResume, bRestart, bToMenu];
  new MutationObserver(() => { if (!pauseBox.classList.contains('hidden')) { pi = 0; kfSet(pbtns(), 0); } }).observe(pauseBox, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || !S) return;
    const c = e.code, step = c === 'ArrowDown' || c === 'ArrowRight' || c === 'KeyS' || c === 'KeyD' ? 1 : c === 'ArrowUp' || c === 'ArrowLeft' || c === 'KeyW' || c === 'KeyA' ? -1 : 0;
    const act = c === 'Enter' || c === 'NumpadEnter' || c === 'Space';
    const endBs = () => [...endBox.querySelectorAll<HTMLElement>('button')];
    if (paused) {
      if (step) { pi = Math.min(2, Math.max(0, pi + step)); kfSet(pbtns(), pi); }
      else if (act && !e.repeat) { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); pbtns()[pi].click(); }
    } else if (!endBox.classList.contains('hidden')) {
      const bs = endBs();
      if (step) { pi = Math.min(bs.length - 1, Math.max(0, (pi || 0) + step)); kfSet(bs, pi); }
      else if (act && !e.repeat) { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); (bs[pi] ?? bs[0]).click(); }
      else if (c === 'Escape' && !e.repeat) showMenu();
      return;
    }
    if (!e.repeat && (c === 'KeyP' || c === 'Escape')) { if (mini?.isOpen) closeMap(); else setPaused(!paused); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
  // Android-Zurücktaste: Endkarte → Menü, Karte zu, Pause → weiter, Rennen → Pause, Menü → App beenden
  onBack(() => {
    if (root.classList.contains('in-menu')) return false;
    if (!endBox.classList.contains('hidden')) showMenu();
    else if (mini?.isOpen) closeMap();
    else setPaused(!paused);
    return true;
  });
  const showMenu = () => {
    paused = false; pauseBox.classList.add('hidden'); bPause.classList.remove('on');
    mini?.destroy(); mini = null; mapTips = null;
    audio.setLive(false);
    if (S) { disposeSession(S); S = null; }
    endBox.classList.add('hidden');
    dbg.ev('menue'); dbg.end();
    root.classList.add('in-menu'); menu.show();
    attractBlack = 0; startAttract();
  };


  const start = (entry: LevelEntry, m: Mode, cid: string) => {
    if (S) disposeSession(S);
    stopAttract();
    paused = false; pauseBox.classList.add('hidden'); bPause.classList.remove('on');
    const sess = buildSession(entry, m, cid, audio, camera), { course } = sess;
    audio.setLive(true);
    S = sess;
    mini?.destroy();
    mini = new Minimap(root, course, sess.run, null);
    { const m = mini; m.box.onclick = () => openMap(); m.big.onclick = () => closeMap(); }
    // Foto von oben einmal, kurz nach dem Start (zwei Frames später, damit die Ladezeit gleich bleibt; Software-GL: ~1 s Ruckler, Grafikchip: Millisekunden); bis dahin gezeichneter Plan. Kosten in window.__rsMap
    { const g = sess, m = mini, size = MAP_PHOTO < 0 ? photoSize(mapExtent(course).span) : MAP_PHOTO; (window as any).__rsMap = { ms: 0, size, ok: false };
      const shot = (ext: MapExt, sz: number) => capturePhoto(renderer, g.scene, ext, sz, [g.sky, g.carMesh.root, g.fx.points, g.rain?.mesh, g.moverMesh?.group, g.trafficMesh?.group, g.ar?.mesh, g.starMesh.mesh, g.cpMesh?.mesh, ...(g.beach?.photoHide ?? [])], store.get('rs-maptint') === '0' ? undefined : { length: course.route.length, half: course.roadWidth / 2, offset: (s, l) => course.route.offset(s, l) });   // rs-maptint=0: Messschalter ohne Tönung
      if (size > 0) {
        mapTips = () => { m.tips = { near: t('mapNear'), far: t('mapFar') }; m.zoom.title = m.isNear ? m.tips.far : m.tips.near; }; mapTips();
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
          if (S !== g || mini !== m) return;
          const t0 = performance.now(), photo = shot(mapExtent(course), size);
          (window as any).__rsMap = { ms: Math.round(performance.now() - t0), size, ok: !!photo, span: Math.round(mapExtent(course).span), roadW: course.roadWidth, ...mapPhotoState, photo };
          if (photo) m.setPhoto(photo);
        }, 0)));
      }
    }
    controls.onReset = () => {
      controls.resetGas();   // Kran: kein Restgas ins Auto
      if (!S || S.run.over) return;   // nach Ende (Zeit/Ziel) kein Kran, auch nicht per R oder Randschutz
      const pen = S.run.penalize(); if (pen) hud.flashPlus(pen, '#ff4a5a');
      if (dbg.on) { dbg.ev('kran', `${pen ? '+' + pen + ' s ' : ''}bei ${S.car.pos[0].toFixed(0)},${S.car.pos[2].toFixed(0)} ${Math.round(S.car.speed * 3.6)} km/h`); dbg.teleported(); }
      if (S.run.over) return;   // die Strafzeit hat die Uhr auf 0 gebracht: Ende, kein Umsetzen mehr   // rotes +3 an der Uhr
      const r = S.course.recoverAt ? S.course.recoverAt(S.car.pos[0], S.car.pos[2]) : S.course.recover(S.run.resetS());   // nur das Auto, ein paar Meter zurück; Pfosten bleiben, Uhr läuft weiter
      if (r) S.car.reset(r.x, r.z, r.yaw);
      else S.car.reset(S.car.pos[0], S.car.pos[2], Math.atan2(-S.car.forwardAxis()[0], -S.car.forwardAxis()[2]));
    };
    controls.onView = hud.nextView;
    bReset.onclick = () => controls.onReset();
    bCrane.onclick = () => { setPaused(false); controls.onReset(); };
    hx = -Math.sin(course.start.yaw); hz = -Math.cos(course.start.yaw); camInit = false; rv = 0; hud.resetView();
    goalBox.classList.toggle('stars', m === 'stars'); sess.starMesh.mesh.visible = m === 'stars';   // Sammeln: keine Uhr; Zeitfahren: keine Sterne auf der Strecke
    endBox.classList.add('hidden'); finBox.classList.add('hidden'); root.classList.remove('in-menu'); controls.resetGas(); menu.hide();
    if (dbg.on) dbg.begin({   // Debug-Log: Kopf; nur bei aktivem Modus
      Level: `${entry.id} (${course.world})`, Modus: m, Auto: cid,
      'Gerät': navigator.userAgent, Bildschirm: `${screen.width}x${screen.height} @${devicePixelRatio}, Fenster ${innerWidth}x${innerHeight}, Render ${canvas.width}x${canvas.height}`,
      Eingabe: (coarse ? 'Touch' : 'Tastatur') + (controls.tiltOn ? ' + Neigen' : ''), 'Sprache': lang(),
    });
    (window as any).__rennspiel = { get scene() { return S?.scene; }, get movers() { return S?.movers; }, get traffic() { return S?.traffic; }, get session() { return S; }, get car() { return S?.car; }, get props() { return S?.props; }, get carMesh() { return S?.carMesh; }, get run() { return S?.run; }, audio, camera, freeCam: false, get view() { return hud.view; }, get rv() { return rv; }, get calls() { return renderer.info.render.calls; } };
    hud.update(sess);
  };

  const showEnd = (s: Session) => hud.showEnd(s, { again: () => start(s.entry, s.run.mode, s.carId), menu: showMenu, shown: () => { pi = 0; kfSet([...endBox.querySelectorAll<HTMLElement>('button')], 0); } });

  // ── Kamera ──
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  let hx = 0, hz = -1, camInit = false;
  const _a = new THREE.Vector3();
  let rv = 0;   // rv: 0 vorwärts … 1 rückwärts (weich)
  const UP = new THREE.Vector3(0, 1, 0);
  const updateCamera = (s: Session, dt: number, px: number, py: number, pz: number) => {
    const f = s.car.forwardAxis();
    const l = Math.hypot(f[0], f[2]) || 1;
    const fs = s.car.forwardSpeed;
    rv += ((fs < (rv > 0.5 ? -0.3 : -1) ? 1 : 0) - rv) * (1 - Math.exp(-dt / 0.4));
    const k = 1 - Math.exp(-(hud.view === 1 ? 10 : 3.2) * dt);
    hx += (f[0] / l - hx) * k; hz += (f[2] / l - hz) * k;
    const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const sp = Math.min(1, s.car.speed / 40);
    let fov = 62 + 20 * sp;
    camera.up.copy(UP);
    s.carMesh.root.visible = hud.view !== 1;
    if (hud.view === 1) {   // Dach: auf Dachhöhe, schaut mit der Nase
      camPos.set(px, py + 1.35, pz); camera.position.copy(camPos); camInit = true;
      camera.lookAt(px + hx * 10, py + 1.1, pz + hz * 10);
      fov = 75;
    } else {   // Verfolger; rückwärts weich viel höher (Abstand 8, Höhe 14, Blick aufs Auto)
      const dist = (7.2 + 1.8 * sp) * (1 - rv) + 8 * rv, height = (3.3 - 1.0 * sp) * (1 - rv) + 14 * rv;
      _a.set(px - hx * dist, py + height, pz - hz * dist);
      if (!camInit) { camPos.copy(_a); camInit = true; }
      camPos.lerp(_a, 1 - Math.exp(-7 * dt));
      camPos.y = Math.max(camPos.y, s.course.terrain.height(camPos.x, camPos.z) + 0.9);
      camera.position.copy(camPos);
      look.set(px + hx * 4 * (1 - rv), py + 0.6, pz + hz * 4 * (1 - rv));
      camera.lookAt(look);
    }
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  };

  // ── Schleife ──
  let last = performance.now(), acc = 0, frames = 0, fpsT = last, hudT = 0;
  const FPS_LOW = 20;   // darunter: Debug-Ereignis „fps“
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const s = S;
    if (!s) { lights.classList.add('hidden'); attractFrame(now, dt); return; }
    if (paused) { s.sky.position.copy(camera.position); renderer.render(s.scene, camera); return; }
    acc += dt;
    if (s.cd < CD_GO + 1.2) {   // Startampel
      const before = s.cd; s.cd += dt;
      for (const k of [0, 1, CD_GO]) if (before < k && s.cd >= k) { audio.light(k === CD_GO); if (k === CD_GO) dbg.ev('gruen'); }
      hud.showLights(s.cd); s.startLight?.set(s.cd < 0 ? 0 : s.cd < 1 ? 1 : s.cd < CD_GO ? 2 : 3);
    }
    const hold = s.cd < CD_GO;
    if (!hold && !paused) s.sigT += dt;   // Signalzeit ab Start; vorher alles rot
    if (s.traffic && !s.traffic.sigClock) s.traffic.sigClock = () => s.sigT;   // Netzverkehr schaltet nach derselben Uhr wie die Lampen
    { const sg = s.course.signals, tt = s.traffic ? s.traffic.t : 0; s.startLight?.signals(sg ? (k) => sg.phaseOf(k, hold ? -1 : s.sigT) : (k) => sigPhase(tt, k)); }
    const inp = s.run.over ? (s.car.forwardSpeed > 2 ? { steer: 0, throttle: 0, brake: 0.7, handbrake: false } : { steer: 0, throttle: 0, brake: 0, handbrake: true }) :   // Ende: bremsen, im Stand/rückwärts nur Handbremse (Bremse allein schaltet unter 1 m/s in den Rückwärtsgang)
      hold ? { ...controls.read(), throttle: 0, brake: 0, handbrake: true } : controls.read();
    { const g = Math.round(controls.gasLevel * 100) + '%'; if (gasFill.style.width !== g) gasFill.style.width = g; }
    let n = 0;
    if (s.course.bridge || s.course.river || s.course.bridges.length) s.car.water = s.course.waterAt(s.car.pos[0], s.car.pos[2]);
    s.car.aid = s.aidAt(s.car.pos[0], s.car.pos[2]);
    if (s.course.fords.length || s.course.brook) s.car.shallow = s.course.shallowAt(s.car.pos[0], s.car.pos[2]);
    while (acc >= DT && n < 12) { s.movers?.step(DT); if (!hold) { const f = s.car.forwardAxis(); s.traffic?.step(DT, s.car.pos[0], s.car.pos[2], f[0], f[2]); } s.car.step(inp, DT); s.props.step(s.car, DT); s.movers?.barrierHit(s.car.pos[0], s.car.pos[2], s.car.vel[0], s.car.vel[2], s.props); s.obst.step(s.car); acc -= DT; n++; }
    if (n === 12) acc = 0;
    if (s.edge && s.edge.step(s.car, dt).fire) { controls.onReset(); camInit = false; }   // Rand der Welt: nach EDGE_WARN s außerhalb kommt der Kran (wie der Knopf)
    if (s.car.landing > 0) { if (s.car.landing > 1.5) { audio.land(s.car.landing, now); s.fx.land(s.car, s.car.landing); } s.car.landing = 0; }
    const f = acc / DT;
    const got = s.run.update(dt, s.car.pos[0], s.car.pos[2], !hold && (inp.throttle > 0 || s.car.speed > 0.5), (s.car.forwardAxis()[0]) * s.car.forwardSpeed, (s.car.forwardAxis()[2]) * s.car.forwardSpeed);
    if (dbg.on) {   // Debug: Zustand je Bild lesen, nie ändern; im Tunnel ist „unter Gelände“ normal
      const p = s.car.pos, ts = s.run.tracker.s, inTun = s.course.tunnels.some((tn) => ts > tn.s0 - 3 && ts < tn.s1 + 3);
      dbg.frame({ dt, pos: p, vel: s.car.vel, q: s.car.q, omega: s.car.omega, ground: inTun ? -1e9 : s.course.terrain.height(p[0], p[2]), kmh: Math.abs(s.car.forwardSpeed) * 3.6, gas: inp.throttle, steer: inp.steer, surf: s.car.surfaceName });
      if (got.length) dbg.ev('stern', `${s.run.stars}/${s.course.stars.length}`);
    }
    if (got.length) audio.ping(s.run.stars);
    if (s.run.over && !s.endHandled) {   // genau einmal, auch wenn der Kran-Zuschlag die Uhr beendet hat
      s.endHandled = true;
      dbg.ev('ende', `${s.run.state} ${s.run.elapsed.toFixed(1)} s, Sterne ${s.run.stars}/${s.course.stars.length}`);
      audio.setLive(false); audio.end(true);
      s.newBest = recordResult(s.course.saveKey, { won: true, mode: s.run.mode, stars: s.run.stars, car: s.carId, elapsed: s.run.elapsed }).newBest;
      s.endAt = now + (s.run.mode === 'time' ? 3200 : 1300);   // Zeitfahren: Konfetti darf ausspielen, bevor die (schwarze) Endkarte kommt
      if (s.run.mode === 'time') { hud.showFinish(s.run.elapsed); s.fx.confetti(); }
    }
    if (s.endHandled && s.endAt && now >= s.endAt) { s.endAt = 0; showEnd(s); }
    { const fa = s.car.forwardAxis(); mini?.update(s.car.pos[0], s.car.pos[2], fa[0], fa[2]); if (s.run.over && mini?.isOpen) closeMap(); }
    hud.updateNav(s, now, hx, hz);
    if (s.cpMesh) {
      const cp = s.run.cps!, n = cp.got.reduce((a, b) => a + b, 0), txt = n + '/' + cp.got.length;
      if (cpEl.dataset.t !== txt) { if (cpEl.dataset.t && n > Number(cpEl.dataset.t.split('/')[0])) { audio.cp(); dbg.ev('checkpoint', txt + ' ' + s.run.elapsed.toFixed(1) + ' s'); if (n < cp.got.length) hud.flashText(fmtClock(s.run.elapsed, true)); } pxSet(cpEl, txt, n === cp.got.length ? '#4cff6a' : '#39e6ff', false); cpEl.classList.remove('hidden'); }
      s.cpMesh.update(s.run.missed);
    }
    s.pylons.update();
    s.obst.decay(dt); s.forest?.update(s.obst);
    s.starMesh.update(now / 1000, s.run.got);
    audio.update(s.car, inp.throttle, now);
    s.carMesh.setLights(s.car.brakeOn, s.car.reverseOn);
    s.carMesh.update(s.car.prevPose, s.car.pose, f);
    const a = s.car.prevPose, b = s.car.pose;
    if (!(window as any).__rennspiel?.freeCam) updateCamera(s, dt, a.px + (b.px - a.px) * f, a.py + (b.py - a.py) * f, a.pz + (b.pz - a.pz) * f);
    s.moverMesh?.update(now / 1000); s.trafficMesh?.update();
    s.ar?.update(s.run.tracker.s, now / 1000, s.run.state === 'run');
    if (s.ford) s.ford.update(dt, s.car.pos[0], s.car.pos[1] - 0.3, s.car.pos[2], s.car.speed, s.car.shallow > 0);
    if (s.course.tunnels.length) {   // im Tunnel: dunkler, Scheinwerfer an
      const ts = s.run.tracker.s, inT = s.course.tunnels.some((t) => ts > t.s0 + 3 && ts < t.s1 - 3) ? 1 : 0;
      s.tunnelF += (inT - s.tunnelF) * (1 - Math.exp(-5 * dt));
    }
    if (s.rain) {   // Regen: Regenfahrt immer, sonst in „Nasser Asphalt“-Abschnitten; weich, nie im Tunnel; etwas dunkler + dichterer Nebel
      const ts = s.run.tracker.s, wet = s.course.rainAlways || s.course.rainS.some(([a, b]) => ts >= a && ts <= b);
      s.rain.update(dt, wet ? 1 - s.tunnelF : 0, camera, s.car.vel);
      const fg = s.scene.fog as THREE.Fog, F = s.course.fog; fg.near = F.near * (1 - 0.25 * s.rain.f); fg.far = F.far * (1 - 0.22 * s.rain.f);
    }
    { const fg = s.scene.fog as THREE.Fog, F = s.course.fog; if (!s.rain) { fg.near = F.near; fg.far = F.far; } }
    if (s.course.tunnels.length || s.rain) {
      const k = (1 - 0.62 * s.tunnelF) * (1 - 0.14 * (s.rain?.f ?? 0));
      s.hemi.intensity = s.base[0] * k; s.sunL.intensity = s.base[1] * k;
      if (s.course.tunnels.length) { const nt = s.dark || s.course.sea !== null || s.tunnelF > 0.5; s.carMesh.setNight(nt); s.trafficMesh?.setNight(nt); }
    }
    s.fx.update(dt, s.car, inp, { camera, tunnelF: s.tunnelF, live: !hold, renderer });
    s.beach?.update(now / 1000, camera.position); s.bridgeMesh?.update(now / 1000); s.riverMesh?.update(now / 1000, s.run.elapsed);
    s.sky.position.copy(camera.position);
    renderer.render(s.scene, camera);

    frames++;
    if (now - fpsT >= 500) {
      if (dbg.on) {
        const fps = Math.round(frames * 1000 / (now - fpsT)), dc = renderer.info.render.calls;
        pxSet(fpsEl, fps + ' fps ' + dc + ' dc', '#888888');
        if (fps < FPS_LOW && now - fpsT < 1500) dbg.ev('fps', `${fps} fps, ${dc} dc`);   // lange Fenster (Pause/Tab im Hintergrund) zählen nicht
      }
      frames = 0; fpsT = now;
    }
    if (now - hudT >= 100) { hudT = now; if (S) hud.update(S); }
  };
  requestAnimationFrame(loop);
}
