/**
 * StationTrack Frontend - Supabase Integration
 * Handles student and office portals with Supabase Auth
 */

// ============================================================
// Configuration
// ============================================================
// These are loaded from environment variables at runtime
// If running in development, they may be injected by the build system
const SUPABASE_URL = window.VITE_SUPABASE_URL || 'VITE_SUPABASE_URL_PLACEHOLDER';
const SUPABASE_ANON_KEY = window.VITE_SUPABASE_ANON_KEY || 'VITE_SUPABASE_ANON_KEY_PLACEHOLDER';

// Will be replaced by build system or set from window
let currentUser = null;
let currentToken = null;

// Helper to ensure we have valid credentials
function validateSupabaseConfig() {
  if (SUPABASE_URL.includes('PLACEHOLDER') || SUPABASE_ANON_KEY.includes('PLACEHOLDER')) {
    console.error('ERROR: Supabase credentials not configured. Check .env file.');
    toast('Configuration error: Supabase credentials missing');
    return false;
  }

  return true;
}

// ============================================================
// Utility Functions
// ============================================================
const $ = id => document.getElementById(id);
const show = id => {
  document.querySelectorAll('.screen').forEach(x => x.classList.add('hidden'));
  const screen = $(id);
  if (screen) {
    screen.classList.remove('hidden');
    window.scrollTo(0, 0);
  }
};

document.querySelectorAll('.portal').forEach(card => {
  const spotlight = card.querySelector('.cardSpotlight');
  if (!spotlight) return;
  card.addEventListener('pointermove', event => {
    const rect = card.getBoundingClientRect();
    spotlight.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
    spotlight.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
  });

  const stationDock = document.querySelector('.stationDock');
  if (stationDock) {
    const dockItems = [...stationDock.querySelectorAll('.dockItem')];
    stationDock.addEventListener('pointermove', event => {
      dockItems.forEach(item => {
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(event.clientX - (rect.left + rect.width / 2));
        const scale = 1 + 0.8 * Math.exp(-(distance * distance) / (2 * 120 * 120));
        item.style.setProperty('--dock-scale', scale.toFixed(3));
      });
    });
    stationDock.addEventListener('pointerleave', () => {
      dockItems.forEach(item => item.style.setProperty('--dock-scale', '1'));
    });
  }
});

function toast(msg) {
  const toastEl = $('toast');
  if (toastEl) {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    setTimeout(() => { toastEl.style.display = 'none'; }, 3200);
  }

}

function togglePassword(id, button) {
  const input = $(id);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? 'Show' : 'Hide';
}

async function forgotPassword() {
  const email = $('sident')?.value.trim();
  if (!email) {
    toast('Enter your email first, then select Forgot password.');
    $('sident')?.focus();
    return;
  }
  try {
    await api('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    toast('If the account exists, a reset email has been sent.');
  } catch (e) {
    toast(e.message);
  }
}

function toggleMenu() {
  if (!currentUser || $('menuToggle')?.classList.contains('hidden')) return;
  $('mobileMenu')?.classList.toggle('hidden');
}

function closeMenu() {
  $('mobileMenu')?.classList.add('hidden');
}

function setAuthenticatedChrome(authenticated) {
  closeMenu();
  $('logout')?.classList.toggle('hidden', !authenticated);
  $('menuToggle')?.classList.toggle('hidden', !authenticated);
  $('mobileMenu')?.classList.toggle('hidden', !authenticated);
  $('mobileNav')?.classList.toggle('hidden', !authenticated || currentUser?.role !== 'student');
  $('officeStudentsMenu')?.classList.toggle('hidden', !authenticated || currentUser?.role !== 'office');
  document.querySelectorAll('.studentMenuItem').forEach(item => {
    item.classList.toggle('hidden', !authenticated || currentUser?.role !== 'student');
  });
}

function navigateStudent(screenId) {
  closeMenu();
  show(screenId);
  $('mobileNav')?.classList.toggle('hidden', !currentUser || currentUser.role !== 'student');
  if (screenId === 'studentHistory') loadHistory();
}

async function logoutUser() {
  toggleMenu();
  if (logoutBtn) await logoutBtn.onclick();
}

async function api(url, opt = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(currentToken && { 'Authorization': `Bearer ${currentToken}` }),
    ...( opt.headers || {})
  };

  const r = await fetch(url, { headers, ...opt });
  let d = {};
  try {
    d = await r.json();
  } catch {}

  if (!r.ok) {
    throw Error(d.error || 'Something went wrong');
  }

  return d;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric', minute: '2-digit'
  });
}

// ============================================================
// IST Clock (Ambient)
// ============================================================
function tickClock() {
  const clockEl = $('clockLine');
  if (clockEl) {
    clockEl.textContent = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date()) + ' IST';
  }
}

tickClock();
const clockTimer = setInterval(tickClock, 1000);

// ============================================================
// Animated Number Counter
// ============================================================
function animateNumber(el, to) {
  if (!el) return;
  const from = Number(el.textContent) || 0;
  if (from === to) {
    el.textContent = to;
    return;
  }
  const dur = 350;
  const start = performance.now();
  function step(t) {
    const p = Math.min(1, (t - start) / dur);
    el.textContent = Math.round(from + (to - from) * p);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============================================================
// Auth State Management
// ============================================================
async function initAuth() {
  const storage = localStorage.getItem('stationtrack_remember') === 'true'
    ? localStorage
    : sessionStorage;
  const stored = storage.getItem('stationtrack_token');
  if (stored) {
    try {
      currentToken = stored;
      const user = await api('/api/me');
      currentUser = user.user;
        const savedAssignment = storage.getItem('stationtrack_office_assignment');
        if (currentUser.role === 'office' && savedAssignment) {
          try {
            Object.assign(currentUser, JSON.parse(savedAssignment));
          } catch {}
        }
      setAuthenticatedChrome(true);
      
      if (currentUser.role === 'student') {
        loadStudent();
      } else if (currentUser.role === 'office') {
        loadOffice();
      }
    } catch (e) {
      localStorage.removeItem('stationtrack_token');
      sessionStorage.removeItem('stationtrack_token');
      localStorage.removeItem('stationtrack_remember');
      localStorage.removeItem('stationtrack_office_assignment');
      sessionStorage.removeItem('stationtrack_office_assignment');
      show('home');
    }
  } else {
    setAuthenticatedChrome(false);
    show('home');
  }
}

const logoutBtn = $('logout');
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('stationtrack_token');
    sessionStorage.removeItem('stationtrack_token');
    localStorage.removeItem('stationtrack_remember');
    currentToken = null;
    currentUser = null;
    setAuthenticatedChrome(false);
    clearInterval(statusTimer);
    clearInterval(attendanceTimer);
    show('home');
  };
}

// ============================================================
// Login/Registration
// ============================================================
async function loadUnits() {
  try {
    const units = await api('/api/units');
    setupOfficeAssignmentFields(units);
    const unique = [...new Map(units.map(x => [x.unit_id, x])).values()];
    const unitSelect = $('runit');
    if (unitSelect) {
      unitSelect.innerHTML = '<option value="">Select zone / unit</option>' + unique.map(x => 
        `<option value="${x.unit_id}">${escapeHtml(x.unit_name)}</option>`
      ).join('');
    }
  } catch (e) {
    toast(e.message);
  }
}

async function register(e) {
  e.preventDefault();
  try {
    const rname = $('rname');
    const remail = $('remail');
    const rpass = $('rpass');
    const rconfirm = $('rconfirm');
    const runit = $('runit');

    if (!rname || !remail || !rpass || !rconfirm || !runit) return;
    if (rpass.value !== rconfirm.value) {
      toast('Passwords do not match.');
      rconfirm.focus();
      return;
    }

    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: rname.value.trim(),
        email: remail.value.trim(),
        password: rpass.value,
        unit_id: runit.value
      })
    });

    toast('Account created successfully. Please log in.');
    show('studentLogin');
    
    // Clear form
    rname.value = '';
    remail.value = '';
    rpass.value = '';
    rconfirm.value = '';
  } catch (e) {
    toast(e.message);
  }
}

const LOGIN_FIELDS = {
  student: ['sident', 'spass', 'studentRemember'],
  office: ['oident', 'opass', 'officeRemember']
};

let availableAssignments = [];
let loginInProgress = false;

function setLoginLoading(loading, message = 'Signing you in…') {
  const overlay = $('loadingOverlay');
  const text = $('loadingText');
  if (text) text.textContent = message;
  overlay?.classList.toggle('hidden', !loading);
  document.querySelectorAll('.loginButton').forEach(button => {
    button.disabled = loading;
    button.classList.toggle('isLoading', loading);
  });
}

function populateOfficeStations() {
  const unitSelect = $('officeUnit');
  const stationSelect = $('officeStation');
  if (!unitSelect || !stationSelect) return;
  const selectedUnit = unitSelect.value;
  const stations = availableAssignments.filter(x => x.unit_id === selectedUnit);
  stationSelect.innerHTML = '<option value="">Select police station</option>' +
    stations.map(x => `<option value="${x.station_id}">${escapeHtml(x.station_name)}</option>`).join('');
  stationSelect.disabled = !selectedUnit || stations.length === 0;
}

function setupOfficeAssignmentFields(units) {
  availableAssignments = units;
  const unitSelect = $('officeUnit');
  if (!unitSelect) return;
  const unique = [...new Map(units.map(x => [x.unit_id, x])).values()];
  unitSelect.innerHTML = '<option value="">Select zone / unit</option>' +
    unique.map(x => `<option value="${x.unit_id}">${escapeHtml(x.unit_name)}</option>`).join('');
  unitSelect.onchange = populateOfficeStations;
  populateOfficeStations();
}

async function login(e, role) {
  e.preventDefault();
  if (loginInProgress) return;
  loginInProgress = true;
  setLoginLoading(true, role === 'office' ? 'Opening office control center…' : 'Opening student portal…');
  try {
    const fields = LOGIN_FIELDS[role];
    if (!fields) return;

    const identField = $(fields[0]);
    const passField = $(fields[1]);
    const rememberField = $(fields[2]);

    if (!identField || !passField || !rememberField) return;

    const email = identField.value;
    const password = passField.value;
    const assignment = role === 'office'
      ? { unit_id: $('officeUnit')?.value, station_id: $('officeStation')?.value }
      : null;
    if (role === 'office' && (!assignment.unit_id || !assignment.station_id)) {
      toast('Select the office zone/unit and police station.');
      return;
    }

    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role, ...(assignment || {}) })
    });

    currentToken = res.access_token;
    currentUser = res.user;
    if (role === 'office') {
      const targetStorage = rememberField.checked ? localStorage : sessionStorage;
      targetStorage.setItem('stationtrack_office_assignment', JSON.stringify({
        unit_id: res.user.unit_id,
        unit_name: res.user.unit_name,
        police_station_id: res.user.police_station_id,
        station_name: res.user.station_name
      }));
    }
    localStorage.removeItem('stationtrack_token');
    sessionStorage.removeItem('stationtrack_token');
    if (rememberField.checked) {
      localStorage.setItem('stationtrack_remember', 'true');
      localStorage.setItem('stationtrack_token', currentToken);
    } else {
      localStorage.removeItem('stationtrack_remember');
      sessionStorage.setItem('stationtrack_token', currentToken);
    }
    
    setAuthenticatedChrome(true);

    if (role === 'student') {
      loadStudent();
    } else if (role === 'office') {
      loadOffice();
    }
  } catch (e) {
    toast(e.message);
  } finally {
    loginInProgress = false;
    setLoginLoading(false);
  }
}

// ============================================================
// Student Portal
// ============================================================
let scanner = null;

async function loadStudent() {
  try {
    const m = await api('/api/me');
    const sname = $('sname');
    const splace = $('splace');
    
    if (sname) sname.textContent = `Welcome, ${m.user.name}`;
    if (splace) splace.textContent = m.user.unit_name;
    $('menuUserName').textContent = m.user.name;
    $('profileName').textContent = m.user.name;
    $('profileEmail').textContent = m.user.email;
    $('profileUnit').textContent = m.user.unit_name;
    const date = $('studentDate');
    if (date) date.textContent = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric'
    }).format(new Date());
    
    show('studentDash');
    $('mobileNav')?.classList.remove('hidden');
    await loadStudentRecord();
    await loadHistory();
  } catch (e) {
    toast(e.message);
  }
}

async function loadStudentRecord() {
  try {
    const a = await api('/api/student/today');
    const record = $('studentRecord');
    
    if (!record) return;

    const state = $('attendanceState');
    if (!a) {
      if (state) state.textContent = 'NOT MARKED';
      record.innerHTML = '<span style="color:var(--ink-dim)">Attendance not marked. Scan the office QR when you arrive.</span>';
      return;
    }

    const inside = !a.check_out;
    const statusBadge = a.status === 'present' ? 'present' : 'late';
    const statusLabel = a.status === 'present' ? 'PRESENT' : 'LATE';
    if (state) state.textContent = 'ATTENDANCE VERIFIED';
    const currentStatus = $('studentCurrentStatus');
    if (currentStatus) currentStatus.textContent = inside ? 'INSIDE' : 'CHECKED OUT';

    record.innerHTML = `
      <div><span class="badge ${statusBadge}">${statusLabel}</span>
      &nbsp;Check-in ${fmtTime(a.check_in)}
      ${inside ? '<button class="liquidMetalButton checkoutAction" onclick="exitStation()">Check out</button>' : `&nbsp; Check-out ${fmtTime(a.check_out)}`}
      </div>
    `;
  } catch (e) {
    toast(e.message);
  }
}

async function exitStation() {
  try {
    await api('/api/attendance/exit', { method: 'POST' });
    toast('Exit time recorded.');
    loadStudentRecord();
  } catch (e) {
    toast(e.message);
  }
}

async function submitManualCode() {
  const input = $('manualCodeInput');
  const code = input?.value.trim();
  if (!code) {
    toast('Enter the office backup code.');
    input?.focus();
    return;
  }
  try {
    const res = await api('/api/attendance/manual', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    if (input) input.value = '';
    showResult(true, res);
  } catch (e) {
    showResult(false, { error: e.message });
  }
}

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!$('scanOverlay')?.classList.contains('hidden')) {
    stopScan();
  } else if (!$('resultOverlay')?.classList.contains('hidden')) {
    closeResult();
  } else if (!$('fsQr')?.classList.contains('hidden')) {
    hideFullscreen();
  } else if (!$('mobileMenu')?.classList.contains('hidden')) {
    toggleMenu();
  }
});

async function loadHistory() {
  try {
    const rows = await api('/api/student/history');
    const historyRows = $('historyRows');
    
    if (!historyRows) return;
    animateNumber($('studentPresentCount'), rows.filter(row => row.status === 'present').length);
    animateNumber($('studentLateCount'), rows.filter(row => row.status === 'late').length);
    animateNumber($('studentDaysCount'), rows.length);

    historyRows.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${escapeHtml(r.attendance_date)}</td>
        <td>${fmtTime(r.check_in)}</td>
        <td><span class="badge ${r.status}">${r.status.toUpperCase()}</span></td>
        <td>${r.check_out ? fmtTime(r.check_out) : '—'}</td>
      </tr>
    `).join('') : '<tr><td colspan="4">No attendance recorded yet.</td></tr>';
  } catch (e) {
    toast(e.message);
  }
}

// ============================================================
// QR Scanner
// ============================================================
async function startScan() {
  if (!window.Html5Qrcode) {
    toast('Scanner is loading. Try again in a moment.');
    return;
  }

  const scanOverlay = $('scanOverlay');
  const scanStatus = $('scanStatus');

  if (scanOverlay) {
    scanOverlay.classList.remove('hidden');
  }
  if (scanStatus) {
    scanStatus.textContent = "Point your camera at the office's QR code";
  }

  scanner = new Html5Qrcode('reader');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      async text => {
        try {
          if (scanStatus) scanStatus.textContent = 'Verifying secure token…';
          const p = JSON.parse(text);
          if (!p.token) throw Error('This QR code could not be read.');
          await stopScan();
          const res = await api('/api/attendance/mark', {
            method: 'POST',
            body: JSON.stringify({ token: p.token })
          });
          showResult(true, res);
        } catch (e) {
          await stopScan();
          showResult(false, { error: e.message });
        }
      }
    );
  } catch (e) {
    if (scanOverlay) scanOverlay.classList.add('hidden');
    toast('Camera permission is required to scan the office QR.');
  }
}

async function stopScan() {
  const scanOverlay = $('scanOverlay');
  if (scanOverlay) {
    scanOverlay.classList.add('hidden');
  }
  if (scanner) {
    try { await scanner.stop(); } catch {}
    try { scanner.clear(); } catch {}
    scanner = null;
  }
}

function showResult(ok, data) {
  const card = $('resultCard');
  const resultOverlay = $('resultOverlay');

  if (!card) return;

  if (ok) {
    card.className = 'resultCard ok';
    card.innerHTML = `
      <div class="mark">✓</div>
      <h3>Attendance Verified</h3>
      <div class="sub">SECURE TOKEN ACCEPTED</div>
      <div class="detail">
        <div><span>Time</span><span>${fmtTime(data.attendance?.check_in || data.check_in)}</span></div>
        <div><span>Status</span><span>${escapeHtml(data.attendance?.status || data.status || '')}</span></div>
      </div>
      <button onclick="closeResult()">Continue</button>
    `;
  } else {
    card.className = 'resultCard err';
    card.innerHTML = `
      <div class="mark">!</div>
      <h3>Verification Failed</h3>
      <div class="sub">${escapeHtml(data.error || 'Unable to verify attendance.')}</div>
      <button class="secondary" onclick="closeResult()">Close</button>
    `;
  }

  if (resultOverlay) resultOverlay.classList.remove('hidden');
}

function closeResult() {
  const resultOverlay = $('resultOverlay');
  if (resultOverlay) resultOverlay.classList.add('hidden');
  loadStudentRecord();
}

// ============================================================
// Office Portal
// ============================================================
let officeRows = [];
let currentFilter = 'all';
let statusTimer = null;
let attendanceTimer = null;

async function loadOffice() {
  try {
    const m = await api('/api/me');
    if (currentUser?.role === 'office' && currentUser.unit_id && currentUser.police_station_id) {
      Object.assign(m.user, currentUser);
    }
    currentUser = m.user;
    const oname = $('oname');
    const ounit = $('ounit');
    const ostation = $('ostation');

    if (oname) oname.textContent = 'Office Control Center';
    if (ounit) ounit.textContent = m.user.unit_name;
    if (ostation) ostation.textContent = `· ${m.user.station_name}`;

    show('officeDash');
    await generateQR();
    refreshAttendance();
    refreshStatus();

    clearInterval(attendanceTimer);
    attendanceTimer = setInterval(refreshAttendance, 15000);
    clearInterval(statusTimer);
    statusTimer = setInterval(refreshStatus, 20000);
  } catch (e) {
    toast(e.message);
  }
}

async function refreshStatus() {
  try {
    const params = new URLSearchParams({
      unit_id: currentUser?.unit_id || '',
      station_id: currentUser?.police_station_id || ''
    });
    const s = await api(`/api/system/status?${params}`);
    setDot('dotDb', s.database ? 'on' : 'off');
    setDot('dotAtt', s.attendance_service ? 'on' : 'off');
    setDot('dotQr', s.qr_ready_today ? 'on' : 'warn');
  } catch (e) {
    setDot('dotDb', 'off');
    setDot('dotAtt', 'off');
    setDot('dotQr', 'off');
  }
}

function setDot(id, state) {
  const dot = $(id);
  if (dot) dot.className = 'dot ' + state;
}

let lastQr = null;

async function generateQR() {
  try {
    const d = await api('/api/office/qr', { method: 'POST', body: JSON.stringify({
      unit_id: currentUser?.unit_id,
      station_id: currentUser?.police_station_id
    }) });
    applyQr(d);
  } catch (e) {
    toast(e.message);
  }
}

async function regenerateQR() {
  try {
    const d = await api('/api/office/qr/regenerate', { method: 'POST', body: JSON.stringify({
      unit_id: currentUser?.unit_id,
      station_id: currentUser?.police_station_id
    }) });
    applyQr(d);
    toast('New QR issued — the previous image no longer works.');
  } catch (e) {
    toast(e.message);
  }
}

function applyQr(d) {
  lastQr = d;
  const qr = $('qr');
  const qrDateLine = $('qrDateLine');
  const fsQrImg = $('fsQrImg');

  if (qr) qr.src = d.qr;
  if (qrDateLine) qrDateLine.textContent = `${d.date} · valid until 11:59 PM`;
  if (fsQrImg) fsQrImg.src = d.qr;
  const manualCode = $('manualCode');
  if (manualCode) manualCode.textContent = d.manual_code || '—';
}

async function copyManualCode() {
  const code = $('manualCode')?.textContent;
  if (!code || code === '—') return toast('Generate today’s QR first.');
  try {
    await navigator.clipboard.writeText(code);
    toast('Backup code copied.');
  } catch {
    toast(`Backup code: ${code}`);
  }
}

function showFullscreen() {
  if (lastQr) {
    const fsQr = $('fsQr');
    if (fsQr) fsQr.classList.remove('hidden');
  }
}

function hideFullscreen() {
  const fsQr = $('fsQr');
  if (fsQr) fsQr.classList.add('hidden');
}

async function refreshAttendance() {
  try {
    const attendanceDate = $('attendanceDate');
    const currentDate = getClientISTDate();
    if (attendanceDate && (!attendanceDate.value || attendanceDate.dataset.autoDate === attendanceDate.value)) {
      attendanceDate.value = currentDate;
      attendanceDate.dataset.autoDate = currentDate;
    }
    const params = new URLSearchParams({
      unit_id: currentUser?.unit_id || '',
      station_id: currentUser?.police_station_id || '',
      attendance_date: attendanceDate?.value || currentDate
    });
    const d = await api(`/api/office/attendance?${params}`);
    officeRows = d.records;
    animateNumber($('totalRegistered'), d.total_students);
    renderAttendance();
  } catch (e) {
    toast(e.message);
  }
}

function getClientISTDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.chips .chip').forEach(b => 
    b.classList.toggle('active', b.dataset.filter === f)
  );
  renderAttendance();
}

function renderAttendance() {
  const present = officeRows.filter(x => x.status === 'Present').length;
  const late = officeRows.filter(x => x.status === 'Late').length;
  const inside = officeRows.filter(x => x.status !== 'Absent' && !x.check_out).length;
  const out = officeRows.filter(x => x.status !== 'Absent' && x.check_out).length;
  const absent = officeRows.filter(x => x.status === 'Absent').length;

  animateNumber($('presentCount'), present);
  animateNumber($('lateCount'), late);
  animateNumber($('insideCount'), inside);
  animateNumber($('outCount'), out);
  animateNumber($('absentCount'), absent);

  const q = ($('searchInput')?.value || '').trim().toLowerCase();
  let rows = officeRows;

  if (currentFilter === 'present') rows = rows.filter(x => x.status === 'Present');
  else if (currentFilter === 'late') rows = rows.filter(x => x.status === 'Late');
  else if (currentFilter === 'absent') rows = rows.filter(x => x.status === 'Absent');
  else if (currentFilter === 'inside') rows = rows.filter(x => x.status !== 'Absent' && !x.check_out);
  else if (currentFilter === 'out') rows = rows.filter(x => x.status !== 'Absent' && x.check_out);

  if (q) rows = rows.filter(x => x.name.toLowerCase().includes(q));

  const attendanceRows = $('attendanceRows');
  if (attendanceRows) {
    attendanceRows.innerHTML = rows.length ? rows.map(x => `
      <tr>
        <td>${escapeHtml(x.attendance_date || '—')}</td>
        <td>${escapeHtml(x.name)}</td>
        <td>${escapeHtml(x.unit_name)}</td>
        <td>${escapeHtml(x.station_name)}</td>
        <td>${x.check_in ? fmtTime(x.check_in) : '—'}</td>
        <td><span class="badge ${x.status.toLowerCase()}">${escapeHtml(x.status)}</span></td>
        <td>${x.status === 'Absent' ? '—' : (x.check_out ? fmtTime(x.check_out) : 'Inside')}</td>
      </tr>
    `).join('') : '<tr><td colspan="7">No matching attendance records.</td></tr>';
  }
}

async function showOfficeStudents() {
  closeMenu();
  show('officeStudents');
  await loadOfficeStudents();
}

async function loadOfficeStudents() {
  try {
    const params = new URLSearchParams({
      unit_id: currentUser?.unit_id || '',
      station_id: currentUser?.police_station_id || ''
    });
    const d = await api(`/api/office/students?${params}`);
    const label = $('studentManageAssignment');
    if (label) label.textContent = `${currentUser?.unit_name || 'selected unit'} · ${currentUser?.station_name || 'selected station'}`;
    const rows = $('officeStudentsRows');
    if (!rows) return;
    rows.innerHTML = d.students.length ? d.students.map(student => `
      <tr>
        <td>${escapeHtml(student.full_name)}</td>
        <td>${escapeHtml(student.email || '—')}</td>
        <td>${student.created_at ? new Date(student.created_at).toLocaleDateString() : '—'}</td>
        <td><button class="dangerButton" onclick="removeOfficeStudent('${escapeHtml(student.auth_user_id)}')">Remove permanently</button></td>
      </tr>
    `).join('') : '<tr><td colspan="4">No registered students in this assignment.</td></tr>';
  } catch (e) {
    toast(e.message);
  }
}

async function removeOfficeStudent(studentId) {
  if (!window.confirm('Permanently remove this student? Their login and attendance history will be deleted.')) return;
  try {
    const params = new URLSearchParams({
      unit_id: currentUser?.unit_id || '',
      station_id: currentUser?.police_station_id || ''
    });
    await api(`/api/office/students/${encodeURIComponent(studentId)}?${params}`, { method: 'DELETE' });
    toast('Student was permanently removed.');
    await loadOfficeStudents();
    await refreshAttendance();
  } catch (e) {
    toast(e.message);
  }
}

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', initAuth);
window.onload = () => {
  const attendanceDate = $('attendanceDate');
  if (attendanceDate) {
    attendanceDate.value = getClientISTDate();
    attendanceDate.dataset.autoDate = attendanceDate.value;
  }
  loadUnits().catch(console.error);
};

// Global functions for onclick handlers
window.show = show;
window.toast = toast;
window.login = login;
window.register = register;
window.togglePassword = togglePassword;
window.closeMenu = closeMenu;
window.submitManualCode = submitManualCode;
window.copyManualCode = copyManualCode;
window.forgotPassword = forgotPassword;
window.loadUnits = loadUnits;
window.startScan = startScan;
window.stopScan = stopScan;
window.closeResult = closeResult;
window.exitStation = exitStation;
window.showFullscreen = showFullscreen;
window.hideFullscreen = hideFullscreen;
window.generateQR = generateQR;
window.regenerateQR = regenerateQR;
window.refreshAttendance = refreshAttendance;
window.setFilter = setFilter;
window.showOfficeStudents = showOfficeStudents;
window.loadOfficeStudents = loadOfficeStudents;
window.removeOfficeStudent = removeOfficeStudent;
window.loadStudent = loadStudent;
window.loadOffice = loadOffice;
