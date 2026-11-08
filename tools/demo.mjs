// Llena un proyecto con datos de demostración (cuentas, reels publicados y programados, pauta y campañas)
// y lo deja en modo demo: el programador no lo toca y no se puede publicar ni pautar desde él.
// Uso, dentro del contenedor: node tools/demo.mjs <id del proyecto>
// Se puede correr de nuevo: borra lo que dejó la vez anterior (cuentas con notas «demo», reels demo-*, campañas).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA = path.resolve(process.env.ACM_DATA || './data');
const UPLOADS = path.join(DATA, 'uploads');
const SRC = path.join(path.dirname(new URL(import.meta.url).pathname), 'demo');
const pid = Number(process.argv[2]);
const db = new DatabaseSync(path.join(DATA, 'acm.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
const get = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
if (!pid || !get('SELECT 1 FROM projects WHERE id = ?', pid)) { console.error('Pasá el id de un proyecto que exista.'); process.exit(1); }
if (!all('PRAGMA table_info(projects)').some((c) => c.name === 'demo')) { console.error('Esta versión de ACM no tiene modo demo: desplegá primero.'); process.exit(1); }

// hora argentina como texto «AAAA-MM-DD HH:MM», igual que el programador
const ar = (d) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const day = (n, hh = 19, mm = 0) => { const d = new Date(Date.now() + n * 864e5); const s = ar(d).slice(0, 10); return `${s} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
const now = ar(new Date());

db.exec('BEGIN');
try {
  // limpieza de una corrida anterior
  for (const r of all("SELECT file FROM reels WHERE project_id = ? AND original_name LIKE 'demo-%'", pid)) fs.rmSync(path.join(UPLOADS, path.basename(r.file)), { force: true });
  run("DELETE FROM reels WHERE project_id = ? AND original_name LIKE 'demo-%'", pid);
  run("DELETE FROM accounts WHERE project_id = ? AND notes = 'demo'", pid);
  run('DELETE FROM campaigns WHERE project_id = ?', pid);
  run("DELETE FROM knowledge WHERE project_id = ? AND source = 'demo'", pid);

  run(`UPDATE projects SET demo = 1, role = 'Presidente · Lista Azul', org = 'Club Atlético Ejemplo', election_date = '2026-12-13', propaganda_until = '2026-12-10',
    padron = 65000, padron_contacts = 41000, padron_phones = 38500, padron_emails = 27000, padron_file = 'padron-demo.csv', padron_at = ?,
    ads_name = 'Cuenta publicitaria demo', ads_currency = 'USD', ads_rate = 0, ads_audience_id = 'DEMO-AUD', ads_audience_count = 41000, ads_error = '', ads_at = ?,
    notes = 'Proyecto de demostración: todo lo que se ve es de muestra.' WHERE id = ?`, now, now, pid);

  const ACC = [
    ['instagram', 'lista.azul.oficial', 18400], ['instagram', 'socios.lista.azul', 6200], ['instagram', 'juventud.azul', 3900], ['instagram', 'azul.filiales', 2100],
    ['tiktok', 'listaazul', 25100], ['tiktok', 'azul.jovenes', 8800],
    ['facebook', 'Lista Azul', 12000], ['facebook', 'Socios con la Azul', 4300],
    ['youtube', 'Lista Azul TV', 2300],
  ];
  const acc = ACC.map(([network, handle, followers]) => Number(run(`INSERT INTO accounts (project_id, network, handle, status, followers, connected_as, last_checked_at, notes)
    VALUES (?, ?, ?, 'conectada', ?, ?, ?, 'demo')`, pid, network, handle, followers, network === 'facebook' || network === 'youtube' ? handle : '@' + handle, now).lastInsertRowid));

  const REELS = [
    ['01-deuda', 'La deuda tiene plan', 'Auditoría externa en 90 días y un plan de pagos que se publica.'],
    ['02-jovenes', 'Socios jóvenes', 'Cuota joven hasta los 25 años.'],
    ['03-estadio', 'El estadio que queremos', 'Obras con fecha y presupuesto.'],
    ['04-inferiores', 'Inferiores primero', 'Pensión nueva y más becas.'],
    ['05-transparencia', 'Cuentas claras', 'Balances abiertos todos los meses.'],
    ['06-cuota', 'Cuota justa', 'Congelada todo el primer año.'],
    ['07-deportes', 'Básquet, vóley y más', 'Todos los deportes del club.'],
    ['08-sede', 'La sede abierta', 'Horario extendido para socios.'],
    ['09-seguridad', 'Cancha segura', 'Accesos nuevos y familias primero.'],
    ['10-mujeres', 'Mujeres en el club', 'Fútbol femenino profesional.'],
    ['11-filiales', 'Filiales del interior', 'Una voz en la comisión directiva.'],
    ['12-debate', 'Debate en vivo', 'Jueves 21 h por todas las redes.'],
    ['13-voto', 'Así se vota', 'Traé tu carnet y el DNI.'],
    ['14-cierre', 'Nos vemos el domingo', 'Cierre de campaña en la sede.'],
  ];
  const reel = REELS.map(([f, title, caption], i) => {
    const file = `demo-${f}.mp4`;
    fs.copyFileSync(path.join(SRC, `${f}.mp4`), path.join(UPLOADS, file));
    const size = fs.statSync(path.join(UPLOADS, file)).size;
    return Number(run(`INSERT INTO reels (project_id, title, caption, file, original_name, size, status, width, height, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 720, 1280, 6, ?)`,
      pid, title, caption + ' #ListaAzul', file, file, size, i < 12 ? 'aprobado' : 'borrador', day(-14 + i, 12) + ':00').lastInsertRowid);
  });

  // publicaciones: los primeros 10 reels ya salieron (escalonados en los últimos días), los siguientes están programados
  const ins = db.prepare('INSERT INTO posts (project_id, reel_id, account_id, scheduled_at, status, published_at, error) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const pickAcc = (i) => acc.filter((_, k) => (k + i) % 3 !== 0 || k === 0); // 6 o 7 cuentas por reel, siempre la oficial
  for (let i = 0; i < 10; i++) {
    pickAcc(i).forEach((a, k) => {
      const at = day(-11 + i, 18 + (k % 4), (k * 17) % 60);
      const fallo = (i === 3 && k === 5) || (i === 7 && k === 2);
      ins.run(pid, reel[i], a, at, fallo ? 'fallido' : 'publicado', fallo ? '' : at, fallo ? 'La red pidió volver a iniciar sesión en la cuenta: reconectala y tocá Reintentar.' : '');
    });
  }
  for (let i = 10; i < 12; i++) pickAcc(i).forEach((a, k) => ins.run(pid, reel[i], a, day(i - 8, 19 + (k % 3), (k * 13) % 60), 'programado', '', ''));

  if (!get('SELECT 1 FROM pauta WHERE project_id = ?', pid)) run('INSERT INTO pauta (project_id) VALUES (?)', pid);
  run("UPDATE pauta SET budget = 4000, start_date = ?, end_date = '2026-12-10' WHERE project_id = ?", day(-12).slice(0, 10), pid);

  const [ig1, ig2, ig3, ig4, tt1, tt2, fb1, fb2, yt] = acc;
  const CAMP = [
    ['Socios jóvenes', 1200, [ig3, tt1, tt2], [reel[1], reel[9]], 'Menores de 30 en Instagram y TikTok', 'DEMO-101', 2, 450, 74000, 21000],
    ['La deuda', 1000, [ig1, fb1], [reel[0], reel[4]], 'Socios vitalicios y activos de más de 50', 'DEMO-102', 2, 380, 63000, 18000],
    ['Interior y filiales', 600, [ig4, fb2], [reel[10]], 'Filiales de todo el país', 'DEMO-103', 1, 160, 26000, 9000],
    ['Obras y estadio', 500, [ig1, ig2, yt], [reel[2], reel[8]], 'Socios que van a la cancha', 'DEMO-104', 2, 230, 38000, 12000],
    ['Debate en vivo', 400, [], [reel[11]], 'Se activa la semana del debate', '', 0, 0, 0, 0],
  ];
  for (const [name, budget, accounts, reels, notes, mid, ads, spent, imp, reach] of CAMP)
    run(`INSERT INTO campaigns (project_id, name, budget, start_date, end_date, accounts, reels, notes, meta_campaign_id, meta_ads, spent, impressions, reach, spent_at)
      VALUES (?, ?, ?, ?, '2026-12-10', ?, ?, ?, ?, ?, ?, ?, ?, ?)`, pid, name, budget, mid ? day(-10).slice(0, 10) : '2026-11-26', JSON.stringify(accounts), JSON.stringify(reels), notes, mid, ads, spent, imp, reach, mid ? now : '');

  const FICHAS = [
    ['dirigente', 'Candidato de la Lista Azul', 'Contador, 48 años, socio desde los 12. Fue tesorero de la subcomisión de básquet y propone auditar la deuda.', 'alta'],
    ['tema', 'La deuda es lo que más preocupa', 'En la encuesta de muestra, 6 de cada 10 socios nombran la deuda como el principal problema del club.', 'media'],
    ['tema', 'Los jóvenes no van a votar', 'Los socios de menos de 30 votan la mitad que el promedio: la cuota joven y TikTok apuntan a ellos.', 'media'],
    ['competidor', 'Lista Roja', 'Oficialismo. Fuerte en la sede y en las filiales del conurbano; débil en redes.', 'media'],
    ['competidor', 'Lista Verde', 'Agrupación nueva de socios jóvenes; mucha presencia en Instagram, poca estructura.', 'baja'],
    ['dato', 'Padrón de muestra', '65.000 socios habilitados; 41.000 con teléfono o mail para la pauta.', 'alta'],
  ];
  for (const [kind, title, text, confidence] of FICHAS) run("INSERT INTO knowledge (project_id, kind, title, text, source, confidence, date) VALUES (?, ?, ?, ?, 'demo', ?, ?)", pid, kind, title, text, confidence, now.slice(0, 10));

  db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); throw e; }

const n = (sql) => get(sql, pid).n;
console.log(`Proyecto ${pid} en modo demo: ${n("SELECT count(*) n FROM accounts WHERE project_id = ? AND notes = 'demo'")} cuentas, ${n("SELECT count(*) n FROM reels WHERE project_id = ? AND original_name LIKE 'demo-%'")} reels, ${n("SELECT count(*) n FROM posts WHERE project_id = ? AND status = 'publicado'")} publicadas, ${n("SELECT count(*) n FROM posts WHERE project_id = ? AND status = 'programado'")} programadas, ${n('SELECT count(*) n FROM campaigns WHERE project_id = ?')} campañas.`);
