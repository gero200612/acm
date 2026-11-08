// Videos en Cloudflare R2: el navegador sube directo con un link firmado (el servidor no recibe los gigas),
// el panel los muestra con links firmados y el programador los baja solo cuando tiene que subirlos a una red.
// Sin las variables ACM_R2_* todo sigue en el disco del servidor, como antes.
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const env = () => ({
  account: process.env.ACM_R2_ACCOUNT_ID || '',
  key: process.env.ACM_R2_ACCESS_KEY_ID || '',
  secret: process.env.ACM_R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.ACM_R2_BUCKET || '',
  endpoint: process.env.ACM_R2_ENDPOINT || '', // para pruebas contra el simulador
});
export const r2Ready = () => { const e = env(); return !!(e.key && e.secret && e.bucket && (e.account || e.endpoint)); };
export const MAX_UPLOAD = 5 * 1024 ** 3; // R2 acepta hasta 5 GB en una sola subida

let client = null;
const s3 = () => {
  if (client) return client;
  const e = env();
  client = new S3Client({
    region: 'auto', endpoint: e.endpoint || `https://${e.account}.r2.cloudflarestorage.com`, forcePathStyle: true,
    credentials: { accessKeyId: e.key, secretAccessKey: e.secret },
    // R2 no usa los checksums nuevos del SDK: sin esto, la subida desde el navegador falla
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return client;
};
const B = () => env().bucket;

export const putUrl = (key, type) => getSignedUrl(s3(), new PutObjectCommand({ Bucket: B(), Key: key, ContentType: type }), { expiresIn: 6 * 3600 });
export const getUrl = (key, seconds = 3600) => getSignedUrl(s3(), new GetObjectCommand({ Bucket: B(), Key: key }), { expiresIn: seconds });
export async function head(key) {
  try { const r = await s3().send(new HeadObjectCommand({ Bucket: B(), Key: key })); return { size: Number(r.ContentLength) || 0, type: r.ContentType || '' }; }
  catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null; throw e; }
}
export const remove = (key) => s3().send(new DeleteObjectCommand({ Bucket: B(), Key: key }));
export async function download(key, dest) {
  const r = await s3().send(new GetObjectCommand({ Bucket: B(), Key: key }));
  await pipeline(r.Body, fs.createWriteStream(dest));
  return dest;
}
