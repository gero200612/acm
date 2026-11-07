// Levanta el simulador en el puerto 3999. Para usarlo con ACM:
// ACM_GRAPH_URL=http://127.0.0.1:3999/graph ACM_RUPLOAD_URL=http://127.0.0.1:3999/rup ACM_TIKTOK_URL=http://127.0.0.1:3999/tt
// ACM_GOOGLE_OAUTH_URL=http://127.0.0.1:3999/goauth ACM_YOUTUBE_URL=http://127.0.0.1:3999/yt ACM_YT_UPLOAD_URL=http://127.0.0.1:3999/ytup
import { startSimulator } from '../simulator.js';
const s = await startSimulator(3999);
console.log('Simulador en', s.url);
