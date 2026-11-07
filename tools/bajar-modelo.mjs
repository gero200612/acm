// Baja el modelo de vectores (multilingual-e5-small, cuantizado) a ./models para que ACM no dependa de internet al buscar.
// Lo corre el Dockerfile; en local: node tools/bajar-modelo.mjs  (o ACM_MODELS=/otra/carpeta)
import fs from 'node:fs';
import path from 'node:path';
const MODEL = 'Xenova/multilingual-e5-small';
const DIR = path.join(path.resolve(process.env.ACM_MODELS || './models'), MODEL);
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'];
for (const f of FILES) {
  const dest = path.join(DIR, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let i = 1; ; i++) {
    // retoma donde quedó: Hugging Face corta las descargas largas
    const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    try {
      const r = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${f}`, { headers: have ? { Range: `bytes=${have}-` } : {} });
      if (r.status === 416) break; // ya estaba completo
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.status === 206) fs.appendFileSync(dest, buf); else fs.writeFileSync(dest, buf);
      const total = Number((r.headers.get('content-range') || '').split('/')[1] || r.headers.get('content-length'));
      if (!total || fs.statSync(dest).size >= total) break;
    } catch (e) {
      if (i >= 10) throw new Error(`No se pudo bajar ${f}: ${e.message}`);
      console.log(`${f}: ${e.message}, reintento ${i}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  console.log(`${f}: ${(fs.statSync(dest).size / 1048576).toFixed(1)} MB`);
}
