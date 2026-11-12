// ACM — panel. Sin framework: rutas por hash, render con plantillas y delegación de eventos.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d });
const usd = (n) => 'USD ' + fmt(Math.round(n));

const LOGO = () => '<img class="logo" src="/logo.png" alt="" aria-hidden="true">';
// íconos oficiales de cada red (trazos de Simple Icons, iguales a los de las marcas)
const NETS = {
  instagram: { name: 'Instagram', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>' },
  facebook: { name: 'Facebook', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fff"/><path fill="#0866FF" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>' },
  tiktok: { name: 'TikTok', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#25F4EE" transform="translate(-.6 -.6)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#FE2C55" transform="translate(.6 .6)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#fff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>' },
  youtube: { name: 'YouTube', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M8.5 7.5h8v9h-8z"/><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
};
// nombre de una cuenta: el que trajo la conexión, o la red mientras no está conectada
const accName = (a) => a.connected_as || a.handle ? (a.connected_as || '@' + a.handle) : `${NETS[a.network]?.name || a.network} sin conectar`;
const ACC_STATUS = { pendiente: 'Sin conectar', conectada: 'Conectada', error: 'Con error', pausada: 'Pausada' };
const ICON = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5 9-10',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  up: 'M12 16V4m0 0-5 5m5-5 5 5M4 20h16',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 5v14l11-7Z',
  left: 'm15 6-6 6 6 6',
  right: 'm9 6 6 6-6 6',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  move: 'M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  flask: 'M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9',
};
const icon = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[k]}"/></svg>`;
const netBadge = (n) => `<span class="net ${n}" title="${NETS[n]?.name || n}">${NETS[n]?.svg || ''}</span>`;
const initials = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
// size: true o 'lg' = grande, 'sm' = chico (barra lateral)
const avatar = (p, size) => { const c = `avatar${size === 'sm' ? ' sm' : size ? ' lg' : ''}`; return p.photo
  ? `<img class="${c}" src="/media/${esc(p.photo)}" alt="">`
  : `<span class="${c}" style="background:${esc(p.color)}">${esc(initials(p.name))}</span>`; };
function daysTo(date) {
  if (!date) return null;
  const t = new Date(date + 'T00:00:00'); const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t - now) / 864e5);
}
const countdown = (p) => { const d = daysTo(p.election_date); if (d === null) return ''; return `<span class="chip countdown">${d > 1 ? `Faltan ${d} días` : d === 1 ? 'Mañana es la elección' : d === 0 ? 'Hoy es la elección' : 'Elección terminada'}</span>`; };
const fmtDate = (s) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (s) => new Date(s.replace(' ', 'T')).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const pdate = (s) => new Date(String(s).replace(' ', 'T'));
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtShort = (s) => new Date(String(s).slice(0, 10) + 'T12:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtDay = (s) => pdate(s).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
const fmtK = (n) => n >= 1e6 ? fmt(n / 1e6, 1) + ' M' : n >= 1e4 ? fmt(n / 1e3) + ' mil' : fmt(n);
const localInput = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 16); };

// ---------- api ----------
async function api(url, opt = {}) {
  const o = { ...opt, headers: { ...(opt.headers || {}) } };
  if (o.body && !(o.body instanceof FormData)) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.body); }
  const r = await fetch(url, o);
  if (r.status === 401 && !url.endsWith('/login')) { state.authed = false; render(); throw new Error('Sin sesión'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Algo falló');
  return data;
}
function toast(msg, err, action) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  if (action) {
    const b = document.createElement('button'); b.className = 'toast-act'; b.textContent = action.label;
    b.addEventListener('click', () => { t.remove(); action.fn(); }, { once: true });
    t.append(b);
  }
  $('#toasts').append(t); setTimeout(() => t.remove(), action ? 6000 : 3200);
}
const fail = (e) => toast(e.message || 'Algo falló', true);

// ---------- estado ----------
const state = { authed: false, projects: [], project: null, accounts: [], reels: [], posts: [], uploads: [] };
try { state.calMode = localStorage.getItem('acm.calMode') || 'mes'; } catch { state.calMode = 'mes'; }

async function loadProjects() { state.projects = await api('/api/projects'); }
async function loadProject(id) {
  const [p, a, r, s] = await Promise.all([api(`/api/projects/${id}`), api(`/api/projects/${id}/accounts`), api(`/api/projects/${id}/reels`), api(`/api/projects/${id}/posts`)]);
  state.project = p; state.accounts = a; state.reels = r; state.posts = s;
}

function route() {
  const [, a, id, tab, sub] = location.hash.replace(/^#/, '').split('/');
  if (a === 'p' && id) return { view: 'project', id: Number(id), tab: tab || 'resumen', sub: Number(sub) || 0 };
  if (a === 'lab') return { view: 'lab', tab: id || 'corridas' };
  return { view: 'home' };
}

// ---------- render ----------
async function render() {
  const app = $('#app');
  if (!state.authed) { app.innerHTML = loginView(); $('#pw')?.focus(); return; }
  const r = route();
  try {
    await loadProjects();
    if (state.storage == null) state.storage = await api('/api/storage').catch(() => ({ r2: false }));
    if (r.view === 'project') { await loadProject(r.id); state.sub = r.sub; if (r.tab === 'campanas') state.camps = await api(`/api/projects/${r.id}/campaigns`); if (r.tab === 'aprobar') state.review = await api(`/api/projects/${r.id}/review`); if (r.tab === 'memoria') state.memory = await api(`/api/projects/${r.id}/memory`); if (r.tab === 'investigacion' && state.agent == null) state.agent = (await api('/api/agent')).ready; }
    else if (r.view === 'lab') await loadLab(r.tab);
    else state.overview = await api('/api/overview');
  } catch (e) { if (e.message !== 'Sin sesión') { fail(e); location.hash = ''; } return; }
  const head = r.view === 'lab' ? `<div><h1 class="page-title">Laboratorio</h1><p class="lead">Lo que hizo ACM paso a paso, el banco de pruebas y el control técnico de los reels.</p></div>` : r.view === 'project' ? projectHead(state.project) : `<div><h1 class="page-title">Inicio</h1><p class="lead">Todas las campañas, sus cuentas y lo que sale publicado.</p></div><button class="btn primary" data-act="new-project">${icon('plus')} Nuevo proyecto</button>`;
  const body = r.view === 'lab' ? labView(r.tab) : r.view === 'project' ? projectView(r.tab) : homeView();
  app.innerHTML = `
  <div class="layout">
    <header class="mobilebar"><button class="burger" data-act="menu" aria-label="Abrir menú"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>ACM</header>
    <div class="scrim" data-act="menu"></div>
    <aside class="side">${sideNav(r)}</aside>
    <div class="main"><header class="topbar">${head}</header><main class="page">${body}</main></div>
  </div>`;
  afterRender(r);
}

function sideNav(r) {
  return `
  <a class="brand" href="#"><span class="mark">${LOGO()}ACM</span><span class="sub">Agentic Campaign Manager</span></a>
  <nav aria-label="Principal">
    <a class="item ${r.view === 'home' ? 'active' : ''}" href="#">${icon('home', 20)}<span class="t">Inicio</span></a>
    <a class="item ${r.view === 'lab' ? 'active' : ''}" href="#/lab">${icon('flask', 20)}<span class="t">Laboratorio</span></a>
    <div class="nav-label">Proyectos</div>
    ${state.projects.map((p) => `<a class="item ${r.id === p.id ? 'active' : ''}" href="#/p/${p.id}">${avatar(p, 'sm')}<span class="t">${esc(p.name)}</span>${p.review_pending ? `<span class="count" title="Recortes para aprobar">${p.review_pending}</span>` : ''}</a>`).join('')}
    <button class="item add" data-act="new-project">${icon('plus', 20)}<span class="t">Nuevo proyecto</span></button>
  </nav>
  <div class="side-foot"><span class="live"><i></i>En línea</span><button data-act="logout">Salir</button></div>`;
}

function loginView() {
  return `<div class="login"><form id="login-form">
    <div><div class="mark">${LOGO()}ACM</div><p class="muted small">Agentic Campaign Manager</p></div>
    <label class="field">Contraseña<input class="input" id="pw" type="password" autocomplete="current-password" required></label>
    <div class="err" id="login-err"></div>
    <button class="btn primary" type="submit">Entrar</button>
  </form></div>`;
}

// ---------- inicio ----------
function homeView() {
  const P = state.projects, O = state.overview || { upcoming: [], upcoming14: [], networks: [], byProject: [], next: [] };
  const sum = (k) => P.reduce((a, p) => a + (p[k] || 0), 0);
  const nets = (pid) => O.byProject.filter((x) => x.project_id === pid);
  const nextOf = (pid) => O.next.find((x) => x.project_id === pid)?.at;
  const kpis = `<div class="home-kpis">
    <div><span class="lbl">Proyectos</span><b>${P.length}</b><span class="sub">${fmt(sum('padron'))} personas en los padrones</span></div>
    <div><span class="lbl">Cuentas conectadas</span><b>${sum('accounts_live')}<small>/${sum('accounts')}</small></b><span class="sub">en ${O.networks.length} redes</span></div>
    <div><span class="lbl">Reels</span><b>${sum('reels')}</b><span class="sub">cargados en total</span></div>
    <div><span class="lbl">Programadas</span><b>${sum('scheduled')}</b><span class="sub">${sum('published')} ya publicadas</span></div>
    <div><span class="lbl">Pauta</span><b>${usd(P.reduce((a, p) => a + (Number(p.pauta?.budget) || 0), 0))}</b><span class="sub">invertida en todos</span></div>
  </div>`;
  const rows = P.map((p) => { const c = pautaCalc(p, p.pauta); const dE = daysTo(p.election_date); const nx = nextOf(p.id); return `
    <a class="hp" href="#/p/${p.id}" style="--c:${esc(p.color)}">
      <div class="hp-who">${avatar(p, true)}<div class="hp-name"><b>${esc(p.name)}</b><span>${esc([p.role, p.org].filter(Boolean).join(' · ') || 'Sin cargo cargado')}</span></div>${countdown(p)}</div>
      <div class="hp-stats">
        <div><span class="lbl">Elección</span><b>${dE === null ? '—' : dE >= 0 ? dE + ' días' : 'Terminó'}</b><span>${p.election_date ? fmtShort(p.election_date) : 'sin fecha'}${p.propaganda_until ? ' · propaganda hasta ' + fmtShort(p.propaganda_until) : ''}</span></div>
        <div><span class="lbl">Padrón</span><b>${p.padron ? fmt(p.padron) : '—'}</b><span>${p.padron_contacts ? fmt(p.padron_contacts) + ' contactables' : 'sin archivo'}</span></div>
        <div><span class="lbl">Cuentas</span><b>${p.accounts_live}/${p.accounts}</b><span class="hp-nets">${nets(p.id).map((x) => `${netBadge(x.network)}<small>${x.n}</small>`).join('') || 'ninguna'}</span></div>
        <div><span class="lbl">Reels</span><b>${p.reels}</b><span>${p.scheduled} programadas · ${p.published} publicadas</span></div>
        <div><span class="lbl">Pauta</span><b>${c.budget ? usd(c.budget) : '—'}</b><span>${c.budget ? `cada socio la ve ${fmt(c.freq, c.freq < 10 ? 1 : 0)} veces` : 'sin cargar'}</span></div>
        <div><span class="lbl">Próxima</span><b>${nx ? fmtTime(nx) : '—'}</b><span>${nx ? fmtDay(nx) : 'nada programado'}</span></div>
      </div>
    </a>`; }).join('');
  // actividad de los próximos 14 días, todos los proyectos
  const days14 = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
  const perDay = days14.map((d) => O.upcoming14.filter((x) => sameDay(pdate(x.scheduled_at), d)));
  const maxD = Math.max(1, ...perDay.map((l) => l.length));
  const activity = `<section class="card home-act"><div class="card-head"><h2 class="h2">Próximas dos semanas</h2><span class="small muted">${perDay.reduce((a, l) => a + l.length, 0)} publicaciones en todos los proyectos</span></div>
    <div class="ha">${days14.map((d, i) => { const L = perDay[i]; return `<div class="ha-d ${i === 0 ? 'today' : ''}" title="${L.length} publicaciones">
      <span class="ha-bar">${P.map((p) => { const n = L.filter((x) => x.project_id === p.id).length; return n ? `<i style="height:${n / maxD * 100}%;background:${esc(p.color)}"></i>` : ''; }).join('')}</span>
      <b>${L.length || ''}</b><span>${d.toLocaleDateString('es-AR', { weekday: 'narrow' })} ${d.getDate()}</span></div>`; }).join('')}</div>
    <div class="ha-leg">${P.map((p) => `<span><i style="background:${esc(p.color)}"></i>${esc(p.name)}</span>`).join('')}</div></section>`;
  const agenda = O.upcoming.length ? O.upcoming.slice(0, 9).map((x) => `<a class="ag" href="#/p/${x.project_id}/calendario"><span class="ag-t"><b>${fmtTime(x.scheduled_at)}</b>${fmtDay(x.scheduled_at)}</span>${netBadge(x.network)}<span class="ag-w"><b>${esc(x.reel_title)}</b><span><i class="dot" style="background:${esc(x.color)}"></i>${esc(x.project)} · ${esc(x.handle ? '@' + x.handle : NETS[x.network].name)}</span></span></a>`).join('')
    : '<p class="muted small">No hay publicaciones programadas.</p>';
  const netCards = Object.keys(NETS).map((n) => { const x = O.networks.find((y) => y.network === n) || { total: 0, live: 0, followers: 0 }; return `<div class="hn">${netBadge(n)}<div><b>${x.live}/${x.total}</b><span>${NETS[n].name} · ${x.followers ? fmtK(x.followers) + ' seg.' : 'conectadas'}</span></div></div>`; }).join('');
  return `<div class="home">
    ${kpis}
    <div class="home-grid">
      <section class="card home-projects"><div class="card-head"><h2 class="h2">Proyectos</h2><button class="btn sm primary" data-act="new-project">${icon('plus', 16)} Nuevo proyecto</button></div>
        ${rows ? rows : `<div class="empty"><h2 class="h2">Todavía no hay proyectos</h2><p>Cada proyecto es un dirigente o candidato con sus cuentas, reels y pauta.</p><button class="btn primary" data-act="new-project">${icon('plus')} Nuevo proyecto</button></div>`}
      </section>
      ${P.length ? activity : ''}
      <aside class="home-side">
        <section class="card"><div class="card-head"><h2 class="h2">Cuentas por red</h2></div><div class="hn-grid">${netCards}</div></section>
        <section class="card home-agenda"><div class="card-head"><h2 class="h2">Agenda</h2><span class="small muted">próximas en todos los proyectos</span></div>${agenda}</section>
      </aside>
    </div>
  </div>`;
}


// ---------- laboratorio ----------
const RUN_KIND = { publicacion: 'Publicación', conexion: 'Prueba de conexión', meta_ads: 'Meta Ads', pauta: 'Pauta', banco: 'Banco de pruebas' };
const RUN_ST = { ok: 'Bien', error: 'Falló', corriendo: 'Corriendo', cortada: 'Cortada' };
async function loadLab(tab) {
  state.lab ||= { kind: '', sel: null, detail: null };
  if (tab === 'reels') { state.lab.reels = await api('/api/lab/reels'); return; }
  const kind = tab === 'banco' ? 'banco' : state.lab.kind;
  state.lab.runs = await api('/api/lab/runs' + (kind ? `?kind=${kind}` : ''));
  if (tab === 'banco' && !state.lab.bancoSel && state.lab.runs[0]) state.lab.bancoSel = state.lab.runs[0].id;
  const want = tab === 'banco' ? state.lab.bancoSel : state.lab.sel;
  state.lab.detail = want ? await api(`/api/lab/runs/${want}`).catch(() => null) : null;
}
const when = (s) => { const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('T') ? '' : 'Z')); return d.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); };
const ms = (n) => n == null ? '' : n < 1000 ? `${n} ms` : `${fmt(n / 1000, 1)} s`;
function labView(tab) {
  const tabs = [['corridas', 'Corridas'], ['banco', 'Banco de pruebas'], ['reels', 'Revisión de reels']];
  const nav = `<nav class="tabs">${tabs.map(([k, l]) => `<a href="#/lab/${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
  return nav + (tab === 'banco' ? labBanco() : tab === 'reels' ? labReels() : labCorridas());
}
function traceView(d) {
  if (!d) return `<div class="empty"><h2 class="h2">Elegí una corrida</h2><p>Vas a ver cada llamada a las redes con su respuesta y su tiempo. Los tokens nunca se guardan.</p></div>`;
  const r = d.run;
  return `<div class="card-head"><div><h2 class="h2">${esc(r.title || RUN_KIND[r.kind])}</h2><p class="small muted">${RUN_KIND[r.kind] || r.kind}${r.project ? ' · ' + esc(r.project) : ''} · ${when(r.started_at)} · ${ms(r.ms)}</p></div><span class="chip s-run-${r.status}">${RUN_ST[r.status] || r.status}</span></div>
    ${r.error ? `<p class="banner err">${esc(r.error)}</p>` : r.summary ? `<p class="banner ok">${esc(r.summary)}</p>` : ''}
    <ol class="tr">${d.steps.map((s) => `<li class="tr-${s.kind} ${/^[45]|falló|sin respuesta/.test(String(s.status)) ? 'bad' : ''}">
      <div class="tr-h"><span class="tr-k">${s.kind === 'http' ? 'API' : s.kind === 'caso' ? 'Caso' : 'Nota'}</span><code>${esc(s.label)}</code><span class="spacer"></span><span class="tr-s">${esc(s.status)}</span><span class="small muted">${ms(s.ms)}</span></div>
      ${s.detail ? `<pre>${esc(s.detail)}</pre>` : ''}</li>`).join('') || '<li class="muted small">Sin pasos registrados.</li>'}</ol>`;
}
function labCorridas() {
  const L = state.lab, R = L.runs || [];
  const kinds = [['', 'Todas'], ['publicacion', 'Publicaciones'], ['conexion', 'Conexiones'], ['meta_ads', 'Meta Ads'], ['banco', 'Banco']];
  const cnt = (k) => R.filter((r) => !k || r.kind === k);
  return `<div class="lab">
    <section class="card lab-list">
      <div class="card-head"><div class="seg">${kinds.map(([k, l]) => `<button data-act="lab-kind" data-k="${k}" aria-pressed="${L.kind === k}">${l}</button>`).join('')}</div>
        <span class="small muted">${R.length} corridas · ${R.filter((r) => r.status === 'error').length} con error</span></div>
      <div class="table-wrap"><table class="list lab-t"><thead><tr><th>Cuándo</th><th>Qué</th><th>Estado</th><th class="r">Duró</th></tr></thead><tbody>
        ${R.map((r) => `<tr data-act="lab-open" data-rid="${r.id}" class="${L.sel === r.id ? 'sel' : ''}">
          <td class="nowrap small">${when(r.started_at)}</td>
          <td><div class="handle" style="font-weight:500">${r.network && NETS[r.network] ? netBadge(r.network) : `<span class="net" style="background:var(--navy)">${icon('flask', 14)}</span>`}<div class="lab-what">${esc(r.title || RUN_KIND[r.kind])}<small>${RUN_KIND[r.kind] || r.kind} · ${r.steps} ${r.steps === 1 ? 'paso' : 'pasos'}${r.project ? ` · <span class="pdot" style="background:${esc(r.color)}"></span>${esc(r.project)}` : ''}</small>${r.error || r.summary ? `<small class="${r.status === 'error' ? 'lab-err' : ''}">${esc(r.error || r.summary)}</small>` : ''}</div></div></td>
          <td><span class="chip s-run-${r.status}">${RUN_ST[r.status] || r.status}</span></td>
          <td class="r num small">${ms(r.ms)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted small" style="padding:30px;text-align:center">Todavía no hay corridas. Aparecen cuando ACM publica, prueba una conexión o usa Meta Ads.</td></tr>`}
      </tbody></table></div>
    </section>
    <section class="card lab-trace">${traceView(L.detail)}</section>
  </div>`;
}
function labBanco() {
  const L = state.lab, R = (L.runs || []).filter((r) => r.kind === 'banco'), d = L.detail;
  const casos = d ? d.steps.filter((s) => s.kind === 'caso') : [];
  const groups = [...new Set(casos.map((c) => c.label.split(' · ')[0]))];
  const ok = casos.filter((c) => c.status === 'ok').length;
  return `<div class="lab bk">
    <div class="lab-main">
      <section class="bk-hero">
        <div><span class="lbl">Último banco</span><b>${d ? `${ok}/${casos.length}` : '—'}</b><span class="sub">${d ? `${when(d.run.started_at)} · ${ms(d.run.ms)}` : 'todavía no se corrió'}</span></div>
        <div class="bk-txt"><p>Corre los casos contra un <b>simulador de Meta, TikTok y Google</b> que vive dentro de ACM: conectar y publicar en las cuatro redes, que los errores no muestren tokens, el padrón, la pauta, Meta Ads y las reglas del programador. Después hace el <b>recorrido completo</b> sobre una copia aislada de ACM: de entrar con la contraseña a publicar, pautar e investigar. No toca ninguna cuenta real ni la base de los proyectos.</p>
          <button class="btn accent" data-act="lab-banco" ${L.running ? 'disabled' : ''}>${L.running ? '<span class="spin"></span> Corriendo…' : 'Correr el banco de pruebas'}</button></div>
      </section>
      <div class="bk-groups">${groups.map((g) => `<section class="card"><div class="card-head"><h2 class="h2">${esc(g)}</h2><span class="small muted">${casos.filter((c) => c.label.startsWith(g + ' · ') && c.status === 'ok').length}/${casos.filter((c) => c.label.startsWith(g + ' · ')).length}</span></div>
        <ul class="bk-cases">${casos.filter((c) => c.label.startsWith(g + ' · ')).map((c) => `<li class="${c.status === 'ok' ? 'ok' : 'bad'}"><span class="ic">${c.status === 'ok' ? icon('check', 14) : icon('x', 14)}</span><div><b>${esc(c.label.slice(g.length + 3))}</b>${c.detail ? `<span>${esc(c.detail)}</span>` : ''}</div><span class="small muted">${ms(c.ms)}</span></li>`).join('')}</ul></section>`).join('') || `<section class="card empty"><h2 class="h2">Sin resultados todavía</h2><p>Tocá «Correr el banco de pruebas».</p></section>`}</div>
    </div>
    <section class="card lab-hist"><div class="card-head"><h2 class="h2">Historial</h2></div>
      <ul class="bk-hist">${R.map((r) => `<li><button data-act="lab-banco-sel" data-rid="${r.id}" class="${L.bancoSel === r.id ? 'sel' : ''}"><span class="chip s-run-${r.status}">${esc((r.summary || r.error || '').replace(/^Pasaron (los )?/, '').replace(' casos', ''))}</span><span class="small">${when(r.started_at)}</span><span class="small muted">${ms(r.ms)}</span></button></li>`).join('') || '<li class="muted small">Nada todavía.</li>'}</ul></section>
  </div>`;
}
function labReels() {
  const R = state.lab.reels || [];
  const nets = Object.keys(NETS);
  const okAll = R.filter((r) => nets.every((n) => r.review[n].ok)).length;
  return `<section class="card">
    <div class="card-head"><div><h2 class="h2">Control técnico de los reels</h2><p class="small muted">Duración, tamaño, proporción y peso de cada video contra lo que pide cada red. Se mide solo al subirlo.</p></div><span class="chip ${okAll === R.length ? 's-conectada' : 's-pausada'}">${okAll} de ${R.length} sirven para las cuatro redes</span></div>
    <div class="table-wrap"><table class="list rv-t"><thead><tr><th>Reel</th><th>Proyecto</th><th class="r">Duración</th><th class="r">Tamaño</th><th class="r">Peso</th>${nets.map((n) => `<th class="c">${netBadge(n)}</th>`).join('')}</tr></thead><tbody>
      ${R.map((r) => `<tr><td><div class="handle"><video src="/media/${esc(r.file)}#t=0.5" preload="metadata" muted></video><div>${esc(r.title)}<small>${esc(r.original_name || '')}</small></div></div></td>
        <td class="small"><span class="pdot" style="background:${esc(r.color)}"></span>${esc(r.project)}</td>
        <td class="r num">${r.duration != null ? fmt(r.duration, 1) + ' s' : '—'}</td>
        <td class="r num small">${r.width ? `${r.width}×${r.height}` : '—'}</td>
        <td class="r num small">${fmt(r.size / 1048576, 1)} MB</td>
        ${nets.map((n) => { const v = r.review[n]; return `<td class="c"><span class="rv ${v.ok ? 'ok' : 'bad'}" title="${esc(v.why.join(' · ') || 'Cumple')}">${v.ok ? icon('check', 14) : icon('x', 14)}</span>${v.ok ? '' : `<small class="rv-why">${esc(v.why[0])}</small>`}</td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="9" class="muted small" style="padding:30px;text-align:center">No hay reels cargados.</td></tr>`}
    </tbody></table></div>
    <p class="small muted" style="margin-top:12px">Reglas: Instagram 3 s a 15 min · Facebook 3 a 90 s · TikTok hasta 10 min · YouTube Shorts hasta 3 min; todos verticales (9:16), al menos 540 px de ancho para Meta.</p>
  </section>`;
}

// ---------- proyecto ----------
function projectHead(p) {
  return `<div class="who">${avatar(p, true)}<div style="min-width:0"><h1 class="page-title">${esc(p.name)}</h1><p class="lead">${esc([p.role, p.org].filter(Boolean).join(' · ') || 'Proyecto')}</p></div></div>
  <div class="row">${p.demo ? '<span class="chip s-pausada" title="No publica ni pauta nada">Demo · no publica</span>' : ''}${countdown(p)}${p.padron ? `<span class="chip nodot">Padrón ${fmt(p.padron)}</span>` : ''}</div>`;
}
const TABS = [['resumen', 'Resumen'], ['cuentas', 'Cuentas'], ['reels', 'Reels'], ['aprobar', 'Para aprobar'], ['calendario', 'Calendario'], ['pauta', 'Pauta'], ['campanas', 'Campañas'], ['memoria', 'Memoria'], ['investigacion', 'Investigación'], ['ajustes', 'Ajustes']];
function projectView(tab) {
  const p = state.project;
  const counts = { cuentas: state.accounts.length, reels: state.reels.length, aprobar: p.review_pending, calendario: state.posts.filter((x) => x.status === 'programado').length };
  const on = tab === 'reel' ? 'reels' : tab;
  const tabs = `<nav class="tabs">${TABS.map(([k, l]) => `<a href="#/p/${p.id}/${k}" class="${on === k ? 'active' : ''}">${l}${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</a>`).join('')}</nav>`;
  const views = { resumen: resumenView, cuentas: cuentasView, reels: reelsView, calendario: calendarioView, aprobar: aprobarView, pauta: pautaView, campanas: campanasView, memoria: memoriaView, reel: reelDetailView, investigacion: investigacionView, ajustes: ajustesView };
  return tabs + (views[tab] || resumenView)();
}


// ---------- Para aprobar: cada recorte con sus 3 ediciones lado a lado ----------
function recetaResumen(r) {
  if (!r) return '';
  const v = r.variables || {}, gancho = v.gancho || (r.gancho?.texto ? 'con texto' : 'directo');
  const musica = r.musica === null ? 'sin' : (r.musica?.clima || v.musica || '—');
  return [['Gancho', gancho + (r.gancho?.texto ? ` «${r.gancho.texto}»` : '')], ['Subtítulos', r.subtitulos || v.subtitulos], ['Música', musica], ['Ritmo', r.ritmo], ['Largo', r.largo_s ? `${Math.round(r.largo_s)} s` : v.largo]]
    .filter(([, x]) => x).map(([k, x]) => `<li><span>${k}</span><b>${esc(x)}</b></li>`).join('');
}
function aprobarView() {
  const p = state.project, R = state.review || { clips: [], pending: 0, review_mode: p.review_mode };
  const auto = R.review_mode === 'auto';
  const head = `<div class="ap-head"><div><h2 class="h2">Para aprobar <span class="count">${R.pending}</span></h2><p class="muted small">${R.pending ? `${R.pending} ${R.pending === 1 ? 'recorte espera' : 'recortes esperan'} tu decisión. Aprobás o rechazás todas sus versiones juntas.` : 'No hay recortes esperando.'}</p></div>
    <div class="row"><span class="chip ${auto ? 's-conectada' : 'nodot'}" title="${auto ? 'Lo que el analista aprueba entra solo; lo dudoso siempre espera acá. Un rechazo tuyo la vuelve a manual.' : 'Con 19 de los últimos 20 recortes aprobados pasa a automática.'}">Revisión ${auto ? 'automática' : 'manual'}</span>
    <button class="btn sm" data-act="share-open">${icon('link', 15)} Compartir para aprobar</button></div></div>`;
  const rec = (R.recent || []).length ? `<h2 class="h2" style="margin-top:8px">Aprobados recientes</h2>${R.recent.map((c) => `
  <section class="card ap-clip" data-clip="${esc(c.clip_id)}">
    <div class="card-head"><h2 class="h2">${esc(c.moment?.tema || c.clip_id)}</h2><span class="small muted">${c.reels.filter((r) => r.review === 'aprobado').length} aprobadas</span></div>
    <div class="ap-eds">${c.reels.map((r, i) => `<article class="ap-ed ${r.review === 'rechazado' ? 'no' : ''}"><video src="/media/${esc(r.file)}" controls preload="metadata" playsinline></video><b>Versión ${i + 1}</b><ul class="ap-recipe">${recetaResumen(r.recipe)}</ul></article>`).join('')}</div>
    <label class="field">Motivo <span class="small muted">(obligatorio para rechazar)</span><textarea class="input ap-note" rows="2" maxlength="2000"></textarea></label>
    <div class="row"><button class="btn" data-act="ap-no-all">Rechazar</button></div>
  </section>`).join('')}` : '';
  if (!R.clips.length) return `<div class="ap"><section class="card">${head}<p class="muted" style="margin-top:12px">Cuando el editor entregue recortes nuevos, aparecen acá.</p></section>${rec}</div>`;
  return `<div class="ap">${head}${R.clips.map((c) => `
  <section class="card ap-clip" data-clip="${esc(c.clip_id)}">
    <div class="card-head"><h2 class="h2">${esc(c.moment?.tema || c.clip_id)}</h2><span class="small muted">${c.moment?.motivo ? esc(c.moment.motivo) : ''}</span></div>
    <div class="ap-eds">${c.reels.map((r, i) => `
      <article class="ap-ed ${r.review === 'rechazado' ? 'no' : ''}" data-id="${r.id}">
        <video src="/media/${esc(r.file)}" ${r.cover ? `poster="/media/${esc(r.cover)}"` : ''} controls preload="metadata" playsinline></video>
        <div class="ap-ed-h"><b>Versión ${i + 1}</b>${r.review === 'aprobado' ? '<span class="chip s-conectada">Aprobada</span>' : r.review === 'rechazado' ? '<span class="chip s-error">Rechazada</span>' : ''}</div>
        <ul class="ap-recipe">${recetaResumen(r.recipe)}</ul>
        <p class="ap-cap">${esc(r.caption || '')}</p>
        ${r.hashtags ? `<p class="small muted">${esc(r.hashtags)}</p>` : ''}
        ${r.review === 'rechazado' ? '' : `<label class="small ap-pick"><input type="checkbox" data-rid="${r.id}"> Rechazar solo esta</label>`}
      </article>`).join('')}</div>
    <label class="field">Comentario <span class="small muted">(obligatorio para rechazar; sirve para aprender qué te gusta)</span><textarea class="input ap-note" rows="2" maxlength="2000" placeholder="Por ejemplo: los subtítulos tapan la cara"></textarea></label>
    <div class="row"><button class="btn primary" data-act="ap-ok">Aprobar las 3</button><button class="btn" data-act="ap-no">Rechazar lo marcado</button><button class="btn" data-act="ap-no-all">Rechazar las 3</button></div>
  </section>`).join('')}${rec}</div>`;
}

// ---------- Memoria: lo que el proyecto va aprendiendo ----------
const MEM_VARS = { gancho: 'Gancho', subtitulos: 'Subtítulos', musica: 'Música', ritmo: 'Ritmo', largo: 'Largo', horario: 'Horario' };
const MEM_KINDS = { promover: 'Promover', corte: 'Corte', pausa_total: 'Pausa total', rechazo: 'Rechazo', espera: 'Espera', mover: 'Mover plata' };
function memoriaView() {
  const M = state.memory || { decisions: [], comparisons: [], aprendizajes: [], ganadoras: {} };
  const g = M.ganadoras || {};
  const gan = Object.entries(g).map(([k, v]) => `<li><b>${esc(MEM_VARS[k] || k)}</b>: ${k === 'horario' ? Object.entries(v).map(([n, h]) => `${esc(n)} ${esc(h)}`).join(', ') : esc(v)}</li>`).join('');
  const rows = (M.aprendizajes || []).map((a) => `<tr><td>${esc(MEM_VARS[a.variable] || a.variable)}</td><td>${esc(a.value)}${a.network ? ` <span class="muted small">(${esc(a.network)})</span>` : ''}</td><td>${fmt(a.wins, 1)} de ${fmt(a.trials, 1)}</td><td>${fmt(a.rate * 100)} %</td></tr>`).join('');
  const cmp = (M.comparisons || []).map((c) => `<article class="card"><div class="card-head"><h3 class="h2">Recorte ${esc(c.clip_id)}</h3><span class="small muted">${esc(String(c.created_at).slice(0, 16))}</span></div>
    <p class="small">Ganó la edición #${c.winner_reel_id} por ${fmt(c.diff, 3)} de puntaje. Receta: ${Object.entries(c.winner_recipe?.variables || {}).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(' · ') || 'sin datos'}</p>
    <p>${esc(c.hypothesis)}</p></article>`).join('');
  const dec = (M.decisions || []).map((d) => `<tr><td class="small muted">${esc(d.at)}</td><td>${esc(MEM_KINDS[d.kind] || d.kind)}</td><td>${esc(d.target)}</td><td>${esc(d.reason)}</td></tr>`).join('');
  return `<div class="ap">
    <section class="card"><h2 class="h2">Lo que está ganando</h2>
      ${gan ? `<ul>${gan}</ul><p class="muted small">Esto es lo que el editor usa al armar las próximas ediciones. Una variable entra con 5 intentos o más.</p>` : '<p class="muted">Todavía no hay nada ganador: una variable necesita 5 intentos. Se junta a medida que Gero aprueba o rechaza recortes y las versiones publicadas de cada uno se comparan.</p>'}
    </section>
    <section class="card"><h2 class="h2">Aprendizajes</h2>${rows ? `<table class="list"><thead><tr><th>Variable</th><th>Valor</th><th>Victorias</th><th>Tasa</th></tr></thead><tbody>${rows}</tbody></table><p class="muted small">La opinión de Gero pesa 3 veces.</p>` : '<p class="muted">Sin aprendizajes todavía.</p>'}</section>
    <section><h2 class="h2">Comparaciones de recortes</h2>${cmp || '<p class="muted">Cuando las versiones publicadas de un recorte tienen 48 horas de datos, se comparan acá.</p>'}</section>
    <section class="card"><h2 class="h2">Decisiones del agente</h2>${dec ? `<table class="list"><tbody>${dec}</tbody></table>` : '<p class="muted">El agente de marketing todavía no tomó decisiones.</p>'}</section>
  </div>`;
}

// Datos fijos del cálculo (no se tocan desde la pantalla): CPM de Meta en Argentina (mediana jul-2025/jul-2026 según Superads, ver investigación 2026-11-11),
// parte del padrón que Meta reconoce con teléfono o mail, e IVA de servicios digitales del exterior.
const PAUTA_DATOS = { cpm: 3.6, match_pct: 60, iva: 0.21 };
const today = () => localInput(new Date()).slice(0, 10);
function pautaCalc(p, pa) {
  pa = pa || {};
  const from = pa.start_date || today();
  const limit = p.propaganda_until || p.election_date || '';
  let to = pa.end_date || limit;
  if (limit && to > limit) to = limit;
  const days = to ? Math.max(1, Math.round((new Date(to + 'T00:00') - new Date(from + 'T00:00')) / 864e5) + 1) : 30;
  const budget = Number(pa.budget) || 0;
  const net = budget / (1 + PAUTA_DATOS.iva);
  const imps = net / PAUTA_DATOS.cpm * 1000;
  // con el padrón subido se usa la cantidad real de socios con teléfono o mail; si no, una estimación sobre el total
  const base = p.padron_contacts || p.padron || 0;
  const people = Math.round(base * PAUTA_DATOS.match_pct / 100);
  const freq = people ? imps / people : 0;
  const weeks = days / 7;
  return { from, to, limit, days, weeks, budget, net, imps, people, base, real: !!p.padron_contacts, freq, perWeek: freq / Math.max(1, weeks), perDay: budget / days };
}
const pautaVerdict = (f) => f < 3 ? ['poco', 'Poco', 'Con menos de 3 vistas por persona casi nadie la recuerda.']
  : f > 30 ? ['de-mas', 'De más', 'Pasadas las 30 vistas por persona la gente se satura.']
  : f < 8 ? ['justo', 'Justo', 'Alcanza para que la vean, pero queda corto para que se instale el mensaje.']
  : ['bien', 'Bien', 'Cada persona la ve las veces suficientes para recordarla sin cansarse.'];

function resumenView() {
  const p = state.project, A = state.accounts, S = state.posts;
  const c = pautaCalc(p, p.pauta);
  const dE = daysTo(p.election_date), dP = daysTo(p.propaganda_until || p.election_date);
  const live = A.filter((a) => a.status === 'conectada');
  const now = new Date();
  const upcoming = S.filter((x) => x.status === 'programado' && pdate(x.scheduled_at) >= now);
  // franja de los próximos 7 días
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
  const dayPosts = (d) => S.filter((x) => sameDay(pdate(x.scheduled_at), d));
  const maxDay = Math.max(1, ...week.map((d) => dayPosts(d).length));
  const v = pautaVerdict(c.freq);
  return `<div class="rs">
  <section class="rs-hero">
    <div class="rs-count"><span class="small">Elección</span><b>${dE === null ? '—' : dE > 0 ? dE : dE === 0 ? 'Hoy' : '✓'}</b><span>${dE === null ? 'cargá la fecha en Ajustes' : dE > 1 ? 'días' : dE === 1 ? 'día' : ''}${p.election_date ? ' · ' + fmtShort(p.election_date) : ''}</span></div>
    <div class="rs-count"><span class="small">Propaganda</span><b>${dP === null ? '—' : dP >= 0 ? dP + 1 : 0}</b><span>${dP !== null && dP >= 0 ? 'días para publicar y pautar' : 'terminó'}${p.propaganda_until ? ' · hasta ' + fmtShort(p.propaganda_until) : ''}</span></div>
    <div class="rs-next"><span class="small">Próximas publicaciones</span>
      ${upcoming.length ? upcoming.slice(0, 3).map((x) => `<div class="rs-next-row">${netBadge(x.network)}<div><b>${esc(x.reel_title)}</b><span>${esc(x.handle ? '@' + x.handle : NETS[x.network].name)} · ${fmtDay(x.scheduled_at)} ${fmtTime(x.scheduled_at)}</span></div></div>`).join('')
        : `<p>Nada programado. Subí reels y repartilos.</p><a class="btn sm accent" href="#/p/${p.id}/reels">Ir a Reels</a>`}</div>
  </section>

  <div class="rs-stats">
    <a class="rs-stat" href="#/p/${p.id}/ajustes"><span class="lbl">Padrón</span><b>${p.padron ? fmt(p.padron) : '—'}</b><span class="sub">${p.padron_contacts ? `${fmt(p.padron_contacts)} con teléfono o mail` : 'subí el archivo en Ajustes'}</span></a>
    <a class="rs-stat" href="#/p/${p.id}/cuentas"><span class="lbl">Cuentas conectadas</span><b>${live.length}<small>/${A.length}</small></b><span class="sub nets">${Object.keys(NETS).filter((n) => A.some((a) => a.network === n)).map((n) => netBadge(n)).join('') || 'agregá la primera'}</span></a>
    <a class="rs-stat" href="#/p/${p.id}/reels"><span class="lbl">Reels</span><b>${state.reels.length}</b><span class="sub">${upcoming.length} publicaciones programadas · ${p.published} publicadas</span></a>
    <a class="rs-stat" href="#/p/${p.id}/pauta"><span class="lbl">Pauta</span><b>${c.budget ? usd(c.budget) : '—'}</b><span class="sub">${c.budget ? `cada socio la ve ${fmt(c.freq, c.freq < 10 ? 1 : 0)} veces <span class="chip v-${v[0]}">${v[1]}</span>` : 'cargá la inversión'}</span></a>
  </div>

  <section class="card">
    <div class="card-head"><h2 class="h2">Próximos 7 días</h2><a class="btn sm" href="#/p/${p.id}/calendario">Abrir calendario</a></div>
    <div class="rs-week">${week.map((d) => { const L = dayPosts(d); const isE = p.election_date && sameDay(d, new Date(p.election_date + 'T00:00')); return `
      <a class="rs-day ${sameDay(d, new Date()) ? 'today' : ''} ${isE ? 'elec' : ''}" href="#/p/${p.id}/calendario" title="${L.length} publicaciones">
        <span class="wd">${d.toLocaleDateString('es-AR', { weekday: 'short' })}</span><span class="dn">${d.getDate()}</span>
        <span class="bar"><i style="height:${(L.length / maxDay) * 100}%"></i></span>
        <span class="n">${L.length || ''}</span>
        <span class="dots">${[...new Set(L.map((x) => x.network))].map((n) => `<i class="nd ${n}"></i>`).join('')}</span>
      </a>`; }).join('')}</div>
  </section>

  <div class="rs-row">
    <section class="card"><div class="card-head"><h2 class="h2">Cuentas</h2><a class="btn sm" href="#/p/${p.id}/cuentas">Ver todas</a></div>
      ${A.length ? `<ul class="rs-acc">${A.slice(0, 6).map((a) => `<li>${netBadge(a.network)}<span class="nm ${a.connected_as ? '' : 'muted'}">${esc(accName(a))}</span><span class="fl">${a.connected_as ? fmt(a.followers) + ' seg.' : ''}</span><span class="chip s-${a.status}">${ACC_STATUS[a.status]}</span></li>`).join('')}</ul>${A.length > 6 ? `<p class="small muted" style="margin-top:8px">y ${A.length - 6} más</p>` : ''}`
        : `<p class="muted small">Todavía no hay cuentas.</p><button class="btn sm primary" style="margin-top:10px" data-act="new-account">Agregar cuenta</button>`}
    </section>
    <section class="card"><div class="card-head"><h2 class="h2">Reels</h2><a class="btn sm" href="#/p/${p.id}/reels">Ver todos</a></div>
      ${state.reels.length ? `<div class="rs-reels">${state.reels.slice(0, 6).map((r) => `<a href="#/p/${p.id}/reels" title="${esc(r.title)}"><video src="/media/${esc(r.file)}#t=0.5" preload="metadata" muted></video><span>${esc(r.title)}</span><em>${r.posts} publ.</em></a>`).join('')}</div>`
        : `<p class="muted small">Todavía no hay reels.</p><a class="btn sm primary" style="margin-top:10px" href="#/p/${p.id}/reels">Subir reels</a>`}
    </section>
  </div>
  </div>`;
}

function cuentasView() {
  const A = state.accounts;
  const live = A.filter((a) => a.status === 'conectada').length;
  const side = `<aside class="ac-side">
    <section class="card"><div class="card-head"><h2 class="h2">Agregar cuenta</h2></div>
      <div class="ac-add">${Object.entries(NETS).map(([k, n]) => `<button data-act="add-net" data-net="${k}">${netBadge(k)}<span class="n">${n.name}</span>${icon('plus', 16)}</button>`).join('')}</div>
      <p class="small muted" style="margin-top:10px">El nombre de la cuenta lo trae la conexión.</p></section>
    <section class="card"><div class="card-head"><h2 class="h2">Por red</h2></div>
      <div class="ac-nets">${Object.keys(NETS).map((n) => { const L = A.filter((a) => a.network === n), on = L.filter((a) => a.status === 'conectada'); return `<div>${netBadge(n)}<span class="t">${NETS[n].name}</span><span class="bar"><i style="width:${L.length ? on.length / L.length * 100 : 0}%"></i></span><b>${on.length}/${L.length}</b></div>`; }).join('')}</div>
      <div class="ac-tot"><div><b>${live}</b><span>conectadas</span></div><div><b>${A.filter((a) => a.status === 'error').length}</b><span>con error</span></div><div><b>${fmtK(A.reduce((x, a) => x + (a.connected_as ? a.followers : 0), 0))}</b><span>seguidores</span></div></div></section>
    <p class="note"><b>Cómo se conecta:</b> cada cuenta entra por la vía oficial de su red, con el permiso de su dueño; ACM nunca guarda contraseñas. Los tokens quedan cifrados en el servidor y no se vuelven a mostrar.</p>
  </aside>`;
  const table = A.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Cuenta</th><th class="r">Seguidores</th><th>Conexión</th><th>Última prueba</th><th></th></tr></thead><tbody>
  ${A.map((a) => `<tr data-id="${a.id}">
    <td><div class="handle">${netBadge(a.network)}<div class="${a.connected_as ? '' : 'muted'}">${esc(accName(a))}<small>${NETS[a.network].name}</small></div></div></td>
    <td class="r num">${a.connected_as ? fmt(a.followers) : '—'}</td>
    <td><span class="chip s-${a.status}" ${a.status === 'error' ? `title="${esc(a.last_error)}"` : ''}>${ACC_STATUS[a.status] || esc(a.status)}</span></td>
    <td class="small muted">${a.last_checked_at ? new Date(a.last_checked_at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
    <td class="r nowrap"><button class="btn sm ${a.status === 'conectada' ? '' : 'primary'}" data-act="connect-account">${a.status === 'conectada' ? 'Ver conexión' : 'Conectar'}</button>
      <button class="icon-btn" data-act="pause-account" title="${a.status === 'pausada' ? 'Reanudar' : 'Pausar'}">${icon(a.status === 'pausada' ? 'play' : 'pause', 16)}</button><button class="icon-btn danger" data-act="del-account" title="Borrar">${icon('trash', 16)}</button></td>
  </tr>`).join('')}
  </tbody></table></div>` : `<div class="empty"><h2 class="h2">Sin cuentas todavía</h2><p>Elegí una red a la derecha para agregar la primera.</p></div>`;
  return `<div class="ac"><section class="card ac-main"><div class="card-head"><div><h2 class="h2">Cuentas</h2><p class="small muted">${live} de ${A.length} conectadas</p></div></div>${table}</section>${side}</div>`;
}

function reelsView() {
  const ALL = state.reels, F = state.reelFilter || 'todos';
  const R = F === 'todos' ? ALL : ALL.filter((r) => (r.kind || 'listo') === F);
  const up = state.uploads.length ? `<div class="up-box"><b>Subiendo ${state.uploads.length} ${state.uploads.length === 1 ? 'archivo' : 'archivos'}…</b><div class="progress"><i id="up-bar"></i></div></div>` : '';
  const sinRepartir = ALL.filter((r) => r.kind !== 'crudo' && !r.posts).length;
  const kind = state.upKind || 'listo';
  const side = `<aside class="rl-side">
    <div class="seg" role="radiogroup" aria-label="Qué estás subiendo">
      <button type="button" data-act="up-kind" data-k="listo" aria-pressed="${kind === 'listo'}"><b>Listo</b><span>editado, para publicar</span></button>
      <button type="button" data-act="up-kind" data-k="crudo" aria-pressed="${kind === 'crudo'}"><b>Crudo</b><span>sin editar, para editar</span></button>
    </div>
    <label class="drop" id="drop"><input type="file" id="reel-input" accept="video/*" multiple hidden>${icon('up', 28)}<p style="margin-top:8px"><b>Arrastrá los ${kind === 'crudo' ? 'crudos' : 'reels listos'} acá</b></p><p class="small">o tocá para elegirlos · MP4 o MOV, vertical 9:16, varios juntos · hasta ${state.storage?.r2 ? '5' : '1'} GB cada uno</p></label>
    ${up}
    <div class="rl-stats">
      <div><b>${ALL.filter((r) => r.kind !== 'crudo').length}</b><span>listos</span></div>
      <div><b>${ALL.filter((r) => r.kind === 'crudo').length}</b><span>crudos</span></div>
      <div><b>${sinRepartir}</b><span>sin repartir</span></div>
      <div><b>${ALL.reduce((a, r) => a + r.posts, 0)}</b><span>publicaciones</span></div>
    </div>
    <p class="note">${state.accounts.length ? `Con <b>Repartir</b> cada reel listo sale en una cuenta por red: el mismo video en dos cuentas de la misma red hace que la red las bloquee. Para más cuentas, subí otra edición del crudo.` : 'Cargá cuentas para poder repartir los reels.'}</p>
  </aside>`;
  const filt = `<div class="kn-chips rl-filter">${[['todos', 'Todos', ALL.length], ['listo', 'Listos', ALL.filter((r) => r.kind !== 'crudo').length], ['crudo', 'Crudos', ALL.filter((r) => r.kind === 'crudo').length]].map(([k, l, n]) => `<button type="button" data-act="reel-filter" data-k="${k}" aria-pressed="${F === k}">${l} <b>${n}</b></button>`).join('')}</div>`;
  const grid = R.length ? `<div class="reels">${R.map((r) => `<article class="reel" data-id="${r.id}">
    <a class="reel-link" href="#/p/${state.project.id}/reel/${r.id}" title="Ver en qué cuentas está">${r.archived_at ? `<div class="gone">Video borrado<span>se publicó hace más de ${state.storage?.retentionDays ?? 7} días</span></div>` : `<video src="/media/${esc(r.file)}#t=0.5" preload="metadata" muted playsinline></video>`}<span class="reel-ver">Ver dónde está</span></a>
    <div class="body">
      <input class="title" value="${esc(r.title)}" data-act="reel-title" aria-label="Título">
      <div class="meta">${r.kind === 'crudo' ? '<span class="chip s-crudo">Crudo</span>' : `<span class="chip s-${r.status}">${r.status === 'aprobado' ? 'Aprobado' : 'Borrador'}</span>`}<span>${mb(r.size)}</span></div>
      ${r.kind === 'crudo' ? `<a class="reel-nets none" href="#/p/${state.project.id}/reel/${r.id}">${(() => { const n = state.reels.filter((x) => x.source_id === r.id).length; return n ? `${n} ${n === 1 ? 'edición' : 'ediciones'}` : 'Sin ediciones todavía'; })()}</a>` : reelNets(r.id)}
      <div class="row" style="gap:6px">
        ${r.kind === 'crudo' ? `<a class="btn sm" href="#/p/${state.project.id}/reel/${r.id}">Ver crudo</a>` : `<button class="btn sm accent" data-act="distribute" ${state.accounts.length && !r.archived_at ? '' : 'disabled'}>Repartir</button>
        <button class="btn sm" data-act="reel-approve">${r.status === 'aprobado' ? 'A borrador' : 'Aprobar'}</button>`}
        <span class="spacer"></span><button class="icon-btn danger" data-act="del-reel" title="Borrar">${icon('trash', 16)}</button>
      </div>
    </div></article>`).join('')}</div>`
    : `<div class="card empty rl-empty"><h2 class="h2">Todavía no hay reels</h2><p>Arrastrá los videos ya editados a la izquierda.</p></div>`;
  return `<div class="rl">${side}<div class="rl-main">${ALL.length ? filt : ''}${grid}</div></div>`;
}

// Una publicación se puede mover (arrastrar a otro día) si todavía no salió y faltan más de 15 minutos.
const LOCK_MS = 15 * 60 * 1000;
const movable = (x) => (x.status === 'programado' || x.status === 'fallido') && pdate(x.scheduled_at) - Date.now() > LOCK_MS;
function calendarioView() {
  const p = state.project, S = state.posts;
  const week = state.calMode === 'semana';
  const m = state.calMonth || (state.calMonth = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })());
  const wk = state.calWeek || (state.calWeek = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })());
  const first = new Date(m); const start = week ? new Date(wk) : new Date(first); if (!week) start.setDate(1 - ((first.getDay() + 6) % 7)); // semana empieza el lunes
  const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
  const cells = week ? 7 : Math.ceil(((first.getDay() + 6) % 7 + last.getDate()) / 7) * 7;
  const elec = p.election_date ? new Date(p.election_date + 'T00:00') : null;
  const lim = p.propaganda_until ? new Date(p.propaganda_until + 'T00:00') : null;
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const days = Array.from({ length: cells }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const shown = S.filter((x) => { const d = pdate(x.scheduled_at); return week ? d >= days[0] && d < new Date(days[6].getTime() + 86400000) : d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear(); });
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const title = week
    ? `${days[0].getDate()} ${days[0].getMonth() !== days[6].getMonth() ? days[0].toLocaleDateString('es-AR', { month: 'short' }) + ' ' : ''}– ${days[6].getDate()} ${days[6].toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`
    : cap(m.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
  const ev = (x) => `<button class="cal-ev s-${x.status} ${movable(x) ? 'can-move' : ''}" data-act="open-post" data-pid="${x.id}" ${movable(x) ? 'data-drag="1"' : ''} title="${esc(x.reel_title)} · ${esc(x.handle ? '@' + x.handle : NETS[x.network].name)}${movable(x) ? ' · arrastrá para cambiar el día' : ''}"><i class="nd ${x.network}"></i><span class="t">${fmtTime(x.scheduled_at)}</span><span class="r">${esc(x.reel_title)}</span></button>`;
  return `<section class="card cal ${week ? 'week' : ''}">
    <div class="cal-head">
      <h2 class="h2">${title}</h2>
      <span class="small muted">${shown.length} ${shown.length === 1 ? 'publicación' : 'publicaciones'} ${week ? 'esta semana' : 'este mes'}</span>
      <span class="spacer"></span>
      <div class="seg" role="group" aria-label="Vista"><button aria-pressed="${!week}" data-act="cal-mode" data-k="mes">Mes</button><button aria-pressed="${week}" data-act="cal-mode" data-k="semana">Semana</button></div>
      <button class="btn sm" data-act="cal-today">Hoy</button>
      <button class="icon-btn" data-act="cal-prev" aria-label="${week ? 'Semana anterior' : 'Mes anterior'}">${icon('left')}</button>
      <button class="icon-btn" data-act="cal-next" aria-label="${week ? 'Semana siguiente' : 'Mes siguiente'}">${icon('right')}</button>
    </div>
    <p class="cal-hint small muted">${icon('move', 14)} Arrastrá una publicación a otro día para moverla: mantiene la hora. Las que ya salieron o salen en menos de 15 minutos quedan fijas.</p>
    <div class="cal-grid">
      ${days.slice(0, 7).map((d) => `<div class="cal-wd ${week && sameDay(d, todayD) ? 'today' : ''}">${d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}${week ? ` <b>${d.getDate()}</b>` : ''}</div>`).join('')}
      ${days.map((d) => {
        const L = S.filter((x) => sameDay(pdate(x.scheduled_at), d));
        const out = !week && d.getMonth() !== m.getMonth();
        const isE = elec && sameDay(d, elec), isL = lim && sameDay(d, lim), after = lim && d > lim && !(elec && d >= elec);
        const cls = [out ? 'out' : '', sameDay(d, todayD) ? 'today' : '', isE ? 'elec' : '', after ? 'veda' : '', d < todayD ? 'past' : ''].join(' ');
        const drop = d >= todayD && !after;
        const max = week ? 99 : 3;
        return `<div class="cal-day ${cls}" data-day="${ymd(d)}" ${drop ? 'data-drop="1"' : ''}>
          <div class="cal-dn">${week ? '' : `<span>${d.getDate()}</span>`}${isE ? '<em class="tag e">Elección</em>' : isL ? '<em class="tag l">Fin de propaganda</em>' : ''}</div>
          ${L.slice(0, max).map(ev).join('')}
          ${L.length > max ? `<button class="cal-more" data-act="open-day" data-day="${ymd(d)}">+${L.length - max} más</button>` : ''}
        </div>`; }).join('')}
    </div>
    <div class="cal-legend small muted"><span><i class="lgd prog"></i>Programado</span><span><i class="lgd pub"></i>Publicado</span><span><i class="lgd fail"></i>Falló</span><span><i class="lgd publ"></i>Publicándose</span>${lim ? '<span><i class="lgd veda"></i>Sin propaganda</span>' : ''}</div>
  </section>`;
}

// ---------- arrastrar publicaciones entre días ----------
// Con el mouse arranca al mover 5 px; en pantallas táctiles, con una pulsación larga (así el dedo sigue pudiendo hacer scroll).
function wireCalDrag() {
  const grid = $('.cal-grid');
  if (!grid) return;
  grid.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-drag]');
    if (!card || e.button > 0) return;
    const post = state.posts.find((x) => x.id === Number(card.dataset.pid));
    if (!post) return;
    const sx = e.clientX, sy = e.clientY, touch = e.pointerType === 'touch';
    let drag = null, over = null, timer = null;
    const begin = () => {
      const r = card.getBoundingClientRect();
      const clone = card.cloneNode(true);
      clone.classList.add('cal-fly');
      Object.assign(clone.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
      clone.removeAttribute('data-act');
      const label = document.createElement('span'); label.className = 'fly-to'; clone.append(label);
      document.body.append(clone);
      card.classList.add('ghost');
      document.body.classList.add('cal-dragging');
      drag = { clone, label, dx: sx - r.left, dy: sy - r.top, from: card.closest('.cal-day') };
      if (touch && navigator.vibrate) navigator.vibrate(12);
    };
    const move = (ev) => {
      if (!drag) {
        if (touch) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) cancel(); return; }
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        begin();
      }
      ev.preventDefault();
      // cerca del borde de la ventana, la página se desplaza sola
      const edge = 70, vh = window.innerHeight;
      drag.scroll = ev.clientY > vh - edge ? 14 : ev.clientY < edge ? -14 : 0;
      if (drag.scroll && !drag.raf) { const tick = () => { if (!drag || !drag.scroll) { if (drag) drag.raf = 0; return; } window.scrollBy(0, drag.scroll); drag.raf = requestAnimationFrame(tick); }; drag.raf = requestAnimationFrame(tick); }
      drag.clone.style.left = ev.clientX - drag.dx + 'px';
      drag.clone.style.top = ev.clientY - drag.dy + 'px';
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cal-day');
      if (el !== over) {
        over?.classList.remove('drop-over', 'drop-no');
        over = el;
        if (over) over.classList.add(over.dataset.drop ? 'drop-over' : 'drop-no');
      }
      drag.label.textContent = over ? (over.dataset.drop ? `→ ${fmtDay(over.dataset.day + ' 12:00')} · ${hhmm(post.scheduled_at)}` : 'No se puede') : '';
    };
    const end = async (ev) => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!drag) return;
      drag.scroll = 0;
      ev.preventDefault();
      // el clic que sigue al soltar no abre la publicación
      card.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true });
      over?.classList.remove('drop-over', 'drop-no');
      const target = over && over.dataset.drop && over !== drag.from ? over : null;
      if (!target) return settle(drag, card, drag.from, over && !over.dataset.drop ? 'Ese día no se puede: ya pasó o es veda de propaganda.' : null);
      const when = `${target.dataset.day} ${hhmm(post.scheduled_at)}`;
      if (pdate(when) - Date.now() < LOCK_MS) return settle(drag, card, drag.from, 'A esa hora ya no llega: tiene que faltar más de 15 minutos.');
      await flyTo(drag.clone, target);
      try {
        await api(`/api/posts/${post.id}`, { method: 'PUT', body: { scheduled_at: when } });
        const old = post.scheduled_at;
        post.scheduled_at = when;
        finish(drag, card);
        render();
        toast(`Movida al ${fmtDay(when)} a las ${hhmm(when)}`, false, { label: 'Deshacer', fn: async () => {
          try { await api(`/api/posts/${post.id}`, { method: 'PUT', body: { scheduled_at: old } }); post.scheduled_at = old; render(); toast('Volvió a su día'); } catch (err) { fail(err); }
        } });
      } catch (err) {
        await settle(drag, card, drag.from, err.message);
      }
    };
    const cancel = () => { clearTimeout(timer); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
    if (touch) timer = setTimeout(begin, 320);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });
}
const hhmm = (s) => s.slice(11, 16);
function flyTo(clone, cell) {
  const r = cell.getBoundingClientRect();
  clone.classList.add('landing');
  clone.style.left = r.left + 6 + 'px';
  clone.style.top = r.top + 34 + 'px';
  return new Promise((ok) => setTimeout(ok, 220));
}
async function settle(drag, card, home, why) {
  await flyTo(drag.clone, home);
  finish(drag, card);
  if (why) toast(why, true);
}
function finish(drag, card) {
  drag.clone.remove();
  card.classList.remove('ghost');
  document.body.classList.remove('cal-dragging');
}
const POST_ST = { programado: 'Programado', publicando: 'Publicando…', publicado: 'Publicado', fallido: 'Falló', bloqueado: 'Bloqueado' };
function postDialog(ids) {
  const L = ids.map((id) => state.posts.find((x) => x.id === id)).filter(Boolean);
  if (!L.length) return;
  const d = openDialog(L.length === 1 ? 'Publicación' : fmtDate(L[0].scheduled_at), L.map((x) => `
    <div class="pd" data-id="${x.id}">
      <video src="/media/${esc(x.reel_file)}#t=0.5" preload="metadata" controls playsinline></video>
      <div class="pd-info"><b>${esc(x.reel_title)}</b>
        <span class="row small">${netBadge(x.network)}${esc(x.handle ? '@' + x.handle : NETS[x.network].name + ' sin conectar')}</span>
        <span class="small muted">${fmtDate(x.scheduled_at)} · ${fmtTime(x.scheduled_at)}</span>
        <span><span class="chip s-${x.status}">${POST_ST[x.status] || esc(x.status)}</span>${x.published_at ? ` <span class="small muted">el ${fmtDay(x.published_at)} a las ${fmtTime(x.published_at)}</span>` : ''}</span>
        ${x.error ? `<p class="banner err" style="margin:0">${esc(x.error)}</p>` : ''}
        ${x.note ? `<p class="small muted">${esc(x.note)}</p>` : ''}
        ${x.external_url ? `<a class="btn sm" href="${esc(x.external_url)}" target="_blank" rel="noopener noreferrer">Ver en ${NETS[x.network].name} ↗</a>` : ''}
        ${x.network === 'tiktok' && (x.status === 'programado' || x.status === 'fallido') ? `<div class="tt-opts" data-acc="${x.account_id}"><p class="small muted">Cargando la cuenta de TikTok…</p></div>` : ''}
        <div class="row">
          ${x.status === 'programado' ? `<button class="btn sm accent" data-act="post-now">Publicar ahora</button>` : ''}
          ${x.status === 'fallido' ? `<button class="btn sm accent" data-act="post-now">Reintentar</button>` : ''}
          ${x.status !== 'publicando' && x.status !== 'publicado' ? `<button class="btn sm danger" data-act="del-post">Quitar</button>` : ''}
        </div>
      </div>
    </div>`).join(''));
  d.classList.add('wide');
  d.addEventListener('close', () => render());
  // TikTok: antes de publicar se muestra la cuenta y se eligen privacidad e interacciones (reglas de TikTok)
  $$('.tt-opts', d).forEach(async (box) => {
    const x = state.posts.find((p) => p.id === Number(box.closest('.pd').dataset.id));
    let o = {}; try { o = x.options ? JSON.parse(x.options) : {}; } catch {}
    try { const c = await api(`/api/accounts/${box.dataset.acc}/tiktok`); box.innerHTML = ttForm(c, o); ttWire(box); }
    catch (e) { box.innerHTML = `<p class="banner err" style="margin:0">${esc(e.message)}</p>`; }
  });
}

// formulario de publicación en TikTok: cuenta, privacidad (sin elegir), interacciones (apagadas), contenido comercial y declaración
const TT_PRIV = { PUBLIC_TO_EVERYONE: 'Todos', MUTUAL_FOLLOW_FRIENDS: 'Amigos (se siguen mutuamente)', FOLLOWER_OF_CREATOR: 'Seguidores', SELF_ONLY: 'Solo yo' };
function ttForm(c, o = {}) {
  const opts = c ? c.privacyOptions : Object.keys(TT_PRIV);
  const chk = (k, label, off) => `<label class="tt-chk ${off ? 'off' : ''}"><input type="checkbox" data-tt="${k}" ${o[k] && !off ? 'checked' : ''} ${off ? 'disabled' : ''}> ${label}${off ? ' <span class="small muted">(la cuenta lo tiene desactivado)</span>' : ''}</label>`;
  return `<div class="tt-box">
    ${c ? `<div class="tt-who">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div><b>${esc(c.nickname)}</b><span class="small muted">@${esc(c.username)} · se publica en esta cuenta de TikTok</span></div></div>` : ''}
    <label class="field">¿Quién puede ver este video?<select class="select" data-tt="privacy" required>
      <option value="" ${o.privacy ? '' : 'selected'} disabled>Elegí la privacidad</option>
      ${opts.map((v) => `<option value="${v}" ${o.privacy === v ? 'selected' : ''}>${TT_PRIV[v] || v}</option>`).join('')}</select></label>
    <div class="tt-row">${chk('allowComment', 'Permitir comentarios', c?.commentDisabled)}${chk('allowDuet', 'Permitir dúos', c?.duetDisabled)}${chk('allowStitch', 'Permitir stitch', c?.stitchDisabled)}</div>
    <label class="tt-chk"><input type="checkbox" data-tt="commercial" ${o.brandOrganic || o.brandContent ? 'checked' : ''}> Es contenido comercial (promociona una marca, producto o servicio)</label>
    <div class="tt-brand" ${o.brandOrganic || o.brandContent ? '' : 'hidden'}>
      <label class="tt-chk"><input type="checkbox" data-tt="brandOrganic" ${o.brandOrganic ? 'checked' : ''}> Tu marca: se etiqueta como «Contenido promocional»</label>
      <label class="tt-chk"><input type="checkbox" data-tt="brandContent" ${o.brandContent ? 'checked' : ''}> Contenido de marca de un tercero: se etiqueta como «Colaboración pagada»</label>
    </div>
    <p class="small muted tt-decl"></p>
  </div>`;
}
function ttWire(box) {
  const decl = () => {
    const bc = $('[data-tt=brandContent]', box)?.checked;
    $('.tt-decl', box).innerHTML = `Al publicar, aceptás ${bc ? 'la <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener noreferrer">Política de contenido de marca</a> y ' : ''}la <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer">Confirmación de uso de música</a> de TikTok.`;
    $('.tt-brand', box).hidden = !$('[data-tt=commercial]', box).checked;
    const priv = $('[data-tt=privacy]', box), selfOnly = [...priv.options].find((op) => op.value === 'SELF_ONLY');
    if (selfOnly) selfOnly.disabled = !!bc; // TikTok no permite contenido de marca en privado
  };
  box.addEventListener('change', decl); decl();
}
// lee el formulario; devuelve null y avisa si falta algo
function ttRead(box) {
  if (!box) return {};
  const v = (k) => $(`[data-tt=${k}]`, box);
  if (!v('privacy')) { toast('No se pudo cargar la cuenta de TikTok: revisá la conexión', true); return null; }
  const o = { privacy: v('privacy').value, allowComment: v('allowComment').checked, allowDuet: v('allowDuet').checked, allowStitch: v('allowStitch').checked,
    brandOrganic: v('commercial').checked && v('brandOrganic').checked, brandContent: v('commercial').checked && v('brandContent').checked };
  if (!o.privacy) { toast('Elegí quién puede ver el video en TikTok', true); v('privacy').focus(); return null; }
  if (v('commercial').checked && !o.brandOrganic && !o.brandContent) { toast('Indicá si el contenido comercial es de tu marca o de un tercero', true); return null; }
  return o;
}

function pautaView() {
  const p = state.project, pa = p.pauta || {};
  if (!p.padron) return `<div class="card empty"><h2 class="h2">Falta el padrón</h2><p>Subí el padrón en Ajustes para calcular a cuántos socios llega la pauta.</p><a class="btn primary" href="#/p/${p.id}/ajustes">Ir a Ajustes</a></div>`;
  const c = pautaCalc(p, pa);
  return `<div class="pz2">
    <aside class="card pz-ctl" id="pauta-form">
      <h2 class="h2">Inversión</h2>
      <label class="field">Cuánto invertir (USD, con IVA)<span class="pz-money2"><span>USD</span><input type="number" min="0" step="50" name="budget" value="${pa.budget || ''}" placeholder="3000"></span></label>
      <div class="two"><label class="field">Desde<input class="input" type="date" name="start_date" value="${esc(c.from)}"></label>
      <label class="field">Hasta<input class="input" type="date" name="end_date" value="${esc(c.to)}" ${c.limit ? `max="${esc(c.limit)}"` : ''}></label></div>
      <div id="pauta-datos">${pautaDatos(p, c)}</div>
    </aside>
    <div class="pz-main" id="pauta-out">${pautaOut(p, c)}</div>
  </div>
  <section class="card" id="pauta-tabla">${pautaTabla(p, c)}</section>
  ${adsCard(p)}
  ${adsNetCards(p)}`;
}
// TikTok Ads y Google Ads: credenciales de pauta del proyecto, "Probar conexión" y, si una red rechazó un anuncio, «Reactivar»
function adsNetCards(p) {
  const a = p.ads || {}, bl = p.ads_blocked || {};
  const inp = (net, k, label, ph = '', secret = false) => {
    const f = (a[net] || {})[k] || {};
    return `<label class="field">${label}<input class="input ${secret ? 'masked' : ''}" data-adsx="${net}" data-k="${k}" autocomplete="off" ${secret ? `placeholder="${f.set ? 'Guardado · pegá uno nuevo para cambiarlo' : esc(ph)}"` : `value="${esc(f.value || '')}" placeholder="${esc(ph)}"`}></label>`;
  };
  const blocked = (net, t) => bl[net] ? `<p class="banner err">${t} rechazó un anuncio y la red está bloqueada: no se le reparte plata. ${esc(bl[net].reason || '')} <button class="btn sm" data-act="ads-unblock" data-net="${net}">Reactivar</button></p>` : '';
  return `<section class="card ads" id="ads-tt-card">
    <div class="card-head"><div><h2 class="h2">TikTok Ads</h2><p class="small muted">Spark Ads: el ciclo promociona el video ya publicado en la cuenta de TikTok vinculada, con presupuesto diario y fecha de fin en la propia red.</p></div>
      ${a.ok?.tiktok ? '<span class="chip s-conectada">Datos completos</span>' : ''}</div>
    ${blocked('tiktok', 'TikTok')}
    <div class="two">${inp('tiktok', 'ttAdvertiserId', 'ID del anunciante', '7000000000000')}${inp('tiktok', 'ttAccessToken', 'Token de acceso (Marketing API)', 'Access token', true)}</div>
    <div class="two">${inp('tiktok', 'ttBcId', 'ID del Business Center', '')}${inp('tiktok', 'ttIdentityId', 'Identidad (cuenta de TikTok vinculada)', '')}</div>
    <div class="row"><button class="btn primary sm" data-act="ads-save-net" data-net="tiktok">Guardar y probar conexión</button></div>
  </section>
  <section class="card ads" id="ads-youtube-card">
    <div class="card-head"><div><h2 class="h2">Google Ads · YouTube Shorts</h2><p class="small muted">El Short ya publicado sale como anuncio de video; el padrón viaja como lista de Customer Match (solo huellas). Cada Short lleva su propia campaña con presupuesto diario y fecha de fin.</p></div>
      ${a.ok?.youtube ? '<span class="chip s-conectada">Datos completos</span>' : ''}</div>
    ${blocked('youtube', 'YouTube')}
    <div class="two">${inp('youtube', 'gCustomerId', 'ID de cliente de Google Ads', '123-456-7890')}${inp('youtube', 'gLoginCustomerId', 'ID de la cuenta administradora (opcional)', '')}</div>
    <div class="two">${inp('youtube', 'gDeveloperToken', 'Token de desarrollador', 'Developer token', true)}${inp('youtube', 'gRefreshToken', 'Token de renovación (alcance adwords)', 'Refresh token', true)}</div>
    <div class="two">${inp('youtube', 'gClientId', 'ID de cliente OAuth (si no, el de ACM)', '')}${inp('youtube', 'gClientSecret', 'Secreto OAuth (si no, el de ACM)', '', true)}</div>
    <div class="row"><button class="btn primary sm" data-act="ads-save-net" data-net="youtube">Guardar y probar conexión</button></div>
  </section>
  ${bl.meta ? `<p class="banner err">Meta rechazó un anuncio y la red está bloqueada. ${esc(bl.meta.reason || '')} <button class="btn sm" data-act="ads-unblock" data-net="meta">Reactivar</button></p>` : ''}`;
}
function adsCard(p) {
  const a = p.ads || {};
  const ok = !!p.ads_name;
  const mgr = a.adAccountId ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(a.adAccountId)}${p.ads_campaign_id ? '&selected_campaign_ids=' + encodeURIComponent(p.ads_campaign_id) : ''}` : '';
  const step = (n, done, title, body) => `<div class="ads-step ${done ? 'done' : ''}"><span class="dot">${done ? icon('check', 14) : n}</span><div><b>${title}</b>${body}</div></div>`;
  return `<section class="card ads" id="ads-card">
    <div class="card-head"><div class="row" style="gap:10px"><span class="net facebook">${NETS.facebook.svg}</span><div><h2 class="h2">Meta Ads</h2><p class="small muted">La pauta sale de ACM: el padrón como público y la campaña creada en pausa para que la revises.</p></div></div>
      ${ok ? `<span class="chip s-conectada">${esc(p.ads_name)} · ${esc(p.ads_currency)}</span>` : ''}</div>
    ${p.ads_error ? `<p class="banner err">${esc(p.ads_error)}</p>` : ''}
    <div class="ads-grid">
      ${step(1, ok, 'Conectá la cuenta publicitaria', `
        <p class="small muted">En Configuración del negocio, Cuentas publicitarias, copiá el ID (act_…). Asignala al usuario del sistema y generá un token con <code>ads_management</code> y <code>ads_read</code>.</p>
        <div class="two"><label class="field">ID de la cuenta publicitaria<input class="input" data-ads="adAccountId" value="${esc(a.adAccountId)}" placeholder="act_1234567890"></label>
        <label class="field">Token<input class="input masked" data-ads="accessToken" autocomplete="off" placeholder="${a.token ? 'Guardado · pegá uno nuevo para cambiarlo' : 'EAA…'}"></label></div>
        ${ok && p.ads_currency !== 'USD' ? `<label class="field">Cotización del dólar (${esc(p.ads_currency)} por USD)<input class="input" type="number" min="0" data-ads="rate" value="${p.ads_rate || ''}" placeholder="1200"></label>` : ''}
        <label class="check"><input type="checkbox" data-ads="political" ${p.ads_political ? 'checked' : ''}> Anuncios sobre elecciones o política (Meta pide verificar al anunciante y el «Pagado por»)</label>
        <div class="row"><button class="btn primary sm" data-act="ads-save">Guardar y probar</button><a class="btn sm" href="https://business.facebook.com/settings/ad-accounts" target="_blank" rel="noopener noreferrer">Abrir Cuentas publicitarias ↗</a></div>`)}
      ${step(2, !!p.ads_audience_id, 'Subí el padrón como público', `
        <p class="small muted">${p.ads_audience_id ? `Público creado con ${fmt(p.ads_audience_count)} contactos el ${fmtDay(p.ads_at)}. Meta tarda unas horas en cruzarlo con sus usuarios.` : `Se mandan las huellas de ${fmt(p.padron_contacts)} teléfonos y mails; Meta las cruza con sus usuarios. Ni nombres ni DNI.`}</p>
        <button class="btn sm ${p.ads_audience_id ? '' : 'primary'}" data-act="ads-audience" ${ok && p.padron_contacts ? '' : 'disabled'}>${p.ads_audience_id ? 'Volver a subir' : 'Subir padrón a Meta'}</button>`)}
      ${step(3, !!p.ads_campaign_id, 'Creá la campaña en pausa', `
        <p class="small muted">${p.ads_campaign_id ? `Campaña creada con ${p.ads_ads} ${p.ads_ads === 1 ? 'anuncio' : 'anuncios'}. Revisala en el Administrador de anuncios y prendela desde ahí.` : 'Alcance sobre el público del padrón, con el monto y las fechas de arriba (sin IVA, que Meta factura aparte), tope de vistas por semana y un anuncio por cada reel ya publicado en Instagram.'}</p>
        <div class="row"><button class="btn sm ${p.ads_campaign_id ? '' : 'accent'}" data-act="ads-campaign" ${p.ads_audience_id && p.pauta?.budget ? '' : 'disabled'}>${p.ads_campaign_id ? 'Crear otra' : 'Crear campaña en pausa'}</button>
        ${mgr ? `<a class="btn sm" href="${esc(mgr)}" target="_blank" rel="noopener noreferrer">Abrir el Administrador de anuncios ↗</a>` : ''}</div>`)}
    </div>
  </section>`;
}
function pautaDatos(p, c) {
  return `<dl class="pz-dl">
    <div><dt>CPM de Meta</dt><dd>USD ${fmt(PAUTA_DATOS.cpm, 1)}</dd></div>
    <div><dt>Padrón</dt><dd>${fmt(p.padron)}</dd></div>
    <div><dt>Con teléfono o mail</dt><dd>${p.padron_contacts ? fmt(p.padron_contacts) : 'sin archivo'}</dd></div>
    <div><dt>Meta reconoce</dt><dd>${PAUTA_DATOS.match_pct} %</dd></div>
    <div><dt>IVA incluido</dt><dd>${PAUTA_DATOS.iva * 100} %</dd></div>
    <div><dt>Período</dt><dd>${fmt(c.days)} días</dd></div>
    <div><dt>Propaganda hasta</dt><dd>${c.limit ? fmtShort(c.limit) : '—'}</dd></div>
  </dl>`;
}
function pautaWeeks(c) {
  const wk = Math.max(1, Math.ceil(c.days / 7));
  let cum = 0;
  return Array.from({ length: wk }, (_, i) => {
    const d0 = new Date(c.from + 'T00:00'); d0.setDate(d0.getDate() + i * 7);
    const dd = Math.min(7, c.days - i * 7);
    const d1 = new Date(d0); d1.setDate(d0.getDate() + dd - 1);
    const budget = c.budget * dd / c.days, net = budget / (1 + PAUTA_DATOS.iva), imps = net / PAUTA_DATOS.cpm * 1000;
    const per = c.people ? imps / c.people : 0; cum += per;
    return { i, d0, d1, dd, budget, net, iva: budget - net, imps, per, cum };
  });
}
function pautaOut(p, c) {
  const v = pautaVerdict(c.freq), has = c.budget > 0;
  const W = pautaWeeks(c);
  const max = Math.max(c.freq, 8) * 1.1;
  const VW = 760, H = 220, padB = 2, bw = VW / W.length;
  const y = (val) => H - padB - (val / max) * (H - padB - 14);
  const refY = y(8);
  return `<section class="pz-big">
      <div><span class="lbl">Socios alcanzados</span><b>${fmt(c.people)}</b><span class="sub">${c.real ? 'de los contactos del padrón' : 'estimado sobre el padrón'}</span></div>
      <div><span class="lbl">Veces que la ve cada uno</span><b>${has ? fmt(c.freq, c.freq < 10 ? 1 : 0) : '—'}</b><span class="sub">${has ? `${fmt(c.perWeek, 1)} por semana <span class="chip v-${v[0]}">${v[1]}</span>` : 'cargá la inversión'}</span></div>
      <div><span class="lbl">Vistas en total</span><b>${has ? fmtK(c.imps) : '—'}</b><span class="sub">en ${fmt(c.days)} días</span></div>
      <div><span class="lbl">Por día</span><b>${has ? usd(c.perDay) : '—'}</b><span class="sub">${has ? `${usd(c.perDay * 7)} por semana` : ''}</span></div>
    </section>
    <section class="card pz-chart-card">
      <div class="card-head"><h2 class="h2">Vistas por socio, acumuladas</h2><span class="small muted">${has ? v[2] : 'Poné un monto para ver la curva.'}</span></div>
      <svg class="pz-chart" viewBox="0 0 ${VW} ${H}" preserveAspectRatio="none" role="img" aria-label="Vistas por socio acumuladas por semana">
        <line class="axis" x1="0" x2="${VW}" y1="${H - padB}" y2="${H - padB}"/>
        <line class="ref" x1="0" x2="${VW}" y1="${refY}" y2="${refY}"/>
        ${W.map((w) => `<g class="pz-bar"><rect x="${w.i * bw + bw * 0.2}" y="${y(w.cum)}" width="${bw * 0.6}" height="${Math.max(has ? 2 : 0, H - padB - y(w.cum))}" rx="4"/><rect class="hit" x="${w.i * bw}" y="0" width="${bw}" height="${H - padB}"><title>${fmtShort(ymd(w.d0))} al ${fmtShort(ymd(w.d1))}: ${fmt(w.cum, 1)} vistas por socio acumuladas</title></rect></g>`).join('')}
      </svg>
      <div class="pz-xl" style="grid-template-columns:repeat(${W.length},1fr)">${W.map((w) => `<span>${has ? `<b>${fmt(w.cum, 1)}</b>` : ''}${w.d0.getDate()}/${w.d0.getMonth() + 1}</span>`).join('')}</div>
      <p class="pz-ref-t">- - - 8 vistas: el mensaje se instala</p>
    </section>`;
}
function pautaTabla(p, c) {
  const W = pautaWeeks(c), has = c.budget > 0;
  const n = (x, d = 0) => has ? fmt(x, d) : '—', u = (x) => has ? usd(x) : '—';
  return `<div class="card-head"><h2 class="h2">Detalle semana a semana</h2><span class="small muted">La inversión se reparte pareja entre los días · ${fmt(c.people)} socios alcanzados</span></div>
  <div class="table-wrap"><table class="list pz-table">
    <thead><tr><th>Semana</th><th class="r">Días</th><th class="r">Inversión</th><th class="r">Pauta</th><th class="r">IVA</th><th class="r">Vistas</th><th class="r">Vistas por socio</th><th class="r">Acumulado por socio</th></tr></thead>
    <tbody>${W.map((w) => `<tr><td>${fmtShort(ymd(w.d0))} – ${fmtShort(ymd(w.d1))}</td><td class="r num">${w.dd}</td><td class="r num">${u(w.budget)}</td><td class="r num">${u(w.net)}</td><td class="r num">${u(w.iva)}</td><td class="r num">${n(w.imps)}</td><td class="r num">${n(w.per, 1)}</td><td class="r num">${n(w.cum, 1)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="r num">${c.days}</td><td class="r num">${u(c.budget)}</td><td class="r num">${u(c.net)}</td><td class="r num">${u(c.budget - c.net)}</td><td class="r num">${n(c.imps)}</td><td class="r num">${n(c.freq, 1)}</td><td class="r num">${n(c.freq, 1)}</td></tr></tfoot>
  </table></div>
  <p class="small muted" style="margin-top:12px">Es solo la plata que cobra Meta por mostrar los videos; la plataforma va aparte. TikTok no acepta propaganda política paga. Meta exige verificar al anunciante y mostrar quién paga.</p>`;
}


const mb = (b) => b >= 1048576 ? `${fmt(b / 1048576, 1)} MB` : `${fmt(b / 1024)} KB`;
// redes donde está un reel, para la tarjeta: un ícono por cuenta con su estado
function reelNets(rid) {
  const P = state.posts.filter((x) => x.reel_id === rid);
  if (!P.length) return `<a class="reel-nets none" href="#/p/${state.project.id}/reel/${rid}">Sin repartir todavía</a>`;
  const pub = P.filter((x) => x.status === 'publicado').length;
  return `<a class="reel-nets" href="#/p/${state.project.id}/reel/${rid}" title="Ver en qué cuentas está">${P.slice(0, 6).map((x) => `<span class="rn s-${x.status}">${netBadge(x.network)}</span>`).join('')}${P.length > 6 ? `<span class="small muted">+${P.length - 6}</span>` : ''}<span class="small">${pub} de ${P.length} publicadas</span></a>`;
}

// ---------- detalle de un reel: en qué cuentas está y cómo le fue ----------
function reelDetailView() {
  const p = state.project, r = state.reels.find((x) => x.id === state.sub);
  if (!r) return `<div class="card empty"><h2 class="h2">Ese reel ya no está</h2><a class="btn" href="#/p/${p.id}/reels">Volver a Reels</a></div>`;
  const P = state.posts.filter((x) => x.reel_id === r.id).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const redes = new Set(P.map((x) => x.network));
  const libres = state.accounts.filter((a) => !redes.has(a.network));
  const n = (st) => P.filter((x) => x.status === st).length;
  const rows = P.map((x) => `<tr data-id="${x.id}">
      <td><span class="row" style="gap:8px">${netBadge(x.network)}<span><b>${esc((() => { const a = state.accounts.find((y) => y.id === x.account_id); return a ? accName(a) : x.handle ? '@' + x.handle : NETS[x.network].name; })())}</b><br><span class="small muted">${NETS[x.network].name}</span></span></span></td>
      <td><span class="chip s-${x.status}">${POST_ST[x.status] || esc(x.status)}</span>${x.error ? `<p class="small err-t">${esc(x.error)}</p>` : ''}</td>
      <td class="small">${x.published_at ? `Salió el ${fmtDay(x.published_at)} a las ${fmtTime(x.published_at)}` : `${fmtDay(x.scheduled_at)} · ${fmtTime(x.scheduled_at)}`}</td>
      <td class="right">${x.external_url ? `<a class="btn sm" href="${esc(x.external_url)}" target="_blank" rel="noopener noreferrer">Ver ↗</a>` : `<button class="btn sm ghost" data-act="open-post" data-pid="${x.id}">Abrir</button>`}</td>
    </tr>`).join('');
  return `<div class="rd">
    <aside class="card rd-side">
      <a class="small" href="#/p/${p.id}/reels">← Todos los reels</a>
      ${r.archived_at ? `<div class="gone tall">Video borrado del almacenamiento<span>Quedan el texto y las publicaciones. Para volver a usarlo, subilo de nuevo.</span></div>` : `<video src="/media/${esc(r.file)}#t=0.5" preload="metadata" controls playsinline></video>`}
      <h2 class="h2">${esc(r.title)}</h2>
      <p class="small muted">${r.kind === 'crudo' ? 'Crudo' : r.status === 'aprobado' ? 'Aprobado' : 'Borrador'} · ${mb(r.size)} · subido el ${fmtDate(r.created_at)}</p>
      ${r.kind === 'crudo' || r.archived_at ? '' : `<div class="row" data-id="${r.id}"><button class="btn accent" data-act="distribute" ${state.accounts.length && libres.length ? '' : 'disabled'}>${libres.length ? 'Repartir en más cuentas' : 'Ya está en todas las redes'}</button></div>`}
    </aside>
    <div class="stack">
      ${reelForm(r)}
      ${r.kind === 'crudo' ? crudoInfo(r) : `<div class="rd-stats card"><div><b>${P.length}</b><span>cuentas</span></div><div><b>${n('publicado')}</b><span>publicadas</span></div><div><b>${n('programado') + n('publicando')}</b><span>programadas</span></div><div><b>${n('fallido')}</b><span>con error</span></div></div>
      <section class="card"><div class="card-head"><h2 class="h2">Dónde está este reel</h2></div>
        ${P.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Cuenta</th><th>Estado</th><th>Cuándo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Todavía no está en ninguna cuenta. Tocá <b>Repartir</b>.</p>'}
      </section>
      ${libres.length ? `<section class="card"><h2 class="h2">Donde todavía puede salir</h2><p class="small muted">Una cuenta por red. Las redes donde ya está quedan cerradas para este video.</p><div class="rd-free">${libres.map((a) => `<span class="chip nodot">${netBadge(a.network)} ${esc(accName(a))}</span>`).join('')}</div></section>` : ''}`}
    </div>
  </div>`;
}

// texto del reel: título, descripción, hashtags, si es listo o crudo y de qué crudo sale
function reelForm(r) {
  const crudos = state.reels.filter((x) => x.kind === 'crudo' && x.id !== r.id);
  const pub = state.posts.some((x) => x.reel_id === r.id);
  return `<section class="card"><form class="form rf" id="reel-form" data-id="${r.id}">
    <div class="card-head"><h2 class="h2">Texto del reel</h2><span class="small muted" id="rf-state"></span></div>
    <label class="field">Título<input class="input" name="title" required maxlength="120" value="${esc(r.title)}"></label>
    <label class="field">Descripción<textarea class="textarea" name="caption" rows="5" maxlength="2200" placeholder="Lo que acompaña al video en la publicación">${esc(r.caption)}</textarea></label>
    <label class="field">Hashtags<input class="input" name="hashtags" value="${esc(r.hashtags)}" placeholder="#ListaAzul #Socios #Elecciones2026"><span class="hint">Separados por espacio. Se agregan al final de la descripción.</span></label>
    <div class="two"><label class="field">Tipo<select class="select" name="kind" ${pub ? 'disabled title="Ya tiene publicaciones"' : ''}><option value="listo" ${r.kind !== 'crudo' ? 'selected' : ''}>Listo para publicar</option><option value="crudo" ${r.kind === 'crudo' ? 'selected' : ''}>Crudo (para editar)</option></select></label>
    ${r.kind === 'crudo' ? '' : `<label class="field">Edición de<select class="select" name="source_id"><option value="">Ningún crudo</option>${crudos.map((c) => `<option value="${c.id}" ${r.source_id === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>`}</div>
    ${r.kind === 'crudo' ? '' : `<div class="rf-prev"><span class="small muted">Así sale en las redes</span><p id="rf-prev"></p></div>`}
    <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Guardar</button></div>
  </form></section>`;
}
function crudoInfo(r) {
  const E = state.reels.filter((x) => x.source_id === r.id);
  return `<section class="card"><h2 class="h2">Ediciones de este crudo</h2>
    <p class="small muted">Un crudo no se publica. Cada edición distinta es un reel aparte que puede ir a otra cuenta de la misma red.</p>
    ${E.length ? `<div class="rd-eds">${E.map((e) => `<a href="#/p/${state.project.id}/reel/${e.id}"><video src="/media/${esc(e.file)}#t=0.5" preload="metadata" muted playsinline></video><b>${esc(e.title)}</b><span class="small muted">${state.posts.filter((x) => x.reel_id === e.id).length} publicaciones</span></a>`).join('')}</div>`
      : '<p class="muted">Todavía no hay ediciones. Subí el reel editado como <b>Listo</b> y en su página elegí «Edición de» este crudo.</p>'}
  </section>`;
}
const tagsOf = (v) => [...new Set(String(v || '').split(/[\s,]+/).map((t) => t.replace(/^#+/, '').trim()).filter(Boolean).map((t) => '#' + t))].join(' ');
function reelPreview(f) {
  const out = $('#rf-prev'); if (!out) return;
  const cap = f.caption.value.trim(), extra = tagsOf(f.hashtags.value).split(' ').filter((t) => t && !cap.toLowerCase().includes(t.toLowerCase())).join(' ');
  out.innerHTML = esc([cap || f.title.value, extra].filter(Boolean).join('\n\n')).replace(/\n/g, '<br>').replace(/(#[\wáéíóúñü]+)/gi, '<span class="htag">$1</span>');
}

// ---------- campañas: el presupuesto grande repartido en campañas chicas ----------
const cusd = (n) => 'USD ' + fmt(n);
function campanasView() {
  const p = state.project, D = state.camps || { total: 0, campaigns: [] }, C = D.campaigns;
  const asignado = C.reduce((s, c) => s + c.budget, 0), gastado = C.reduce((s, c) => s + (c.spent || 0), 0);
  const libre = Math.max(0, D.total - asignado);
  const pct = (v) => D.total ? Math.min(100, v / D.total * 100) : 0;
  const colors = ['#2f6bff', '#13a37f', '#f29a1f', '#c2459a', '#7a5cff', '#0fa3c4', '#d9534f', '#6b8e23'];
  const accById = Object.fromEntries(state.accounts.map((a) => [a.id, a])), reelById = Object.fromEntries(state.reels.map((r) => [r.id, r]));
  const bar = `<div class="cg-bar" aria-label="Reparto del presupuesto">${C.map((c, i) => `<i style="width:${pct(c.budget)}%;background:${colors[i % colors.length]}" title="${esc(c.name)} · ${cusd(c.budget)}"></i>`).join('')}</div>
    <div class="cg-legend">${C.map((c, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${esc(c.name)} · ${cusd(c.budget)}</span>`).join('')}${libre ? `<span><i class="free"></i>Sin asignar · ${cusd(libre)}</span>` : ''}</div>`;
  const card = (c, i) => {
    const g = c.budget ? Math.min(100, (c.spent || 0) / c.budget * 100) : 0;
    return `<article class="card cg-card" data-id="${c.id}" style="--c:${colors[i % colors.length]}">
      <div class="cg-top"><h3>${esc(c.name)}</h3><span class="spacer"></span>${c.meta_campaign_id ? `<span class="chip s-conectada">En Meta · ${c.meta_ads} ${c.meta_ads === 1 ? 'anuncio' : 'anuncios'}</span>` : '<span class="chip nodot">Solo en ACM</span>'}
        <button class="icon-btn" data-act="camp-edit" title="Editar">${icon('edit', 16)}</button><button class="icon-btn danger" data-act="camp-del" title="Borrar">${icon('trash', 16)}</button></div>
      <p class="small muted">${c.start_date || c.end_date ? `${c.start_date ? fmtShort(c.start_date) : 'hoy'} → ${c.end_date ? fmtShort(c.end_date) : 'fin de campaña'}` : 'Sin fechas: usa las de la pauta'}${c.notes ? ' · ' + esc(c.notes) : ''}</p>
      <div class="cg-money"><div><b>${cusd(c.budget)}</b><span>presupuesto</span></div><div><b>${cusd(c.spent || 0)}</b><span>gastado${c.spent_at ? ' al ' + fmtShort(c.spent_at) : ''}</span></div><div><b>${fmtK(c.impressions || 0)}</b><span>impresiones</span></div><div><b>${fmtK(c.reach || 0)}</b><span>personas</span></div></div>
      <div class="cg-spend"><i style="width:${g}%"></i></div>
      <div class="cg-who">
        <div><span class="lbl">Cuentas</span>${(() => { const A = c.accounts.map((id) => accById[id]).filter(Boolean); return A.length
          ? `<span class="cg-icons" title="${esc(A.map(accName).join(' · '))}">${A.map((a) => netBadge(a.network)).join('')}</span><span class="small">${A.length === 1 ? esc(accName(A[0])) : `${A.length} cuentas`}</span>`
          : '<span class="small">Todas las de Instagram</span>'; })()}</div>
        <div><span class="lbl">Reels</span>${(() => { const R = c.reels.map((id) => reelById[id]).filter(Boolean); return R.length
          ? `<span class="cg-thumbs">${R.slice(0, 4).map((r) => `<a href="#/p/${p.id}/reel/${r.id}" title="${esc(r.title)}"><video src="/media/${esc(r.file)}#t=0.5" preload="metadata" muted playsinline></video></a>`).join('')}</span><span class="small">${R.length === 1 ? esc(R[0].title) : `${R.length} reels`}</span>`
          : '<span class="small">Todos los publicados</span>'; })()}</div>
      </div>
      ${c.error ? `<p class="banner err">${esc(c.error)}</p>` : ''}
      ${c.meta_campaign_id ? '' : `<div class="row cg-foot"><button class="btn sm accent" data-act="camp-meta">Crear en Meta (en pausa)</button></div>`}
    </article>`;
  };
  return `<div class="cg">
    <section class="card cg-head">
      <div class="cg-total"><label class="field">Presupuesto total (USD, con IVA)<span class="pz-money2"><span>USD</span><input type="number" min="0" step="100" id="cg-total" value="${D.total || ''}" placeholder="10000"></span></label>
        <p class="small muted">Lo que el cliente quiere invertir en toda la campaña. Es el mismo número de Pauta.</p></div>
      <div class="cg-nums"><div><b>${cusd(asignado)}</b><span>asignado a ${C.length} ${C.length === 1 ? 'campaña' : 'campañas'}</span></div><div><b>${cusd(libre)}</b><span>sin asignar</span></div><div><b>${cusd(gastado)}</b><span>gastado (${D.total ? fmt(gastado / D.total * 100, 1) : 0} %)</span></div></div>
      ${D.total ? bar : ''}
      <div class="row"><button class="btn primary" data-act="camp-new" ${D.total ? '' : 'disabled'}>${icon('plus')} Nueva campaña</button>${C.some((c) => c.meta_campaign_id) ? `<button class="btn" data-act="camp-spend">Actualizar gasto desde Meta</button>` : ''}${D.total ? '' : '<span class="small muted">Primero poné el presupuesto total.</span>'}</div>
    </section>
    ${C.length ? `<div class="cg-list">${C.map(card).join('')}</div>` : `<div class="card empty"><h2 class="h2">Sin campañas todavía</h2><p>Partí el presupuesto en campañas chicas: cada una con sus cuentas, sus reels y su plata. Por ejemplo «Socios jóvenes» con los reels de TikTok y «Interior» con los de Facebook.</p></div>`}
  </div>`;
}
function campDialog(c) {
  const p = state.project, D = state.camps, otras = D.campaigns.filter((x) => x.id !== c?.id).reduce((s, x) => s + x.budget, 0);
  const libre = Math.max(0, D.total - otras);
  const d = openDialog(c ? 'Editar campaña' : 'Nueva campaña', `<form class="form" id="camp-form">
    <label class="field">Nombre<input class="input" name="name" required maxlength="80" value="${esc(c?.name)}" placeholder="Socios jóvenes"></label>
    <label class="field">Presupuesto (USD, con IVA) · quedan ${cusd(libre)}<input class="input" type="number" name="budget" min="1" max="${libre}" step="10" required value="${c?.budget || ''}"></label>
    <div class="two"><label class="field">Desde<input class="input" type="date" name="start_date" value="${esc(c?.start_date)}"></label><label class="field">Hasta<input class="input" type="date" name="end_date" value="${esc(c?.end_date)}" ${p.propaganda_until ? `max="${esc(p.propaganda_until)}"` : ''}></label></div>
    <b class="small">Cuentas (ninguna = todas las de Instagram)</b>
    <div class="acc-pick">${state.accounts.map((a) => `<label><input type="checkbox" name="acc" value="${a.id}" ${c?.accounts.includes(a.id) ? 'checked' : ''}>${netBadge(a.network)}${esc(accName(a))}</label>`).join('') || '<p class="small muted">No hay cuentas.</p>'}</div>
    <b class="small">Reels (ninguno = todos los publicados)</b>
    <div class="acc-pick">${state.reels.map((r) => `<label><input type="checkbox" name="reel" value="${r.id}" ${c?.reels.includes(r.id) ? 'checked' : ''}>${esc(r.title)}</label>`).join('') || '<p class="small muted">No hay reels.</p>'}</div>
    <label class="field">Notas<input class="input" name="notes" maxlength="300" value="${esc(c?.notes)}" placeholder="A quién apunta, qué mensaje"></label>
    <p class="err" id="camp-err"></p>
  </form>`, `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="camp-form" type="submit">${c ? 'Guardar' : 'Crear campaña'}</button>`);
  $('#camp-form', d).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { name: f.name.value.trim(), budget: Number(f.budget.value), start_date: f.start_date.value, end_date: f.end_date.value, notes: f.notes.value.trim(),
      accounts: $$('[name=acc]:checked', f).map((x) => Number(x.value)), reels: $$('[name=reel]:checked', f).map((x) => Number(x.value)) };
    try { await api(c ? `/api/campaigns/${c.id}` : `/api/projects/${p.id}/campaigns`, { method: c ? 'PUT' : 'POST', body }); d.close(); toast(c ? 'Campaña guardada' : 'Campaña creada'); render(); }
    catch (err) { $('#camp-err', d).textContent = err.message; }
  });
}

// ---------- preguntale a la investigación (agente con Claude) ----------
const ASK = { pid: null, turns: [], busy: false };
function askCard() {
  return `<section class="card ask" id="ask">
    <div class="card-head"><div><h2 class="h2">Preguntale a la investigación</h2><p class="small muted">Responde solo con las fichas del proyecto y cita cada dato. Ej.: «¿Quién es Fulano y qué le conviene decir?»</p></div></div>
    <div class="ask-log" id="ask-log"></div>
    ${state.agent ? `<form class="kn-row" id="ask-form"><input class="input" name="q" placeholder="Este es el dirigente X: ¿dónde está parado y qué temas le sirven?" autocomplete="off" maxlength="2000"><button class="btn primary" type="submit">Preguntar</button></form>`
      : '<p class="banner">Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY). Mientras tanto, usá la búsqueda de abajo.</p>'}
  </section>`;
}
function askDraw() {
  const log = $('#ask-log'); if (!log) return;
  log.innerHTML = ASK.turns.map((t) => t.role === 'user' ? `<div class="ask-q">${esc(t.content)}</div>`
    : `<div class="ask-a ${t.error ? 'err' : ''}">${esc(t.content).replace(/\[(\d+)\]/g, (m, n) => { const s = t.sources?.find((x) => x.n === Number(n)); return s ? `<a href="${/^https?:/.test(s.source || '') ? esc(s.source) : '#'}" target="_blank" rel="noopener noreferrer" class="cite" title="${esc(s.title)}">${n}</a>` : m; }).replace(/\n/g, '<br>')}
      ${t.sources?.length ? `<div class="ask-src">${t.sources.map((s) => `<span><b>${s.n}</b> ${esc(s.title)}</span>`).join('')}</div>` : ''}</div>`).join('') + (ASK.busy ? '<div class="ask-a muted">Leyendo las fichas…</div>' : '');
  log.scrollTop = log.scrollHeight;
}
async function askSend(e) {
  e.preventDefault(); const q = e.target.q.value.trim(); if (!q || ASK.busy) return;
  const history = ASK.turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }));
  ASK.turns.push({ role: 'user', content: q }); ASK.busy = true; e.target.q.value = ''; askDraw();
  try { const r = await api(`/api/projects/${state.project.id}/knowledge/ask`, { method: 'POST', body: { question: q, history } }); ASK.turns.push({ role: 'assistant', content: r.answer + (r.truncated ? '\n(La respuesta quedó cortada.)' : ''), sources: r.sources }); }
  catch (err) { ASK.turns.pop(); ASK.turns.push({ role: 'user', content: q }, { role: 'assistant', content: err.message, error: true }); }
  ASK.busy = false; askDraw();
}

// ---------- investigación (fichas con búsqueda por significado) ----------
const K = { q: '', kind: '', handle: '', data: null, pid: null };
const CONF = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Sin confirmar' };
function investigacionView() {
  return `${askCard()}<div class="kn">
    <form class="card kn-search" id="kn-form">
      <div class="kn-row"><input class="input" name="q" placeholder="Preguntá algo: ¿quién está cerca de la AFA? ¿qué propone cada uno sobre la deuda? ¿qué le funciona a Gaudio?" value="${esc(K.q)}" autocomplete="off">
      <button class="btn primary" type="submit">Buscar</button></div>
      <div class="kn-chips" id="kn-chips"></div>
    </form>
    <div class="kn-grid"><section id="kn-list" class="kn-list"><div class="card muted small">Cargando…</div></section>
    <aside class="kn-side" id="kn-side"></aside></div>
  </div>`;
}
async function knLoad() {
  const pid = state.project.id;
  if (K.pid !== pid) Object.assign(K, { q: '', kind: '', handle: '', pid });
  const qs = new URLSearchParams({ q: K.q, kind: K.kind, handle: K.handle, limit: '60' });
  const seq = (K.seq = (K.seq || 0) + 1); // solo pinta la última respuesta si se cruzan dos búsquedas
  const meta = $('.kn-meta'); if (meta) meta.textContent = 'Buscando…';
  let d; try { d = await api(`/api/projects/${pid}/knowledge?${qs}`); } catch (e) { return fail(e); }
  if (seq !== K.seq) return;
  K.data = d; knDraw();
}
function knDraw() {
  const D = K.data, list = $('#kn-list'); if (!D || !list) return;
  const names = D.kindNames || {};
  const total = D.kinds.reduce((s, k) => s + k.n, 0);
  $('#kn-chips').innerHTML = `<button type="button" data-act="kn-kind" data-k="" aria-pressed="${!K.kind}">Todo <b>${fmt(total)}</b></button>` +
    D.kinds.sort((a, b) => b.n - a.n).map((k) => `<button type="button" data-act="kn-kind" data-k="${esc(k.kind)}" aria-pressed="${K.kind === k.kind}">${esc(names[k.kind] || k.kind)} <b>${fmt(k.n)}</b></button>`).join('') +
    (K.handle ? `<button type="button" data-act="kn-handle" data-h="" aria-pressed="true">@${esc(K.handle)} ✕</button>` : '');
  const mode = D.mode === 'significado' ? 'ordenado por significado' : D.mode === 'palabras' ? 'por palabras (el modelo todavía no cargó)' : 'lo más reciente';
  list.innerHTML = !total ? `<div class="card empty"><h2 class="h2">Sin investigación todavía</h2><p>Importá un JSON con fichas (tipo, titulo, texto, fuente) o cuentas de Instagram.</p></div>`
    : `<p class="small muted kn-meta">${fmt(D.items.length)} resultados · ${mode}${D.pending ? ` · ${fmt(D.pending)} fichas calculando su vector` : ''}</p>` +
    (D.items.length ? D.items.map(knCard).join('') : '<div class="card muted">Nada parecido. Probá con otras palabras.</div>');
  const A = D.accounts || [];
  $('#kn-side').innerHTML = `<div class="card"><h2 class="h2">Cuentas relevadas</h2><p class="small muted">Publicaciones leídas de Instagram. Tocá una para ver solo esa.</p>
    <div class="kn-acc">${A.map((a) => `<button data-act="kn-handle" data-h="${esc(a.handle)}" class="${K.handle === a.handle ? 'sel' : ''}"><b>@${esc(a.handle)}</b><span>${fmt(a.followers)} seg. · ${fmt(a.posts)} publ.</span><span>${fmt(a.avg_eng)} interacciones prom. · ${a.followers ? fmt(a.avg_eng / a.followers * 100, 1) : 0} %</span></button>`).join('') || '<p class="small muted">Ninguna todavía.</p>'}</div></div>
    <div class="card"><h2 class="h2">Importar</h2><p class="small muted">JSON con <code>items</code> (fichas) y/o <code>instagram</code> (cuentas con sus publicaciones).</p>
    <label class="btn">${icon('up')} Elegir archivo<input type="file" id="kn-file" accept=".json,application/json" hidden></label>
    <p class="small muted" style="margin-top:10px">Búsqueda: ${D.model.ready ? 'modelo listo' : D.model.present ? 'el modelo carga con la primera búsqueda' : 'sin modelo, solo por palabras'} (${esc(D.model.model)})</p></div>`;
  $('#kn-file').addEventListener('change', knImport);
}
function knCard(x) {
  const d = x.data || {};
  return `<article class="card kn-card">
    <div class="kn-top"><span class="chip kn-k-${esc(x.kind)}">${esc((K.data.kindNames || {})[x.kind] || x.kind)}</span>${x.confidence ? `<span class="chip conf-${esc(x.confidence)}">${CONF[x.confidence] || esc(x.confidence)}</span>` : ''}${x.date ? `<span class="small muted">${esc(x.date)}</span>` : ''}<span class="spacer"></span>${x.score != null ? `<span class="small muted" title="Parecido con lo que buscaste">${Math.round(Math.min(1, x.score) * 100)} %</span>` : ''}<button class="icon-btn" data-act="kn-del" data-id="${x.id}" title="Borrar ficha">${icon('trash', 16)}</button></div>
    <h3>${esc(x.title)}</h3>
    <p class="kn-text">${esc(x.text)}</p>
    ${x.kind === 'publicacion' ? `<p class="small muted">${fmt(d.likes)} me gusta · ${fmt(d.comments)} comentarios · ${fmt((d.rate || 0) * 100, 1)} % de sus seguidores</p>` : ''}
    ${x.source ? (/^https?:/.test(x.source) ? `<a class="small" href="${esc(x.source)}" target="_blank" rel="noopener noreferrer">${esc(x.source.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70))} ↗</a>` : `<span class="small muted">${esc(x.source)}</span>`) : ''}
  </article>`;
}
async function knImport(e) {
  const f = e.target.files[0]; if (!f) return;
  let body; try { body = JSON.parse(await f.text()); } catch { return toast('El archivo no es un JSON válido', true); }
  try { const r = await api(`/api/projects/${state.project.id}/knowledge/import`, { method: 'POST', body }); toast(`Se sumaron ${r.added} fichas y ${r.posts} publicaciones`); knLoad(); } catch (err) { fail(err); }
}

function ajustesView() {
  const p = state.project;
  return `<div class="grid g2" style="align-items:start">
  <section class="card"><div class="card-head"><h2 class="h2">Datos del proyecto</h2></div>${projectForm(p)}</section>
  <div class="stack">
    <section class="card"><div class="card-head"><h2 class="h2">Padrón</h2>${p.padron_file ? `<button class="btn sm danger" data-act="del-padron">Quitar</button>` : ''}</div>
      ${p.padron_file ? `<div class="pad-ok">${icon('file', 22)}<div><b>${esc(p.padron_file)}</b><span class="small muted">subido el ${fmtDate(p.padron_at)}</span></div></div>
        <div class="pad-nums"><div><b>${fmt(p.padron)}</b><span>socios</span></div><div><b>${fmt(p.padron_phones)}</b><span>con teléfono</span></div><div><b>${fmt(p.padron_emails)}</b><span>con mail</span></div><div><b>${fmt(p.padron_contacts)}</b><span>contactables</span></div></div>` : ''}
      <label class="drop pad-drop" id="pad-drop"><input type="file" id="pad-input" accept=".csv,.xlsx,.txt" hidden>${icon('up', 26)}
        <p style="margin-top:6px"><b>${p.padron_file ? 'Soltá otro archivo para reemplazarlo' : 'Tirá el padrón acá'}</b> o tocá para elegirlo</p>
        <p class="small">Excel (.xlsx) o CSV. Se detectan solas las columnas de teléfono y mail.</p></label>
      <p class="small muted" style="margin-top:12px">Del archivo no se guardan nombres ni DNI: solo cuántos socios hay y la huella cifrada de cada teléfono y mail, que es lo que Meta usa para mostrarle la propaganda solo a ellos. El archivo no queda en el servidor.</p>
    </section>
    <section class="card"><div class="card-head"><h2 class="h2">Borrar proyecto</h2></div><p class="muted small">Se borran sus cuentas, reels, publicaciones y el padrón. No se puede deshacer.</p><button class="btn danger" style="margin-top:14px" data-act="del-project">${icon('trash')} Borrar ${esc(p.name)}</button></section>
  </div></div>`;
}
function projectForm(p = {}) {
  return `<form class="form" id="project-form">
    <label class="field">Nombre del dirigente o candidato<input class="input" name="name" required value="${esc(p.name)}" placeholder="Nombre y apellido"></label>
    <div class="two"><label class="field">Cargo o lista<input class="input" name="role" value="${esc(p.role)}" placeholder="Presidente · Lista 1"></label>
    <label class="field">Institución<input class="input" name="org" value="${esc(p.org)}" placeholder="Club Atlético Independiente"></label></div>
    <div class="two"><label class="field">Fecha de la elección<input class="input" type="date" name="election_date" value="${esc(p.election_date)}"></label>
    <label class="field">Fecha máxima de propaganda<input class="input" type="date" name="propaganda_until" value="${esc(p.propaganda_until)}"><span class="hint">Último día en que se publica y se pauta</span></label></div>
    ${p.id ? '' : `<label class="field">Personas en el padrón<input class="input" type="number" min="0" name="padron" value="" placeholder="65000"><span class="hint">Después podés subir el archivo en Ajustes</span></label>`}
    <div class="two"><label class="field">Color<input class="input" type="color" name="color" value="${esc(p.color || '#ff5a1f')}" style="padding:4px"></label>
    <label class="field">Foto<input class="input" type="file" name="photo" accept="image/*" style="padding:8px"></label></div>
    <div class="two"><label class="field">Tipo de proyecto<select class="input" name="kind">${[['club', 'Club o institución'], ['politica', 'Política'], ['comercial', 'Comercial']].map(([v, t]) => `<option value="${v}" ${(p.kind || 'club') === v ? 'selected' : ''}>${t}</option>`).join('')}</select><span class="hint">En política TikTok no acepta pauta</span></label>
    <label class="field">Revisión de recortes<select class="input" name="review_mode"><option value="manual" ${p.review_mode === 'auto' ? '' : 'selected'}>Manual: apruebo yo</option><option value="auto" ${p.review_mode === 'auto' ? 'selected' : ''}>Automática</option></select></label></div>
    <div class="field">Redes con pauta<div class="row" style="gap:16px;flex-wrap:wrap">${[['meta', 'Meta'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']].map(([k, t]) => `<label class="row" style="gap:6px"><input type="checkbox" name="ads_${k}" ${(p.ads_networks || { meta: true, youtube: true, tiktok: true })[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
    ${p.id ? `<label class="field">Modo demostración<select class="input" name="demo"><option value="0" ${p.demo ? '' : 'selected'}>No: publica y pauta de verdad</option><option value="1" ${p.demo ? 'selected' : ''}>Sí: se ve completo pero no publica ni pauta nada</option></select></label>` : ''}
    ${p.id ? `<div class="field">Puntaje de cada publicación<div class="two">${[['target_reach_per_usd', 'Personas del público por dólar'], ['impressions_per_usd', 'Impresiones por dólar'], ['completion', 'Cuánto del video se ve'], ['engagement', 'Interacción (me gusta, comentarios, compartidos)']].map(([k, t]) => `<label class="field">${t}<input class="input" type="number" min="0" step="0.05" name="w_${k}" value="${esc((p.score_weights || {})[k] ?? '')}"></label>`).join('')}</div><span class="hint">Cuánto pesa cada cosa al puntuar un video. Sin gasto solo cuentan los dos últimos. El agente no los cambia.</span></div>` : ''}
    <label class="field">Notas<textarea class="textarea" name="notes" rows="3" placeholder="Tono, temas, lo que nunca diría…">${esc(p.notes)}</textarea></label>
    <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">${p.id ? 'Guardar' : 'Crear proyecto'}</button></div>
  </form>`;
}

// ---------- diálogos ----------
function openDialog(title, body, foot = '') {
  const d = document.createElement('dialog');
  d.innerHTML = `<div class="dh"><h2 class="h2">${title}</h2><button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div><div class="db">${body}</div>${foot ? `<div class="df">${foot}</div>` : ''}`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.showModal();
  return d;
}
// Links para que el dirigente (u otra persona) apruebe desde el celular sin entrar a ACM.
async function shareDialog() {
  const pid = state.project.id;
  const list = async () => {
    const L = await api(`/api/projects/${pid}/shares`);
    return L.length ? L.map((l) => `<div class="sh-row" data-id="${l.id}">
      <div><b>${esc(l.label || (l.can === 'revisar' ? 'Para aprobar' : 'Solo mirar'))}</b>
        <span class="small muted">${l.can === 'revisar' ? 'Aprueba o pide cambios' : 'Solo mira'}${l.calendar ? ' · ve el calendario' : ''}${l.has_code ? ' · con código' : ''}${l.expires_at ? ` · vence ${fmtDay(l.expires_at)}` : ''}${l.last_seen_at ? ` · lo abrieron ${fmtDay(l.last_seen_at)}` : ' · todavía no lo abrieron'}</span></div>
      <button class="btn sm" data-copy="${esc(location.origin + l.path)}">${icon('link', 14)} Copiar</button><button class="btn sm danger" data-revoke="${l.id}">Desactivar</button></div>`).join('') : '<p class="small muted">Todavía no hay links.</p>';
  };
  const d = openDialog('Compartir para aprobar', `
    <form id="sh-form" class="sh-form">
      <p class="small muted">La persona abre el link en el navegador, sin cuenta: ve los recortes que esperan y, si querés, lo que viene en el calendario. Desde el link nunca se publica ni se programa nada.</p>
      <label class="field">Para quién <input class="input" name="label" maxlength="80" placeholder="Por ejemplo: Juan (candidato)"></label>
      <div class="field">Puede <div class="seg" role="group"><button type="button" aria-pressed="true" data-can="revisar">Aprobar o pedir cambios</button><button type="button" aria-pressed="false" data-can="ver">Solo mirar</button></div></div>
      <label class="small"><input type="checkbox" name="calendar" checked> Que vea el calendario de lo que viene</label>
      <div class="grid2"><label class="field">Código (opcional) <input class="input" name="code" minlength="4" maxlength="40" autocomplete="off" placeholder="Sin código"></label>
      <label class="field">Vence <select class="input" name="days"><option value="7">En 7 días</option><option value="30" selected>En 30 días</option><option value="0">Nunca</option></select></label></div>
      <button class="btn primary">Crear link</button>
    </form>
    <h3 class="h2" style="margin-top:18px">Links activos</h3><div id="sh-list"><p class="small muted">Cargando…</p></div>`);
  const refresh = async () => { d.querySelector('#sh-list').innerHTML = await list(); };
  let can = 'revisar';
  d.querySelectorAll('[data-can]').forEach((b) => b.addEventListener('click', () => { can = b.dataset.can; d.querySelectorAll('[data-can]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  d.querySelector('#sh-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const l = await api(`/api/projects/${pid}/shares`, { method: 'POST', body: { label: f.label.value.trim(), can, calendar: f.calendar.checked, code: f.code.value.trim(), days: Number(f.days.value) } });
      const url = location.origin + l.path;
      try { await navigator.clipboard.writeText(url); toast('Link creado y copiado'); } catch { toast('Link creado'); }
      f.reset(); await refresh();
    } catch (err) { fail(err); }
  });
  d.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]'), r = e.target.closest('[data-revoke]');
    if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Link copiado'); } catch { toast(c.dataset.copy); } }
    if (r && await confirmBox('Desactivar link', 'Quien lo tenga ya no va a poder abrirlo.', 'Desactivar')) { await api(`/api/shares/${r.dataset.revoke}`, { method: 'DELETE' }); refresh(); }
  });
  refresh();
}
function confirmBox(title, text, okLabel = 'Borrar') {
  return new Promise((res) => {
    const d = openDialog(title, `<p class="muted">${text}</p>`, `<button class="btn" data-close>Cancelar</button><button class="btn danger" data-ok>${okLabel}</button>`);
    d.querySelector('[data-ok]').onclick = () => { res(true); d.close(); };
    d.addEventListener('close', () => res(false));
  });
}

// los interruptores de pauta viajan como un solo campo JSON; al cambiar el tipo vuelven a su valor por defecto (en política, TikTok apagado)
function projectFormData(form) {
  const fd = new FormData(form);
  fd.set('ads_networks', JSON.stringify(Object.fromEntries(['meta', 'youtube', 'tiktok'].map((k) => [k, !!form.querySelector(`[name=ads_${k}]`)?.checked]))));
  for (const k of ['meta', 'youtube', 'tiktok']) fd.delete(`ads_${k}`);
  const wk = ['target_reach_per_usd', 'impressions_per_usd', 'completion', 'engagement'];
  if (wk.some((k) => form.querySelector(`[name=w_${k}]`))) fd.set('score_weights', JSON.stringify(Object.fromEntries(wk.map((k) => [k, Number(form.querySelector(`[name=w_${k}]`)?.value) || 0]))));
  for (const k of wk) fd.delete(`w_${k}`);
  return fd;
}
function wireKindDefaults(form) {
  form.querySelector('[name=kind]')?.addEventListener('change', (e) => { const t = form.querySelector('[name=ads_tiktok]'); if (t) t.checked = e.target.value !== 'politica'; });
}
function newProjectDialog() {
  const d = openDialog('Nuevo proyecto', projectForm());
  wireKindDefaults(d.querySelector('form'));
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const p = await api('/api/projects', { method: 'POST', body: projectFormData(e.target) }); d.close(); toast('Proyecto creado'); location.hash = `#/p/${p.id}/cuentas`; } catch (err) { fail(err); }
  });
}
function addAccountDialog() {
  const d = openDialog('Agregar cuenta', `<p class="muted small" style="margin-bottom:14px">Elegí la red. El nombre de la cuenta lo trae la conexión.</p>
    <div class="net-pick">${Object.entries(NETS).map(([k, n]) => `<button type="button" data-net="${k}">${netBadge(k)}<span>${n.name}</span></button>`).join('')}</div>`);
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-net]'); if (!b) return;
    try { const acc = await api(`/api/projects/${state.project.id}/accounts`, { method: 'POST', body: { network: b.dataset.net } }); d.close(); await render(); connectPanel(acc); }
    catch (err) { fail(err); }
  });
}

// ---------- conexión de una cuenta (como las integraciones de Efaysto) ----------
const SYSTEM_USERS = { label: 'Abrir Usuarios del sistema', url: 'https://business.facebook.com/settings/system-users' };
const META_PERMS = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'read_insights', 'instagram_manage_insights', 'business_management'];
const FIELD_DEF = {
  pageId: { label: 'ID de la Página de Facebook' },
  pageAccessToken: { label: 'Token de la Página', secret: true },
  instagramBusinessId: { label: 'ID de Instagram', hint: 'opcional, se completa solo al probar' },
  clientKey: { label: 'Client key' },
  clientSecret: { label: 'Client secret', secret: true },
  accessToken: { label: 'Token de acceso', secret: true },
  refreshToken: { label: 'Token de renovación', secret: true },
  clientId: { label: 'ID de cliente de OAuth' },
};
const CONNECT_STEPS = {
  instagram: [
    { title: 'Pasá Instagram a cuenta Profesional y vinculala a una Página', body: ['La cuenta tiene que ser Profesional (Empresa o Creador) y estar vinculada a una Página de Facebook.', 'En Meta Business Suite entrá a Configuración, después Cuentas de Instagram, y conectá la cuenta. Si la cuenta es de otra persona, que te dé acceso como socio desde su Business.'], links: [{ label: 'Abrir Meta Business Suite', url: 'https://business.facebook.com/latest/settings/instagram_accounts' }] },
    { title: 'Generá el token de la Página', body: ['En Configuración del negocio entrá a Usuarios, después Usuarios del sistema. Creá uno con rol Administrador (o usá el que ya tenés) y asignale la Página y la cuenta de Instagram.', 'Tocá «Generar token» con estos permisos. Ese token no vence.'], links: [SYSTEM_USERS], chips: META_PERMS, fields: ['pageAccessToken'] },
    { title: 'Copiá el ID de la Página', body: ['Está en la Página, en Información, sección Transparencia. También en Business Suite, Configuración, Páginas.', 'El ID de Instagram se completa solo cuando probás la conexión.'], fields: ['pageId', 'instagramBusinessId'] },
    { title: 'Probá la conexión', body: ['Guardá y probá. ACM le pregunta a Meta a qué cuenta entra y trae el usuario y los seguidores reales.'], test: true },
  ],
  facebook: [
    { title: 'Tené acceso a la Página', body: ['La Página tiene que estar en tu Business de Meta, propia o compartida como socio.'], links: [{ label: 'Abrir Páginas del negocio', url: 'https://business.facebook.com/settings/pages' }] },
    { title: 'Generá el token de la Página', body: ['En Usuarios del sistema asignale la Página al usuario y tocá «Generar token» con estos permisos. Ese token no vence.'], links: [SYSTEM_USERS], chips: META_PERMS.filter((p) => !p.startsWith('instagram')), fields: ['pageAccessToken'] },
    { title: 'Copiá el ID de la Página', body: ['Está en la Página, en Información, sección Transparencia.'], fields: ['pageId'] },
    { title: 'Probá la conexión', body: ['Guardá y probá. ACM trae el nombre de la Página y sus seguidores.'], test: true },
  ],
  tiktok: [
    { title: 'Creá la app en TikTok for Developers', body: ['Entrá a developers.tiktok.com, creá una app y agregale los productos Login Kit y Content Posting API.', 'Pedí los permisos que siguen. Hasta que TikTok apruebe la app, lo que se publica sale como privado.'], links: [{ label: 'Abrir TikTok for Developers', url: 'https://developers.tiktok.com/apps/' }], chips: ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.publish', 'video.upload'] },
    { title: 'Copiá las claves de la app', body: ['En la app, en Credenciales, copiá el Client key y el Client secret.'], fields: ['clientKey', 'clientSecret'] },
    { title: 'Autorizá la cuenta y pegá los tokens', body: ['Con la cuenta de TikTok abierta, autorizá la app (Login Kit). TikTok devuelve un token de acceso (dura 24 horas) y uno de renovación (dura un año).', 'Con los dos, ACM renueva el de acceso solo.'], fields: ['accessToken', 'refreshToken'] },
    { title: 'Probá la conexión', body: ['Guardá y probá. ACM trae el usuario y los seguidores.'], note: 'TikTok no acepta pauta política: en esta red el alcance es solo orgánico.', test: true },
  ],
  youtube: [
    { title: 'Creá el proyecto en Google Cloud', body: ['En console.cloud.google.com creá un proyecto y activá la API «YouTube Data API v3».'], links: [{ label: 'Abrir la API de YouTube', url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com' }] },
    { title: 'Creá el cliente de OAuth', body: ['En Credenciales creá un «ID de cliente de OAuth» de tipo Aplicación web. Agregá https://developers.google.com/oauthplayground como URI de redireccionamiento.', 'Copiá el ID de cliente y el secreto.'], links: [{ label: 'Abrir Credenciales', url: 'https://console.cloud.google.com/apis/credentials' }], fields: ['clientId', 'clientSecret'] },
    { title: 'Autorizá el canal y sacá el token de renovación', body: ['En OAuth Playground, en la rueda de configuración, marcá «Use your own OAuth credentials» y pegá el ID y el secreto.', 'Autorizá estos permisos con la cuenta de Google del canal y canjeá el código: copiá el «Refresh token».'], links: [{ label: 'Abrir OAuth Playground', url: 'https://developers.google.com/oauthplayground' }], chips: ['youtube.upload', 'youtube.readonly'], fields: ['refreshToken'] },
    { title: 'Probá la conexión', body: ['Guardá y probá. ACM trae el canal y sus suscriptores.'], test: true },
  ],
};

function connectPanel(acc) {
  const steps = CONNECT_STEPS[acc.network];
  let a = acc, active = 0, busy = '';
  const values = {}, shown = new Set();
  const host = document.createElement('div');
  host.className = 'cp-host';
  document.body.append(host);
  const close = () => { host.remove(); document.removeEventListener('keydown', onKey); render(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const fieldDone = (k) => (a.fields[k]?.set || a.fields[k]?.value || values[k]);
  const stepDone = (i) => steps[i].test ? a.status === 'conectada' : steps[i].fields ? steps[i].fields.filter((k) => k !== 'instagramBusinessId').every(fieldDone) : i < active || a.status === 'conectada';
  const dirty = () => Object.values(values).some((v) => v !== undefined);
  // conectar con un clic: solo TikTok y YouTube, y solo si el servidor tiene la app cargada
  const ONE = { tiktok: 'Conectar con TikTok', youtube: 'Conectar con Google' };
  const quick = () => !ONE[a.network] || !state.oauth?.[a.network] ? '' : `<div class="cp-quick">
    <div><b>${a.status === 'conectada' ? 'Volver a conectar' : 'La forma rápida'}</b><p class="small muted">Te lleva a ${a.network === 'tiktok' ? 'TikTok' : 'Google'}, autorizás con la cuenta${a.network === 'youtube' ? ' dueña del canal' : ''} y volvés acá conectado. No hace falta copiar nada.</p></div>
    <button class="btn primary" data-cp="oauth" ${busy ? 'disabled' : ''}>${netBadge(a.network)} ${ONE[a.network]}</button></div>
    <p class="small muted cp-or">o seguí los pasos para conectarla a mano</p>`;
  if (state.oauth === undefined) api('/api/oauth').then((o) => { state.oauth = o; draw(); }).catch(() => { state.oauth = null; });

  const draw = () => {
    const s = steps[active];
    const banner = busy === 'probar' ? '' : a.status === 'conectada' ? `<p class="banner ok">Conectada como <b>${esc(a.connected_as)}</b>.</p>` : a.status === 'error' && a.last_error ? `<p class="banner err"><b>La última prueba falló.</b> ${esc(a.last_error)}</p>` : '';
    host.innerHTML = `<div class="cp-scrim" data-cp="close"></div>
    <aside class="cp" role="dialog" aria-modal="true" aria-label="Conectar ${esc(accName(a))}">
      <header class="cp-h">${netBadge(a.network)}<div class="t"><h2 class="h2">${a.connected_as ? esc(a.connected_as) : 'Conectar cuenta de ' + NETS[a.network].name}</h2><p class="small muted">${NETS[a.network].name}</p></div><button class="btn sm ghost" data-cp="close">Cerrar</button></header>
      <div class="cp-body">${banner}
        ${quick()}
        <div class="cp-cols">
          <ol class="cp-steps">${steps.map((st, i) => `<li class="${i === active ? 'on' : ''} ${stepDone(i) && i !== active ? 'done' : ''}"><button data-cp="go" data-i="${i}"><span class="dot">${stepDone(i) && i !== active ? icon('check', 14) : i + 1}</span><span class="st">${esc(st.title)}</span></button></li>`).join('')}</ol>
          <section class="cp-detail">
            <p class="small muted">Paso ${active + 1} de ${steps.length}</p>
            <h3>${esc(s.title)}</h3>
            <div class="cp-content">
              ${s.body.map((p) => `<p>${esc(p)}</p>`).join('')}
              ${s.chips ? `<ul class="cp-chips">${s.chips.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
              ${s.links ? `<div class="row">${s.links.map((l) => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
              ${(s.fields || []).map((k) => { const f = FIELD_DEF[k], cur = a.fields[k] || {}; return `<label class="field">${esc(f.label)}${f.hint ? ` <span class="hint">(${esc(f.hint)})</span>` : ''}
                <span class="row"><input class="input ${f.secret && !shown.has(k) ? 'masked' : ''}" data-k="${k}" autocomplete="off" spellcheck="false" value="${esc(values[k] ?? (f.secret ? '' : cur.value || ''))}" placeholder="${f.secret && cur.set ? 'Guardado · pegá uno nuevo para cambiarlo' : ''}">
                ${f.secret ? `<button type="button" class="btn sm" data-cp="show" data-k="${k}">${shown.has(k) ? 'Ocultar' : 'Mostrar'}</button>` : ''}</span></label>`; }).join('')}
              ${s.note ? `<p class="cp-note">${esc(s.note)}</p>` : ''}
              ${s.test ? `<div class="row"><button class="btn primary" data-cp="test" ${busy ? 'disabled' : ''}>${busy === 'probar' ? '<span class="spin"></span> Probando…' : 'Probar conexión'}</button>${a.status === 'conectada' ? `<span class="res-ok">Conectada como ${esc(a.connected_as)} · ${fmt(a.followers)} seguidores</span>` : ''}</div>
                ${a.status === 'error' && a.last_error ? `<p class="banner err" style="margin:0">${esc(a.last_error)}</p>` : ''}` : ''}
            </div>
            <div class="cp-nav"><button class="btn sm" data-cp="go" data-i="${active - 1}" ${active === 0 ? 'disabled' : ''}>Anterior</button><button class="btn sm primary" data-cp="go" data-i="${active + 1}" ${active === steps.length - 1 ? 'disabled' : ''}>Siguiente paso</button></div>
          </section>
        </div>
      </div>
      <footer class="cp-f"><button class="btn danger" data-cp="disconnect" ${busy || !(a.connected_as || Object.values(a.fields).some((f) => f.set || f.value)) ? 'disabled' : ''}>Desconectar</button><span class="spacer"></span>
        <button class="btn" data-cp="save" ${busy || !dirty() ? 'disabled' : ''}>${busy === 'guardar' ? 'Guardando…' : 'Guardar'}</button>
        <button class="btn primary" data-cp="test" ${busy ? 'disabled' : ''}>${busy === 'probar' ? 'Probando…' : 'Probar conexión'}</button></footer>
    </aside>`;
  };
  const payload = () => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  host.addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    values[k] = e.target.value;
    const save = host.querySelector('[data-cp=save]'); if (save) save.disabled = false;
  });
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cp]'); if (!b || b.disabled) return;
    const act = b.dataset.cp;
    if (act === 'close') return close();
    if (act === 'go') { active = Math.max(0, Math.min(steps.length - 1, Number(b.dataset.i))); return draw(); }
    if (act === 'show') { const k = b.dataset.k; shown.has(k) ? shown.delete(k) : shown.add(k); return draw(); }
    try {
      if (act === 'oauth') { busy = 'oauth'; draw(); const r = await api(`/api/accounts/${a.id}/oauth`, { method: 'POST' }); location.href = r.url; return; }
      if (act === 'save') { busy = 'guardar'; draw(); a = await api(`/api/accounts/${a.id}/connection`, { method: 'PUT', body: payload() }); for (const k in values) delete values[k]; toast('Datos guardados'); }
      if (act === 'test') {
        busy = 'probar'; active = steps.length - 1; draw();
        a = await api(`/api/accounts/${a.id}/test`, { method: 'POST', body: payload() });
        for (const k in values) delete values[k];
        toast(a.status === 'conectada' ? `Conectada como ${a.connected_as}` : 'La prueba falló', a.status !== 'conectada');
      }
      if (act === 'disconnect') {
        busy = 'x';
        if (await confirmBox('Desconectar cuenta', 'Se borran los datos de conexión guardados. La cuenta y sus publicaciones quedan.', 'Desconectar')) { a = await api(`/api/accounts/${a.id}/connection`, { method: 'DELETE' }); active = 0; toast('Cuenta desconectada'); }
      }
    } catch (err) { fail(err); }
    busy = ''; draw();
  });
  draw();
}

function distributeDialog(reel) {
  const A = state.accounts.filter((a) => a.status !== 'pausada');
  // redes donde el reel ya está: quedan cerradas (el mismo video en dos cuentas de una red las hace bloquear)
  const ya = Object.fromEntries(state.posts.filter((x) => x.reel_id === reel.id).map((x) => [x.network, state.accounts.find((a) => a.id === x.account_id)]));
  const first = {}; A.forEach((a) => { if (!ya[a.network] && a.status === 'conectada' && !first[a.network]) first[a.network] = a.id; });
  const start = new Date(); start.setDate(start.getDate() + (start.getHours() >= 18 ? 1 : 0)); start.setHours(19, 0, 0, 0);
  const d = openDialog('Repartir reel', `<form class="form" id="dist-form">
    <p class="muted small">«${esc(reel.title)}» sale en <b>una cuenta por red</b>, con horarios separados. El mismo video en dos cuentas de la misma red hace que la red las bloquee: para más cuentas, subí otra edición del crudo.</p>
    <div class="row"><b class="small">Cuentas</b><span class="spacer"></span><button type="button" class="btn sm ghost" data-none>Ninguna</button></div>
    <div class="acc-pick">${A.map((a) => ya[a.network] ? `<label class="off"><input type="checkbox" disabled>${netBadge(a.network)}${esc(accName(a))}<span class="spacer"></span><span class="small muted">${ya[a.network].id === a.id ? 'ya está acá' : `ya está en ${esc(accName(ya[a.network]))}`}</span></label>`
      : `<label><input type="checkbox" name="acc" value="${a.id}" data-net="${a.network}" ${first[a.network] === a.id ? 'checked' : ''}>${netBadge(a.network)}${esc(accName(a))}<span class="spacer"></span><span class="small muted">${ACC_STATUS[a.status]}</span></label>`).join('') || '<p class="small muted">No hay cuentas activas.</p>'}</div>
    ${A.some((a) => a.network === 'tiktok') ? `<div class="tt-dist" hidden><b class="small">TikTok</b>${ttForm(null)}</div>` : ''}
    ${A.some((a) => a.status !== 'conectada') ? '<p class="hint" style="margin-top:-6px">Las cuentas sin conectar no vienen tildadas: si las elegís, conectalas antes de la hora o esa publicación falla.</p>' : ''}
    <label class="field">Texto de la publicación<textarea class="textarea" name="caption" rows="3" placeholder="El texto que acompaña al reel, con sus #hashtags">${esc(reel.caption || '')}</textarea><span class="hint">Se guarda en el reel y sale igual en todas las cuentas${reel.hashtags ? `, con ${esc(reel.hashtags)} al final` : ''}</span></label>
    <div class="two"><label class="field">Primera publicación<input class="input" type="datetime-local" name="start" value="${localInput(start)}" ${state.project.propaganda_until ? `max="${state.project.propaganda_until}T23:59"` : ''} required></label>
    <label class="field">Separación entre cuentas<select class="select" name="gap"><option value="20">20 minutos</option><option value="45" selected>45 minutos</option><option value="90">1 h 30</option><option value="180">3 horas</option><option value="1440">1 día</option></select></label></div>
    <div class="row"><span class="spacer"></span><button class="btn" type="button" data-close>Cancelar</button><button class="btn accent" type="submit">Programar</button></div>
  </form>`);
  const f = d.querySelector('form');
  const ttBox = d.querySelector('.tt-dist');
  const ttIds = new Set(A.filter((a) => a.network === 'tiktok').map((a) => a.id));
  const ttShow = () => { if (ttBox) ttBox.hidden = !$$('[name=acc]:checked', f).some((c) => ttIds.has(Number(c.value))); };
  if (ttBox) { ttWire(ttBox); f.addEventListener('change', ttShow); ttShow(); }
  // al tildar una cuenta se destilda la otra de la misma red
  f.addEventListener('change', (e) => { const c = e.target; if (c.name === 'acc' && c.checked) $$(`[name=acc][data-net="${c.dataset.net}"]`, f).forEach((o) => { if (o !== c) o.checked = false; }); });
  d.querySelector('[data-none]').onclick = () => { $$('[name=acc]', f).forEach((c) => (c.checked = false)); ttShow?.(); };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = $$('[name=acc]:checked', f).map((c) => Number(c.value));
    if (!ids.length) return toast('Elegí al menos una cuenta', true);
    const ttOpts = ids.some((i) => ttIds.has(i)) ? ttRead(ttBox) : undefined;
    if (ttOpts === null) return;
    // mezcla el orden para que las cuentas no salgan siempre en la misma secuencia
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const t0 = new Date(f.start.value), gap = Number(f.gap.value);
    const lim = state.project.propaganda_until;
    const items = ids.map((id, i) => { const t = new Date(t0.getTime() + i * gap * 6e4); return { reel_id: reel.id, account_id: id, scheduled_at: localInput(t).replace('T', ' '), ...(ttIds.has(id) ? { options: ttOpts } : {}) }; });
    if (lim && items.some((x) => x.scheduled_at.slice(0, 10) > lim)) return toast(`Algunas publicaciones caen después del ${fmtShort(lim)}, la fecha máxima de propaganda. Empezá antes o separalas menos.`, true);
    try { if (f.caption.value !== (reel.caption || '')) await api(`/api/reels/${reel.id}`, { method: 'PUT', body: { caption: f.caption.value } });
      await api(`/api/projects/${state.project.id}/posts`, { method: 'POST', body: items }); d.close(); toast(`Programado en ${items.length} ${items.length === 1 ? 'cuenta' : 'cuentas'}`); render(); } catch (err) { fail(err); }
  });
}

// ---------- subida de reels ----------
// duración y medidas que lee el navegador: con R2 el servidor no ve el archivo
const videoMeta = (f) => new Promise((ok) => { const v = document.createElement('video'); const u = URL.createObjectURL(f); const end = (m) => { URL.revokeObjectURL(u); ok(m); };
  v.preload = 'metadata'; v.onloadedmetadata = () => end({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }); v.onerror = () => end({}); setTimeout(() => end({}), 8000); v.src = u; });
async function uploadToR2(files) {
  const kind = state.upKind || 'listo', pid = state.project.id;
  state.uploads = files; render();
  try {
    const links = await api(`/api/projects/${pid}/reels/uploads`, { method: 'POST', body: { files: files.map((f) => ({ name: f.name, size: f.size, type: f.type || 'video/mp4' })) } });
    const total = files.reduce((a, f) => a + f.size, 0), sent = files.map(() => 0);
    const bar = () => { const b = $('#up-bar'); if (b) b.style.width = (sent.reduce((a, x) => a + x, 0) / total * 100) + '%'; };
    const putOne = (f, l, i) => new Promise((ok, ko) => { const x = new XMLHttpRequest(); x.open('PUT', l.url); x.setRequestHeader('Content-Type', f.type || 'video/mp4');
      x.upload.onprogress = (e) => { sent[i] = e.loaded; bar(); }; x.onload = () => (x.status < 300 ? ok() : ko(new Error(`«${f.name}» no se pudo subir (${x.status})`))); x.onerror = () => ko(new Error(`Se cortó la subida de «${f.name}»`)); x.send(f); });
    // de a 3 a la vez: más rápido sin saturar la conexión
    const metas = await Promise.all(files.map(videoMeta));
    for (let i = 0; i < files.length; i += 3) await Promise.all(files.slice(i, i + 3).map((f, k) => putOne(f, links[i + k], i + k)));
    await api(`/api/projects/${pid}/reels/complete`, { method: 'POST', body: { kind, items: files.map((f, i) => ({ key: links[i].key, name: f.name, ...metas[i] })) } });
    toast(`${files.length} ${kind === 'crudo' ? (files.length === 1 ? 'crudo subido' : 'crudos subidos') : (files.length === 1 ? 'reel listo subido' : 'reels listos subidos')}`);
  } catch (err) { fail(err); }
  state.uploads = []; render();
}
function uploadReels(files) {
  files = [...files].filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
  if (!files.length) return toast('Elegí archivos de video', true);
  const max = state.storage?.max || 1024 ** 3;
  const big = files.find((f) => f.size > max); if (big) return toast(`«${big.name}» pesa más de ${Math.round(max / 1024 ** 3)} GB`, true);
  if (state.storage?.r2) return uploadToR2(files);
  const fd = new FormData(); fd.append('kind', state.upKind || 'listo'); files.forEach((f) => fd.append('files', f));
  state.uploads = files; render();
  const x = new XMLHttpRequest();
  x.open('POST', `/api/projects/${state.project.id}/reels`);
  x.upload.onprogress = (e) => { const b = $('#up-bar'); if (b && e.lengthComputable) b.style.width = (e.loaded / e.total * 100) + '%'; };
  x.onload = () => { state.uploads = []; if (x.status < 300) toast(`${files.length} ${state.upKind === 'crudo' ? (files.length === 1 ? 'crudo subido' : 'crudos subidos') : (files.length === 1 ? 'reel listo subido' : 'reels listos subidos')}`); else { try { fail(new Error(JSON.parse(x.responseText).error)); } catch { fail(new Error('No se pudo subir')); } } render(); };
  x.onerror = () => { state.uploads = []; fail(new Error('Se cortó la subida')); render(); };
  x.send(fd);
}

// ---------- eventos ----------
function afterRender(r) {
  if (r.view === 'project' && r.tab === 'investigacion') {
    knLoad();
    if (ASK.pid !== state.project.id) Object.assign(ASK, { pid: state.project.id, turns: [] });
    askDraw(); $('#ask-form')?.addEventListener('submit', askSend);
    $('#kn-form').addEventListener('submit', (e) => { e.preventDefault(); K.q = e.target.q.value.trim(); knLoad(); });
  }
  const rf = $('#reel-form');
  if (rf) {
    reelPreview(rf); rf.addEventListener('input', () => { reelPreview(rf); $('#rf-state').textContent = 'Sin guardar'; });
    rf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { title: rf.title.value.trim(), caption: rf.caption.value, hashtags: rf.hashtags.value };
      if (!rf.kind.disabled) body.kind = rf.kind.value;
      if (rf.source_id) body.source_id = rf.source_id.value || null;
      try { await api(`/api/reels/${rf.dataset.id}`, { method: 'PUT', body }); toast('Reel guardado'); render(); } catch (err) { fail(err); }
    });
  }
  const ct = $('#cg-total');
  if (ct) { ct.addEventListener('change', () => { (async () => { try { state.project.pauta = await api(`/api/projects/${state.project.id}/pauta`, { method: 'PUT', body: { ...(state.project.pauta || {}), budget: Number(ct.value) || 0 } }); render(); } catch (e) { fail(e); } })(); }); }
  wireCalDrag();
  const drop = $('#drop');
  if (drop) {
    $('#reel-input').addEventListener('change', (e) => uploadReels(e.target.files));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => uploadReels(e.dataTransfer.files));
  }
  const pf = $('#project-form');
  if (pf && r.view === 'project') wireKindDefaults(pf);
  if (pf && r.view === 'project') pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = projectFormData(pf); if (!fd.get('photo')?.size) fd.delete('photo');
    try { await api(`/api/projects/${state.project.id}`, { method: 'PUT', body: fd }); toast('Guardado'); render(); } catch (err) { fail(err); }
  });
  const pd = $('#pad-drop');
  if (pd) {
    const send = async (f) => {
      if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      pd.classList.add('over'); pd.querySelector('b').textContent = 'Leyendo el padrón…';
      try { const r = await api(`/api/projects/${state.project.id}/padron`, { method: 'POST', body: fd }); toast(`Padrón cargado: ${fmt(r.padron)} socios, ${fmt(r.padron_contacts)} contactables`); if (!r.columns.phone && !r.columns.email) toast('No encontré columnas de teléfono ni de mail', true); }
      catch (err) { fail(err); }
      render();
    };
    $('#pad-input').addEventListener('change', (e) => send(e.target.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => pd.addEventListener(ev, (e) => { e.preventDefault(); pd.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => pd.addEventListener(ev, (e) => { e.preventDefault(); pd.classList.remove('over'); }));
    pd.addEventListener('drop', (e) => send(e.dataTransfer.files[0]));
  }
  const pform = $('#pauta-form');
  if (pform) {
    let timer;
    const read = () => ({ budget: Number(pform.querySelector('[name=budget]').value) || 0, start_date: pform.querySelector('[name=start_date]').value, end_date: pform.querySelector('[name=end_date]').value });
    const update = () => {
      const pa = read();
      const c = pautaCalc(state.project, pa);
      $('#pauta-out').innerHTML = pautaOut(state.project, c); $('#pauta-tabla').innerHTML = pautaTabla(state.project, c); $('#pauta-datos').innerHTML = pautaDatos(state.project, c);
      clearTimeout(timer); timer = setTimeout(() => api(`/api/projects/${state.project.id}/pauta`, { method: 'PUT', body: pa }).then((x) => (state.project.pauta = x)).catch(fail), 500);
    };
    pform.addEventListener('input', update);
  }
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'login-form') return;
  e.preventDefault();
  try { await api('/api/login', { method: 'POST', body: { password: $('#pw').value } }); state.authed = true; render(); }
  catch (err) { $('#login-err').textContent = err.message; }
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = Number(el.closest('[data-id]')?.dataset.id);
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  try {
    switch (act) {
      case 'menu': $('.side').classList.toggle('open'); $('.scrim').classList.toggle('open'); break;
      case 'logout': await api('/api/logout', { method: 'POST' }); state.authed = false; location.hash = ''; render(); break;
      case 'new-project': newProjectDialog(); break;
      case 'new-account': addAccountDialog(); break;
      case 'add-net': { const acc = await api(`/api/projects/${state.project.id}/accounts`, { method: 'POST', body: { network: el.dataset.net } }); await render(); connectPanel(acc); break; }
      case 'cal-prev': case 'cal-next': case 'cal-today': {
        if (state.calMode === 'semana') {
          const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
          const w = new Date(state.calWeek || t); if (act !== 'cal-today') w.setDate(w.getDate() + (act === 'cal-next' ? 7 : -7));
          state.calWeek = act === 'cal-today' ? t : w;
          state.calMonth = new Date(state.calWeek.getFullYear(), state.calWeek.getMonth(), 1);
        } else {
          const m = state.calMonth || new Date();
          state.calMonth = act === 'cal-today' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date(m.getFullYear(), m.getMonth() + (act === 'cal-next' ? 1 : -1), 1);
        }
        render(); break; }
      case 'cal-mode': state.calMode = el.dataset.k; try { localStorage.setItem('acm.calMode', state.calMode); } catch {} render(); break;
      case 'open-post': postDialog([Number(el.dataset.pid)]); break;
      case 'share-open': shareDialog(); break;
      case 'camp-new': campDialog(); break;
      case 'up-kind': state.upKind = el.dataset.k; render(); break;
      case 'reel-filter': state.reelFilter = el.dataset.k; render(); break;
      case 'camp-edit': campDialog(state.camps.campaigns.find((c) => c.id === id)); break;
      case 'camp-del': if (await confirmBox('Borrar campaña', 'Se borra de ACM. Si ya estaba creada en Meta, allá queda en pausa.')) { await api(`/api/campaigns/${id}`, { method: 'DELETE' }); render(); } break;
      case 'camp-meta': el.disabled = true; el.textContent = 'Creando…'; try { await api(`/api/campaigns/${id}/meta`, { method: 'POST' }); toast('Campaña creada en Meta, en pausa'); } catch (err) { fail(err); } render(); break;
      case 'camp-spend': el.disabled = true; el.textContent = 'Consultando…'; try { const r = await api(`/api/projects/${state.project.id}/campaigns/spend`, { method: 'POST' }); toast(r.errors?.length ? `Actualizadas ${r.updated}; ${r.errors.length} con error` : `Gasto actualizado (${r.updated})`, !!r.errors?.length); } catch (err) { fail(err); } render(); break;
      case 'kn-kind': K.kind = el.dataset.k; knLoad(); break;
      case 'kn-handle': K.handle = K.handle === el.dataset.h ? '' : el.dataset.h; K.kind = K.handle ? 'publicacion' : ''; knLoad(); break;
      case 'kn-del': if (await confirmBox('Borrar ficha', 'La ficha se borra de la investigación del proyecto.', 'Borrar')) { await api(`/api/knowledge/${el.dataset.id}`, { method: 'DELETE' }); knLoad(); } break;
      case 'ads-save': {
        const box = $('#ads-card'), body = {};
        $$('[data-ads]', box).forEach((i) => { const k = i.dataset.ads; if (i.type === 'checkbox') body[k] = i.checked; else if (i.value || k !== 'accessToken') body[k] = i.value; });
        el.disabled = true; el.textContent = 'Probando…';
        await api(`/api/projects/${state.project.id}/ads`, { method: 'PUT', body });
        try { await api(`/api/projects/${state.project.id}/ads/test`, { method: 'POST' }); toast('Cuenta publicitaria conectada'); } catch (err) { fail(err); }
        render(); break; }
      case 'ads-save-net': {
        const net = el.dataset.net, body = {};
        $$(`[data-adsx="${net}"]`).forEach((i) => { if (i.value || !i.classList.contains('masked')) body[i.dataset.k] = i.value; });
        el.disabled = true; el.textContent = 'Probando…';
        try {
          await api(`/api/projects/${state.project.id}/ads`, { method: 'PUT', body });
          await api(`/api/projects/${state.project.id}/ads/test`, { method: 'POST', body: { network: net } });
          toast(net === 'tiktok' ? 'TikTok Ads conectado' : 'Google Ads conectado');
        } catch (err) { fail(err); }
        render(); break; }
      case 'ads-unblock':
        try { await api(`/api/projects/${state.project.id}/ads/unblock`, { method: 'POST', body: { network: el.dataset.net } }); toast('Red reactivada'); } catch (err) { fail(err); }
        render(); break;
      case 'ads-audience': el.disabled = true; el.textContent = 'Subiendo…'; try { await api(`/api/projects/${state.project.id}/ads/audience`, { method: 'POST' }); toast('Padrón subido a Meta'); } catch (err) { fail(err); } render(); break;
      case 'ads-campaign': el.disabled = true; el.textContent = 'Creando…'; try { await api(`/api/projects/${state.project.id}/ads/campaign`, { method: 'POST' }); toast('Campaña creada en pausa'); } catch (err) { fail(err); } render(); break;
      case 'lab-kind': state.lab.kind = el.dataset.k; state.lab.sel = null; render(); break;
      case 'lab-open': state.lab.sel = Number(el.dataset.rid); render(); break;
      case 'lab-banco-sel': state.lab.bancoSel = Number(el.dataset.rid); render(); break;
      case 'lab-banco': { state.lab.running = true; render(); try { const r = await api('/api/lab/banco', { method: 'POST' }); state.lab.bancoSel = r.run?.id; toast(r.ok === r.total ? `Pasaron los ${r.total} casos` : `Pasaron ${r.ok} de ${r.total}`, r.ok !== r.total); } catch (err) { fail(err); } state.lab.running = false; render(); break; }
      case 'post-now': { const box = el.closest('.pd')?.querySelector('.tt-opts'); const options = box ? ttRead(box) : undefined; if (options === null) break; el.disabled = true; el.textContent = 'Publicando…'; await api(`/api/posts/${id}/now`, { method: 'POST', body: options ? { options } : {} }); toast('Se está publicando: en un rato cambia el estado'); el.closest('dialog')?.close(); break; }
      case 'open-day': postDialog(state.posts.filter((x) => ymd(pdate(x.scheduled_at)) === el.dataset.day).map((x) => x.id)); break;
      case 'del-padron': if (await confirmBox('Quitar padrón', 'Se borran las huellas de teléfonos y mails. El número de socios queda.', 'Quitar')) { await api(`/api/projects/${state.project.id}/padron`, { method: 'DELETE' }); toast('Padrón quitado'); render(); } break;
      case 'connect-account': connectPanel(state.accounts.find((a) => a.id === id)); break;
      case 'pause-account': { const a = state.accounts.find((x) => x.id === id); await api(`/api/accounts/${id}`, { method: 'PUT', body: { status: a.status === 'pausada' ? 'activa' : 'pausada' } }); toast(a.status === 'pausada' ? 'Cuenta reanudada' : 'Cuenta pausada: no recibe publicaciones nuevas'); render(); break; }
      case 'del-account': if (await confirmBox('Borrar cuenta', 'Se quitan también sus publicaciones programadas.')) { await api(`/api/accounts/${id}`, { method: 'DELETE' }); render(); } break;
      case 'del-reel': if (await confirmBox('Borrar reel', 'Se borra el video y sus publicaciones programadas.')) { await api(`/api/reels/${id}`, { method: 'DELETE' }); render(); } break;
      case 'reel-approve': { const r = state.reels.find((x) => x.id === id); await api(`/api/reels/${id}`, { method: 'PUT', body: { status: r.status === 'aprobado' ? 'borrador' : 'aprobado' } }); render(); break; }
      case 'ap-ok': case 'ap-no': case 'ap-no-all': {
        const box = el.closest('.ap-clip'), clip = box.dataset.clip, note = $('.ap-note', box).value.trim();
        const marked = $$('input[data-rid]:checked', box).map((i) => Number(i.dataset.rid));
        if (act === 'ap-no' && !marked.length) { toast('Marcá la versión que querés rechazar, o usá «Rechazar las 3»', true); break; }
        if (act !== 'ap-ok' && !note) { toast('Para rechazar escribí un comentario: nos ayuda a aprender', true); $('.ap-note', box).focus(); break; }
        el.disabled = true;
        const r = await api(`/api/clips/${encodeURIComponent(clip)}/review`, { method: 'POST', body: act === 'ap-ok' ? { decision: 'aprobar', comentario: note } : { decision: 'rechazar', rechazar_ids: act === 'ap-no' ? marked : [], comentario: note } });
        toast(act === 'ap-ok' ? 'Recorte aprobado' : 'Recorte rechazado');
        if (r.review_mode !== state.review?.review_mode) toast(r.review_mode === 'auto' ? 'La revisión pasó a automática: 19 de los últimos 20 aprobados' : 'La revisión volvió a manual');
        render(); break; }
      case 'distribute': distributeDialog(state.reels.find((x) => x.id === id)); break;
      case 'del-post': await api(`/api/posts/${id}`, { method: 'DELETE' }); { const box = el.closest('.pd'); const dlg = el.closest('dialog'); box?.remove(); if (dlg && !dlg.querySelector('.pd')) dlg.close(); else render(); } break;
      case 'del-project': if (await confirmBox('Borrar proyecto', `Se borra «${esc(state.project.name)}» con todas sus cuentas, reels y publicaciones.`)) { await api(`/api/projects/${state.project.id}`, { method: 'DELETE' }); location.hash = ''; toast('Proyecto borrado'); } break;
    }
  } catch (err) { fail(err); }
});

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = Number(el.closest('[data-id]')?.dataset.id);
  try {
    if (el.dataset.act === 'post-status') { await api(`/api/posts/${id}`, { method: 'PUT', body: { status: el.value } }); const x = state.posts.find((y) => y.id === id); if (x) x.status = el.value; toast('Publicación actualizada'); if (!el.closest('dialog')) render(); }
    if (el.dataset.act === 'reel-title' && el.value.trim()) { await api(`/api/reels/${id}`, { method: 'PUT', body: { title: el.value.trim() } }); toast('Título guardado'); }
  } catch (err) { fail(err); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-act=reel-title]')) e.target.blur(); });

setInterval(() => { if (state.authed && !document.querySelector('dialog, .cp-host') && state.posts.some((x) => x.status === 'publicando' || (x.status === 'programado' && pdate(x.scheduled_at) <= new Date()))) render(); }, 15000);
window.addEventListener('hashchange', () => { $('.side')?.classList.remove('open'); render(); window.scrollTo(0, 0); });
// vuelta de «Conectar con TikTok / Google»: el servidor manda ?conexion=ok|error en la dirección
{ const q = new URLSearchParams(location.search); const c = q.get('conexion');
  if (c) { history.replaceState(null, '', location.pathname + location.hash); setTimeout(() => toast(c === 'ok' ? `Cuenta conectada: ${q.get('cuenta') || ''}` : `No se pudo conectar. ${q.get('motivo') || ''}`, c !== 'ok'), 600); } }
api('/api/session').then((s) => { state.authed = s.ok; render(); }).catch(() => render());
