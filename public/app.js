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
  flask: 'M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9',
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
    if (r.view === 'project') await loadProject(r.id);
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
const RUN_KIND = { publicacion: 'Publicación', conexion: 'Prueba de conexión', meta_ads: 'Meta Ads', banco: 'Banco de pruebas' };
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
        <div class="bk-txt"><p>Corre los casos contra un <b>simulador de Meta, TikTok y Google</b> que vive dentro de ACM: conectar y publicar en las cuatro redes, que los errores no muestren tokens, el padrón, la pauta, Meta Ads y las reglas del programador. No toca ninguna cuenta real.</p>
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
      <div class="ac-add">${Object.entries(NETS).map(([k, n]) => `<button data-act="add-net" data-net="${k}">${netBadge(k)}<span>${n.name}</span>${icon('plus', 16)}</button>`).join('')}</div>
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
  const R = state.reels;
  const up = state.uploads.length ? `<div class="up-box"><b>Subiendo ${state.uploads.length} ${state.uploads.length === 1 ? 'archivo' : 'archivos'}…</b><div class="progress"><i id="up-bar"></i></div></div>` : '';
  const sinRepartir = R.filter((r) => !r.posts).length;
  const side = `<aside class="rl-side">
    <label class="drop" id="drop"><input type="file" id="reel-input" accept="video/*" multiple hidden>${icon('up', 28)}<p style="margin-top:8px"><b>Arrastrá los reels acá</b></p><p class="small">o tocá para elegirlos · MP4 o MOV, vertical 9:16, varios juntos</p></label>
    ${up}
    <div class="rl-stats">
      <div><b>${R.length}</b><span>reels</span></div>
      <div><b>${R.filter((r) => r.status === 'aprobado').length}</b><span>aprobados</span></div>
      <div><b>${sinRepartir}</b><span>sin repartir</span></div>
      <div><b>${R.reduce((a, r) => a + r.posts, 0)}</b><span>publicaciones</span></div>
    </div>
    <p class="note">${state.accounts.length ? `Con <b>Repartir</b> cada reel sale en las cuentas que elijas, con horarios separados para que no publiquen lo mismo a la vez.` : 'Cargá cuentas para poder repartir los reels.'}</p>
  </aside>`;
  const grid = R.length ? `<div class="reels">${R.map((r) => `<article class="reel" data-id="${r.id}">
    <video src="/media/${esc(r.file)}#t=0.5" preload="metadata" controls playsinline></video>
    <div class="body">
      <input class="title" value="${esc(r.title)}" data-act="reel-title" aria-label="Título">
      <div class="meta"><span class="chip s-${r.status}">${r.status === 'aprobado' ? 'Aprobado' : 'Borrador'}</span><span>${fmt(r.size / 1048576, 1)} MB · ${r.posts} ${r.posts === 1 ? 'publicación' : 'publicaciones'}</span></div>
      <div class="row" style="gap:6px">
        <button class="btn sm accent" data-act="distribute" ${state.accounts.length ? '' : 'disabled'}>Repartir</button>
        <button class="btn sm" data-act="reel-approve">${r.status === 'aprobado' ? 'A borrador' : 'Aprobar'}</button>
        <span class="spacer"></span><button class="icon-btn danger" data-act="del-reel" title="Borrar">${icon('trash', 16)}</button>
      </div>
    </div></article>`).join('')}</div>`
    : `<div class="card empty rl-empty"><h2 class="h2">Todavía no hay reels</h2><p>Arrastrá los videos ya editados a la izquierda.</p></div>`;
  return `<div class="rl">${side}<div class="rl-main">${grid}</div></div>`;
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
    <div class="cal-legend small muted"><span><i class="lgd prog"></i>Programado</span><span><i class="lgd pub"></i>Publicado</span><span><i class="lgd fail"></i>Falló</span><span><i class="lgd publ"></i>Publicándose</span>${lim ? '<span><i class="lgd veda"></i>Sin propaganda</span>' : ''}</div>
  </section>`;
}
const POST_ST = { programado: 'Programado', publicando: 'Publicando…', publicado: 'Publicado', fallido: 'Falló' };
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
        <div class="row">
          ${x.status === 'programado' ? `<button class="btn sm accent" data-act="post-now">Publicar ahora</button>` : ''}
          ${x.status === 'fallido' ? `<button class="btn sm accent" data-act="post-now">Reintentar</button>` : ''}
          ${x.status !== 'publicando' && x.status !== 'publicado' ? `<button class="btn sm danger" data-act="del-post">Quitar</button>` : ''}
        </div>
      </div>
    </div>`).join(''));
  d.classList.add('wide');
  d.addEventListener('close', () => render());
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
  ${adsCard(p)}`;
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
    <div><dt>CPM de Meta</dt><dd>USD ${fmt(PAUTA_DATOS.cpm)}</dd></div>
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
    <div class="acc-pick">${A.map((a) => `<label><input type="checkbox" name="acc" value="${a.id}" ${a.status === 'conectada' ? 'checked' : ''}>${netBadge(a.network)}${esc(accName(a))}<span class="spacer"></span><span class="small muted">${ACC_STATUS[a.status]}</span></label>`).join('') || '<p class="small muted">No hay cuentas activas.</p>'}</div>
    ${A.some((a) => a.status !== 'conectada') ? '<p class="hint" style="margin-top:-6px">Las cuentas sin conectar no vienen tildadas: si las elegís, conectalas antes de la hora o esa publicación falla.</p>' : ''}
    <label class="field">Texto de la publicación<textarea class="textarea" name="caption" rows="3" placeholder="El texto que acompaña al reel, con sus #hashtags">${esc(reel.caption || '')}</textarea><span class="hint">Se guarda en el reel y sale igual en todas las cuentas</span></label>
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
    try { if (f.caption.value !== (reel.caption || '')) await api(`/api/reels/${reel.id}`, { method: 'PUT', body: { caption: f.caption.value } });
      await api(`/api/projects/${state.project.id}/posts`, { method: 'POST', body: items }); d.close(); toast(`Programado en ${items.length} ${items.length === 1 ? 'cuenta' : 'cuentas'}`); render(); } catch (err) { fail(err); }
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
        const m = state.calMonth || new Date();
        state.calMonth = act === 'cal-today' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date(m.getFullYear(), m.getMonth() + (act === 'cal-next' ? 1 : -1), 1);
        render(); break; }
      case 'open-post': postDialog([Number(el.dataset.pid)]); break;
      case 'ads-save': {
        const box = $('#ads-card'), body = {};
        $$('[data-ads]', box).forEach((i) => { const k = i.dataset.ads; if (i.type === 'checkbox') body[k] = i.checked; else if (i.value || k !== 'accessToken') body[k] = i.value; });
        el.disabled = true; el.textContent = 'Probando…';
        await api(`/api/projects/${state.project.id}/ads`, { method: 'PUT', body });
        try { await api(`/api/projects/${state.project.id}/ads/test`, { method: 'POST' }); toast('Cuenta publicitaria conectada'); } catch (err) { fail(err); }
        render(); break; }
      case 'ads-audience': el.disabled = true; el.textContent = 'Subiendo…'; try { await api(`/api/projects/${state.project.id}/ads/audience`, { method: 'POST' }); toast('Padrón subido a Meta'); } catch (err) { fail(err); } render(); break;
      case 'ads-campaign': el.disabled = true; el.textContent = 'Creando…'; try { await api(`/api/projects/${state.project.id}/ads/campaign`, { method: 'POST' }); toast('Campaña creada en pausa'); } catch (err) { fail(err); } render(); break;
      case 'lab-kind': state.lab.kind = el.dataset.k; state.lab.sel = null; render(); break;
      case 'lab-open': state.lab.sel = Number(el.dataset.rid); render(); break;
      case 'lab-banco-sel': state.lab.bancoSel = Number(el.dataset.rid); render(); break;
      case 'lab-banco': { state.lab.running = true; render(); try { const r = await api('/api/lab/banco', { method: 'POST' }); state.lab.bancoSel = r.run?.id; toast(r.ok === r.total ? `Pasaron los ${r.total} casos` : `Pasaron ${r.ok} de ${r.total}`, r.ok !== r.total); } catch (err) { fail(err); } state.lab.running = false; render(); break; }
      case 'post-now': { el.disabled = true; el.textContent = 'Publicando…'; await api(`/api/posts/${id}/now`, { method: 'POST' }); toast('Se está publicando: en un rato cambia el estado'); el.closest('dialog')?.close(); break; }
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

setInterval(() => { if (state.authed && !document.querySelector('dialog, .cp-host') && state.posts.some((x) => x.status === 'publicando' || (x.status === 'programado' && pdate(x.scheduled_at) <= new Date()))) render(); }, 15000);
window.addEventListener('hashchange', () => { $('.side')?.classList.remove('open'); render(); window.scrollTo(0, 0); });
api('/api/session').then((s) => { state.authed = s.ok; render(); }).catch(() => render());
