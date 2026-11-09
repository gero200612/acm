// Banco de pruebas del Laboratorio: casos que corren contra el simulador de las APIs (nunca contra las redes reales).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startSimulator } from './simulator.js';
import { traced, step } from './trace.js';
import { testConnection } from './connections.js';
import { publish } from './publisher.js';
import { uploadAudience, createCampaign, testAds } from './ads.js';
import ExcelJS from 'exceljs';
import { readPadron, normPhone } from './padron.js';
import { postBlocked, pautaNumbers, defaultAdsNetworks, scheduleBlocked, withinWindow, youtubeShare, NETWORK_CAPS } from './rules.js';
import { embed } from './knowledge.js';
import { startSandbox, startFakeEditor, recorridoCases } from './recorrido.js';

const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: dio ${JSON.stringify(a)}, se esperaba ${JSON.stringify(b)}`); };
const yes = (cond, what) => { if (!cond) throw new Error(what); };

function cases(video, sim) {
  const IG = { pageId: 'PAGE1', pageAccessToken: 'EAAprueba1234567', instagramBusinessId: 'IG1' };
  return [
    ['Conexiones', 'Instagram: trae el usuario y los seguidores', async () => { const r = await testConnection('instagram', { pageId: 'PAGE1', pageAccessToken: IG.pageAccessToken }); eq(r.connectedAs, '@mock.ig', 'usuario'); eq(r.extra.instagramBusinessId, 'IG1', 'ID de Instagram'); }],
    ['Conexiones', 'Facebook: trae el nombre de la Página', async () => { const r = await testConnection('facebook', { pageId: 'PAGE1', pageAccessToken: IG.pageAccessToken }); eq(r.connectedAs, 'Página Mock', 'nombre'); }],
    ['Conexiones', 'TikTok: renueva solo el token vencido', async () => { const r = await testConnection('tiktok', { accessToken: 'TT_VIEJO', refreshToken: 'R', clientKey: 'k', clientSecret: 's' }); eq(r.connectedAs, '@mock.tt', 'usuario'); eq(r.extra.accessToken, 'TT_OK', 'token nuevo'); }],
    ['Conexiones', 'YouTube: trae el canal', async () => { const r = await testConnection('youtube', { clientId: 'c', clientSecret: 's', refreshToken: 'r' }); eq(r.connectedAs, '@canalmock', 'canal'); }],
    ['Conexiones', 'Un error de Meta no muestra el token', async () => {
      let msg = '';
      try { await testConnection('facebook', { pageId: 'PAGEBAD', pageAccessToken: 'EAAsecretoNoVisible99' }); } catch (e) { msg = e.message; }
      yes(msg, 'tendría que haber fallado'); yes(!msg.includes('EAAsecretoNoVisible99'), `el error muestra el token: ${msg}`);
    }],
    ['Publicación', 'Instagram: sube el video y publica el Reel', async () => { const r = await publish('instagram', IG, video, 'Prueba', 'Prueba'); eq(r.id, 'M1', 'publicación'); yes(r.url.includes('instagram.com'), 'sin link'); }],
    ['Publicación', 'Facebook: publica el Reel de la Página', async () => { const r = await publish('facebook', IG, video, 'Prueba', 'Prueba'); eq(r.id, 'V1', 'video'); }],
    ['Publicación', 'TikTok: sin app aprobada pasa a privado y avisa', async () => { const r = await publish('tiktok', { accessToken: 'TT_OK' }, video, 'Prueba', 'Prueba', () => {}, () => {}, { privacy: 'PUBLIC_TO_EVERYONE', allowComment: true }); eq(r.id, 'P1', 'publicación'); yes(/privado/.test(r.note), 'no avisó que sale privado'); }],
    ['Publicación', 'TikTok: sin privacidad elegida no publica (regla de TikTok)', async () => {
      let msg = ''; try { await publish('tiktok', { accessToken: 'TT_OK' }, video, 'Prueba', 'Prueba'); } catch (e) { msg = e.message; }
      yes(/privacidad/.test(msg), `tendría que pedir la privacidad: ${msg}`);
    }],
    ['Publicación', 'TikTok: con cuenta pública y app sin aprobar explica cómo hacerla privada', async () => {
      let msg = ''; try { await publish('tiktok', { accessToken: 'TT_PUBLICA' }, video, 'Prueba', 'Prueba', () => {}, () => {}, { privacy: 'SELF_ONLY' }); } catch (e) { msg = e.message; }
      yes(/Cuenta privada/.test(msg), `tendría que explicar cómo hacer privada la cuenta: ${msg}`);
    }],
    ['Publicación', 'TikTok: comentarios, dúos y stitch apagados salvo que se pidan', async () => {
      await publish('tiktok', { accessToken: 'TT_OK' }, video, 'Prueba', 'Prueba', () => {}, () => {}, { privacy: 'SELF_ONLY', allowComment: true });
      const last = JSON.parse(sim.log.filter((l) => l.startsWith('ttinit ')).pop().slice(7));
      eq([last.disable_comment, last.disable_duet, last.disable_stitch], [false, true, true], 'comentarios, dúos, stitch apagados');
    }],
    ['Publicación', 'YouTube: sube el Short', async () => { const r = await publish('youtube', { clientId: 'c', clientSecret: 's', refreshToken: 'r' }, video, 'Prueba', 'Prueba'); eq(r.id, 'Y1', 'video'); }],
    ['Reglas', 'No publica con la cuenta pausada, desconectada ni fuera de fecha', async () => {
      eq(postBlocked({ scheduled_at: '2026-12-01 10:00', propaganda_until: '2026-12-10', acc_status: 'conectada' }), null, 'cuenta conectada en fecha');
      yes(/pausada/.test(postBlocked({ scheduled_at: '2026-12-01 10:00', acc_status: 'pausada' })), 'cuenta pausada');
      yes(/no está conectada/.test(postBlocked({ scheduled_at: '2026-12-01 10:00', acc_status: 'pendiente' })), 'cuenta sin conectar');
      yes(/fecha máxima/.test(postBlocked({ scheduled_at: '2026-12-11 10:00', propaganda_until: '2026-12-10', acc_status: 'conectada' })), 'fuera de la fecha de propaganda');
    }],
    ['Padrón', 'Pasa los celulares al formato de Meta y descarta los DNI', async () => {
      eq(['11 15 6789-0123', '+54 9 351 555 1234', '0351 15 555 1234', '011 4555-1234', '30123456'].map(normPhone),
        ['5491167890123', '5493515551234', '5493515551234', '5491145551234', ''], 'teléfonos');
    }],
    ['Padrón', 'Lee un CSV y encuentra solas las columnas', async () => {
      const csv = 'Socio;Nombre;DNI;Celular;Correo\n1;Ana;30111222;11 15 1234-5678;ana@x.com\n2;Beto;30111223;;\n3;Caro;30111224;;caro@y.com.ar\n';
      const r = await readPadron(Buffer.from(csv), 'padron.csv');
      eq([r.total, r.phones, r.emails, r.contacts], [3, 1, 2, 2], 'socios, teléfonos, mails, contactables');
      yes(r.hashes.every(([em, ph]) => (!em || em.length === 64) && (!ph || ph.length === 64)), 'no son huellas SHA-256');
    }],
    ['Padrón', 'Lee Excel con mails con formato, links y números', async () => {
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Padrón');
      ws.addRow(['Socio', 'DNI', 'Celular', 'E-mail']);
      ws.addRow([1, 30111222, 1167890123, { text: 'ana@x.com', hyperlink: 'mailto:ana@x.com' }]);
      ws.addRow([2, 30111223, '11 15 2222-3333', { richText: [{ text: 'beto' }, { font: { bold: true }, text: '@y.com' }] }]);
      ws.addRow([3, 30111224, null, { formula: 'LOWER("CARO@Z.COM")', result: 'caro@z.com' }]);
      const r = await readPadron(Buffer.from(await wb.xlsx.writeBuffer()), 'padron.xlsx');
      eq([r.total, r.phones, r.emails, r.contacts], [3, 2, 3, 3], 'socios, teléfonos, mails, contactables');
    }],
    ['Padrón', 'Lee un CSV de Excel en Latin-1 sin romper los encabezados', async () => {
      const r = await readPadron(Buffer.from('Nº;Móvil;Dirección de correo\n1;1167890123;a@x.com\n2;;b@y.com\n3;;c@y.com\n4;;d@y.com\n', 'latin1'), 'padron.csv');
      eq([r.total, r.phones, r.emails], [4, 1, 4], 'socios, teléfonos, mails');
    }],
    ['Pauta', 'USD 3.000 en 33 días sobre el padrón de 65.000', async () => {
      const n = pautaNumbers({ budget: 3000, from: '2026-11-08', to: '2026-12-10', padron: 65000, contacts: 59584 });
      eq(n.days, 33, 'días'); eq(n.people, 35750, 'socios alcanzados'); eq(Math.round(n.freq), 12, 'veces por socio');
    }],
    ['Investigación', 'El modelo de vectores está y busca por significado', async () => {
      const docs = ['Gaudio promete el sponsor más grande de la historia del club', 'La FIFA inhibió al club por la deuda con Bragantino', 'Nakis es prosecretario de la AFA y cercano a Tapia'];
      const [q] = await embed(['quién tiene relación con la AFA'], 'query');
      const D = await embed(docs);
      const s = D.map((v) => v.reduce((a, x, i) => a + x * q[i], 0));
      eq(s.indexOf(Math.max(...s)), 2, 'la ficha más parecida');
    }],
    ['Meta Ads', 'Sube el padrón como público en tandas', async () => {
      const rows = Array.from({ length: 25000 }, (_, i) => ({ em: 'e' + i, ph: '' }));
      const r = await uploadAudience({ adAccountId: '999', accessToken: 'EAAads' }, 'Prueba', rows);
      eq(r.id, 'AUD1', 'público'); eq(r.received, 25000, 'contactos recibidos');
    }],
    ['Meta Ads', 'Crea la campaña en pausa con su anuncio', async () => {
      const c = { adAccountId: '999', accessToken: 'EAAads', pageId: 'PAGE1', instagramId: 'IG1' };
      eq((await testAds(c)).currency, 'ARS', 'moneda');
      const r = await createCampaign(c, { name: 'Prueba', budget: 1000, start: '2026-11-08T00:00:00-03:00', end: '2026-12-10T23:59:00-03:00', perWeek: 2.5, audienceId: 'AUD1', political: true, media: [{ id: 'M1', title: 'Reel' }] });
      eq(r.campaignId, 'CAMP1', 'campaña'); eq(r.ads.length, 1, 'anuncios');
    }],
    ['Circuito', 'Redes con pauta por defecto: política sin TikTok, el resto con las tres', async () => {
      eq(defaultAdsNetworks('politica'), { meta: true, youtube: true, tiktok: false }, 'política');
      eq(defaultAdsNetworks('club'), { meta: true, youtube: true, tiktok: true }, 'club');
      eq(defaultAdsNetworks('comercial'), { meta: true, youtube: true, tiktok: true }, 'comercial');
    }],
    ['Circuito', 'Regla: dos versiones del recorte en la misma red van con 3 h de distancia, en otra red no importa', async () => {
      const post = (at, network = 'instagram', account_id = 1) => ({ reel_id: 1, account_id, network, scheduled_at: at, clip_id: 'c1', review: 'aprobado' });
      const ctx = (sib) => ({ siblings: sib, dayCount: 0, networkCap: 100, tz: 'America/Argentina/Buenos_Aires' });
      const otra = { network: 'instagram', scheduled_at: '2026-12-01 10:00', account_id: 2 };
      yes(/3 horas/.test(scheduleBlocked(post('2026-12-01 12:59'), ctx([otra]))), 'a 2 h 59 min tendría que bloquear');
      yes(/3 horas/.test(scheduleBlocked(post('2026-12-01 09:01'), ctx([{ ...otra, scheduled_at: '2026-12-01 12:00' }]))), 'la hermana sale 2 h 59 min después: también bloquea');
      eq(scheduleBlocked(post('2026-12-01 13:00'), ctx([otra])), null, 'a 3 h');
      eq(scheduleBlocked(post('2026-12-01 10:00', 'facebook', 3), ctx([otra])), null, 'otra red a 0 min');
    }],
    ['Circuito', 'Regla: solo de 08:00 a 23:00 hora local', async () => {
      const at = (hm) => scheduleBlocked({ reel_id: 1, account_id: 1, network: 'tiktok', scheduled_at: `2026-12-01 ${hm}`, clip_id: 'c', review: 'aprobado' }, { siblings: [], dayCount: 0, networkCap: 15 });
      yes(at('07:59'), '07:59'); yes(at('23:01'), '23:01'); eq(at('08:00'), null, '08:00'); eq(at('23:00'), null, '23:00');
    }],
    ['Circuito', 'withinWindow: la hora real también respeta 08:00-23:00', async () => {
      eq(['07:59', '08:00', '23:00', '23:01'].map(withinWindow), [false, true, true, false], 'ventana');
      eq(withinWindow('2026-12-01 12:00'), true, 'con fecha');
    }],
    ['Circuito', 'Regla: sin aprobar no se programa', async () => {
      const p = { reel_id: 1, account_id: 1, network: 'instagram', scheduled_at: '2026-12-01 12:00', clip_id: 'c' };
      for (const review of ['pendiente', 'rechazado', undefined]) yes(/aprobado/.test(scheduleBlocked({ ...p, review }, { siblings: [], dayCount: 0, networkCap: 100 })), `review ${review}`);
      eq(scheduleBlocked({ ...p, review: 'aprobado' }, { siblings: [], dayCount: 0, networkCap: 100 }), null, 'aprobado');
    }],
    ['Circuito', 'Regla: tope diario por red y cuota de YouTube', async () => {
      const p = { reel_id: 1, account_id: 1, network: 'tiktok', scheduled_at: '2026-12-01 12:00', clip_id: 'c', review: 'aprobado' };
      yes(/tope/.test(scheduleBlocked(p, { siblings: [], dayCount: 15, networkCap: NETWORK_CAPS.tiktok })), 'en el tope');
      eq(scheduleBlocked(p, { siblings: [], dayCount: 14, networkCap: NETWORK_CAPS.tiktok }), null, 'debajo del tope');
      eq(NETWORK_CAPS, { instagram: 100, facebook: 30, tiktok: 15, youtube: null }, 'topes');
      eq(youtubeShare(100, 8), 12, 'cuota de YouTube');
    }],
  ];
}

export async function runBanco() {
  const sim = await startSimulator(0);
  const video = path.join(os.tmpdir(), `acm-banco-${process.pid}.mp4`);
  fs.writeFileSync(video, Buffer.alloc(256 * 1024, 7));
  let ok = 0, total = 0;
  // la copia aislada de ACM para el recorrido completo (si no arranca, esos casos fallan con el motivo)
  const sb = {};
  try {
    sb.editor = await startFakeEditor(); sb.bases = { ...sim.bases, __log: sim.log };
    sb.box = await startSandbox({ ...sb.bases, editor: sb.editor.base }); sb.simLog = () => sim.log;
  } catch (e) { sb.error = e.message; }
  try {
    await traced({ kind: 'banco', title: 'Banco de pruebas', bases: sim.bases }, async () => {
      for (const [group, name, fn] of [...cases(video, sim), ...recorridoCases(sb)]) {
        total++;
        const t0 = Date.now();
        try { await fn(); ok++; step('caso', `${group} · ${name}`, 'ok', Date.now() - t0); }
        catch (e) { step('caso', `${group} · ${name}`, 'falló', Date.now() - t0, e.message); }
      }
      if (ok < total) throw new Error(`Pasaron ${ok} de ${total} casos`);
      return `Pasaron los ${total} casos`;
    });
  } catch {}
  finally { await sb.box?.stop(); await sb.editor?.close(); await sim.close(); fs.rmSync(video, { force: true }); }
  return { ok, total };
}
