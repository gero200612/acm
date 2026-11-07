// ACM — panel. Sin framework: rutas por hash, render con plantillas y delegación de eventos.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d });
const usd = (n) => 'USD ' + fmt(Math.round(n));

const LOGO = (hub = 'var(--blue)', node = '#fff') => `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><g stroke="${node}" stroke-width="3.2" stroke-linecap="round"><path d="M24 33 9.5 14.5M24 33V10M24 33l14.5-18.5"/></g><circle cx="9.5" cy="14.5" r="4.6" fill="${node}"/><circle cx="24" cy="9.5" r="4.6" fill="${node}"/><circle cx="38.5" cy="14.5" r="4.6" fill="${node}"/><circle cx="24" cy="34" r="7.5" fill="${hub}"/></svg>`;
const NETS = {
  instagram: { name: 'Instagram', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>' },
  facebook: { name: 'Facebook', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21h3Z"/></svg>' },
  tiktok: { name: 'TikTok', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.2 3c.4 2.3 1.8 3.7 4.1 3.9v3.2c-1.5 0-2.9-.5-4.1-1.2v6.3a6.1 6.1 0 1 1-6.1-6.1h.5v3.3a2.8 2.8 0 1 0 2.3 2.8V3h3.3Z"/></svg>' },
  youtube: { name: 'YouTube', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.6 7.8v8.4l7.2-4.2-7.2-4.2Z"/></svg>' },
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
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
};
const icon = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[k]}"/></svg>`;
const netBadge = (n) => `<span class="net ${n}" title="${NETS[n]?.name || n}">${NETS[n]?.svg || ''}</span>`;
const initials = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const avatar = (p, lg) => p.photo
  ? `<img class="avatar${lg ? ' lg' : ''}" src="/media/${esc(p.photo)}" alt="">`
  : `<span class="avatar${lg ? ' lg' : ''}" style="background:${esc(p.color)}">${esc(initials(p.name))}</span>`;
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
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3200);
}
const fail = (e) => toast(e.message || 'Algo falló', true);

// ---------- estado ----------
const state = { authed: false, projects: [], project: null, accounts: [], reels: [], posts: [], uploads: [] };

async function loadProjects() { state.projects = await api('/api/projects'); }
async function loadProject(id) {
  const [p, a, r, s] = await Promise.all([api(`/api/projects/${id}`), api(`/api/projects/${id}/accounts`), api(`/api/projects/${id}/reels`), api(`/api/projects/${id}/posts`)]);
  state.project = p; state.accounts = a; state.reels = r; state.posts = s;
}

function route() {
  const [, a, id, tab] = location.hash.replace(/^#/, '').split('/');
  if (a === 'p' && id) return { view: 'project', id: Number(id), tab: tab || 'resumen' };
  return { view: 'home' };
}

// ---------- render ----------
async function render() {
  const app = $('#app');
  if (!state.authed) { app.innerHTML = loginView(); $('#pw')?.focus(); return; }
  const r = route();
  try {
    await loadProjects();
    if (r.view === 'project') await loadProject(r.id);
  } catch (e) { if (e.message !== 'Sin sesión') { fail(e); location.hash = ''; } return; }
  const head = r.view === 'project' ? projectHead(state.project) : `<div><h1 class="page-title">Inicio</h1><p class="lead">Todas las campañas, sus cuentas y lo que sale publicado.</p></div><button class="btn primary" data-act="new-project">${icon('plus')} Nuevo proyecto</button>`;
  const body = r.view === 'project' ? projectView(r.tab) : homeView();
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
    <div class="nav-label">Proyectos</div>
    ${state.projects.map((p) => `<a class="item ${r.id === p.id ? 'active' : ''}" href="#/p/${p.id}"><span class="dot" style="background:${esc(p.color)}"></span><span class="t">${esc(p.name)}</span></a>`).join('')}
    <button class="item add" data-act="new-project">${icon('plus', 20)}<span class="t">Nuevo proyecto</span></button>
  </nav>
  <div class="side-foot"><span class="live"><i></i>En línea</span><button data-act="logout">Salir</button></div>`;
}

function loginView() {
  return `<div class="login"><form id="login-form">
    <div><div class="mark">${LOGO('var(--blue)', 'var(--ink)')}ACM</div><p class="muted small">Agentic Campaign Manager</p></div>
    <label class="field">Contraseña<input class="input" id="pw" type="password" autocomplete="current-password" required></label>
    <div class="err" id="login-err"></div>
    <button class="btn primary" type="submit">Entrar</button>
  </form></div>`;
}

// ---------- inicio ----------
function homeView() {
  const P = state.projects;
  const sum = (k) => P.reduce((a, p) => a + (p[k] || 0), 0);
  const padron = sum('padron');
  const kpis = `<div class="grid g4">
    <div class="kpi dark"><div class="label">Proyectos activos</div><div class="value"><em>${P.length}</em></div><div class="hint">${padron ? fmt(padron) + ' personas en los padrones' : 'Cargá el primero'}</div></div>
    <div class="kpi"><div class="label">Cuentas</div><div class="value">${sum('accounts')}</div><div class="hint">${sum('accounts_live')} conectadas</div></div>
    <div class="kpi"><div class="label">Reels cargados</div><div class="value">${sum('reels')}</div><div class="hint">listos para repartir</div></div>
    <div class="kpi"><div class="label">Publicaciones</div><div class="value">${sum('scheduled')}</div><div class="hint">programadas · ${sum('published')} publicadas</div></div>
  </div>`;
  const cards = P.map((p) => `
    <a class="pcard" href="#/p/${p.id}" style="--c:${esc(p.color)}">
      <div class="top">${avatar(p)}<div style="min-width:0"><div class="name">${esc(p.name)}</div><div class="muted small">${esc([p.role, p.org].filter(Boolean).join(' · ') || 'Sin cargo cargado')}</div></div></div>
      <div class="row">${countdown(p)}${p.padron ? `<span class="chip nodot">Padrón ${fmt(p.padron)}</span>` : ''}</div>
      <div class="stats"><div><b>${p.accounts}</b><span>cuentas</span></div><div><b>${p.reels}</b><span>reels</span></div><div><b>${p.scheduled}</b><span>programadas</span></div></div>
    </a>`).join('');
  return `<div class="stack">${kpis}
    <div class="card-head" style="margin:12px 0 0"><h2 class="h2">Proyectos</h2></div>
    <div class="grid g3">${cards}<button class="pcard new" data-act="new-project">${icon('plus', 28)}Nuevo proyecto<span class="small muted" style="font-weight:400">Un dirigente o candidato con sus cuentas</span></button></div>
  </div>`;
}

// ---------- proyecto ----------
function projectHead(p) {
  return `<div class="who">${avatar(p, true)}<div style="min-width:0"><h1 class="page-title">${esc(p.name)}</h1><p class="lead">${esc([p.role, p.org].filter(Boolean).join(' · ') || 'Proyecto')}</p></div></div>
  <div class="row">${countdown(p)}${p.padron ? `<span class="chip nodot">Padrón ${fmt(p.padron)}</span>` : ''}</div>`;
}
const TABS = [['resumen', 'Resumen'], ['cuentas', 'Cuentas'], ['reels', 'Reels'], ['calendario', 'Calendario'], ['pauta', 'Pauta'], ['ajustes', 'Ajustes']];
function projectView(tab) {
  const p = state.project;
  const counts = { cuentas: state.accounts.length, reels: state.reels.length, calendario: state.posts.filter((x) => x.status === 'programado').length };
  const tabs = `<nav class="tabs">${TABS.map(([k, l]) => `<a href="#/p/${p.id}/${k}" class="${tab === k ? 'active' : ''}">${l}${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</a>`).join('')}</nav>`;
  const views = { resumen: resumenView, cuentas: cuentasView, reels: reelsView, calendario: calendarioView, pauta: pautaView, ajustes: ajustesView };
  return tabs + (views[tab] || resumenView)();
}

// Datos fijos del cálculo (no se tocan desde la pantalla): CPM de Meta en Argentina en campaña con públicos chicos,
// parte del padrón que Meta reconoce con teléfono o mail, e IVA de servicios digitales del exterior.
const PAUTA_DATOS = { cpm: 6, match_pct: 60, iva: 0.21 };
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
  const next = upcoming[0];
  // franja de los próximos 7 días
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
  const dayPosts = (d) => S.filter((x) => sameDay(pdate(x.scheduled_at), d));
  const maxDay = Math.max(1, ...week.map((d) => dayPosts(d).length));
  const v = pautaVerdict(c.freq);
  return `<div class="rs">
  <section class="rs-hero">
    <div class="rs-count"><span class="small">Elección</span><b>${dE === null ? '—' : dE > 0 ? dE : dE === 0 ? 'Hoy' : '✓'}</b><span>${dE === null ? 'cargá la fecha en Ajustes' : dE > 1 ? 'días' : dE === 1 ? 'día' : ''}${p.election_date ? ' · ' + fmtShort(p.election_date) : ''}</span></div>
    <div class="rs-count"><span class="small">Propaganda</span><b>${dP === null ? '—' : dP >= 0 ? dP + 1 : 0}</b><span>${dP !== null && dP >= 0 ? 'días para publicar y pautar' : 'terminó'}${p.propaganda_until ? ' · hasta ' + fmtShort(p.propaganda_until) : ''}</span></div>
    <div class="rs-next">${next ? `<span class="small">Próxima publicación</span>
      <div class="rs-next-row">${netBadge(next.network)}<div><b>${esc(next.reel_title)}</b><span>${esc(next.handle ? '@' + next.handle : NETS[next.network].name)} · ${fmtDay(next.scheduled_at)} ${fmtTime(next.scheduled_at)}</span></div></div>`
      : `<span class="small">Próxima publicación</span><p>Nada programado. Subí reels y repartilos.</p><a class="btn sm accent" href="#/p/${p.id}/reels">Ir a Reels</a>`}</div>
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
  </div>`;
}

function cuentasView() {
  const A = state.accounts;
  if (!A.length) return `<div class="card empty"><h2 class="h2">Sin cuentas todavía</h2><p>Agregá las cuentas que van a publicar los reels. Cada una se conecta con su red, como en Efaysto, y el nombre lo trae la conexión.</p><button class="btn primary" data-act="new-account">${icon('plus')} Agregar cuenta</button></div>`;
  const live = A.filter((a) => a.status === 'conectada').length;
  return `<section class="card"><div class="card-head"><div><h2 class="h2">Cuentas</h2><p class="small muted">${live} de ${A.length} conectadas</p></div><button class="btn primary" data-act="new-account">${icon('plus')} Agregar cuenta</button></div>
  <div class="table-wrap"><table class="list"><thead><tr><th>Cuenta</th><th class="r">Seguidores</th><th>Conexión</th><th></th></tr></thead><tbody>
  ${A.map((a) => `<tr data-id="${a.id}">
    <td><div class="handle">${netBadge(a.network)}<div class="${a.connected_as ? '' : 'muted'}">${esc(accName(a))}<small>${NETS[a.network].name}</small></div></div></td>
    <td class="r num">${a.connected_as ? fmt(a.followers) : '—'}</td>
    <td><span class="chip s-${a.status}" ${a.status === 'error' ? `title="${esc(a.last_error)}"` : ''}>${ACC_STATUS[a.status] || esc(a.status)}</span></td>
    <td class="r nowrap"><button class="btn sm ${a.status === 'conectada' ? '' : 'primary'}" data-act="connect-account">${a.status === 'conectada' ? 'Ver conexión' : 'Conectar'}</button>
      <button class="icon-btn" data-act="pause-account" title="${a.status === 'pausada' ? 'Reanudar' : 'Pausar'}">${icon(a.status === 'pausada' ? 'play' : 'pause', 16)}</button><button class="icon-btn danger" data-act="del-account" title="Borrar">${icon('trash', 16)}</button></td>
  </tr>`).join('')}
  </tbody></table></div>
  <p class="note" style="margin-top:16px"><b>Cómo se conecta:</b> cada cuenta entra por la vía oficial de su red, con el permiso de su dueño; ACM nunca guarda contraseñas. Los tokens quedan cifrados en el servidor y no se vuelven a mostrar.</p>
  </section>`;
}

function reelsView() {
  const R = state.reels;
  const up = state.uploads.length ? `<div class="card"><b>Subiendo ${state.uploads.length} ${state.uploads.length === 1 ? 'archivo' : 'archivos'}…</b><div class="progress"><i id="up-bar"></i></div></div>` : '';
  return `<div class="stack">
  <label class="drop" id="drop"><input type="file" id="reel-input" accept="video/*" multiple hidden>${icon('up', 28)}<p style="margin-top:8px"><b>Arrastrá los reels acá</b> o tocá para elegirlos</p><p class="small">MP4 o MOV ya editados, vertical 9:16. Podés subir varios juntos.</p></label>
  ${up}
  ${R.length ? `<div class="row"><h2 class="h2">${R.length} ${R.length === 1 ? 'reel' : 'reels'}</h2><span class="spacer"></span>${state.accounts.length ? '' : '<span class="small muted">Cargá cuentas para poder repartirlos</span>'}</div>
  <div class="reels">${R.map((r) => `<article class="reel" data-id="${r.id}">
    <video src="/media/${esc(r.file)}#t=0.5" preload="metadata" controls playsinline></video>
    <div class="body">
      <input class="title" value="${esc(r.title)}" data-act="reel-title" aria-label="Título">
      <div class="meta"><span class="chip s-${r.status}">${r.status === 'aprobado' ? 'Aprobado' : 'Borrador'}</span><span>${fmt(r.size / 1048576, 1)} MB · ${r.posts} ${r.posts === 1 ? 'publicación' : 'publicaciones'}</span></div>
      <div class="row" style="gap:6px">
        <button class="btn sm accent" data-act="distribute" ${state.accounts.length ? '' : 'disabled'}>Repartir</button>
        <button class="btn sm" data-act="reel-approve">${r.status === 'aprobado' ? 'A borrador' : 'Aprobar'}</button>
        <span class="spacer"></span><button class="icon-btn danger" data-act="del-reel" title="Borrar">${icon('trash', 16)}</button>
      </div>
    </div></article>`).join('')}</div>` : (state.uploads.length ? '' : `<p class="muted small" style="text-align:center">Todavía no hay reels en este proyecto.</p>`)}
  </div>`;
}

function calendarioView() {
  const p = state.project, S = state.posts;
  const m = state.calMonth || (state.calMonth = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })());
  const first = new Date(m); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // semana empieza el lunes
  const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
  const cells = Math.ceil(((first.getDay() + 6) % 7 + last.getDate()) / 7) * 7;
  const elec = p.election_date ? new Date(p.election_date + 'T00:00') : null;
  const lim = p.propaganda_until ? new Date(p.propaganda_until + 'T00:00') : null;
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const days = Array.from({ length: cells }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const inMonth = S.filter((x) => { const d = pdate(x.scheduled_at); return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear(); });
  return `<section class="card cal">
    <div class="cal-head">
      <h2 class="h2">${(() => { const t = m.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); })()}</h2>
      <span class="small muted">${inMonth.length} ${inMonth.length === 1 ? 'publicación' : 'publicaciones'} este mes</span>
      <span class="spacer"></span>
      <button class="btn sm" data-act="cal-today">Hoy</button>
      <button class="icon-btn" data-act="cal-prev" aria-label="Mes anterior">${icon('left')}</button>
      <button class="icon-btn" data-act="cal-next" aria-label="Mes siguiente">${icon('right')}</button>
    </div>
    <div class="cal-grid">
      ${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => `<div class="cal-wd">${d}</div>`).join('')}
      ${days.map((d) => {
        const L = S.filter((x) => sameDay(pdate(x.scheduled_at), d));
        const out = d.getMonth() !== m.getMonth();
        const isE = elec && sameDay(d, elec), isL = lim && sameDay(d, lim), after = lim && d > lim && !(elec && d >= elec);
        const cls = [out ? 'out' : '', sameDay(d, todayD) ? 'today' : '', isE ? 'elec' : '', after ? 'veda' : '', d < todayD ? 'past' : ''].join(' ');
        return `<div class="cal-day ${cls}">
          <div class="cal-dn"><span>${d.getDate()}</span>${isE ? '<em class="tag e">Elección</em>' : isL ? '<em class="tag l">Fin de propaganda</em>' : ''}</div>
          ${L.slice(0, 3).map((x) => `<button class="cal-ev s-${x.status}" data-act="open-post" data-pid="${x.id}" title="${esc(x.reel_title)} · ${esc(x.handle ? '@' + x.handle : NETS[x.network].name)}"><i class="nd ${x.network}"></i><span class="t">${fmtTime(x.scheduled_at)}</span><span class="r">${esc(x.reel_title)}</span></button>`).join('')}
          ${L.length > 3 ? `<button class="cal-more" data-act="open-day" data-day="${ymd(d)}">+${L.length - 3} más</button>` : ''}
        </div>`; }).join('')}
    </div>
    <div class="cal-legend small muted"><span><i class="lgd prog"></i>Programado</span><span><i class="lgd pub"></i>Publicado</span><span><i class="lgd fail"></i>Falló</span>${lim ? '<span><i class="lgd veda"></i>Sin propaganda</span>' : ''}</div>
  </section>`;
}
function postDialog(ids) {
  const L = ids.map((id) => state.posts.find((x) => x.id === id)).filter(Boolean);
  if (!L.length) return;
  const d = openDialog(L.length === 1 ? 'Publicación' : fmtDate(L[0].scheduled_at), L.map((x) => `
    <div class="pd" data-id="${x.id}">
      <video src="/media/${esc(x.reel_file)}#t=0.5" preload="metadata" controls playsinline></video>
      <div class="pd-info"><b>${esc(x.reel_title)}</b>
        <span class="row small">${netBadge(x.network)}${esc(x.handle ? '@' + x.handle : NETS[x.network].name + ' sin conectar')}</span>
        <span class="small muted">${fmtDate(x.scheduled_at)} · ${fmtTime(x.scheduled_at)}</span>
        <div class="row"><select class="select sm" data-act="post-status">${[['programado', 'Programado'], ['publicado', 'Publicado'], ['fallido', 'Falló']].map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm danger" data-act="del-post">Quitar</button></div>
      </div>
    </div>`).join(''));
  d.classList.add('wide');
  d.addEventListener('close', () => render());
}

function pautaView() {
  const p = state.project, pa = p.pauta || {};
  if (!p.padron) return `<div class="card empty"><h2 class="h2">Falta el padrón</h2><p>Subí el padrón en Ajustes para calcular a cuántos socios llega la pauta.</p><a class="btn primary" href="#/p/${p.id}/ajustes">Ir a Ajustes</a></div>`;
  const c = pautaCalc(p, pa);
  return `<div class="pz">
  <section class="pz-in" id="pauta-form">
    <p class="pz-sentence">Invierto
      <span class="pz-money">USD <input type="number" min="0" step="50" name="budget" value="${pa.budget || ''}" placeholder="3000" aria-label="Inversión en dólares"></span>
      desde <input class="pz-date" type="date" name="start_date" value="${esc(c.from)}" aria-label="Desde">
      hasta <input class="pz-date" type="date" name="end_date" value="${esc(c.to)}" ${c.limit ? `max="${esc(c.limit)}"` : ''} aria-label="Hasta">
    </p>
    <p class="pz-datos">CPM de Meta USD ${fmt(PAUTA_DATOS.cpm)} · Meta reconoce el ${PAUTA_DATOS.match_pct} % de los contactos · IVA ${PAUTA_DATOS.iva * 100} % incluido${c.limit ? ` · propaganda hasta el ${fmtShort(c.limit)}` : ''}</p>
  </section>
  <div id="pauta-out">${pautaOut(p, c)}</div>
  </div>`;
}
function pautaOut(p, c) {
  if (!c.budget) return `<section class="card empty"><h2 class="h2">¿Cuánto querés invertir?</h2><p>Poné el monto y las fechas arriba: ACM calcula a cuántos socios del padrón les llega y cuántas veces la ven.</p></section>`;
  const v = pautaVerdict(c.freq);
  // vistas acumuladas por persona, semana a semana (la inversión se reparte pareja en los días)
  const wk = Math.max(1, Math.ceil(c.days / 7));
  const weeks = Array.from({ length: wk }, (_, i) => { const d0 = new Date(c.from + 'T00:00'); d0.setDate(d0.getDate() + i * 7); const dd = Math.min(7, c.days - i * 7); return { d0, cum: c.freq * Math.min(c.days, (i * 7) + dd) / c.days }; });
  const max = Math.max(c.freq, 8) * 1.08;
  const W = 1100, H = 240, padL = 8, padB = 28, bw = (W - padL) / wk;
  const y = (val) => H - padB - (val / max) * (H - padB - 10);
  const bars = weeks.map((w, i) => `<g class="pz-bar"><rect x="${padL + i * bw + bw * 0.18}" y="${y(w.cum)}" width="${bw * 0.64}" height="${Math.max(2, H - padB - y(w.cum))}" rx="4"/><rect class="hit" x="${padL + i * bw}" y="0" width="${bw}" height="${H - padB}"><title>Semana del ${fmtShort(ymd(w.d0))}: ${fmt(w.cum, 1)} vistas por persona acumuladas</title></rect><text x="${padL + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${w.d0.getDate()}/${w.d0.getMonth() + 1}</text></g>`).join('');
  const refY = y(8);
  return `<div class="pz-out">
    <section class="pz-big">
      <div><span class="lbl">Socios alcanzados</span><b>${fmt(c.people)}</b><span class="sub">de ${fmt(p.padron)} en el padrón${c.real ? '' : ' (estimado: subí el padrón con teléfonos o mails)'}</span></div>
      <div><span class="lbl">Veces que la ve cada uno</span><b>${fmt(c.freq, c.freq < 10 ? 1 : 0)}</b><span class="sub">${fmt(c.perWeek, 1)} por semana <span class="chip v-${v[0]}">${v[1]}</span></span></div>
      <div><span class="lbl">Vistas en total</span><b>${fmtK(c.imps)}</b><span class="sub">en ${fmt(c.days)} días</span></div>
      <div><span class="lbl">Por día</span><b>${usd(c.perDay)}</b><span class="sub">${usd(c.net)} de pauta + ${usd(c.budget - c.net)} de IVA</span></div>
    </section>
    <section class="card">
      <div class="card-head"><h2 class="h2">Vistas por socio, acumuladas semana a semana</h2><span class="small muted">${v[2]}</span></div>
      <svg class="pz-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vistas por socio acumuladas por semana">
        <line class="axis" x1="${padL}" x2="${W}" y1="${H - padB}" y2="${H - padB}"/>
        <line class="ref" x1="${padL}" x2="${W}" y1="${refY}" y2="${refY}"/><text class="ref-t" x="${padL}" y="${refY - 6}">8 vistas: el mensaje se instala</text>
        ${bars}
      </svg>
    </section>
    <p class="small muted">Es solo la plata que cobra Meta por mostrar los videos; la plataforma va aparte. TikTok no acepta propaganda política paga. Meta exige verificar al anunciante y mostrar quién paga.</p>
  </div>`;
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
function confirmBox(title, text, okLabel = 'Borrar') {
  return new Promise((res) => {
    const d = openDialog(title, `<p class="muted">${text}</p>`, `<button class="btn" data-close>Cancelar</button><button class="btn danger" data-ok>${okLabel}</button>`);
    d.querySelector('[data-ok]').onclick = () => { res(true); d.close(); };
    d.addEventListener('close', () => res(false));
  });
}

function newProjectDialog() {
  const d = openDialog('Nuevo proyecto', projectForm());
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const p = await api('/api/projects', { method: 'POST', body: new FormData(e.target) }); d.close(); toast('Proyecto creado'); location.hash = `#/p/${p.id}/cuentas`; } catch (err) { fail(err); }
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
    { title: 'Creá la app en TikTok for Developers', body: ['Entrá a developers.tiktok.com, creá una app y agregale los productos Login Kit y Content Posting API.', 'Pedí los permisos que siguen. Hasta que TikTok apruebe la app, lo que se publica sale como privado.'], links: [{ label: 'Abrir TikTok for Developers', url: 'https://developers.tiktok.com/apps/' }], chips: ['user.info.basic', 'user.info.stats', 'video.publish', 'video.upload'] },
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

  const draw = () => {
    const s = steps[active];
    const banner = busy === 'probar' ? '' : a.status === 'conectada' ? `<p class="banner ok">Conectada como <b>${esc(a.connected_as)}</b>.</p>` : a.status === 'error' && a.last_error ? `<p class="banner err"><b>La última prueba falló.</b> ${esc(a.last_error)}</p>` : '';
    host.innerHTML = `<div class="cp-scrim" data-cp="close"></div>
    <aside class="cp" role="dialog" aria-modal="true" aria-label="Conectar ${esc(accName(a))}">
      <header class="cp-h">${netBadge(a.network)}<div class="t"><h2 class="h2">${a.connected_as ? esc(a.connected_as) : 'Conectar cuenta de ' + NETS[a.network].name}</h2><p class="small muted">${NETS[a.network].name}</p></div><button class="btn sm ghost" data-cp="close">Cerrar</button></header>
      <div class="cp-body">${banner}
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
  const start = new Date(); start.setDate(start.getDate() + (start.getHours() >= 18 ? 1 : 0)); start.setHours(19, 0, 0, 0);
  const d = openDialog('Repartir reel', `<form class="form" id="dist-form">
    <p class="muted small">«${esc(reel.title)}» sale en cada cuenta elegida, con horarios separados para que no publiquen lo mismo a la vez.</p>
    <div class="row"><b class="small">Cuentas</b><span class="spacer"></span><button type="button" class="btn sm ghost" data-all>Todas</button><button type="button" class="btn sm ghost" data-none>Ninguna</button></div>
    <div class="acc-pick">${A.map((a) => `<label><input type="checkbox" name="acc" value="${a.id}" checked>${netBadge(a.network)}${esc(accName(a))}<span class="spacer"></span><span class="small muted">${ACC_STATUS[a.status]}</span></label>`).join('') || '<p class="small muted">No hay cuentas activas.</p>'}</div>
    <div class="two"><label class="field">Primera publicación<input class="input" type="datetime-local" name="start" value="${localInput(start)}" ${state.project.propaganda_until ? `max="${state.project.propaganda_until}T23:59"` : ''} required></label>
    <label class="field">Separación entre cuentas<select class="select" name="gap"><option value="20">20 minutos</option><option value="45" selected>45 minutos</option><option value="90">1 h 30</option><option value="180">3 horas</option><option value="1440">1 día</option></select></label></div>
    <div class="row"><span class="spacer"></span><button class="btn" type="button" data-close>Cancelar</button><button class="btn accent" type="submit">Programar</button></div>
  </form>`);
  const f = d.querySelector('form');
  d.querySelector('[data-all]').onclick = () => $$('[name=acc]', f).forEach((c) => (c.checked = true));
  d.querySelector('[data-none]').onclick = () => $$('[name=acc]', f).forEach((c) => (c.checked = false));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = $$('[name=acc]:checked', f).map((c) => Number(c.value));
    if (!ids.length) return toast('Elegí al menos una cuenta', true);
    // mezcla el orden para que las cuentas no salgan siempre en la misma secuencia
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const t0 = new Date(f.start.value), gap = Number(f.gap.value);
    const lim = state.project.propaganda_until;
    const items = ids.map((id, i) => { const t = new Date(t0.getTime() + i * gap * 6e4); return { reel_id: reel.id, account_id: id, scheduled_at: localInput(t).replace('T', ' ') }; });
    if (lim && items.some((x) => x.scheduled_at.slice(0, 10) > lim)) return toast(`Algunas publicaciones caen después del ${fmtShort(lim)}, la fecha máxima de propaganda. Empezá antes o separalas menos.`, true);
    try { await api(`/api/projects/${state.project.id}/posts`, { method: 'POST', body: items }); d.close(); toast(`Programado en ${items.length} ${items.length === 1 ? 'cuenta' : 'cuentas'}`); render(); } catch (err) { fail(err); }
  });
}

// ---------- subida de reels ----------
function uploadReels(files) {
  files = [...files].filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
  if (!files.length) return toast('Elegí archivos de video', true);
  const fd = new FormData(); files.forEach((f) => fd.append('files', f));
  state.uploads = files; render();
  const x = new XMLHttpRequest();
  x.open('POST', `/api/projects/${state.project.id}/reels`);
  x.upload.onprogress = (e) => { const b = $('#up-bar'); if (b && e.lengthComputable) b.style.width = (e.loaded / e.total * 100) + '%'; };
  x.onload = () => { state.uploads = []; if (x.status < 300) toast(`${files.length} ${files.length === 1 ? 'reel subido' : 'reels subidos'}`); else { try { fail(new Error(JSON.parse(x.responseText).error)); } catch { fail(new Error('No se pudo subir')); } } render(); };
  x.onerror = () => { state.uploads = []; fail(new Error('Se cortó la subida')); render(); };
  x.send(fd);
}

// ---------- eventos ----------
function afterRender(r) {
  const drop = $('#drop');
  if (drop) {
    $('#reel-input').addEventListener('change', (e) => uploadReels(e.target.files));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => uploadReels(e.dataTransfer.files));
  }
  const pf = $('#project-form');
  if (pf && r.view === 'project') pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(pf); if (!fd.get('photo')?.size) fd.delete('photo');
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
      $('#pauta-out').innerHTML = pautaOut(state.project, pautaCalc(state.project, pa));
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
      case 'cal-prev': case 'cal-next': case 'cal-today': {
        const m = state.calMonth || new Date();
        state.calMonth = act === 'cal-today' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date(m.getFullYear(), m.getMonth() + (act === 'cal-next' ? 1 : -1), 1);
        render(); break; }
      case 'open-post': postDialog([Number(el.dataset.pid)]); break;
      case 'open-day': postDialog(state.posts.filter((x) => ymd(pdate(x.scheduled_at)) === el.dataset.day).map((x) => x.id)); break;
      case 'del-padron': if (await confirmBox('Quitar padrón', 'Se borran las huellas de teléfonos y mails. El número de socios queda.', 'Quitar')) { await api(`/api/projects/${state.project.id}/padron`, { method: 'DELETE' }); toast('Padrón quitado'); render(); } break;
      case 'connect-account': connectPanel(state.accounts.find((a) => a.id === id)); break;
      case 'pause-account': { const a = state.accounts.find((x) => x.id === id); await api(`/api/accounts/${id}`, { method: 'PUT', body: { status: a.status === 'pausada' ? 'activa' : 'pausada' } }); toast(a.status === 'pausada' ? 'Cuenta reanudada' : 'Cuenta pausada: no recibe publicaciones nuevas'); render(); break; }
      case 'del-account': if (await confirmBox('Borrar cuenta', 'Se quitan también sus publicaciones programadas.')) { await api(`/api/accounts/${id}`, { method: 'DELETE' }); render(); } break;
      case 'del-reel': if (await confirmBox('Borrar reel', 'Se borra el video y sus publicaciones programadas.')) { await api(`/api/reels/${id}`, { method: 'DELETE' }); render(); } break;
      case 'reel-approve': { const r = state.reels.find((x) => x.id === id); await api(`/api/reels/${id}`, { method: 'PUT', body: { status: r.status === 'aprobado' ? 'borrador' : 'aprobado' } }); render(); break; }
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

window.addEventListener('hashchange', () => { $('.side')?.classList.remove('open'); render(); window.scrollTo(0, 0); });
api('/api/session').then((s) => { state.authed = s.ok; render(); }).catch(() => render());
