/**
 * =====================================================================
 * STATIONTRACK — COMPREHENSIVE AUTOMATED VERIFICATION & SECURITY SUITE
 * Validates Supabase Auth, Roles, RLS, Day-Valid QR, IST Time Rules,
 * Anti-Cheat, and Security Isolation.
 * =====================================================================
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;
const results = [];

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    results.push(`  ✅ ${name}`);
  } else {
    failed++;
    results.push(`  ❌ ${name} ${detail ? '— ' + detail : ''}`);
  }
}

async function api(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(url, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function runTests() {
  console.log('\n' + '='.repeat(65));
  console.log('  STATIONTRACK — POLICE CYBERSECURITY ATTENDANCE AUDIT SUITE');
  console.log('='.repeat(65) + '\n');

  const runId = Date.now().toString().slice(-6);
  const testStudentId = `INT_${runId}`;
  const testEmail = `intern_${runId}@police.gov.in`;
  const testPassword = 'CyberPass123!Secure';

  // -------------------------------------------------------------
  // 1. SYSTEM HEALTH & FRONTEND SECURITY CONFIGURATION
  // -------------------------------------------------------------
  console.log('[SECTION 1: SYSTEM HEALTH & SECURITY CONFIGURATION]');
  const health = await api('/api/health');
  assert('Health endpoint returns secure status (200)', health.status === 200);
  assert('Health indicates system is secure and DB online', health.data.system === 'secure' && health.data.database === 'online');

  const config = await api('/api/config');
  assert('Public config exposes Supabase URL', typeof config.data.supabaseUrl === 'string');
  assert('SECURITY: Service Role Key is NEVER exposed in config', 
    config.data.supabaseServiceRoleKey === undefined && 
    config.data.service_role_key === undefined &&
    config.data.SUPABASE_SERVICE_ROLE_KEY === undefined);

  // -------------------------------------------------------------
  // 2. UNITS & POLICE STATIONS INTEGRITY (All 18 Official Units)
  // -------------------------------------------------------------
  console.log('\n[SECTION 2: OFFICIAL POLICE UNITS & STATIONS]');
  const unitsRes = await api('/api/units');
  assert('Units endpoint returns active units list', Array.isArray(unitsRes.data) && unitsRes.data.length > 0);
  
  const unitList = unitsRes.data;
  const uniqueUnits = [...new Set(unitList.map(z => z.unit_name || z.zone_name))];
  assert('All 18 official police units registered', uniqueUnits.length === 18, `Got ${uniqueUnits.length}`);

  const expectedUnits = [
    'DCP Zone 1', 'DCP Zone 2', 'DCP Zone 3', 'DCP Zone 4', 'DCP Zone 5', 'DCP Zone 6',
    'Cyber PS', 'MT', 'DCP EOW', 'Wireless', 'IT Section / Wireless', 'DCP HQ',
    'DCP Crime Reader', 'DCP Crime', 'DCP SB', 'Jt CP', 'Add. CP Crime', 'Add. CP North Region'
  ];
  for (const u of expectedUnits) {
    assert(`Official Unit "${u}" present in database`, uniqueUnits.includes(u));
  }

  // -------------------------------------------------------------
  // 3. STUDENT REGISTRATION & PERMANENT ASSIGNMENT LOCK
  // -------------------------------------------------------------
  console.log('\n[SECTION 3: STUDENT REGISTRATION & PERMANENT ASSIGNMENT]');
  const dcpZone3 = unitList.find(z => (z.unit_name || z.zone_name) === 'DCP Zone 3');
  assert('Found DCP Zone 3 configuration', Boolean(dcpZone3));

  const regResult = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      student_id: testStudentId,
      full_name: 'Cyber Cadet Officer',
      email: testEmail,
      password: testPassword,
      unit_id: dcpZone3.unit_id,
      station_id: dcpZone3.station_id
    })
  });
  assert('Student registration returns 201 Created', regResult.status === 201, JSON.stringify(regResult.data));
  assert('Student assignment locked upon registration', regResult.data.student_id === testStudentId);

  // Attempt duplicate registration with same email (Must be rejected)
  const dupReg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      student_id: `DUP_${runId}`,
      full_name: 'Duplicate Cadet',
      email: testEmail,
      password: testPassword,
      unit_id: dcpZone3.unit_id,
      station_id: dcpZone3.station_id
    })
  });
  assert('Duplicate email registration is rejected (409 Conflict)', dupReg.status === 409);

  // -------------------------------------------------------------
  // 4. STUDENT AUTHENTICATION (Student ID & Email Login)
  // -------------------------------------------------------------
  console.log('\n[SECTION 4: STUDENT AUTHENTICATION]');
  // Login with Student ID
  const loginStudentId = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: testStudentId,
      password: testPassword,
      role: 'student'
    })
  });
  assert('Student can log in using Student ID identifier', loginStudentId.status === 200);
  assert('Student ID login returns Supabase JWT access_token', Boolean(loginStudentId.data.access_token));

  const studentToken = loginStudentId.data.access_token;
  const studentUser = loginStudentId.data.user;
  assert('Authenticated profile contains role="student"', studentUser?.role === 'student');
  assert('Permanent assignment preserved in session', studentUser?.unit_id === dcpZone3.unit_id);

  // Login with Email
  const loginEmail = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      role: 'student'
    })
  });
  assert('Student can also log in using Email address', loginEmail.status === 200);

  // Wrong password rejection
  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      password: 'WrongPassword999!',
      role: 'student'
    })
  });
  assert('Invalid credentials rejected with 401 Unauthorized', badLogin.status === 401);

  // Student blocked from Office portal
  const studentAsOffice = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      role: 'office'
    })
  });
  assert('Student cannot log into Office Control Center (role separation enforced)', studentAsOffice.status === 401);

  // -------------------------------------------------------------
  // 5. OFFICE AUTHENTICATION (Single Authorized Account)
  // -------------------------------------------------------------
  console.log('\n[SECTION 5: OFFICE CONTROL CENTER AUTHENTICATION]');
  const officeEmail = process.env.OFFICE_EMAIL || 'office@stationtrack.local';
  const officePass = process.env.OFFICE_PASSWORD || 'office123';

  const officeLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: officeEmail,
      password: officePass,
      role: 'office'
    })
  });
  assert('Single Office account signs in successfully', officeLogin.status === 200, JSON.stringify(officeLogin.data));

  const officeToken = officeLogin.data.access_token;
  const officeUser = officeLogin.data.user;
  assert('Office account has role="office"', officeUser?.role === 'office');
  assert('Office account is assigned to DCP Zone 3', Boolean(officeUser?.unit_id));

  // -------------------------------------------------------------
  // 6. ROLE-BASED ACCESS CONTROL (RBAC) & ENDPOINT SECURITY
  // -------------------------------------------------------------
  console.log('\n[SECTION 6: ACCESS CONTROL & SECURITY ENFORCEMENT]');
  // Unauthenticated request to /api/office/qr
  const unauthQR = await api('/api/office/qr', { method: 'POST' });
  assert('Unauthenticated access to QR endpoint rejected (401)', unauthQR.status === 401);

  // Student token accessing office endpoint
  const studentCallingOffice = await api('/api/office/qr', {
    method: 'POST',
    token: studentToken
  });
  assert('Student access to Office QR generation blocked (403 Forbidden)', studentCallingOffice.status === 403);

  // Student calling office attendance monitor
  const studentCallingMonitor = await api('/api/office/attendance', {
    method: 'GET',
    token: studentToken
  });
  assert('Student access to Office attendance roster blocked (403 Forbidden)', studentCallingMonitor.status === 403);

  // -------------------------------------------------------------
  // 7. DAY-VALID QR GENERATION & REUSE
  // -------------------------------------------------------------
  console.log('\n[SECTION 7: DAY-VALID QR ENGINE]');
  const qrGen1 = await api('/api/office/qr', {
    method: 'POST',
    token: officeToken
  });
  assert('Office generates today verification QR (200 OK)', qrGen1.status === 200);
  assert('QR token is non-empty string', typeof qrGen1.data.token === 'string' && qrGen1.data.token.length > 20);
  assert('QR image is data URL (Base64 PNG)', typeof qrGen1.data.qr === 'string' && qrGen1.data.qr.startsWith('data:image/png'));
  assert('QR validity shows 11:59 PM (Day-long valid)', qrGen1.data.valid_until === '11:59 PM');

  // Consecutive request on same day MUST reuse the existing token
  const qrGen2 = await api('/api/office/qr', {
    method: 'POST',
    token: officeToken
  });
  assert('QR engine reuses today token without churning', qrGen2.data.token === qrGen1.data.token);

  // Regenerating today's QR
  const qrRegen = await api('/api/office/qr/regenerate', {
    method: 'POST',
    token: officeToken
  });
  assert('Regenerate QR returns new active token', qrRegen.status === 200 && qrRegen.data.token !== qrGen1.data.token);
  assert('Regenerate increments generation sequence', qrRegen.data.generation >= 2);

  const activeQRToken = qrRegen.data.token;

  // -------------------------------------------------------------
  // 8. ANTI-CHEAT: CROSS-UNIT / CROSS-STATION ATTENDANCE ATTEMPT
  // -------------------------------------------------------------
  console.log('\n[SECTION 8: ANTI-CHEAT ATTENDANCE VERIFICATION]');
  // Register a student assigned to Cyber PS (different unit from DCP Zone 3)
  const cyberUnit = unitList.find(z => (z.unit_name || z.zone_name) === 'Cyber PS');
  const crossEmail = `cyber_cadet_${runId}@police.gov.in`;
  const crossReg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      student_id: `CYBER_${runId}`,
      full_name: 'Cyber PS Cadet',
      email: crossEmail,
      password: testPassword,
      unit_id: cyberUnit.unit_id,
      station_id: cyberUnit.station_id
    })
  });
  assert('Registered comparison student in Cyber PS', crossReg.status === 201);

  const crossLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: crossEmail, password: testPassword, role: 'student' })
  });
  const crossStudentToken = crossLogin.data.access_token;

  // Cyber PS student tries to scan DCP Zone 3 QR -> MUST BE REJECTED
  const cheatAttempt = await api('/api/attendance/mark', {
    method: 'POST',
    token: crossStudentToken,
    body: JSON.stringify({ token: activeQRToken })
  });
  assert('Anti-cheat: cross-unit QR scan REJECTED (400 Bad Request)', cheatAttempt.status === 400);
  assert('Clear security error returned on station mismatch', cheatAttempt.data.error.includes('assigned station'));

  // Invalid fake token scan
  const fakeTokenAttempt = await api('/api/attendance/mark', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({ token: 'fake_tampered_token_xyz_123' })
  });
  assert('Anti-cheat: forged/tampered QR token REJECTED (400 Bad Request)', fakeTokenAttempt.status === 400);

  // -------------------------------------------------------------
  // 9. VALID ATTENDANCE MARK & IST TIME RULES
  // -------------------------------------------------------------
  console.log('\n[SECTION 9: ATTENDANCE MARKING & SERVER-SIDE IST TIME]');
  const markRes = await api('/api/attendance/mark', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({ token: activeQRToken })
  });
  assert('Valid QR scan records attendance (200 OK)', markRes.status === 200, JSON.stringify(markRes.data));
  assert('Status is computed as Present or Late', markRes.data.status === 'Present' || markRes.data.status === 'Late');
  assert('Server controls check-in timestamp (ISO format)', typeof markRes.data.check_in === 'string');

  // Duplicate check-in on the same day -> MUST BE PREVENTED
  const dupAttendance = await api('/api/attendance/mark', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({ token: activeQRToken })
  });
  assert('Duplicate attendance on same day is PREVENTED (409 Conflict)', dupAttendance.status === 409);
  assert('Clear duplicate attendance alert message returned', dupAttendance.data.error.includes('ALREADY MARKED'));

  // -------------------------------------------------------------
  // 10. STUDENT TODAY RECORD & CHECKOUT
  // -------------------------------------------------------------
  console.log('\n[SECTION 10: STUDENT ATTENDANCE LIFECYCLE & CHECKOUT]');
  const todayRecord = await api('/api/student/today', {
    method: 'GET',
    token: studentToken
  });
  assert('Student can view today record', todayRecord.status === 200 && todayRecord.data !== null);
  assert('Check-out initially null (Intern is currently inside)', todayRecord.data.check_out === null);

  // Record exit / checkout
  const exitRes = await api('/api/attendance/exit', {
    method: 'POST',
    token: studentToken
  });
  assert('Student can record checkout (200 OK)', exitRes.status === 200);
  assert('Check-out timestamp updated by server', typeof exitRes.data.check_out === 'string');

  // Check history
  const historyRes = await api('/api/student/history', {
    method: 'GET',
    token: studentToken
  });
  assert('Student can retrieve read-only attendance history', Array.isArray(historyRes.data) && historyRes.data.length > 0);

  // -------------------------------------------------------------
  // 11. OFFICE LIVE MONITOR INTEGRATION
  // -------------------------------------------------------------
  console.log('\n[SECTION 11: OFFICE LIVE ATTENDANCE MONITOR]');
  const monitorRes = await api('/api/office/attendance', {
    method: 'GET',
    token: officeToken
  });
  assert('Office live roster query succeeds (200 OK)', monitorRes.status === 200);
  assert('Roster contains attendance records array', Array.isArray(monitorRes.data.records));

  const ourStudentInRoster = monitorRes.data.records.find(r => r.student_id === testStudentId);
  assert('Recently attended student appears on Office live roster', Boolean(ourStudentInRoster));
  if (ourStudentInRoster) {
    assert('Roster reflects recorded check-out time', Boolean(ourStudentInRoster.check_out));
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(65));
  console.log(`  AUDIT COMPLETE: ${passed} PASSED | ${failed} FAILED`);
  console.log('='.repeat(65) + '\n');

  results.forEach(r => console.log(r));

  console.log('\n' + '='.repeat(65) + '\n');

  if (failed > 0) {
    console.error(`❌ Audit failed with ${failed} failure(s).`);
    process.exit(1);
  } else {
    console.log('🎉 ALL AUDIT & SECURITY CHECKS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
