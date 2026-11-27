// Orquestador del editor: recibe de ACM los crudos recién subidos y los lleva hasta ediciones entregadas.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirDb } from './db.js';
import { crearEstudio } from './estudio.js';
import { crearAcm } from './acm.js';
import { crearRunner } from './runner.js';
import { crearClaude } from './claude.js';
import { crearBancoFondos } from './fondos.js';
import { crearCriterio } from './criterio.js';

// Arma la app con sus piezas; las funciones de criterio (momentos, recetas, revisión) se inyectan desde acá.
export function crearEditor({ token, db, estudio, acm, publicUrl, dir, dirFondos, hooks = {}, log } = {}) {
  const runner = crearRunner({ db, estudio, acm, publicUrl, dir, log, ...hooks });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  const auth = (req, res, next) => {
    const want = Buffer.from(token || ''), given = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!want.length || given.length !== want.length || !crypto.timingSafeEqual(want, given)) return res.status(401).json({ error: 'Sin token' });
    next();
  };
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.post('/trabajos', auth, (req, res) => {
    const b = req.body || {};
    if (!Number(b.reel_id) || !Number(b.project_id) || !/^https?:\/\//.test(String(b.url || ''))) return res.status(400).json({ error: 'Faltan project_id, reel_id o url' });
    const id = runner.encolar({ project_id: Number(b.project_id), reel_id: Number(b.reel_id), url: b.url, duracion_s: Number(b.duracion_s) || null, aprendizajes_url: b.aprendizajes_url });
    res.status(202).json({ id });
  });
  // una persona rechazó una edición en ACM y pidió rehacerla con cambios
  app.post('/rehacer', auth, (req, res) => {
    const b = req.body || {};
    if (!String(b.edicion_id || '').trim() || !String(b.pedido || '').trim()) return res.status(400).json({ error: 'Faltan edicion_id o pedido' });
    if (b.url && !/^https?:\/\//.test(String(b.url))) return res.status(400).json({ error: 'La url del crudo no es válida' });
    const ok = runner.pedirRehacer({ edicion_id: String(b.edicion_id), pedido: String(b.pedido).slice(0, 2000), url: b.url ? String(b.url) : '' });
    if (!ok) return res.status(404).json({ error: 'No encuentro esa edición en el editor' });
    res.status(202).json({ ok: true });
  });
  app.get('/trabajos/:id', auth, (req, res) => {
    const t = runner.trabajo(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'No existe' });
    const { transcripcion, ...resto } = t;
    res.json(resto);
  });
  // los videos terminados se sirven un rato para que ACM los baje (el nombre es un UUID: no se adivina; con root, que la carpeta
  // de datos esté adentro de una oculta como ~/.cache no la hace invisible)
  if (dir) app.get('/entregas/:f', (req, res) => {
    if (!/^[0-9a-f-]{36}\.(mp4|jpg)$/.test(req.params.f)) return res.status(404).end();
    res.sendFile(req.params.f, { root: path.resolve(dir) }, (e) => { if (e && !res.headersSent) res.status(404).end(); });
  });
  // los fondos de portada guardados (banco de fondos): el Estudio los baja de acá; nombre UUID, sin token como /entregas
  if (dirFondos) app.get('/fondos/:f', (req, res) => {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(req.params.f)) return res.status(404).end();
    res.sendFile(req.params.f, { root: path.resolve(dirFondos) }, (e) => { if (e && !res.headersSent) res.status(404).end(); });
  });
  return { app, runner, db };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = path.resolve(process.env.EDITOR_DATA || './data');
  if (!process.env.EDITOR_TOKEN) { console.error('Falta EDITOR_TOKEN'); process.exit(1); }
  const db = abrirDb(path.join(data, 'editor.db')), publicUrl = process.env.EDITOR_PUBLIC_URL || '';
  const banco = crearBancoFondos({ db, dir: path.join(data, 'fondos'), publicUrl });
  const { app, runner } = crearEditor({
    token: process.env.EDITOR_TOKEN, db, dir: path.join(data, 'entregas'), dirFondos: path.join(data, 'fondos'),
    publicUrl,
    estudio: crearEstudio({ url: process.env.ESTUDIO_URL, empresa: process.env.ESTUDIO_EMPRESA, clave: process.env.ESTUDIO_CLAVE }),
    acm: crearAcm({ url: process.env.ACM_URL, token: process.env.EDITOR_TOKEN }),
    // Tarea 6: momentos y recetas con Claude (sin ANTHROPIC_API_KEY el trabajo termina en «error» con el motivo). Tarea 7: revisar
    hooks: crearCriterio({ banco, claude: crearClaude(), estudio: crearEstudio({ url: process.env.ESTUDIO_URL, empresa: process.env.ESTUDIO_EMPRESA, clave: process.env.ESTUDIO_CLAVE }) }), // incluye ajustar (rehacer a pedido)
  });
  const srv = app.listen(Number(process.env.PORT || 4000), () => console.log(`Editor en http://localhost:${srv.address().port}`));
  runner.arrancar();
}
