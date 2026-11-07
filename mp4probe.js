// Lee duración y tamaño de un MP4/MOV mirando solo sus cajas (moov → mvhd, trak → tkhd/hdlr), sin ffmpeg.
import fs from 'node:fs';

function boxes(buf, start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = buf.readUInt32BE(o), head = 8;
    const type = buf.toString('latin1', o + 4, o + 8);
    if (size === 1) { size = Number(buf.readBigUInt64BE(o + 8)); head = 16; }
    else if (size === 0) size = end - o;
    if (size < head || o + size > end) break;
    out.push({ type, start: o + head, end: o + size });
    o += size;
  }
  return out;
}
const find = (buf, list, type) => list.find((b) => b.type === type);

export function probe(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const total = fs.fstatSync(fd).size;
    // recorre las cajas de primer nivel leyendo solo los encabezados hasta encontrar moov
    let o = 0, moov = null;
    const h = Buffer.alloc(16);
    while (o + 8 <= total) {
      fs.readSync(fd, h, 0, 16, o);
      let size = h.readUInt32BE(0);
      const type = h.toString('latin1', 4, 8);
      if (size === 1) size = Number(h.readBigUInt64BE(8));
      else if (size === 0) size = total - o;
      if (size < 8) break;
      if (type === 'moov') { if (size > 64 * 1024 * 1024) return null; moov = Buffer.alloc(size); fs.readSync(fd, moov, 0, size, o); break; }
      o += size;
    }
    if (!moov) return null;
    const top = boxes(moov, 8, moov.length);
    const mvhd = find(moov, top, 'mvhd');
    let duration = 0;
    if (mvhd) {
      const v = moov[mvhd.start];
      const ts = v === 1 ? moov.readUInt32BE(mvhd.start + 20) : moov.readUInt32BE(mvhd.start + 12);
      const du = v === 1 ? Number(moov.readBigUInt64BE(mvhd.start + 24)) : moov.readUInt32BE(mvhd.start + 16);
      duration = ts ? du / ts : 0;
    }
    let width = 0, height = 0;
    for (const t of top.filter((b) => b.type === 'trak')) {
      const tb = boxes(moov, t.start, t.end);
      const mdia = find(moov, tb, 'mdia');
      const hdlr = mdia && find(moov, boxes(moov, mdia.start, mdia.end), 'hdlr');
      if (!hdlr || moov.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'vide') continue;
      const tkhd = find(moov, tb, 'tkhd');
      if (!tkhd) continue;
      width = moov.readUInt32BE(tkhd.end - 8) / 65536;
      height = moov.readUInt32BE(tkhd.end - 4) / 65536;
      // matriz de rotación: los videos de celular grabados parados vienen girados 90°
      const m = tkhd.end - 8 - 36;
      const a = moov.readInt32BE(m), b = moov.readInt32BE(m + 4);
      if (a === 0 && Math.abs(b) === 65536) [width, height] = [height, width];
      break;
    }
    return { duration: Math.round(duration * 10) / 10, width: Math.round(width), height: Math.round(height), size: total };
  } catch { return null; }
  finally { fs.closeSync(fd); }
}

// Lo que pide cada red para un video corto vertical
export const RULES = {
  instagram: { name: 'Instagram Reels', min: 3, max: 900, maxMB: 1024, ratio: [0.5, 0.8], minW: 540 },
  facebook: { name: 'Facebook Reels', min: 3, max: 90, maxMB: 1024, ratio: [0.5, 0.6], minW: 540 },
  tiktok: { name: 'TikTok', min: 3, max: 600, maxMB: 4096, ratio: [0.5, 1], minW: 360 },
  youtube: { name: 'YouTube Shorts', min: 1, max: 180, maxMB: 4096, ratio: [0.5, 1], minW: 360 },
};

export function review(meta) {
  const out = {};
  for (const [net, r] of Object.entries(RULES)) {
    const why = [];
    if (!meta) { out[net] = { ok: false, why: ['No se pudo leer el video (¿no es MP4/MOV?)'] }; continue; }
    if (meta.duration < r.min) why.push(`dura ${meta.duration} s; mínimo ${r.min} s`);
    if (meta.duration > r.max) why.push(`dura ${meta.duration} s; máximo ${r.max} s`);
    if (meta.size > r.maxMB * 1048576) why.push(`pesa ${Math.round(meta.size / 1048576)} MB; máximo ${r.maxMB} MB`);
    const ratio = meta.height ? meta.width / meta.height : 0;
    if (ratio && (ratio < r.ratio[0] - 0.02 || ratio > r.ratio[1] + 0.02)) why.push(ratio > 1 ? 'es horizontal; tiene que ser vertical' : `proporción ${meta.width}×${meta.height}; lo ideal es 9:16`);
    if (meta.width && meta.width < r.minW) why.push(`ancho ${meta.width} px; mínimo ${r.minW} px`);
    out[net] = { ok: !why.length, why };
  }
  return out;
}
