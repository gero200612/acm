// Orquestador del editor: recibe de ACM los crudos recién subidos y los lleva hasta ediciones entregadas.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirDb } from './db.js';
import { crearEstudio } from './estudio.js';
import { crearAcm } from './acm.js';
import { crearRunner } from './runner.js';

// Arma la app con sus piezas; las funciones de criterio (momentos, recetas, revisión) se inyectan desde acá.
export function crearEditor({ token, db, estudio, acm, publicUrl, dir, hooks = {}, log } = {}) {
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
  app.get('/trabajos/:id', auth, (req, res) => {
    const t = runner.trabajo(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'No existe' });
    const { transcripcion, ...resto } = t;
    res.json(resto);
  });
  // los videos terminados se sirven un rato para que ACM los baje (el nombre es un UUID: no se adivina)
  if (dir) app.get('/entregas/:f', (req, res) => {
    if (!/^[0-9a-f-]{36}\.(mp4|jpg)$/.test(req.params.f)) return res.status(404).end();
    res.sendFile(path.resolve(dir, req.params.f), (e) => { if (e && !res.headersSent) res.status(404).end(); });
  });
  return { app, runner, db };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = path.resolve(process.env.EDITOR_DATA || './data');
  if (!process.env.EDITOR_TOKEN) { console.error('Falta EDITOR_TOKEN'); process.exit(1); }
  const { app, runner } = crearEditor({
    token: process.env.EDITOR_TOKEN, db: abrirDb(path.join(data, 'editor.db')), dir: path.join(data, 'entregas'),
    publicUrl: process.env.EDITOR_PUBLIC_URL || '',
    estudio: crearEstudio({ url: process.env.ESTUDIO_URL, empresa: process.env.ESTUDIO_EMPRESA, clave: process.env.ESTUDIO_CLAVE }),
    acm: crearAcm({ url: process.env.ACM_URL, token: process.env.EDITOR_TOKEN }),
    // Tarea 6 y 7: acá se enchufan elegirMomentos, armarRecetas y revisar
    hooks: {},
  });
  const srv = app.listen(Number(process.env.PORT || 4000), () => console.log(`Editor en http://localhost:${srv.address().port}`));
  runner.arrancar();
}
