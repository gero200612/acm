// Corre el banco de pruebas del Laboratorio desde la terminal (el mismo que el botón del panel), sin tocar ninguna base:
//   node tools/banco.mjs        → imprime cada caso; sale con código 1 si alguno falla
import { DatabaseSync } from 'node:sqlite';
import { initTrace } from '../trace.js';
import { initKnowledge } from '../knowledge.js';
import { runBanco } from '../banco.js';
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY)');
initTrace(db); initKnowledge(db);
const t0 = Date.now();
const r = await runBanco();
let group = '';
for (const s of db.prepare("SELECT label, status, ms, detail FROM run_steps WHERE kind = 'caso' ORDER BY id").all()) {
  const [g, ...rest] = s.label.split(' · ');
  if (g !== group) { group = g; console.log(`\n${g}`); }
  console.log(`  ${s.status === 'ok' ? '✓' : '✗'} ${rest.join(' · ')} (${s.ms} ms)${s.detail ? `\n      ${s.detail}` : ''}`);
}
console.log(`\n${r.ok}/${r.total} casos en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(r.ok === r.total ? 0 : 1);
