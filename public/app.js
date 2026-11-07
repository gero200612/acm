// ACM — panel. Sin framework: rutas por hash, render con plantillas y delegación de eventos.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d });
const usd = (n) => 'USD ' + fmt(Math.round(n));

const NETS = {
  instagram: { name: 'Instagram', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>' },
  facebook: { name: 'Facebook', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8a0 0 0 0 1 0 0Z"/></svg>' },
  tiktok: { name: 'TikTok', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.4 2.4 1.9 3.9 4.3 4.1v3.3c-1.6 0-3-.5-4.3-1.3V15a6 6 0 1 1-6-6h.4v3.4a2.7 2.7 0 1 0 2.3 2.6V3H16Z"/></svg>' },
  youtube: { name: 'YouTube', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 15.5v-7l6 3.5-6 3.5Z"/></svg>' },
};
const KINDS = { principal: 'Principal', apoyo: 'Apoyo', tematica: 'Temática', fan: 'Fan / hinchas', medio: 'Medio / noticias' };
const ACC_STATUS = { pendiente: 'Sin conectar', conectada: 'Conectada', pausada: 'Pausada' };
const ICON = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5 9-10',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  up: 'M12 16V4m0 0-5 5m5-5 5 5M4 20h16',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
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
const fmtDate = (s) => new Date(s.replace(' ', 'T')).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (s) => new Date(s.replace(' ', 'T')).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
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
  <a class="brand" href="#"><span class="mark">ACM <i></i></span><span class="sub">Agentic Campaign Manager</span></a>
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
    <div><div class="mark">ACM <i></i></div><p class="muted small">Agentic Campaign Manager</p></div>
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

function pautaCalc(p, pa) {
  pa = pa || { match_pct: 60, frequency: 10, cpm: 6, iva: 1 };
  const people = Math.round((p.padron || 0) * pa.match_pct / 100);
  const imps = people * pa.frequency;
  const spend = imps / 1000 * pa.cpm;
  const total = spend * (pa.iva ? 1.21 : 1);
  const days = Math.max(1, daysTo(p.election_date) ?? 35);
  return { people, imps, spend, total, days, weeks: days / 7, perWeek: pa.frequency / Math.max(1, days / 7), perPerson: people ? total / people : 0 };
}

function resumenView() {
  const p = state.project, A = state.accounts;
  const c = pautaCalc(p, p.pauta);
  const next = state.posts.filter((x) => x.status === 'programado' && new Date(x.scheduled_at.replace(' ', 'T')) >= new Date(Date.now() - 36e5)).slice(0, 6);
  const byNet = Object.keys(NETS).map((n) => [n, A.filter((a) => a.network === n)]).filter(([, l]) => l.length);
  const steps = [
    [A.length > 0, 'Cargar las cuentas', 'cuentas'],
    [state.reels.length > 0, 'Subir los reels', 'reels'],
    [state.posts.length > 0, 'Repartir los reels en el calendario', 'calendario'],
    [!!p.padron, 'Cargar el padrón y calcular la pauta', p.padron ? 'pauta' : 'ajustes'],
  ];
  return `<div class="stack">
  <div class="grid g4">
    <div class="kpi dark"><div class="label">Personas a alcanzar</div><div class="value"><em>${fmt(c.people)}</em></div><div class="hint">${p.padron ? `de ${fmt(p.padron)} en el padrón` : 'cargá el padrón en Ajustes'}</div></div>
    <div class="kpi"><div class="label">Cuentas</div><div class="value">${A.length}</div><div class="hint">${A.filter((a) => a.status === 'conectada').length} conectadas · ${new Set(A.map((a) => a.network)).size} redes</div></div>
    <div class="kpi"><div class="label">Reels</div><div class="value">${state.reels.length}</div><div class="hint">${state.reels.filter((r) => r.status === 'aprobado').length} aprobados</div></div>
    <div class="kpi"><div class="label">Programadas</div><div class="value">${p.scheduled}</div><div class="hint">${p.published} ya publicadas</div></div>
  </div>
  <div class="grid g2">
    <section class="card"><div class="card-head"><h2 class="h2">Próximas publicaciones</h2><a class="btn sm" href="#/p/${p.id}/calendario">Ver calendario</a></div>
      ${next.length ? next.map(slotRow).join('') : `<p class="muted small">Todavía no hay nada programado. Subí reels y usá <b>Repartir</b> para mandarlos a las cuentas.</p>`}
    </section>
    <section class="card"><div class="card-head"><h2 class="h2">Puesta en marcha</h2></div>
      <div class="stack" style="gap:8px">${steps.map(([ok, t, tab]) => `<a href="#/p/${p.id}/${tab}" class="slot" style="text-decoration:none;color:inherit"><span class="net" style="background:${ok ? 'var(--green)' : 'var(--line-2)'};color:${ok ? 'var(--navy)' : 'var(--muted)'}">${ok ? icon('check', 16) : ''}</span><span class="what"><b style="${ok ? 'color:var(--muted);text-decoration:line-through' : ''}">${t}</b></span></a>`).join('')}</div>
      ${byNet.length ? `<div class="row" style="margin-top:18px">${byNet.map(([n, l]) => `<span class="chip nodot" style="gap:8px;height:32px;padding:0 12px 0 4px;background:var(--bg)">${netBadge(n)}${l.length} ${l.length === 1 ? 'cuenta' : 'cuentas'}</span>`).join('')}</div>` : ''}
    </section>
  </div></div>`;
}

function cuentasView() {
  const A = state.accounts;
  if (!A.length) return `<div class="card empty"><h2 class="h2">Sin cuentas todavía</h2><p>Cargá la cuenta principal del dirigente y las de apoyo, fans y temáticas que van a publicar los reels.</p><button class="btn primary" data-act="new-account">${icon('plus')} Agregar cuenta</button></div>`;
  return `<section class="card"><div class="card-head"><h2 class="h2">Ecosistema de cuentas</h2><button class="btn primary" data-act="new-account">${icon('plus')} Agregar cuenta</button></div>
  <div class="table-wrap"><table class="list"><thead><tr><th>Cuenta</th><th>Tipo</th><th class="r">Seguidores</th><th class="r">Por día</th><th>Estado</th><th></th></tr></thead><tbody>
  ${A.map((a) => `<tr data-id="${a.id}">
    <td><div class="handle">${netBadge(a.network)}<div>@${esc(a.handle)}<small>${NETS[a.network].name}${a.notes ? ' · ' + esc(a.notes) : ''}</small></div></div></td>
    <td><span class="chip nodot ${a.kind === 'principal' ? 'k-principal' : ''}">${KINDS[a.kind] || esc(a.kind)}</span></td>
    <td class="r num">${fmt(a.followers)}</td>
    <td class="r num">${a.posts_per_day}</td>
    <td><select class="select sm" data-act="acc-status">${Object.entries(ACC_STATUS).map(([k, l]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    <td class="r"><button class="icon-btn" data-act="edit-account" title="Editar">${icon('edit', 16)}</button><button class="icon-btn danger" data-act="del-account" title="Borrar">${icon('trash', 16)}</button></td>
  </tr>`).join('')}
  </tbody></table></div>
  <p class="note" style="margin-top:16px"><b>Conexión con las redes:</b> cada cuenta se conecta con el permiso de su dueño por la vía oficial de cada red (sin guardar contraseñas). Mientras tanto, el estado se marca a mano.</p>
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

function slotRow(x) {
  return `<div class="slot" data-id="${x.id}"><span class="time">${fmtTime(x.scheduled_at)}</span><video src="/media/${esc(x.reel_file)}#t=0.5" preload="metadata" muted></video>${netBadge(x.network)}
    <span class="what"><b>${esc(x.reel_title)}</b><span>@${esc(x.handle)}</span></span><span class="chip s-${x.status}">${x.status === 'publicado' ? 'Publicado' : x.status === 'fallido' ? 'Falló' : 'Programado'}</span></div>`;
}
function calendarioView() {
  const S = state.posts;
  if (!S.length) return `<div class="card empty"><h2 class="h2">El calendario está vacío</h2><p>En <b>Reels</b>, tocá <b>Repartir</b> en un video para programarlo en varias cuentas, con horarios separados entre sí.</p><a class="btn primary" href="#/p/${state.project.id}/reels">Ir a Reels</a></div>`;
  const days = {};
  for (const x of S) (days[x.scheduled_at.slice(0, 10)] ||= []).push(x);
  return `<section class="card"><div class="card-head"><h2 class="h2">Calendario de publicaciones</h2><span class="small muted">${S.length} en total · ${S.filter((x) => x.status === 'publicado').length} publicadas</span></div>
  ${Object.entries(days).map(([d, list]) => `<div class="day"><div class="date"><b>${fmtDate(d + 'T12:00')}</b><span>${list.length} ${list.length === 1 ? 'publicación' : 'publicaciones'}</span></div><div>${list.map((x) => `
    <div class="slot" data-id="${x.id}"><span class="time">${fmtTime(x.scheduled_at)}</span><video src="/media/${esc(x.reel_file)}#t=0.5" preload="metadata" muted></video>${netBadge(x.network)}
      <span class="what"><b>${esc(x.reel_title)}</b><span>@${esc(x.handle)}</span></span>
      <select class="select sm" data-act="post-status">${[['programado', 'Programado'], ['publicado', 'Publicado'], ['fallido', 'Falló']].map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn danger" data-act="del-post" title="Quitar">${icon('x', 16)}</button></div>`).join('')}</div></div>`).join('')}
  </section>`;
}

function pautaView() {
  const p = state.project, pa = p.pauta || { match_pct: 60, frequency: 10, cpm: 6, iva: 1 };
  if (!p.padron) return `<div class="card empty"><h2 class="h2">Falta el padrón</h2><p>Cargá cuántas personas hay en el padrón para calcular cuánta pauta hace falta.</p><a class="btn primary" href="#/p/${p.id}/ajustes">Cargar padrón</a></div>`;
  const presets = [[5, 'Baja', 'una vez por semana'], [10, 'Media', 'dos por semana'], [20, 'Alta', 'cuatro por semana']];
  return `<div class="grid g2" style="align-items:start">
  <section class="card stack" id="pauta-form">
    <div class="card-head" style="margin:0"><h2 class="h2">¿Cuántas veces la ve cada uno?</h2></div>
    <div class="presets">${presets.map(([f, l, d]) => `<button data-act="preset" data-f="${f}" aria-pressed="${Number(pa.frequency) === f}"><b>${l} · ${f} veces</b><span>${d}</span></button>`).join('')}</div>
    <div class="slider"><div class="lbl">Veces que ve la propaganda cada persona<span id="v-frequency">${pa.frequency}</span></div><input type="range" min="1" max="40" step="1" name="frequency" value="${pa.frequency}"></div>
    <div class="slider"><div class="lbl">Parte del padrón que Meta reconoce<span id="v-match_pct">${pa.match_pct} %</span></div><input type="range" min="20" max="90" step="5" name="match_pct" value="${pa.match_pct}"><p>Con teléfono o mail de cada socio suele estar entre 50 y 70 %.</p></div>
    <div class="slider"><div class="lbl">Costo cada mil vistas (CPM)<span id="v-cpm">USD ${pa.cpm}</span></div><input type="range" min="2" max="17" step="0.5" name="cpm" value="${pa.cpm}"><p>Argentina: USD 3 a 4,8 en promedio; en campaña y con públicos chicos sube, con picos de 16.</p></div>
    <label class="check"><input type="checkbox" name="iva" ${pa.iva ? 'checked' : ''}> Sumar IVA (21 %)</label>
  </section>
  <section class="stack" id="pauta-out">${pautaOut(p, pa)}</section>
  </div>`;
}
function pautaOut(p, pa) {
  const c = pautaCalc(p, pa);
  const max = p.padron;
  return `<div class="kpi dark"><div class="label">Inversión en pauta hasta la elección</div><div class="value" style="font-size:40px"><em>${usd(c.total)}</em></div><div class="hint">${usd(c.total / Math.max(1, c.weeks))} por semana · ${pa.iva ? 'con IVA' : 'sin IVA'} · ${fmt(c.days)} días</div></div>
  <div class="card"><div class="card-head"><h2 class="h2">Cómo se llega</h2></div><div class="funnel">
    <div class="bar"><span>Padrón</span><span class="track"><i style="width:100%"></i></span><b>${fmt(p.padron)}</b></div>
    <div class="bar"><span>Alcanzables en Meta</span><span class="track"><i class="g" style="width:${(c.people / max) * 100}%"></i></span><b>${fmt(c.people)}</b></div>
    <div class="bar"><span>Vistas en total</span><span class="track"><i style="width:100%;opacity:.35"></i></span><b>${fmt(c.imps)}</b></div>
  </div>
  <div class="grid g2" style="margin-top:18px">
    <div class="note"><b>${fmt(c.perWeek, 1)} veces por semana</b><br>cada persona alcanzada, hasta la elección</div>
    <div class="note"><b>USD ${fmt(c.perPerson, 2)} por persona</b><br>${fmt(pa.frequency)} vistas a USD ${pa.cpm} cada mil</div>
  </div></div>
  <p class="note">Es solo la plata que cobra la red por mostrar los videos; la plataforma va aparte. TikTok no acepta propaganda política paga. Meta exige verificar al anunciante y mostrar quién paga: conviene arrancar ese trámite cuanto antes.</p>`;
}

function ajustesView() {
  const p = state.project;
  return `<div class="grid g2" style="align-items:start"><section class="card"><div class="card-head"><h2 class="h2">Datos del proyecto</h2></div>${projectForm(p)}</section>
  <section class="card"><div class="card-head"><h2 class="h2">Borrar proyecto</h2></div><p class="muted small">Se borran sus cuentas, reels y publicaciones. No se puede deshacer.</p><button class="btn danger" style="margin-top:14px" data-act="del-project">${icon('trash')} Borrar ${esc(p.name)}</button></section></div>`;
}
function projectForm(p = {}) {
  return `<form class="form" id="project-form">
    <label class="field">Nombre del dirigente o candidato<input class="input" name="name" required value="${esc(p.name)}" placeholder="Nombre y apellido"></label>
    <div class="two"><label class="field">Cargo o lista<input class="input" name="role" value="${esc(p.role)}" placeholder="Presidente · Lista 1"></label>
    <label class="field">Institución<input class="input" name="org" value="${esc(p.org)}" placeholder="Club Atlético Independiente"></label></div>
    <div class="two"><label class="field">Fecha de la elección<input class="input" type="date" name="election_date" value="${esc(p.election_date)}"></label>
    <label class="field">Personas en el padrón<input class="input" type="number" min="0" name="padron" value="${p.padron || ''}" placeholder="65000"></label></div>
    <div class="two"><label class="field">Color<input class="input" type="color" name="color" value="${esc(p.color || '#3842f3')}" style="padding:4px"></label>
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
function accountDialog(a) {
  const d = openDialog(a ? 'Editar cuenta' : 'Agregar cuenta', `<form class="form" id="acc-form">
    <div class="two"><label class="field">Red<select class="select" name="network">${Object.entries(NETS).map(([k, n]) => `<option value="${k}" ${a?.network === k ? 'selected' : ''}>${n.name}</option>`).join('')}</select></label>
    <label class="field">Usuario<input class="input" name="handle" required placeholder="@usuario" value="${esc(a?.handle ? '@' + a.handle : '')}"></label></div>
    <div class="two"><label class="field">Tipo de cuenta<select class="select" name="kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${(a?.kind || 'apoyo') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field">Estado<select class="select" name="status">${Object.entries(ACC_STATUS).map(([k, l]) => `<option value="${k}" ${(a?.status || 'pendiente') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="two"><label class="field">Seguidores<input class="input" type="number" min="0" name="followers" value="${a?.followers || ''}"></label>
    <label class="field">Publicaciones por día<input class="input" type="number" min="1" max="20" name="posts_per_day" value="${a?.posts_per_day || 3}"></label></div>
    <label class="field">Nota<input class="input" name="notes" value="${esc(a?.notes)}" placeholder="Quién la maneja, a qué público apunta…"></label>
    <div class="row"><span class="spacer"></span>${a ? '' : '<button class="btn" type="submit" data-more>Guardar y agregar otra</button>'}<button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const more = e.submitter?.hasAttribute('data-more');
    const body = Object.fromEntries(new FormData(e.target));
    try {
      if (a) await api(`/api/accounts/${a.id}`, { method: 'PUT', body });
      else await api(`/api/projects/${state.project.id}/accounts`, { method: 'POST', body });
      toast(a ? 'Cuenta guardada' : 'Cuenta agregada');
      if (more) { e.target.handle.value = ''; e.target.followers.value = ''; e.target.notes.value = ''; e.target.handle.focus(); await render(); }
      else { d.close(); render(); }
    } catch (err) { fail(err); }
  });
}
function distributeDialog(reel) {
  const A = state.accounts.filter((a) => a.status !== 'pausada');
  const start = new Date(); start.setDate(start.getDate() + (start.getHours() >= 18 ? 1 : 0)); start.setHours(19, 0, 0, 0);
  const d = openDialog('Repartir reel', `<form class="form" id="dist-form">
    <p class="muted small">«${esc(reel.title)}» sale en cada cuenta elegida, con horarios separados para que no publiquen lo mismo a la vez.</p>
    <div class="row"><b class="small">Cuentas</b><span class="spacer"></span><button type="button" class="btn sm ghost" data-all>Todas</button><button type="button" class="btn sm ghost" data-none>Ninguna</button></div>
    <div class="acc-pick">${A.map((a) => `<label><input type="checkbox" name="acc" value="${a.id}" checked>${netBadge(a.network)}@${esc(a.handle)}<span class="spacer"></span><span class="small muted">${KINDS[a.kind] || ''}</span></label>`).join('') || '<p class="small muted">No hay cuentas activas.</p>'}</div>
    <div class="two"><label class="field">Primera publicación<input class="input" type="datetime-local" name="start" value="${localInput(start)}" required></label>
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
    const items = ids.map((id, i) => { const t = new Date(t0.getTime() + i * gap * 6e4); return { reel_id: reel.id, account_id: id, scheduled_at: localInput(t).replace('T', ' ') }; });
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
  const pform = $('#pauta-form');
  if (pform) {
    let timer;
    const read = () => ({ frequency: Number(pform.querySelector('[name=frequency]').value), match_pct: Number(pform.querySelector('[name=match_pct]').value), cpm: Number(pform.querySelector('[name=cpm]').value), iva: pform.querySelector('[name=iva]').checked ? 1 : 0 });
    const update = () => {
      const pa = read();
      $('#v-frequency').textContent = pa.frequency; $('#v-match_pct').textContent = pa.match_pct + ' %'; $('#v-cpm').textContent = 'USD ' + pa.cpm;
      $$('[data-act=preset]', pform).forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.f) === pa.frequency));
      $('#pauta-out').innerHTML = pautaOut(state.project, pa);
      clearTimeout(timer); timer = setTimeout(() => api(`/api/projects/${state.project.id}/pauta`, { method: 'PUT', body: pa }).then((x) => (state.project.pauta = x)).catch(fail), 400);
    };
    pform.addEventListener('input', update);
    pform.addEventListener('click', (e) => { const b = e.target.closest('[data-act=preset]'); if (b) { pform.querySelector('[name=frequency]').value = b.dataset.f; update(); } });
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
      case 'new-account': accountDialog(); break;
      case 'edit-account': accountDialog(state.accounts.find((a) => a.id === id)); break;
      case 'del-account': if (await confirmBox('Borrar cuenta', 'Se quitan también sus publicaciones programadas.')) { await api(`/api/accounts/${id}`, { method: 'DELETE' }); render(); } break;
      case 'del-reel': if (await confirmBox('Borrar reel', 'Se borra el video y sus publicaciones programadas.')) { await api(`/api/reels/${id}`, { method: 'DELETE' }); render(); } break;
      case 'reel-approve': { const r = state.reels.find((x) => x.id === id); await api(`/api/reels/${id}`, { method: 'PUT', body: { status: r.status === 'aprobado' ? 'borrador' : 'aprobado' } }); render(); break; }
      case 'distribute': distributeDialog(state.reels.find((x) => x.id === id)); break;
      case 'del-post': await api(`/api/posts/${id}`, { method: 'DELETE' }); render(); break;
      case 'del-project': if (await confirmBox('Borrar proyecto', `Se borra «${esc(state.project.name)}» con todas sus cuentas, reels y publicaciones.`)) { await api(`/api/projects/${state.project.id}`, { method: 'DELETE' }); location.hash = ''; toast('Proyecto borrado'); } break;
    }
  } catch (err) { fail(err); }
});

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = Number(el.closest('[data-id]')?.dataset.id);
  try {
    if (el.dataset.act === 'acc-status') { await api(`/api/accounts/${id}`, { method: 'PUT', body: { status: el.value } }); toast('Estado actualizado'); }
    if (el.dataset.act === 'post-status') { await api(`/api/posts/${id}`, { method: 'PUT', body: { status: el.value } }); toast('Publicación actualizada'); render(); }
    if (el.dataset.act === 'reel-title' && el.value.trim()) { await api(`/api/reels/${id}`, { method: 'PUT', body: { title: el.value.trim() } }); toast('Título guardado'); }
  } catch (err) { fail(err); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-act=reel-title]')) e.target.blur(); });

window.addEventListener('hashchange', () => { $('.side')?.classList.remove('open'); render(); window.scrollTo(0, 0); });
api('/api/session').then((s) => { state.authed = s.ok; render(); }).catch(() => render());
