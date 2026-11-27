// Banco de fondos de portada: cada fondo que genera fal (USD 0,03) se guarda acá para reusarlo en otros momentos del mismo lugar.
// Archivo en el directorio de datos del editor (`dir`, con nombre UUID) + registro en la base. Se sirve en /fondos/<uuid>.<ext> (sin token, como /entregas:
// el nombre no se adivina), así que fondo_url de un fondo reusado es una URL que el Estudio puede bajar. Sin publicUrl el banco no sirve para reusar.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DIAS_SIN_REUSO = 7;

// Caché de búsquedas externas (Openverse tiene límite anónimo): por consulta, ~30 días, en la base del editor.
export const DIAS_CACHE = 30;
export function crearCacheBusquedas({ db, ahora = () => Date.now() } = {}) {
  db.exec('CREATE TABLE IF NOT EXISTS busquedas (clave TEXT PRIMARY KEY, resultado TEXT NOT NULL, creado TEXT NOT NULL)');
  return {
    get(clave) {
      const f = db.prepare('SELECT resultado, creado FROM busquedas WHERE clave = ?').get(clave);
      return f && Date.parse(f.creado) > ahora() - DIAS_CACHE * 864e5 ? JSON.parse(f.resultado) : null;
    },
    set(clave, rows) { db.prepare('INSERT OR REPLACE INTO busquedas (clave, resultado, creado) VALUES (?, ?, ?)').run(clave, JSON.stringify(rows), new Date(ahora()).toISOString()); },
  };
}

export function crearBancoFondos({ db, dir, publicUrl = '', ahora = () => Date.now() } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS fondos (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, lugar TEXT NOT NULL, ref_url TEXT DEFAULT '', luz TEXT NOT NULL, plano TEXT NOT NULL,
  archivo TEXT NOT NULL, referencia TEXT DEFAULT '{}', creado TEXT NOT NULL, ultimo_uso TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'foto')`);
  if (!db.prepare('PRAGMA table_info(fondos)').all().some((c) => c.name === 'tipo')) db.exec("ALTER TABLE fondos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'ia'");
  const pub = String(publicUrl || '').replace(/\/+$/, '');
  const iso = (ms) => new Date(ms).toISOString();
  return {
    disponible: Boolean(pub && dir),
    // los fondos del proyecto que se pueden reusar: no usados en los últimos 7 días, con su archivo todavía en disco
    fondosDe(project_id) {
      const limite = ahora() - DIAS_SIN_REUSO * 864e5;
      return db.prepare('SELECT * FROM fondos WHERE project_id = ? ORDER BY ultimo_uso, id').all(project_id)
        .filter((f) => Date.parse(f.ultimo_uso) <= limite && fs.existsSync(path.join(dir, f.archivo)))
        .map((f) => ({ ...f, referencia: JSON.parse(f.referencia || '{}') }));
    },
    url: (f) => `${pub}/fondos/${f.archivo}`,
    usar(id) { db.prepare('UPDATE fondos SET ultimo_uso = ? WHERE id = ?').run(iso(ahora()), id); },
    // guarda el fondo recién generado (cuenta como usado ahora)
    // tipo: 'foto' (la foto real directa) o 'ia' (generado por fal); ext: jpg, png o webp
    guardar({ project_id, lugar, ref_url, luz, plano, referencia, tipo = 'foto', ext = 'jpg' }, bytes) {
      fs.mkdirSync(dir, { recursive: true });
      const archivo = `${crypto.randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(dir, archivo), bytes);
      const t = iso(ahora());
      db.prepare('INSERT INTO fondos (project_id, lugar, ref_url, luz, plano, archivo, referencia, creado, ultimo_uso, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(project_id, lugar, ref_url || '', luz, plano, archivo, JSON.stringify(referencia || {}), t, t, tipo);
      return archivo;
    },
  };
}
