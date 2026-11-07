// Padrón: se lee el archivo (CSV o Excel), se cuentan socios y contactos, y de los contactos se guarda solo
// la huella SHA-256 normalizada (el formato que pide Meta para los públicos personalizados). Ni nombres ni DNI.
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [';', ',', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function parseXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    r.eachCell({ includeEmpty: true }, (c, n) => {
      let v = c.value;
      if (v && typeof v === 'object') v = v.text ?? v.result ?? (v.hyperlink ? String(v.hyperlink).replace(/^mailto:/, '') : '') ?? '';
      vals[n - 1] = v == null ? '' : String(v);
    });
    rows.push(vals);
  });
  return rows;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export function normEmail(v) { const e = String(v || '').trim().toLowerCase(); return EMAIL.test(e) ? e : ''; }
// Teléfonos de Argentina al formato internacional que entiende Meta: 549 + característica + número (celulares).
export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) { d = d.slice(2); if (d.startsWith('9')) d = d.slice(1); }
  if (d.startsWith('0')) d = d.slice(1);
  // 11 15 1234 5678 → 11 1234 5678 (el 15 después de la característica)
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m && (m[1] + m[2]).length === 10) d = m[1] + m[2];
  return d.length === 10 ? '549' + d : '';
}

function pickColumns(rows) {
  const head = (rows[0] || []).map((h) => String(h || '').toLowerCase());
  let email = head.findIndex((h) => /mail|correo/.test(h));
  let phone = head.findIndex((h) => /tel|cel|m[oó]vil|phone|whats/.test(h));
  const hasHeader = email >= 0 || phone >= 0 || head.some((h) => /nombre|apellido|dni|socio|documento/.test(h));
  const body = hasHeader ? rows.slice(1) : rows;
  // sin encabezado reconocible: se adivina por el contenido
  const sample = body.slice(0, 200);
  const width = Math.max(0, ...sample.map((r) => r.length));
  const score = (i, fn) => sample.filter((r) => fn(r[i])).length / Math.max(1, sample.length);
  if (email < 0) { for (let i = 0; i < width; i++) if (score(i, normEmail) > 0.3) { email = i; break; } }
  if (phone < 0) { for (let i = 0; i < width; i++) if (i !== email && score(i, normPhone) > 0.3) { phone = i; break; } }
  return { body, email, phone };
}

export async function readPadron(buf, name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  let rows;
  if (ext === 'xlsx') rows = await parseXlsx(buf);
  else if (ext === 'csv' || ext === 'txt') rows = parseCsv(buf.toString('utf8').replace(/^﻿/, ''));
  else throw new Error('Subí el padrón en Excel (.xlsx) o CSV. Si es .xls, guardalo como .xlsx.');
  rows = rows.filter((r) => r.some((c) => String(c || '').trim()));
  const { body, email, phone } = pickColumns(rows);
  if (!body.length) throw new Error('El archivo no tiene filas.');
  let phones = 0, emails = 0, contacts = 0;
  const hashes = [];
  for (const r of body) {
    const e = email >= 0 ? normEmail(r[email]) : '';
    const p = phone >= 0 ? normPhone(r[phone]) : '';
    if (e) emails++;
    if (p) phones++;
    if (e || p) { contacts++; hashes.push([e ? sha(e) : '', p ? sha(p) : '']); }
  }
  return { total: body.length, phones, emails, contacts, hashes, columns: { email: email >= 0, phone: phone >= 0 } };
}
