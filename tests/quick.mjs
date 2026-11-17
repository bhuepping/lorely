// Schnelle Stufe (~2 min): Logik ohne lange Bot-Läufe, Build, Browser-Kern (eine Strecke je Welt, Touch-Gas) und Layout 412x915 + 360x740.
// Smoke und Layout laufen gleichzeitig auf getrennten Ports. Volle Suite: `npm test`.
import { spawn } from 'node:child_process';
const run = (name, cmd, args, env = {}) => new Promise((res) => {
  const t0 = Date.now(), p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => res({ name, code, out, s: ((Date.now() - t0) / 1000).toFixed(0) }));
});
const T0 = Date.now(), results = [];
const step = async (r) => { const x = await r; results.push(x); console.log(`${x.code ? 'FAIL' : 'ok  '} ${x.name} ${x.s} s`); if (x.code) { console.log(x.out.split('\n').slice(-40).join('\n')); process.exit(1); } return x; };
await step(run('vitest', 'npx', ['vitest', 'run']));
await step(run('build', 'npm', ['run', 'build', '--silent']));
const [a, b] = await Promise.all([
  run('smoke kern+touch', 'node', ['tests/smoke.mjs'], { ONLY: process.env.ONLY || 'kern,touch', PORT: '4173' }),
  run('layout 412x915 + 360x740', 'node', ['tests/layout.mjs'], { VP: '412x915,360x740', PORT: '4174' }),
]);
for (const x of [a, b]) { results.push(x); console.log(`${x.code ? 'FAIL' : 'ok  '} ${x.name} ${x.s} s`); if (x.code) console.log(x.out.split('\n').slice(-40).join('\n')); }
console.log(`quick gesamt ${((Date.now() - T0) / 1000).toFixed(0)} s`);
process.exit(a.code || b.code ? 1 : 0);
