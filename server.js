/**
 * =====================================================================
 * StationTrack — Police Cybersecurity Internship Attendance System
 * Backend: Node.js + Express + Supabase (PostgreSQL + Auth + RLS)
 * 
 * - Supabase Authentication for students and single office account
 * - Row Level Security (RLS) enforcement and secure server role operations
 * - Day-valid QR verification with cryptographically secure HMAC-SHA256 tokens
 * - Anti-cheat unit and police station matching
 * - Strict server-side IST (Asia/Kolkata) timezone attendance evaluation:
 *     10:00 AM – 11:00 AM IST: Present
 *     After 11:00 AM IST: Late (No 5 PM cutoff; accepted all day)
 * - Single office account management with auto-provisioning
 * =====================================================================
 */

require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');

// ============================================================
// CONSTANTS
// ============================================================
const IST = 'Asia/Kolkata';
const PRESENT_CUTOFF_MINUTES = 11 * 60; // 11:00 AM IST
const HISTORY_LIMIT = 60; // Max days of history returned
const OFFICE_ROLE = 'office';
const STUDENT_ROLE = 'student';
const DEFAULT_OFFICE_UNIT = 'DCP Zone 3';

// ============================================================
// ENVIRONMENT & CREDENTIALS
// ============================================================
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const OFFICE_EMAIL = process.env.OFFICE_EMAIL || (IS_PRODUCTION ? '' : 'office@stationtrack.local');
const OFFICE_PASSWORD = process.env.OFFICE_PASSWORD || (IS_PRODUCTION ? '' : 'office123');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ WARNING: Supabase URL or Anon Key missing in environment. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}
if (IS_PRODUCTION && (!SUPABASE_SERVICE_KEY || !OFFICE_EMAIL || !OFFICE_PASSWORD)) {
  console.warn('⚠️ WARNING: Production requires SUPABASE_SERVICE_ROLE_KEY, OFFICE_EMAIL, and OFFICE_PASSWORD.');
}

// ============================================================
// SUPABASE CLIENTS
// ============================================================
// Anon client - unprivileged operations
const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_ANON_KEY || 'placeholder');

// Service client - privileged backend operations (bypasses RLS)
let supabaseAdmin = null;
if (SUPABASE_SERVICE_KEY && SUPABASE_URL) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// Shortcut to use the admin client if available, else anon
const dbAdmin = () => supabaseAdmin || supabase;

const app = express();

function getConfigurationStatus() {
  return {
    supabase_url_configured: Boolean(SUPABASE_URL),
    supabase_anon_key_configured: Boolean(SUPABASE_ANON_KEY),
    supabase_service_key_configured: Boolean(SUPABASE_SERVICE_KEY),
    office_email_configured: Boolean(OFFICE_EMAIL),
    office_password_configured: Boolean(OFFICE_PASSWORD),
    production_ready: Boolean(
      SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      SUPABASE_SERVICE_KEY &&
      OFFICE_EMAIL &&
      OFFICE_PASSWORD
    )
  };
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co; " +
    "frame-ancestors 'none'"
  );
  next();
});

// Serve index.html with injected Supabase credentials
app.get('/', (req, res) => {
  const fs = require('fs');
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(404).send('Not Found');
  }
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Inject public Supabase credentials into window object (never service role key!)
  const injectScript = `
    <script>
      window.VITE_SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
      window.VITE_SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};
    </script>`;
  
  html = html.replace('</head>', injectScript + '</head>');
  res.type('text/html').send(html);
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function clean(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(v));
}

// Get current date in Asia/Kolkata (YYYY-MM-DD)
function getISTDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

function isValidAttendanceDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

// Attendance Status: 10:00 AM – 11:00 AM IST is Present; After 11:00 AM is Late.
// No 5 PM cutoff: accepted all day.
function attendanceStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour').value);
  const m = Number(parts.find(p => p.type === 'minute').value);
  const totalMinutes = h * 60 + m;
  return totalMinutes <= PRESENT_CUTOFF_MINUTES ? 'present' : 'late';
}

// Generate secure day-valid HMAC token
function computeQrToken(officeUserId, qrSecret, qrDate, generation) {
  return crypto.createHmac('sha256', qrSecret)
    .update(`${officeUserId}:${qrDate}:${generation}`)
    .digest('hex');
}

function manualCodeForToken(token) {
  return clean(token).slice(0, 10).toUpperCase();
}

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

async function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  try {
    const client = dbAdmin();
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired authorization token' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Authentication verification failed' });
  }
}

function requireRole(role) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const client = dbAdmin();
      const { data: profile, error } = await client
        .from('profiles')
        .select('*')
        .eq('auth_user_id', req.user.id)
        .single();

      if (error || !profile || profile.role !== role) {
        return res.status(403).json({ error: 'ACCESS DENIED: Insufficient permissions' });
      }

      req.profile = profile;
      next();
    } catch (e) {
      return res.status(403).json({ error: 'Role authorization failed' });
    }
  };
}

// ============================================================
// PUBLIC & HEALTH ENDPOINTS
// ============================================================

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const configuration = getConfigurationStatus();
  if (!configuration.production_ready && IS_PRODUCTION) {
    return res.status(503).json({
      system: 'misconfigured',
      database: 'unavailable',
      configuration,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const { error } = await dbAdmin().from('units').select('id').limit(1);
    if (error) throw error;
    res.json({
      system: 'secure',
      database: 'online',
      configuration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('GET /api/health error:', error);
    res.status(503).json({
      system: 'degraded',
      database: 'offline',
      configuration,
      timestamp: new Date().toISOString()
    });
  }
});

// Config endpoint: Never exposes service-role key
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    configuration: getConfigurationStatus()
  });
});

// Get official police units and stations
async function getUnitsAndStations() {
  const client = dbAdmin();
  const [{ data: units, error: uErr }, { data: stations, error: sErr }] = await Promise.all([
    client.from('units').select('id, name').order('name'),
    client.from('police_stations').select('id, name, unit_id').order('name')
  ]);

  if (uErr) throw uErr;
  if (sErr) throw sErr;

  const unitMap = new Map((units || []).map(u => [u.id, u.name]));
  return (stations || []).map(st => ({
    unit_id: st.unit_id,
    unit_name: unitMap.get(st.unit_id) || '',
    station_id: st.id,
    station_name: st.name,
    zone_id: st.unit_id,
    zone_name: unitMap.get(st.unit_id) || ''
  }));
}

async function resolveOfficeAssignment(client, profile, input = {}) {
  const unitId = clean(input.unit_id) || profile.unit_id;
  const stationId = clean(input.station_id) || profile.police_station_id;
  if (!unitId || !stationId) {
    throw new Error('Office zone/unit and police station are required');
  }

  const [{ data: unit, error: unitError }, { data: station, error: stationError }] = await Promise.all([
    client.from('units').select('id, name').eq('id', unitId).maybeSingle(),
    client.from('police_stations').select('id, name, unit_id').eq('id', stationId).eq('unit_id', unitId).maybeSingle()
  ]);
  if (unitError) throw unitError;
  if (stationError) throw stationError;
  if (!unit || !station) {
    throw new Error('Invalid office zone/unit or police station');
  }

  return {
    unit_id: unit.id,
    unit_name: unit.name,
    police_station_id: station.id,
    station_name: station.name
  };
}

app.get('/api/units', async (req, res) => {
  try {
    const list = await getUnitsAndStations();
    res.json(list);
  } catch (error) {
    console.error('GET /api/units error:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// Alias for test suite / compatibility
app.get('/api/zones', async (req, res) => {
  try {
    const list = await getUnitsAndStations();
    res.json({ data: list });
  } catch (error) {
    console.error('GET /api/zones error:', error);
    res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

// ============================================================
// AUTHENTICATION ENDPOINTS
// ============================================================

// Student Registration
const handleRegister = async (req, res) => {
  try {
    const { full_name, email, password, student_id } = req.body;
    const unit_id = req.body.unit_id || req.body.zone_id;

    if (!full_name || !email || !password || !unit_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Registration is unavailable until the server service key is configured' });
    }

    const client = supabaseAdmin;

    // Verify unit exists
    const { data: unit, error: uErr } = await client
      .from('units').select('id, name').eq('id', unit_id).single();
    if (uErr || !unit) {
      return res.status(400).json({ error: 'Invalid zone/unit selected' });
    }

    let station;
    if (req.body.station_id) {
      const { data: sCustom } = await client
        .from('police_stations').select('id, name').eq('id', req.body.station_id).eq('unit_id', unit_id).maybeSingle();
      if (sCustom) station = sCustom;
    }
    if (!station) {
      const { data: sDefault, error: sErr } = await client
        .from('police_stations').select('id, name').eq('unit_id', unit_id).order('name').limit(1).maybeSingle();
      if (sErr || !sDefault) {
        return res.status(400).json({ error: 'Invalid police station selected' });
      }
      station = sDefault;
    }

    const normalizedEmail = clean(email).toLowerCase();

    // Create user in Supabase Auth via Admin client
    let user;
    if (supabaseAdmin) {
      const { data: createdUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: clean(password),
        email_confirm: true,
        user_metadata: { full_name: clean(full_name) }
      });

      if (signUpError) {
        if (signUpError.code === 'email_exists' || signUpError.message?.includes('already registered')) {
          return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
        }
        return res.status(400).json({ error: signUpError.message });
      }
      user = createdUser?.user;
    }

    if (!user) {
      throw new Error('Supabase did not return a user for registration');
    }

    const finalStudentId = (student_id && String(student_id).trim()) 
      ? clean(String(student_id)).toUpperCase() 
      : `ST-${user.id.slice(0, 8).toUpperCase()}`;

    // Create profile with permanently locked unit & station
    const { error: profileError } = await client
      .from('profiles')
      .insert({
        auth_user_id: user.id,
        student_id: finalStudentId,
        full_name: clean(full_name),
        email: normalizedEmail,
        role: STUDENT_ROLE,
        unit_id: unit.id,
        police_station_id: station.id
      });

    if (profileError) {
      if (profileError.code === '23505') {
        return res.status(409).json({ error: 'An account with this email or student ID already exists. Please log in.' });
      }
      throw profileError;
    }

    res.status(201).json({ 
      message: 'Registration successful. Account created with permanent assignment.',
      student_id: finalStudentId,
      unit_id: unit.id,
      station_id: station.id
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
};

app.post('/api/auth/register', handleRegister);
app.post('/api/register', handleRegister);

// Student / Office Login
const handleLogin = async (req, res) => {
  try {
    let { email, password, role } = req.body;
    role = role || (req.body.username === 'office' ? OFFICE_ROLE : STUDENT_ROLE);

    if (!email && req.body.username) {
      email = req.body.username;
    }
    if (!email && req.body.student_id) {
      email = req.body.student_id;
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email/Student ID and password are required' });
    }

    email = clean(email);
    password = clean(password);

    const client = dbAdmin();

    // If identifier is not an email (e.g. Student ID or username), resolve it via profiles
    if (!isValidEmail(email)) {
      const { data: foundProfile } = await client
        .from('profiles')
        .select('email')
        .or(`student_id.eq.${email},email.eq.${email}`)
        .maybeSingle();

      if (foundProfile && foundProfile.email) {
        email = foundProfile.email;
      } else if (email.toLowerCase() === 'office') {
        email = OFFICE_EMAIL;
      } else {
        return res.status(401).json({ error: 'AUTHENTICATION FAILED: Check your credentials and try again.' });
      }
    }

    // Authenticate with Supabase Auth
    const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !session) {
      return res.status(401).json({ error: 'AUTHENTICATION FAILED: Check your credentials and try again.' });
    }

    // Fetch and verify profile role
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .single();

    if (profileError || !profile || (role && profile.role !== role)) {
      return res.status(401).json({ error: 'ACCESS DENIED: Account unauthorized for this portal' });
    }

    // Office staff choose the zone/station that this login session controls.
    // The selected assignment is carried to QR and monitor requests and is
    // independently validated on every protected endpoint.
    let assignment;
    if (profile.role === OFFICE_ROLE) {
      try {
        assignment = await resolveOfficeAssignment(client, profile, {
          unit_id: req.body.unit_id,
          station_id: req.body.station_id
        });
      } catch (assignmentError) {
        return res.status(400).json({ error: assignmentError.message });
      }
    } else {
      assignment = {
        unit_id: profile.unit_id,
        police_station_id: profile.police_station_id
      };
    }

    // Fetch unit and station names for user display
    const [{ data: unit }, { data: station }] = await Promise.all([
      assignment.unit_id ? client.from('units').select('name').eq('id', assignment.unit_id).maybeSingle() : Promise.resolve({ data: null }),
      assignment.police_station_id ? client.from('police_stations').select('name').eq('id', assignment.police_station_id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: {
        id: profile.auth_user_id,
        name: profile.full_name,
        email: profile.email,
        role: profile.role,
        student_id: profile.student_id,
        unit_id: assignment.unit_id,
        unit_name: unit?.name || '',
        police_station_id: assignment.police_station_id,
        station_name: station?.name || ''
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed due to an unexpected error' });
  }
};

app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = clean(req.body?.email).toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${req.protocol}://${req.get('host')}/`
  });
  if (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Unable to process password reset' });
  }
  res.json({ message: 'Password reset request processed' });
});

// ============================================================
// PROTECTED USER ENDPOINTS
// ============================================================

// Get current user profile
app.get('/api/me', verifyAuth, async (req, res) => {
  try {
    const client = dbAdmin();
    const { data: profile, error } = await client
      .from('profiles')
      .select('*')
      .eq('auth_user_id', req.user.id)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const [{ data: unit }, { data: station }] = await Promise.all([
      profile.unit_id ? client.from('units').select('name').eq('id', profile.unit_id).maybeSingle() : Promise.resolve({ data: null }),
      profile.police_station_id ? client.from('police_stations').select('name').eq('id', profile.police_station_id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    res.json({
      user: {
        id: profile.auth_user_id,
        name: profile.full_name,
        email: profile.email,
        role: profile.role,
        student_id: profile.student_id,
        unit_id: profile.unit_id,
        unit_name: unit?.name || '',
        police_station_id: profile.police_station_id,
        station_name: station?.name || ''
      }
    });
  } catch (error) {
    console.error('GET /api/me error:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// ============================================================
// STUDENT ENDPOINTS
// ============================================================

// Get student's today attendance
app.get('/api/student/today', verifyAuth, async (req, res) => {
  try {
    const today = getISTDate();
    const client = dbAdmin();
    const { data: attendance, error } = await client
      .from('attendance')
      .select('*')
      .eq('student_id', req.user.id)
      .eq('attendance_date', today)
      .maybeSingle();

    if (error) throw error;
    res.json(attendance || null);
  } catch (error) {
    console.error('GET /api/student/today error:', error);
    res.status(500).json({ error: 'Failed to fetch today attendance' });
  }
});

// Get student's attendance history (up to 60 days)
app.get('/api/student/history', verifyAuth, async (req, res) => {
  try {
    const client = dbAdmin();
    const { data: history, error } = await client
      .from('attendance')
      .select('*')
      .eq('student_id', req.user.id)
      .order('attendance_date', { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) throw error;
    res.json(history || []);
  } catch (error) {
    console.error('GET /api/student/history error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

// Mark student attendance via scanned QR
const handleMarkAttendance = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'VERIFICATION FAILED: QR token is required' });
    }

    const client = dbAdmin();

    // 1. Verify student profile
    const { data: profile, error: profileErr } = await client
      .from('profiles')
      .select('*')
      .eq('auth_user_id', req.user.id)
      .single();

    if (profileErr || !profile || profile.role !== STUDENT_ROLE) {
      return res.status(403).json({ error: 'ACCESS DENIED: Only students can mark attendance' });
    }

    const selectedDate = clean(req.query.attendance_date) || getISTDate();
    if (!isValidAttendanceDate(selectedDate)) {
      return res.status(400).json({ error: 'Invalid attendance date. Use YYYY-MM-DD.' });
    }

    // 2. Validate token (must exist, be active, match today's IST date)
    const { data: qrRecord, error: qrErr } = await client
      .from('daily_qr_tokens')
      .select('*')
      .eq('token', clean(token))
      .eq('qr_date', today)
      .eq('active', true)
      .maybeSingle();

    if (qrErr || !qrRecord) {
      return res.status(400).json({ error: 'VERIFICATION FAILED: QR code is invalid or expired.' });
    }

    // 3. Anti-cheat: verify student's permanent unit and station match the QR's office assignment
    if (profile.unit_id !== qrRecord.unit_id || profile.police_station_id !== qrRecord.police_station_id) {
      return res.status(400).json({ error: 'ATTENDANCE REJECTED: QR verification is not valid for your assigned station.' });
    }

    // 4. Duplicate prevention
    const { data: existingAtt } = await client
      .from('attendance')
      .select('id')
      .eq('student_id', req.user.id)
      .eq('attendance_date', selectedDate)
      .maybeSingle();

    if (existingAtt) {
      return res.status(409).json({ error: 'ALREADY MARKED: Attendance has already been recorded today.' });
    }

    // 5. Server determines check-in time and status strictly by Asia/Kolkata
    const now = new Date();
    const status = attendanceStatus(now);

    const { data: attendance, error: insErr } = await client
      .from('attendance')
      .insert({
        student_id: req.user.id,
        unit_id: profile.unit_id,
        police_station_id: profile.police_station_id,
        qr_token_id: qrRecord.id,
        attendance_date: today,
        check_in: now.toISOString(),
        status: status
      })
      .select()
      .single();

    if (insErr) {
      if (insErr.code === '23505') {
        return res.status(409).json({ error: 'ALREADY MARKED: Attendance has already been recorded today.' });
      }
      throw insErr;
    }

    res.json({
      name: profile.full_name,
      student_id: profile.student_id,
      check_in: attendance.check_in,
      status: attendance.status.charAt(0).toUpperCase() + attendance.status.slice(1),
      attendance
    });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ error: error.message || 'Attendance verification failed' });
  }
};

app.post('/api/attendance/mark', verifyAuth, handleMarkAttendance);
app.post('/api/attendance/verify', verifyAuth, handleMarkAttendance);

app.post('/api/attendance/manual', verifyAuth, async (req, res) => {
  try {
    const code = clean(req.body?.code).toUpperCase();
    if (!code) return res.status(400).json({ error: 'MANUAL VERIFICATION FAILED: Code is required' });
    const client = dbAdmin();
    const { data: profile, error: profileErr } = await client
      .from('profiles').select('*').eq('auth_user_id', req.user.id).single();
    if (profileErr || !profile || profile.role !== STUDENT_ROLE) {
      return res.status(403).json({ error: 'ACCESS DENIED: Only students can mark attendance' });
    }
    const today = getISTDate();
    const { data: qrRecords, error: qrErr } = await client
      .from('daily_qr_tokens').select('*').eq('qr_date', today).eq('active', true);
    if (qrErr) throw qrErr;
    const qrRecord = (qrRecords || []).find(record =>
      manualCodeForToken(record.token) === code &&
      record.unit_id === profile.unit_id &&
      record.police_station_id === profile.police_station_id
    );
    if (!qrRecord) {
      return res.status(400).json({ error: 'MANUAL VERIFICATION FAILED: Code is invalid, expired, or not valid for your assigned station.' });
    }
    const { data: existingAtt } = await client
      .from('attendance').select('id').eq('student_id', req.user.id).eq('attendance_date', today).maybeSingle();
    if (existingAtt) return res.status(409).json({ error: 'ALREADY MARKED: Attendance has already been recorded today.' });
    const now = new Date();
    const { data: attendance, error: insErr } = await client.from('attendance').insert({
      student_id: req.user.id,
      unit_id: profile.unit_id,
      police_station_id: profile.police_station_id,
      qr_token_id: qrRecord.id,
      attendance_date: today,
      check_in: now.toISOString(),
      status: attendanceStatus(now)
    }).select().single();
    if (insErr) {
      if (insErr.code === '23505') return res.status(409).json({ error: 'ALREADY MARKED: Attendance has already been recorded today.' });
      throw insErr;
    }
    res.json({
      name: profile.full_name,
      student_id: profile.student_id,
      check_in: attendance.check_in,
      status: attendance.status.charAt(0).toUpperCase() + attendance.status.slice(1),
      attendance
    });
  } catch (error) {
    console.error('Manual attendance error:', error);
    res.status(500).json({ error: error.message || 'Manual attendance verification failed' });
  }
});

// Record checkout
app.post('/api/attendance/exit', verifyAuth, async (req, res) => {
  try {
    const today = getISTDate();
    const now = new Date();
    const client = dbAdmin();

    const { data: attendance, error: fetchError } = await client
      .from('attendance')
      .select('*')
      .eq('student_id', req.user.id)
      .eq('attendance_date', today)
      .maybeSingle();

    if (fetchError || !attendance) {
      return res.status(404).json({ error: 'No attendance record found for today' });
    }

    const { data: updated, error: updateError } = await client
      .from('attendance')
      .update({ check_out: now.toISOString() })
      .eq('id', attendance.id)
      .select()
      .single();

    if (updateError) throw updateError;
    res.json(updated);
  } catch (error) {
    console.error('POST /api/attendance/exit error:', error);
    res.status(500).json({ error: 'Failed to record exit' });
  }
});

// ============================================================
// OFFICE CONTROL CENTER ENDPOINTS
// ============================================================

// Generate or retrieve day-valid QR token (00:00:00 to 23:59:59 IST)
const handleOfficeQR = async (req, res) => {
  try {
    const client = dbAdmin();
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('*')
      .eq('auth_user_id', req.user.id)
      .single();
    if (profileError || !profile || profile.role !== OFFICE_ROLE) {
      return res.status(403).json({ error: 'Office profile not found' });
    }
    const assignment = await resolveOfficeAssignment(client, profile, req.body);

    const today = getISTDate();

    // Reuse existing active token for today if present
    let { data: qrRecord } = await client
      .from('daily_qr_tokens')
      .select('*')
      .eq('office_user_id', req.user.id)
      .eq('qr_date', today)
      .maybeSingle();

    const assignmentChanged = qrRecord && (
      qrRecord.unit_id !== assignment.unit_id ||
      qrRecord.police_station_id !== assignment.police_station_id
    );
    if (!qrRecord || assignmentChanged) {
      const qrSecret = crypto.randomBytes(32).toString('hex');
      const generation = assignmentChanged ? (qrRecord.generation || 1) + 1 : 1;
      const token = computeQrToken(req.user.id, qrSecret, today, generation);

      const query = assignmentChanged
        ? client.from('daily_qr_tokens').update({
            token, unit_id: assignment.unit_id, police_station_id: assignment.police_station_id,
            active: true, generation
          }).eq('id', qrRecord.id).select().single()
        : client.from('daily_qr_tokens').insert({
            token, office_user_id: req.user.id, unit_id: assignment.unit_id,
            police_station_id: assignment.police_station_id, qr_date: today, active: true, generation
          }).select().single();
      const { data: updatedRecord, error: recordError } = await query;
      if (recordError) throw recordError;
      qrRecord = updatedRecord;
    }

    const qrPayload = JSON.stringify({ token: qrRecord.token, date: today });
    const qrImage = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      width: 320,
      margin: 2,
      color: { dark: '#ffffff', light: '#060907' }
    });

    res.json({
      qr: qrImage,
      token: qrRecord.token,
      manual_code: manualCodeForToken(qrRecord.token),
      date: today,
      valid_until: '11:59 PM',
      generation: qrRecord.generation || 1
    });
  } catch (error) {
    console.error('Generate QR error:', error);
    res.status(500).json({ error: 'Failed to generate QR token' });
  }
};

app.post('/api/office/qr', verifyAuth, requireRole(OFFICE_ROLE), handleOfficeQR);
app.post('/api/officer/session', verifyAuth, requireRole(OFFICE_ROLE), handleOfficeQR);

// Regenerate today's QR (invalidates previous)
app.post('/api/office/qr/regenerate', verifyAuth, requireRole(OFFICE_ROLE), async (req, res) => {
  try {
    const client = dbAdmin();
    const today = getISTDate();
    const { data: profile, error: profileError } = await client
      .from('profiles').select('*').eq('auth_user_id', req.user.id).single();
    if (profileError || !profile) return res.status(403).json({ error: 'Office profile not found' });
    const assignment = await resolveOfficeAssignment(client, profile, req.body);

    const { data: qrRecord, error: fetchError } = await client
      .from('daily_qr_tokens')
      .select('*')
      .eq('office_user_id', req.user.id)
      .eq('qr_date', today)
      .maybeSingle();

    if (fetchError || !qrRecord) {
      return res.status(404).json({ error: 'No QR record found for today to regenerate' });
    }

    const newGeneration = (qrRecord.generation || 1) + 1;
    const qrSecret = crypto.randomBytes(32).toString('hex');
    const newToken = computeQrToken(req.user.id, qrSecret, today, newGeneration);

    const { data: updated, error: updateError } = await client
      .from('daily_qr_tokens')
      .update({
        token: newToken,
        generation: newGeneration,
        active: true,
        unit_id: assignment.unit_id,
        police_station_id: assignment.police_station_id
      })
      .eq('id', qrRecord.id)
      .select()
      .single();

    if (updateError) throw updateError;

    const qrPayload = JSON.stringify({ token: newToken, date: today });
    const qrImage = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      width: 320,
      margin: 2,
      color: { dark: '#ffffff', light: '#060907' }
    });

    res.json({
      qr: qrImage,
      token: newToken,
      manual_code: manualCodeForToken(newToken),
      date: today,
      valid_until: '11:59 PM',
      generation: newGeneration
    });
  } catch (error) {
    console.error('Regenerate QR error:', error);
    res.status(500).json({ error: 'Failed to regenerate QR token' });
  }
});

// Live Attendance Monitor for Office
const handleOfficeAttendance = async (req, res) => {
  try {
    const client = dbAdmin();
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('*')
      .eq('auth_user_id', req.user.id)
      .single();
    if (profileError || !profile) return res.status(403).json({ error: 'Office profile not found' });
    const assignment = await resolveOfficeAssignment(client, profile, req.query);

    const selectedDate = clean(req.query.attendance_date) || getISTDate();
    if (!isValidAttendanceDate(selectedDate)) {
      return res.status(400).json({ error: 'Invalid attendance date. Use YYYY-MM-DD.' });
    }

    // 1. Fetch unit & station names
    const [{ data: unit }, { data: station }] = await Promise.all([
      assignment.unit_id ? client.from('units').select('name').eq('id', assignment.unit_id).maybeSingle() : Promise.resolve({ data: null }),
      assignment.police_station_id ? client.from('police_stations').select('name').eq('id', assignment.police_station_id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    // 2. Fetch today's attendance for this office's assigned unit/station
    const { data: attendance, error: attErr } = await client
      .from('attendance')
      .select('*')
      .eq('unit_id', assignment.unit_id)
      .eq('police_station_id', assignment.police_station_id)
      .eq('attendance_date', selectedDate)
      .order('check_in', { ascending: false });

    if (attErr) throw attErr;

    // 3. Fetch registered students in this unit/station
    const { data: students, error: stuErr } = await client
      .from('profiles')
      .select('auth_user_id, full_name, student_id')
      .eq('unit_id', assignment.unit_id)
      .eq('police_station_id', assignment.police_station_id)
      .eq('role', STUDENT_ROLE);

    if (stuErr) throw stuErr;

    const studentMap = new Map((students || []).map(s => [s.auth_user_id, s]));

    // 4. Map records cleanly without broken PostgREST foreign key joins
    const records = (attendance || []).map(a => {
      const sp = studentMap.get(a.student_id);
      return {
        id: a.id,
        attendance_date: a.attendance_date,
        name: sp?.full_name || 'Cyber Intern',
        unit_name: unit?.name || '',
        station_name: station?.name || '',
        check_in: a.check_in,
        check_out: a.check_out,
        status: a.status === 'present' ? 'Present' : 'Late'
      };
    });

    res.json({
      records,
      total_students: (students || []).length,
      attendance_date: selectedDate
    });
  } catch (error) {
    console.error('Office attendance monitor error:', error);
    res.status(500).json({ error: 'Failed to fetch live attendance data' });
  }
};

app.get('/api/office/attendance', verifyAuth, requireRole(OFFICE_ROLE), handleOfficeAttendance);
app.get('/api/officer/attendance', verifyAuth, requireRole(OFFICE_ROLE), handleOfficeAttendance);

// System Status Indicators
app.get('/api/system/status', verifyAuth, async (req, res) => {
  try {
    const client = dbAdmin();
    const { error: dbError } = await client.from('units').select('id').limit(1);
    const databaseOk = !dbError;

    const today = getISTDate();
    let qrReadyToday = false;

    if (req.user) {
      const { data: profile } = await client
        .from('profiles')
        .select('*')
        .eq('auth_user_id', req.user.id)
        .single();
      const assignment = profile?.role === OFFICE_ROLE
        ? await resolveOfficeAssignment(client, profile, req.query)
        : {
            unit_id: profile?.unit_id,
            police_station_id: profile?.police_station_id
          };
      const { data: qr } = await client
        .from('daily_qr_tokens')
        .select('id')
        .eq('office_user_id', req.user.id)
        .eq('qr_date', today)
        .eq('unit_id', assignment.unit_id)
        .eq('police_station_id', assignment.police_station_id)
        .eq('active', true)
        .maybeSingle();
      qrReadyToday = !!qr;
    }

    res.json({
      database: databaseOk,
      attendance_service: true,
      qr_ready_today: qrReadyToday
    });
  } catch (error) {
    res.status(500).json({
      database: false,
      attendance_service: false,
      qr_ready_today: false
    });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// ============================================================
// AUTOMATIC OFFICE ACCOUNT PROVISIONING
// ============================================================
async function ensureOfficeAccount() {
  if (!supabaseAdmin || !OFFICE_EMAIL || !OFFICE_PASSWORD) return;
  try {
    const email = OFFICE_EMAIL;
    const password = OFFICE_PASSWORD;
    const unitName = DEFAULT_OFFICE_UNIT;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', OFFICE_ROLE)
      .maybeSingle();

    if (!profile) {
      console.log('Ensuring default single authorized office account exists in Supabase...');
      const { data: unit } = await supabaseAdmin.from('units').select('id, name').eq('name', unitName).maybeSingle();
      if (!unit) return;

      const { data: station } = await supabaseAdmin.from('police_stations').select('id, name').eq('unit_id', unit.id).limit(1).maybeSingle();
      if (!station) return;

      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      let authUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

      if (!authUser) {
        const { data: newUser } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role: 'office', full_name: 'Cybersecurity Internship Command Desk' }
        });
        authUser = newUser?.user;
      }

      if (authUser) {
        await supabaseAdmin.from('profiles').upsert({
          auth_user_id: authUser.id,
          full_name: 'Cybersecurity Internship Command Desk',
          email,
          role: 'office',
          unit_id: unit.id,
          police_station_id: station.id
        });
        console.log(`✓ Single office account provisioned: ${email} (${unit.name})`);
      }
    }
  } catch (err) {
    console.warn('Office auto-provisioning note:', err.message);
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// START SERVER
// ============================================================
let server = null;
if (!process.env.VERCEL) {
  server = app.listen(PORT, async () => {
    console.log('\n=====================================================================');
    console.log('✓ STATIONTRACK — CYBERSECURITY INTERNSHIP ATTENDANCE COMMAND CENTER');
    console.log(`✓ Server running at: http://localhost:${PORT}`);
    console.log(`✓ Supabase Endpoint: ${SUPABASE_URL}`);
    console.log('✓ Timezone Engine   : Asia/Kolkata (IST)');
    console.log('=====================================================================\n');

    await ensureOfficeAccount();
  });
}

module.exports = app;
