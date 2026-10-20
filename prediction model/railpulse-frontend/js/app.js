import { api, ApiError } from './api.js';
import { CONFIG } from './config.js';
import { clearSession, getState, restoreSession, setSession, setTrainContext } from './state.js';
import {
    loadJourney, renderPassengerAlerts, renderPassengerDashboard, renderPassengerHistory,
    renderPassengerTrain,
} from './pages/passenger.js';
import {
    applyFilters, renderStaffAlerts, renderStaffDashboard, renderStaffHistory, renderStaffTrains,
    runStaffPrediction, showTrainDetail,
} from './pages/staff.js';
import {
    renderStaffCapabilities, renderStaffSimulation, runScenarioComparison,
} from './pages/operations.js';
import { renderAdminDashboard, renderAdminSystem } from './pages/admin.js';

const app = document.querySelector('#app');
let healthTimer;

const icons = { grid: '▦', train: '▰', chart: '⌁', bell: '◌', settings: '⚙', pulse: '◉', shield: '◇', system: '⌘', logout: '↗', arrow: '→', menu: '☰', close: '×' };
const roleNames = { PASSENGER: 'Passenger', STAFF: 'Staff operations', ADMIN: 'Administration' };
const rolePrefix = { PASSENGER: 'passenger', STAFF: 'staff', ADMIN: 'admin' };

restoreSession();
window.addEventListener('hashchange', render);
document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('input', handleFilterChange);
document.addEventListener('change', handleFilterChange);
render();

function route() { return window.location.hash.replace(/^#/, '') || '/'; }
function navigate(path) { window.location.hash = path; }

/**
 * Select a train and show it.
 *
 * Assigning the same hash fires no hashchange, so navigating to the train page
 * while already on it would leave the old train on screen. Re-render in place
 * in that case.
 */
async function goToTrain(trainNumber) {
    setTrainContext(trainNumber);
    const role = session().user.role;
    const target = `/${rolePrefix[role]}/train`;
    if (route() === target) await renderPage(role, 'train');
    else navigate(target);
    // Selecting a train from a list further down the page leaves the answer
    // above the viewport, because the scroll position survives the re-render.
    scrollToTop();
}

/** Return to the top of the page, honouring a reduced-motion preference. */
function scrollToTop() {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}
function session() { return getState().session; }
function isAuthRoute(path) { return path.startsWith('/login') || path === '/register' || path === '/'; }

function render() {
    const path = route();
    // The sign-in handoff has to be answered before the session checks below,
    // because the whole point is that there is no session yet.
    if (path.startsWith('/sso')) return acceptHandoff(path);
    const currentSession = session();
    if (!currentSession && !isAuthRoute(path)) return navigate('/login/user');
    if (currentSession && isAuthRoute(path)) return navigate(`/${rolePrefix[currentSession.user.role]}/dashboard`);
    if (path === '/') return renderLanding();
    if (path === '/register') return renderAuth('register');
    if (path.startsWith('/login/')) return renderAuth(path.split('/')[2] || 'user');
    const expectedRole = path.split('/')[1]?.toUpperCase();
    if (currentSession?.user.role !== expectedRole) return renderAccessDenied();
    renderShell(path);
}

/**
 * Accept a session handed over from the main RailPulse site.
 *
 * The token arrives in the URL fragment, which the browser never sends to any
 * server. It is stripped from the address immediately -- before the token is
 * even used -- so it does not sit in the visible URL, and a copied link
 * carries nothing. The token is then checked against /auth/me rather than
 * trusted: an expired or forged one signs nobody in, it just lands on the
 * login page. The weakness that remains is that the fragment existed in this
 * tab's history for an instant; a one-time code exchanged server-side would
 * close that, at the cost of a new endpoint.
 */
async function acceptHandoff(path) {
    const token = new URLSearchParams(path.split('?')[1] || '').get('token');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

    if (!token) return navigate('/login/user');

    app.innerHTML = `<main class="center-state"><div class="empty-icon">${icons.pulse}</div><p class="eyebrow">Signing you in</p><h1>Opening RailPulse&hellip;</h1></main>`;

    // The API layer reads the token out of the stored session, so it has to be
    // stored before it can be validated. A failed check clears it again.
    setSession({ accessToken: token, user: { username: '', role: 'PASSENGER' } });

    try {
        const user = await api.get('/auth/me');
        if (!user || !rolePrefix[user.role]) throw new ApiError('Unknown role', 401);
        setSession({ accessToken: token, user });
        navigate(`/${rolePrefix[user.role]}/dashboard`);
    } catch {
        clearSession();
        navigate('/login/user');
    }
}

function renderLanding() {
    app.innerHTML = `<main class="landing"><div class="landing-mark">${icons.pulse}</div><p class="eyebrow">Railway intelligence, in motion</p><h1>Know where the journey is going.</h1><p class="landing-copy">RailPulse turns current train state into a clear, explainable ETA and delay picture.</p><div class="portal-grid"><a class="portal portal-passenger" href="#/login/user"><span class="portal-kicker">For travellers</span><strong>Passenger portal</strong><span>Track a train and understand its arrival.</span><b>${icons.arrow}</b></a><a class="portal" href="#/login/staff"><span class="portal-kicker">For operations</span><strong>Staff operations</strong><span>Inspect state, predict, and simulate.</span><b>${icons.arrow}</b></a><a class="portal" href="#/login/admin"><span class="portal-kicker">For control rooms</span><strong>Administration</strong><span>Monitor health and model readiness.</span><b>${icons.arrow}</b></a></div><div id="landing-health" class="connection-note"><span class="status-dot"></span>Checking FastAPI connection</div></main>`;
    checkHealth(document.querySelector('#landing-health'));
}

function renderAuth(kind) {
    const isRegister = kind === 'register';
    const title = isRegister ? 'Create a passenger account' : `${kind === 'staff' ? 'Staff operations' : kind === 'admin' ? 'Administration' : 'Passenger'} portal`;
    const subtitle = isRegister ? 'Registration creates a PASSENGER account only.' : 'Sign in through the shared RailPulse FastAPI service.';
    app.innerHTML = `<main class="auth-layout"><section class="auth-aside"><a class="brand" href="#/"><span>${icons.pulse}</span> RailPulse</a><div><p class="eyebrow">${isRegister ? 'Start tracking' : 'Secure access'}</p><h1>${kind === 'user' ? 'Your journey, with a better ETA.' : kind === 'staff' ? 'Operate with the full picture.' : kind === 'admin' ? 'Keep the intelligence layer healthy.' : 'A clearer journey starts here.'}</h1><p>Live state, model-backed predictions, and honest capability boundaries.</p></div><div class="rail-stripe"><i></i><i></i><i></i><i></i></div></section><section class="auth-panel"><div class="auth-card"><div class="auth-heading"><span class="section-index">0${isRegister ? '2' : '1'}</span><div><p class="eyebrow">${title}</p><h2>${isRegister ? 'Register' : 'Welcome back'}</h2><p>${subtitle}</p></div></div><form id="auth-form" data-kind="${kind}" data-register="${isRegister}">${isRegister ? '<label>Username<input name="username" minlength="3" maxlength="64" pattern="[A-Za-z0-9_.-]+" autocomplete="username" required></label><label>Full name <span>(optional)</span><input name="full_name" maxlength="120" autocomplete="name"></label>' : '<label>Username<input name="username" minlength="3" maxlength="64" autocomplete="username" required></label>'}<label>Password<div class="password-wrap"><input name="password" type="password" minlength="${isRegister ? '8' : '1'}" maxlength="128" autocomplete="${isRegister ? 'new-password' : 'current-password'}" required><button type="button" class="icon-button" data-action="toggle-password" aria-label="Show password">◉</button></div></label>${!isRegister ? '<label class="check-row"><input name="remember" type="checkbox"> Keep this session on this device</label>' : ''}<button class="button button-primary full" type="submit"><span>${isRegister ? 'Create passenger account' : 'Sign in'}</span><b>${icons.arrow}</b></button><div id="auth-error" class="form-error" role="alert"></div></form><div class="auth-links">${isRegister ? '<a href="#/login/user">Already registered? Sign in</a>' : '<a href="#/register">New passenger? Register</a><span>·</span><a href="#/login/staff">Staff</a><a href="#/login/admin">Admin</a>'}</div><div id="auth-health" class="connection-note"><span class="status-dot"></span>Checking FastAPI connection</div></div></section></main>`;
    checkHealth(document.querySelector('#auth-health'));
}

function renderShell(path) {
    const current = session().user;
    const role = current.role;
    const page = path.split('/')[2] || 'dashboard';
    const nav = navigation(role);
    app.innerHTML = `<div class="dashboard-shell"><aside id="sidebar" class="sidebar"><div class="sidebar-top"><a class="brand" href="#/${rolePrefix[role]}/dashboard"><span>${icons.pulse}</span><em>RailPulse</em></a><button class="icon-button mobile-only" data-action="close-sidebar" aria-label="Close navigation">${icons.close}</button></div><div class="role-stamp">${roleNames[role]} <span class="status-dot"></span></div><nav aria-label="Main navigation">${nav.map((item) => `<a class="nav-link ${item.page === page ? 'active' : ''}" href="#/${rolePrefix[role]}/${item.page}"><span>${item.icon}</span><em>${item.label}</em></a>`).join('')}</nav><button class="logout-link" data-action="logout"><span>${icons.logout}</span><em>Sign out</em></button></aside><div class="main-column"><header class="topbar"><button class="icon-button mobile-only" data-action="open-sidebar" aria-label="Open navigation">${icons.menu}</button><div><p class="eyebrow">${roleNames[role]}</p><h1>${pageTitle(page, role)}</h1></div><div class="topbar-tools"><div id="top-health" class="connection-pill"><span class="status-dot"></span><span>Checking</span></div><span class="top-user">${(current.full_name || current.username).slice(0, 1).toUpperCase()}</span></div></header><main id="page-content" class="page-content"></main></div></div>`;
    checkHealth(document.querySelector('#top-health'));
    renderPage(role, page);
}

function navigation(role) {
    const base = [{ page: 'dashboard', label: 'Dashboard', icon: icons.grid }, { page: 'train', label: role === 'PASSENGER' ? 'Track train' : 'Live trains', icon: icons.train }, { page: 'history', label: 'Prediction history', icon: icons.chart }, { page: 'alerts', label: 'Alerts', icon: icons.bell }];
    if (role === 'STAFF' || role === 'ADMIN') base.push({ page: 'simulation', label: 'Simulation', icon: icons.pulse }, { page: 'capabilities', label: 'Network intelligence', icon: icons.shield });
    if (role === 'ADMIN') base.push({ page: 'system', label: 'System health', icon: icons.system });
    return base;
}

function pageTitle(page, role) { const titles = { dashboard: role === 'PASSENGER' ? 'Welcome' : 'Command overview', train: role === 'PASSENGER' ? 'Track a train' : 'Live train state', history: 'Prediction history', alerts: 'Alert intelligence', simulation: 'Simulation lab', capabilities: 'Future capabilities', system: 'System health' }; return titles[page] || 'RailPulse'; }

async function renderPage(role, page) {
    const content = document.querySelector('#page-content');
    if (!content) return;
    content.innerHTML = '<div class="loading-grid"><div class="skeleton skeleton-large"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
    if (role === 'PASSENGER') {
        if (page === 'dashboard') return renderPassengerDashboard(content);
        if (page === 'train') return renderPassengerTrain(content);
        if (page === 'history') return renderPassengerHistory(content);
        if (page === 'alerts') return renderPassengerAlerts(content);
    }
    // Staff and admin share the operational pages; admin additionally gets the
    // model and evaluation surface, and its own service-state dashboard.
    if (role === 'STAFF' || role === 'ADMIN') {
        if (page === 'train') return renderStaffTrains(content);
        if (page === 'history') return renderStaffHistory(content);
        if (page === 'alerts') return renderStaffAlerts(content);
        if (page === 'simulation') return renderStaffSimulation(content);
        if (page === 'capabilities') return renderStaffCapabilities(content);
    }
    if (role === 'STAFF' && page === 'dashboard') {
        // The demo controls lived on the old shared dashboard; staff keep them.
        return renderStaffDashboard(content).then(() => mountDemoPanel(role));
    }
    if (role === 'ADMIN') {
        if (page === 'dashboard') return renderAdminDashboard(content).then(() => mountDemoPanel(role));
        if (page === 'system') return renderAdminSystem(content);
    }
    // Below here are the generic fallbacks. Reaching them by role block is
    // impossible for dashboard/train/history/alerts, but a hash typed by hand
    // -- #/passenger/simulation, say -- lands here, and a PASSENGER was being
    // served the staff simulation form. FastAPI refuses the data either way;
    // the surface should not render either.
    if (['simulation', 'capabilities'].includes(page) && role !== 'STAFF' && role !== 'ADMIN') {
        return renderNotFound(content);
    }
    if (page === 'system' && role !== 'ADMIN') {
        return renderNotFound(content);
    }
    if (page === 'dashboard') return renderDashboard(content, role);
    if (page === 'train') return renderTrain(content, role);
    if (page === 'history') return renderHistory(content);
    if (page === 'alerts') return renderAlerts(content);
    if (page === 'simulation') return renderSimulation(content);
    if (page === 'capabilities') return renderCapabilities(content);
    if (page === 'system') return renderSystem(content);
    renderNotFound(content);
}

/**
 * Mount the existing demo-data controls into the admin dashboard.
 *
 * These are pre-existing, server-role-guarded controls (seed and refresh are
 * STAFF+, reset is ADMIN only) and are kept exactly as they were; only their
 * host page changed.
 */
async function mountDemoPanel(role) {
    const mount = document.querySelector('#admin-demo-panel');
    if (!mount) return;
    mount.innerHTML = await demoEnvironmentPanel(role);
}

async function renderDashboard(content, role) {
    const user = session().user;
    const demoPanel = role === 'STAFF' || role === 'ADMIN' ? await demoEnvironmentPanel(role) : '';
    content.innerHTML = `<section class="welcome reveal"><div><p class="eyebrow">${formatDate(new Date())}</p><h2>${greeting()}, ${escapeHtml(user.full_name || user.username)}.</h2><p class="lede">${role === 'PASSENGER' ? 'The clearest view of your train starts with one number.' : role === 'STAFF' ? 'Operational clarity begins with current state.' : 'A healthy prediction system earns trust.'}</p></div><div class="signal-mark">${icons.pulse}<span>LIVE<br>SIGNAL</span></div></section>${role === 'PASSENGER' ? passengerDashboard() : operationalDashboard(role)}${demoPanel}`;
}

function passengerDashboard() { return `<section class="lookup-panel reveal"><div><p class="eyebrow">Quick lookup</p><h3>Where is your train now?</h3><p>Enter a train number to retrieve backend state. No route data is invented when it is unavailable.</p></div><form id="lookup-form" class="lookup-form"><label class="sr-only" for="lookup-train">Train number</label><input id="lookup-train" name="train_number" placeholder="Train number" inputmode="numeric" required><button class="button button-primary" type="submit">Track train ${icons.arrow}</button></form></section><section class="empty-hero reveal"><div class="empty-icon">${icons.train}</div><div><p class="eyebrow">Your live board</p><h3>No train selected</h3><p>Look up a train to see its current station, speed, delay, and a model-backed ETA.</p></div></section>`; }

function operationalDashboard(role) { return `<section class="metric-grid reveal"><article class="metric-card"><span class="metric-label">Live train states</span><strong>—</strong><small>Awaiting operational feed</small></article><article class="metric-card metric-accent"><span class="metric-label">Prediction engine</span><strong>READY?</strong><small>Confirming backend health below</small></article><article class="metric-card"><span class="metric-label">Network risk</span><strong>—</strong><small>Requires live network data</small></article></section><section class="split-grid reveal"><div class="panel architecture-panel"><div class="panel-heading"><div><p class="eyebrow">System view</p><h3>From state to signal</h3></div><a class="text-link" href="#/${rolePrefix[role]}/system">Inspect health ${icons.arrow}</a></div><div class="flow"><span>Train state</span><b>↓</b><span>FastAPI + Pydantic</span><b>↓</b><span>ETA model</span><b>↓</b><span>Prediction response</span></div></div><div class="panel"><div class="panel-heading"><div><p class="eyebrow">Truthful by design</p><h3>Capability boundary</h3></div></div><p class="panel-copy">Station-level ETAs, propagation, and operational risk remain marked as future data until the backend receives the required live feeds.</p><a class="button button-secondary" href="#/${rolePrefix[role]}/capabilities">View capabilities ${icons.arrow}</a></div></section>`; }

async function demoEnvironmentPanel(role) {
    const canSeed = role === 'STAFF' || role === 'ADMIN';
    const canClear = role === 'ADMIN';
    let count = 0;
    let status = 'Demo data not loaded';
    let lastSeeded = 'Not seeded yet';
    try {
        const data = await api.get('/trains');
        const demoTrains = (data.trains || []).filter((train) => (train.data_source || '').toUpperCase() === 'DEMO');
        count = demoTrains.length || data.count || 0;
        status = count > 0 ? 'Demo data available' : 'Demo data not loaded';
        lastSeeded = count > 0 ? 'Seeded from the live backend' : 'No demo snapshot available';
    } catch (error) {
        status = 'Demo data unavailable';
        lastSeeded = 'Unable to read demo state';
    }
    return `<section class="panel reveal" id="demo-environment-panel"><div class="panel-heading"><div><p class="eyebrow">Demo environment</p><h3>Live demo data</h3></div></div><div class="demo-env-body"><p class="demo-count">${count} trains available</p>${canSeed ? `<div class="action-row"><button class="button button-primary" type="button" data-action="seed-demo">Seed Demo Trains</button><button class="button button-secondary" type="button" data-action="refresh-demo">Refresh Demo Trains</button>${canClear ? '<button class="button button-danger" type="button" data-action="clear-demo">Clear Demo Data</button>' : ''}</div>` : '<p class="muted">Demo data is managed by Admin.</p>'}<div class="demo-status"><strong>Status:</strong> <span class="status-chip ${count > 0 ? 'good' : 'warning'}">${status}</span></div><div class="demo-status"><strong>Last seeded:</strong> <span>${escapeHtml(lastSeeded)}</span></div>${canClear ? `<div id="demo-confirmation" class="demo-confirmation hidden"></div>` : ''}</div></section>`;
}

async function renderTrain(content, role) {
    content.innerHTML = `${trainLookup(role)}<div id="train-list"></div><div id="train-result"></div>`;
    await loadTrainOptions();
    await loadAvailableTrains();
    const selected = getState().selectedTrain;
    if (selected) await loadTrain(selected, document.querySelector('#train-result'), role);
}
function trainLookup(role) { return `<section class="page-intro reveal"><div><p class="eyebrow">${role === 'PASSENGER' ? 'Live journey' : 'Operational feed'}</p><h2>Track a train</h2><p>Retrieve the latest state stored by FastAPI, then request a fresh ETA from the same state contract.</p></div></section><section class="lookup-panel compact reveal"><form id="lookup-form" class="lookup-form"><label class="sr-only" for="lookup-train">Train number</label><input id="lookup-train" name="train_number" list="train-options" autocomplete="off" placeholder="Train number or name" value="${escapeHtml(getState().selectedTrain)}" required><datalist id="train-options"></datalist><button class="button button-primary" type="submit">Retrieve state ${icons.arrow}</button></form></section>`; }


async function loadTrainOptions(query = '') {
    const list = document.querySelector('#train-options');
    if (!list) return;
    try {
        const data = await api.get(`/reference/trains?q=${encodeURIComponent(query)}&limit=25`);
        list.innerHTML = (data.results || [])
            .map((train) => `<option value="${escapeHtml(train.train_number)}">${escapeHtml(train.train_name || '')} · ${escapeHtml(train.source || '')} → ${escapeHtml(train.destination || '')}</option>`)
            .join('');
    } catch {
        list.innerHTML = '';
    }
}

async function loadStationOptions(query = '') {
    const list = document.querySelector('#station-options');
    if (!list) return;
    try {
        const data = await api.get(`/reference/stations?q=${encodeURIComponent(query)}&limit=25`);
        list.innerHTML = (data.results || [])
            .map((station) => `<option value="${escapeHtml(station.station_name)}"></option>`)
            .join('');
    } catch {
        list.innerHTML = '';
    }
}

async function loadAvailableTrains() {
    const listElement = document.querySelector('#train-list');
    if (!listElement) return;
    try {
        const data = await api.get('/trains');
        const trains = Array.isArray(data.trains) ? data.trains : [];
        if (!trains.length) {
            listElement.innerHTML = emptyPanel('No live trains available', 'Seed demo data to create a working live feed for this environment.');
            return;
        }
        listElement.innerHTML = `<section class="panel reveal"><div class="panel-heading"><div><p class="eyebrow">Available demo/live trains</p><h3>${data.count || trains.length} trains available</h3></div></div><div class="train-card-grid">${trains.map(trainCard).join('')}</div></section>`;
    } catch (error) {
        listElement.innerHTML = errorView(error);
    }
}

function trainCard(train) {
    const trainNumber = escapeHtml(train.train_number || 'Unknown');
    const trainType = escapeHtml(train.train_name || train.train_type || 'Service name not provided');
    const source = escapeHtml(train.source || 'Unknown');
    const destination = escapeHtml(train.destination || 'Unknown');
    const currentStation = escapeHtml(train.current_station || 'Unknown');
    const delay = Number(train.current_delay_minutes || 0);
    const isDemo = (train.data_source || '').toUpperCase() === 'DEMO';
    return `<article class="train-card reveal"><div class="train-card-top"><div><p class="eyebrow">${trainNumber}</p><h4>${trainType}</h4></div>${isDemo ? '<span class="status-chip warning">DEMO DATA</span>' : '<span class="status-chip good">LIVE</span>'}</div><p>${source} → ${destination}</p><small>Current: ${currentStation}</small><small>Delay: ${formatDelay(delay)}</small><div class="action-row compact"><button class="button button-secondary" type="button" data-action="track-train" data-train="${trainNumber}">Track</button><button class="button button-primary" type="button" data-action="predict" data-train="${trainNumber}">Predict ETA</button></div></article>`;
}

async function loadTrain(trainNumber, result, role) { result.innerHTML = '<div class="loading-grid"><div class="skeleton skeleton-large"></div><div class="skeleton"></div></div>'; try { const train = await api.get(`/trains/${encodeURIComponent(trainNumber)}/state`); setTrainContext(trainNumber, train, null); result.innerHTML = trainStateView(train, role); } catch (error) { result.innerHTML = error.status === 404 ? missingStateView(trainNumber) : errorView(error); } }

function trainStateView(train, role) { const trainNumber = train.train_number; return `<section class="train-header reveal"><div><p class="eyebrow">Train ${escapeHtml(trainNumber)} · ${escapeHtml(train.train_name || train.train_type || 'Service name not provided')}</p><h2>${escapeHtml(train.source || 'Origin unavailable')} <span>${icons.arrow}</span> ${escapeHtml(train.destination || 'Destination unavailable')}</h2><p class="muted">State source: ${escapeHtml(train.state_source || 'backend')} · Updated ${relativeTime(train.updated_at)}</p></div><span class="status-chip ${train.current_delay_minutes > 15 ? 'warning' : 'good'}">${train.current_delay_minutes > 0 ? `${formatNumber(train.current_delay_minutes)} min late` : 'On time'}</span></section><section class="metric-grid train-metrics reveal"><article class="metric-card"><span class="metric-label">Current station</span><strong class="small-value">${escapeHtml(train.current_station || 'Not provided')}</strong><small>Current section: ${escapeHtml(train.current_section || 'Not provided')}</small></article><article class="metric-card"><span class="metric-label">Speed</span><strong>${formatNumber(train.current_speed_kmph)}<small class="unit"> km/h</small></strong><small>Reported by state</small></article><article class="metric-card"><span class="metric-label">Distance remaining</span><strong>${formatNumber(train.distance_remaining_km)}<small class="unit"> km</small></strong><small>Backend state</small></article></section><section class="split-grid reveal"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">Journey line</p><h3>Route timeline</h3></div></div><div class="timeline"><div class="timeline-stop complete"><i></i><span><b>${escapeHtml(train.source || 'Source unavailable')}</b><small>Origin</small></span></div><div class="timeline-stop current"><i></i><span><b>${escapeHtml(train.current_station || train.current_section || 'Current position unavailable')}</b><small>Current state</small></span></div><div class="timeline-stop"><i></i><span><b>${escapeHtml(train.destination || 'Destination unavailable')}</b><small>Destination</small></span></div></div></div><div class="panel prediction-panel"><div class="panel-heading"><div><p class="eyebrow">Prediction</p><h3>Ask the model</h3></div><span class="status-chip neutral">Backend sourced</span></div><p class="panel-copy">Uses this stored train state as the exact Pydantic-compatible prediction payload.</p><button class="button button-primary" data-action="predict" data-train="${escapeHtml(trainNumber)}">Predict ETA ${icons.arrow}</button><div id="prediction-result" class="prediction-result"></div></div></section>${role === 'PASSENGER' ? '' : `<section class="panel reveal"><div class="panel-heading"><div><p class="eyebrow">Staff controls</p><h3>Operational actions</h3></div></div><div class="action-row"><a class="button button-secondary" href="#/${rolePrefix[role]}/simulation">Open simulation</a><a class="button button-secondary" href="#/${rolePrefix[role]}/capabilities">Propagation & risk</a></div></section>`}`; }

function missingStateView(trainNumber) { return `<section class="empty-hero reveal"><div class="empty-icon">${icons.train}</div><div><p class="eyebrow">No stored state</p><h3>Train ${escapeHtml(trainNumber)} is not in the live feed.</h3><p>FastAPI returned 404. A prediction needs a valid train state; enter a different number or use staff simulation to add it to the live feed.</p></div></section>`; }

async function renderHistory(content) { content.innerHTML = `${trainLookup('PASSENGER')}<div id="history-result"></div>`; const selected = getState().selectedTrain; if (selected) await loadHistory(selected, document.querySelector('#history-result')); }
async function loadHistory(trainNumber, result) { result.innerHTML = '<div class="skeleton skeleton-table"></div>'; try { const data = await api.get(`/trains/${encodeURIComponent(trainNumber)}/predictions?limit=50&skip=0`); result.innerHTML = historyView(data); } catch (error) { result.innerHTML = error.status === 404 ? emptyPanel('No prediction history', 'A history record appears after an authenticated ETA prediction.') : errorView(error); } }
function historyView(data) { if (!data.predictions?.length) return emptyPanel('No prediction history', 'Run an ETA prediction for this train to create the first persisted record.'); return `<section class="panel reveal"><div class="panel-heading"><div><p class="eyebrow">${data.total} records</p><h3>Prediction timeline · ${escapeHtml(data.train_number)}</h3></div></div><div class="table-wrap"><table><thead><tr><th>Timestamp</th><th>Predicted ETA</th><th>Delay</th><th>Category</th><th>Model</th></tr></thead><tbody>${data.predictions.map((item) => `<tr><td>${formatDate(item.timestamp)}</td><td>${formatDate(item.predicted_eta)}</td><td>${formatDelay(item.predicted_delay_minutes)}</td><td><span class="status-chip neutral">${escapeHtml(item.delay_category || 'Not provided')}</span></td><td>${escapeHtml(item.model_version || '—')}</td></tr>`).join('')}</tbody></table></div></section>`; }

async function renderAlerts(content) { content.innerHTML = '<section class="page-intro reveal"><div><p class="eyebrow">Operational awareness</p><h2>Alerts</h2><p>Only persisted backend alerts appear here. The current backend may return a future-data envelope.</p></div></section><div id="alerts-result" class="loading-grid"><div class="skeleton skeleton-large"></div></div>'; try { const data = await api.get('/alerts?limit=50'); document.querySelector('#alerts-result').innerHTML = data.alerts?.length ? data.alerts.map(alertCard).join('') : emptyPanel(data.status === 'future_data_required' ? 'Alert generation is awaiting live data' : 'No active alerts', data.limitation || 'The backend has no alert records for this view.'); } catch (error) { document.querySelector('#alerts-result').innerHTML = errorView(error); } }
function alertCard(alert) { return `<article class="alert-card reveal"><span class="severity ${escapeHtml(alert.severity)}">${escapeHtml(alert.severity)}</span><div><p class="eyebrow">${escapeHtml(alert.alert_type)} · ${escapeHtml(alert.train_number || 'Network')}</p><h3>${escapeHtml(alert.message)}</h3><small>${formatDate(alert.created_at)} · ${alert.acknowledged ? 'Acknowledged' : 'Open'}</small></div></article>`; }

function renderSimulation(content) { content.innerHTML = `<section class="page-intro reveal"><div><p class="eyebrow">Staff and admin only</p><h2>Simulation lab</h2><p>Store a simulated train state and publish it to the live-trains feed.</p></div><span class="simulation-badge">SIMULATION MODE</span></section><section class="panel form-panel reveal"><div class="panel-heading"><div><p class="eyebrow">TrainStateRequest</p><h3>Submit a simulated state</h3></div></div><form id="simulation-form" class="data-form">${trainFields(true)}<button class="button button-primary" type="submit">Store simulated state ${icons.arrow}</button><div id="simulation-result" class="form-message" role="status"></div></form></section>`; }
function trainFields(includeOptional = false) { return `<div class="form-grid"><label>Train number<input name="train_number" required placeholder="e.g. 12345"></label><label>Destination<input name="destination" required placeholder="Destination station"></label><label>Current timestamp<input name="current_timestamp" type="datetime-local" required value="${localDateTime()}"></label><label>Current delay (minutes)<input name="current_delay_minutes" type="number" step="0.1" value="0"></label>${includeOptional ? '<label>Current station<input name="current_station" placeholder="Optional"></label><label>Current speed (km/h)<input name="current_speed_kmph" type="number" min="0" step="0.1"></label><label>Distance remaining (km)<input name="distance_remaining_km" type="number" min="0" step="0.1"></label><label>Train type<input name="train_type" placeholder="Optional"></label><label>Source<input name="source" placeholder="Optional"></label>' : ''}</div>`; }

async function renderCapabilities(content) { const train = getState().selectedTrain || '12345'; content.innerHTML = `<section class="page-intro reveal"><div><p class="eyebrow">Honest capability map</p><h2>Network intelligence</h2><p>Future-data contracts stay visible without pretending the backend has feeds it does not have.</p></div><a class="button button-secondary" href="#/${rolePrefix[session().user.role]}/train">Choose train ${icons.arrow}</a></section><div id="capability-result" class="capability-grid"><div class="skeleton"></div><div class="skeleton"></div></div>`; try { const [catalog, propagation, risk] = await Promise.all([api.get('/docs/capabilities'), api.get(`/network/trains/${encodeURIComponent(train)}/delay-propagation`), api.get(`/network/trains/${encodeURIComponent(train)}/operational-risk`)]); document.querySelector('#capability-result').innerHTML = capabilityCards(catalog, propagation, risk, train); } catch (error) { document.querySelector('#capability-result').innerHTML = errorView(error); } }
function capabilityCards(catalog, propagation, risk, train) { return `<article class="capability-card available"><span class="status-chip good">Available</span><p class="eyebrow">Current backend</p><h3>Train state + ETA prediction</h3><p>Prediction history, model health, and simulation state separation are supported by the API.</p><small>${catalog.available?.map(escapeHtml).join(' · ') || 'Capability catalog returned no entries.'}</small></article><article class="capability-card"><span class="status-chip warning">Future data required</span><p class="eyebrow">Train ${escapeHtml(train)}</p><h3>Delay propagation</h3><p>${escapeHtml(propagation.limitation)}</p><small>Source: ${escapeHtml(propagation.data_source)}</small></article><article class="capability-card"><span class="status-chip warning">Future data required</span><p class="eyebrow">Train ${escapeHtml(train)}</p><h3>Operational risk</h3><p>${escapeHtml(risk.limitation)}</p><small>Source: ${escapeHtml(risk.data_source)}</small></article>`; }

async function renderSystem(content) { content.innerHTML = '<section class="page-intro reveal"><div><p class="eyebrow">Backend observability</p><h2>System health</h2><p>Health is read from FastAPI. The browser never reaches MongoDB or the model artifact.</p></div><button class="button button-secondary" data-action="refresh-health">Refresh health</button></section><div id="system-result" class="loading-grid"><div class="skeleton skeleton-large"></div></div>'; await showSystemHealth(); }
async function showSystemHealth() { const result = document.querySelector('#system-result'); if (!result) return; try { const health = await api.get('/health/'); getState().health = health; result.innerHTML = healthView(health); } catch (error) { result.innerHTML = errorView(error); } }
function healthView(health) { const details = health.model_details || {}; return `<section class="health-grid reveal"><article class="health-card"><span class="health-icon">${icons.pulse}</span><div><p class="eyebrow">FastAPI</p><h3 class="health-${health.status}">${escapeHtml(health.status)}</h3></div></article><article class="health-card"><span class="health-icon">◈</span><div><p class="eyebrow">MongoDB</p><h3 class="health-${health.mongodb}">${escapeHtml(health.mongodb)}</h3></div></article><article class="health-card"><span class="health-icon">⌁</span><div><p class="eyebrow">ML model</p><h3 class="health-${health.model}">${escapeHtml(health.model)}</h3></div></article></section><section class="split-grid reveal"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">Model metadata</p><h3>${escapeHtml(health.model_version || 'Unknown version')}</h3></div><span class="status-chip ${health.model === 'ok' ? 'good' : 'warning'}">${health.model === 'ok' ? 'Model ready' : 'Model unavailable'}</span></div><div class="metadata-list"><div><span>Artifact</span><b>${details.artifact_exists ? 'Present' : 'Missing'}</b></div><div><span>Features</span><b>${details.features?.length || 0}</b></div><div><span>ETA interval</span><b>${formatNumber(details.uncertainty?.eta_interval_minutes)} min</b></div><div><span>Interval coverage</span><b>${formatPercent(details.uncertainty?.eta_calibration_coverage)}</b></div><div><span>Training dataset</span><b>${escapeHtml(health.dataset?.name || 'unknown')}</b></div><div><span>Data provenance</span><b>${escapeHtml(health.dataset?.data_provenance || 'unknown')}</b></div><div><span>Training rows</span><b>${formatNumber(health.dataset?.rows)}</b></div><div><span>Beats baseline</span><b>${health.model_quality ? (health.model_quality.beats_baseline ? 'Yes' : 'No') : '—'}</b></div></div>${health.model_quality?.notice ? `<p class="panel-copy">${escapeHtml(health.model_quality.notice)}</p>` : ''}</div><div class="panel"><div class="panel-heading"><div><p class="eyebrow">Model features</p><h3>Inference contract</h3></div></div><div class="tag-cloud">${(details.features || []).map((feature) => `<span>${escapeHtml(feature)}</span>`).join('') || '<span>No feature metadata returned</span>'}</div></div></section>`; }

function renderAccessDenied() { app.innerHTML = `<main class="center-state"><div class="empty-icon">${icons.shield}</div><p class="eyebrow">403 · Access restricted</p><h1>This portal is not assigned to your role.</h1><p>FastAPI remains the security authority. Return to your dashboard or sign out to use another account.</p><div class="action-row"><a class="button button-primary" href="#/${rolePrefix[session().user.role]}/dashboard">Dashboard ${icons.arrow}</a><button class="button button-secondary" data-action="logout">Sign out</button></div></main>`; }
function renderNotFound(content) { content.innerHTML = `<section class="center-state"><div class="empty-icon">${icons.train}</div><p class="eyebrow">404 · Route not laid</p><h2>This route has not been laid yet.</h2><p>Return to the operational view and choose a supported section.</p></section>`; }

/** Staff fleet filters re-render from the already-loaded snapshot. */
function handleFilterChange(event) {
    const target = event.target;
    if (!target || !target.id || !target.id.startsWith('filter-')) return;
    applyFilters();
}

async function handleSubmit(event) { const form = event.target; if (!(form instanceof HTMLFormElement)) return; event.preventDefault(); if (form.id === 'auth-form') return submitAuth(form); if (form.id === 'lookup-form') { const number = new FormData(form).get('train_number').trim(); await goToTrain(number); return; } if (form.id === 'simulation-form') return submitSimulation(form); if (form.id === 'scenario-form') return runScenarioComparison(form); }
async function submitAuth(form) { const errorBox = document.querySelector('#auth-error'); const button = form.querySelector('button[type="submit"]'); setBusy(button, true); errorBox.textContent = ''; const data = Object.fromEntries(new FormData(form)); try { if (form.dataset.register === 'true') { await api.post('/auth/register', { username: data.username, password: data.password, full_name: data.full_name || null }); toast('Account created. Sign in to continue.'); return navigate('/login/user'); } const response = await api.post('/auth/login', { username: data.username, password: data.password }); const expected = form.dataset.kind === 'user' ? 'PASSENGER' : form.dataset.kind.toUpperCase(); if (response.user.role !== expected) { errorBox.textContent = `This account belongs to ${roleNames[response.user.role] || 'another role'}. Please use the appropriate portal.`; return; } setSession({ accessToken: response.access_token, user: response.user }, data.remember === 'on'); navigate(`/${rolePrefix[response.user.role]}/dashboard`); } catch (error) { errorBox.textContent = error.message; } finally { setBusy(button, false); } }
async function submitSimulation(form) { const message = document.querySelector('#simulation-result'); const button = form.querySelector('button[type="submit"]'); setBusy(button, true); message.textContent = ''; try { const payload = formPayload(form); const response = await api.post('/simulation/update', payload); message.textContent = response.message || 'Simulation state stored and live train updated.'; toast('Live train updated'); } catch (error) { message.textContent = error.message; } finally { setBusy(button, false); } }

document.addEventListener('input', (event) => {
    if (event.target && event.target.id === 'lookup-train') loadTrainOptions(event.target.value);
    if (event.target && event.target.dataset && event.target.dataset.stations === 'true') loadStationOptions(event.target.value);
});

async function handleClick(event) { const trigger = event.target.closest('[data-action]'); if (!trigger) return; const action = trigger.dataset.action; if (action === 'logout') { clearSession(); navigate('/login/user'); return; } if (action === 'toggle-password') { const input = trigger.closest('.password-wrap').querySelector('input'); input.type = input.type === 'password' ? 'text' : 'password'; trigger.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password'); return; } if (action === 'open-sidebar') { document.querySelector('#sidebar')?.classList.add('open'); return; } if (action === 'close-sidebar') { document.querySelector('#sidebar')?.classList.remove('open'); return; } if (action === 'refresh-health') { showSystemHealth(); return; } if (action === 'predict') { predict(trigger.dataset.train, trigger); return; } if (action === 'track-train') { await goToTrain(trigger.dataset.train); return; } if (action === 'staff-detail') { await showTrainDetail(trigger.dataset.train); return; } if (action === 'staff-predict') { await runStaffPrediction(trigger.dataset.train, trigger); return; } if (action === 'seed-demo') { try { const result = await api.post('/demo/seed', {}); toast(result.message || 'Demo trains seeded.'); await renderPage(session().user.role, 'dashboard'); } catch (error) { toast(error.message); } return; } if (action === 'refresh-demo') { try { const result = await api.post('/demo/refresh', {}); toast(result.message || 'Demo trains refreshed.'); await renderPage(session().user.role, 'dashboard'); } catch (error) { toast(error.message); } return; } if (action === 'clear-demo') { try { const result = await api.post('/demo/reset', {}); toast(result.message || 'Demo data cleared.'); await renderPage(session().user.role, 'dashboard'); } catch (error) { toast(error.message); } return; } }

async function predict(trainNumber, trigger) { let result = trigger?.closest('.prediction-panel')?.querySelector('#prediction-result') || document.querySelector('#prediction-result'); const button = trigger || document.querySelector(`[data-action="predict"][data-train="${CSS.escape(trainNumber)}"]`); if (!trainNumber) return; setBusy(button, true); if (result) result.innerHTML = '<div class="inline-loading">Running ETA inference…</div>'; try { const train = await api.get(`/trains/${encodeURIComponent(trainNumber)}/state`); const prediction = await api.post('/predict/eta', predictionPayload(train)); const liveResult = document.querySelector('#train-result'); if (!result && liveResult) { await loadTrain(trainNumber, liveResult, session().user.role); result = document.querySelector('#prediction-result'); } setTrainContext(trainNumber, train, prediction); if (result) result.innerHTML = predictionView(prediction); const historyResult = document.querySelector('#history-result'); if (historyResult) await loadHistory(trainNumber, historyResult); toast('Prediction updated'); scrollToUpdate(result || liveResult || '.page-content'); } catch (error) { if (result) result.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; toast(error.message); } finally { setBusy(button, false); } }
function predictionPayload(train) { const payload = { ...train }; delete payload._id; delete payload.state_source; delete payload.updated_at; delete payload.simulated_at; return payload; }

function scrollToUpdate(target) {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    node.classList?.remove('reveal');
    void node.offsetWidth;
    node.classList?.add('reveal');
}

async function checkHealth(target) { if (!target) return; try { const health = await api.get('/health/'); target.innerHTML = `<span class="status-dot ${health.status === 'ok' ? 'connected' : 'degraded'}"></span>${health.status === 'ok' ? 'FastAPI connected' : 'FastAPI degraded'}`; } catch { target.innerHTML = '<span class="status-dot offline"></span>FastAPI offline'; } if (healthTimer) window.clearTimeout(healthTimer); healthTimer = window.setTimeout(() => checkHealth(document.querySelector('#top-health') || document.querySelector('#landing-health') || document.querySelector('#auth-health')), CONFIG.healthPollMs); }

function predictionView(item) {
    const risk = ['LOW', 'MODERATE', 'HIGH'].includes(item.risk_level) ? item.risk_level.toLowerCase() : 'unknown';
    const riskLabel = risk === 'unknown' ? 'Unavailable' : `${risk[0].toUpperCase()}${risk.slice(1)}`;
    const quality = item.model_quality || {};
    const synthetic = (quality.data_provenance || '').toLowerCase() === 'synthetic';
    const syntheticChip = synthetic
        ? '<div class="prediction-meta"><span class="status-chip warning">Trained on synthetic data</span></div>' : '';
    const notice = quality.notice ? `<div class="prediction-meta">${escapeHtml(quality.notice)}${quality.beats_baseline === false ? ' · does not beat its mean-delay baseline on held-out data' : ''}</div>` : '';
    const ignored = (item.unsupported_fields_ignored || []).length
        ? `<div class="prediction-meta">Not used by the model: ${escapeHtml(item.unsupported_fields_ignored.join(', '))}</div>` : '';
    const coldStart = item.train_known_to_model === false
        ? '<div class="prediction-meta">This train was not in the training data; the prediction uses route-level fallbacks.</div>' : '';
    return `${syntheticChip}<div class="prediction-hero"><p class="eyebrow">Predicted ETA</p><strong>${formatTime(item.predicted_eta)}</strong><div class="prediction-details"><span>Likely delay range <b>${formatNumber(item.delay_p10_minutes)}–${formatNumber(item.delay_p90_minutes)} min</b></span><span>Chance of >15 min delay <b>${formatPercent(item.p_delay_gt_15)}</b></span><span>Median delay <b>${formatDelay(item.predicted_delay_minutes)}</b></span><span>Risk <b class="risk-level risk-${risk}">${riskLabel}</b></span><span>ETA window <b>${formatTime(item.eta_lower)} – ${formatTime(item.eta_upper)}</b></span><span>Interval coverage <b>${formatPercent(item.confidence)}</b></span></div></div><div class="prediction-meta">${escapeHtml(item.delay_category)} · ${escapeHtml(item.model_version)} · source ${escapeHtml(item.data_source || 'LIVE')} · ${formatDate(new Date())}</div>${notice}${coldStart}${ignored}`;
}
function errorView(error) { return `<section class="empty-hero error-state"><div class="empty-icon">!</div><div><p class="eyebrow">${error.status ? `API ${error.status}` : 'Connection issue'}</p><h3>${escapeHtml(error.message)}</h3><p>Check the FastAPI service and retry this operation.</p><button class="button button-secondary" data-action="refresh-health">Check connection</button></div></section>`; }
function emptyPanel(title, copy) { return `<section class="empty-hero reveal"><div class="empty-icon">${icons.pulse}</div><div><p class="eyebrow">Nothing to show</p><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div></section>`; }
function formPayload(form) { const raw = Object.fromEntries(new FormData(form)); const payload = {}; for (const [key, value] of Object.entries(raw)) { if (value === '') continue; if (['current_timestamp'].includes(key)) payload[key] = new Date(value).toISOString(); else if (['current_delay_minutes', 'current_speed_kmph', 'distance_remaining_km'].includes(key)) payload[key] = Number(value); else payload[key] = value; } return payload; }
function setBusy(button, busy) { if (!button) return; button.disabled = busy; button.classList.toggle('is-busy', busy); if (busy) button.dataset.originalText = button.innerHTML; button.innerHTML = busy ? '<span class="loader"></span> Working…' : button.dataset.originalText || button.innerHTML; }
function toast(message) { const region = document.querySelector('#toast-region'); const item = document.createElement('div'); item.className = 'toast'; item.textContent = message; region.append(item); window.setTimeout(() => item.remove(), 4000); }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; }
function formatNumber(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(0) : '—'; }
function formatDelay(value) { return Number.isFinite(Number(value)) ? `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(0)} min` : '—'; }
function formatPercent(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(0)}%` : '—'; }
function formatTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function relativeTime(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return 'unknown time'; const minutes = Math.round((Date.now() - date.getTime()) / 60000); return minutes <= 0 ? 'just now' : `${minutes} min ago`; }
function localDateTime() { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }