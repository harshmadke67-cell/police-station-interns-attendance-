# StationTrack Supabase Integration - Testing & Deployment Guide

## Overview

This is StationTrack v4.0.0 — completely rebuilt with Supabase (PostgreSQL + Auth + RLS) replacing the old SQLite+session-based authentication. All functionality is preserved while adding professional-grade security and scalability.

## What Changed from v3.0.0

| Aspect | Old (v3.0.0) | New (v4.0.0) |
|--------|--------------|--------------|
| Database | SQLite (local file) | Supabase PostgreSQL (cloud) |
| Auth | Custom password hashing | Supabase Auth |
| Sessions | Express session middleware | Supabase JWT tokens |
| QR Tokens | Stored in database | HMAC-derived (not stored) |
| Security | Session cookies | Bearer tokens + RLS policies |
| Admin UI | Visible login form | No frontend admin interface |
| Office Account | Multiple supported | Single account only |
| Passwords | bcryptjs hashing | Supabase Auth (industry standard) |

## Pre-Deployment Checklist

- [ ] Node.js 18+ installed
- [ ] Supabase account created (free tier OK)
- [ ] `.env` file created with real Supabase credentials
- [ ] All three SQL migrations applied
- [ ] Office account created in Supabase
- [ ] npm dependencies installed
- [ ] Server starts without errors
- [ ] Frontend loads with injected credentials

## Step-by-Step Setup

### 1. Prerequisites

```bash
node --version  # Should be v18+
npm --version
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up / Log in
3. Click "New Project"
4. Name: `stationtrack`
5. Database password: Generate strong password
6. Region: Choose nearest to your police department
7. Pricing: Free tier is fine
8. Wait for initialization (~2 minutes)

### 3. Get Supabase Credentials

In Supabase dashboard:
- **Settings → API**
- Copy "Project URL" (looks like `https://xxxxx.supabase.co`)
- Copy "anon public" key
- Copy "service_role secret" key (keep private!)

### 4. Configure Environment

```bash
cd police_station_attendance
cp .env.example .env
```

Edit `.env`:

```bash
VITE_SUPABASE_URL=https://your-actual-url.supabase.co
VITE_SUPABASE_ANON_KEY=your_actual_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key
PORT=3000
NODE_ENV=development
OFFICE_EMAIL=office@stationtrack.local
OFFICE_PASSWORD=your_secure_password_here
```

**CRITICAL: Never commit this file.**

### 5. Run Database Migrations

In Supabase dashboard, go to **SQL Editor**:

**Migration 1:** Copy entire contents of `supabase/migrations/001_initial_schema.sql` into a new query, click Run
**Migration 2:** Copy entire contents of `supabase/migrations/002_rls_policies.sql` into a new query, click Run
**Migration 3:** Copy entire contents of `supabase/migrations/003_seed_units.sql` into a new query, click Run

Verify all ran without errors. You should see 18 units pre-seeded.

### 6. Create Office Account

In Supabase dashboard, go to **Authentication → Users**:

1. Click "Create User"
2. Email: `office@stationtrack.local`
3. Password: (Use value from `.env` OFFICE_PASSWORD)
4. Check "Auto confirm user"
5. Click "Create User"
6. Copy the auth user ID (will be a UUID)

Then in **SQL Editor**, run:

```sql
INSERT INTO public.profiles (
  auth_user_id,
  full_name,
  email,
  role,
  unit_id,
  police_station_id
) VALUES (
  'YOUR_OFFICE_AUTH_USER_ID_HERE',  -- <-- Replace with the UUID you just copied
  'Office Control Center',
  'office@stationtrack.local',
  'office',
  (SELECT id FROM public.units WHERE name = 'DCP Zone 3' LIMIT 1),
  (SELECT id FROM public.police_stations WHERE name = 'DCP Zone 3' LIMIT 1)
);
```

Replace `YOUR_OFFICE_AUTH_USER_ID_HERE` with the actual UUID from the user you just created.

### 7. Install Dependencies

```bash
npm install
```

This will:
- Download @supabase/supabase-js (Supabase client)
- Download express (web server)
- Download qrcode (QR generation)
- Download cors (cross-origin support)
- Download dotenv (environment variable loading)

### 8. Start the Application

```bash
npm start
```

Output should show:
```
StationTrack server running on http://localhost:3000
```

### 9. Test in Browser

Open `http://localhost:3000`

You should see:
- Home page with three buttons:
  - "Student Portal" ✓
  - "Office Control Center" ✓
  - (NO "System administrator" link)
- StationTrack header with clock showing IST time
- Dark cybersecurity theme

## Testing Scenarios

### Scenario 1: Student Registration & Login

**Steps:**
1. Click "Student Portal"
2. Click "Register once"
3. Fill in:
   - Student ID: `INT001`
   - Full Name: `John Intern`
   - Email: `john@example.com`
   - Password: `SecurePass123!`
   - Unit: `DCP Zone 3`
   - Station: `DCP Zone 3`
4. Submit form

**Expected:**
- ✓ Success message: "Registration complete! Please verify your email and log in."
- ✓ Redirects to student login screen
- ✓ Supabase Auth user created in **Authentication → Users**
- ✓ Profile record created in database with role='student'

**Then: Login**
1. Email: `john@example.com`
2. Password: `SecurePass123!`
3. Submit

**Expected:**
- ✓ Redirects to Student Dashboard
- ✓ Shows student name and locked assignment 🔒
- ✓ Shows "Scan Attendance QR" button
- ✓ Shows "Today's record" section with no attendance yet

### Scenario 2: Office Login & QR Generation

**Steps:**
1. Click "Office Control Center"
2. Enter:
   - Email: `office@stationtrack.local`
   - Password: (from your `.env`)
3. Submit

**Expected:**
- ✓ Redirects to Office Dashboard
- ✓ Shows "TODAY'S ATTENDANCE VERIFICATION"
- ✓ Shows QR code image (valid all day)
- ✓ Shows system status pills (Database / QR Verification / etc.)
- ✓ Shows "LIVE ATTENDANCE MONITOR" with empty table

### Scenario 3: QR Scanning Workflow

**Setup:** Two browser windows/devices
- Browser 1: Office login (displays QR)
- Browser 2: Student login (scans QR)

**Steps:**
1. Office (Browser 1):
   - Go to Office Control Center
   - QR code is visible and valid
   - Click "DISPLAY FULLSCREEN" to project it

2. Student (Browser 2):
   - Go to Student Dashboard
   - Click "Scan Attendance QR"
   - Camera permission prompt appears
   - Point device at QR on screen

3. Student scans QR:
   - ✓ Shows overlay: "Attendance Verified ✓"
   - ✓ Shows name, ID, time, status (Present/Late)
   - ✓ "Today's record" updates with check-in time

4. Office (Browser 1):
   - ✓ Live table updates with student entry
   - ✓ "Total Today" counter increments
   - ✓ "Currently Inside" counter increments

### Scenario 4: Attendance Status (Timing Rules)

The server determines Present vs Late based on IST time:

**Test Cases:**

```
Time (IST)      Status      Expected
10:00 AM        PRESENT     ✓ "present"
10:59 AM        PRESENT     ✓ "present"
11:00 AM        PRESENT     ✓ "present"
11:01 AM        LATE        ✓ "late"
5:30 PM         LATE        ✓ "late"  (no 5 PM cutoff)
```

Note: The server's `Asia/Kolkata` time is used, never the browser's local time.

### Scenario 5: Checkout

**Steps:**
1. Student clicks "Record Exit" after scanning QR
2. Marks check-out time

**Expected:**
- ✓ "Check out" field in Today's record is populated
- ✓ Status becomes "CHECKED OUT"
- ✓ Office dashboard "Currently Inside" counter decrements
- ✓ "Checked Out" counter increments

### Scenario 6: Duplicate Attendance Prevention

**Steps:**
1. Student successfully scans QR and marks attendance
2. Student tries to scan QR again same day

**Expected:**
- ✗ Error: "ALREADY MARKED - Attendance has already been recorded today."
- ✓ No second attendance record created
- ✓ Database UNIQUE constraint (student_id, attendance_date) prevents duplicates

### Scenario 7: QR Regeneration

**Steps:**
1. Office is displaying today's QR
2. Click "REGENERATE TODAY'S QR"
3. Confirm regeneration

**Expected:**
- ✓ QR image changes (different token)
- ✓ Old QR becomes invalid if student tries to use it
- ✓ New QR still valid for entire day
- ✓ All previously displayed copies of old QR are now invalid

### Scenario 8: Student Cannot Change Assignment

**Steps:**
1. Student logs in
2. Inspection: Cannot edit unit/station in UI
3. Even if manually modified in localStorage/network calls
4. Server validates and rejects modification

**Expected:**
- ✓ No edit UI for unit/station (only shown with 🔒 lock icon)
- ✓ Unit/station remain immutable after registration
- ✓ Server-side validation prevents unauthorized changes

### Scenario 9: Cross-Unit Data Access (RLS)

**Setup:**
1. Create two students in different units
2. Create one office account for Unit A

**Steps:**
1. Office logs in (assigned to Unit A)
2. Tries to view attendance from Unit B student

**Expected:**
- ✓ Office can ONLY see attendance for their assigned unit/station
- ✓ Unit B attendance is not visible
- ✓ RLS policies enforce at database level

### Scenario 10: Attendance History

**Steps:**
1. Student has multiple check-ins over several days
2. Click "View history"

**Expected:**
- ✓ Shows list of past 60 days max
- ✓ Each entry shows date, check-in time, status, check-out time
- ✓ Read-only (no editing)
- ✓ Newest first

### Scenario 11: Session Persistence

**Steps:**
1. Student logs in
2. Close browser completely
3. Reopen `http://localhost:3000`

**Expected:**
- ✓ Session token is read from localStorage
- ✓ User is automatically logged back in
- ✓ Student Dashboard loads without re-entering credentials

### Scenario 12: Logout

**Steps:**
1. Either student or office is logged in
2. Click "Logout" button (top right)

**Expected:**
- ✓ Token cleared from localStorage
- ✓ Redirects to home page
- ✓ Logout button disappears
- ✓ Must log in again to access protected screens

## Security Testing

### Test 1: Service Role Key Never Exposed

**Method:**
1. Open browser DevTools
2. **Network tab** → Reload page → Check all requests
3. Search for "service_role" or "SUPABASE_SERVICE_ROLE_KEY"

**Expected:**
- ✗ Service role key NEVER appears in Network requests
- ✗ Service role key NEVER appears in HTML source
- ✗ Service role key NEVER appears in console
- ✓ Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are visible (safe)

### Test 2: RLS Policies Enabled

**Method:**
1. In Supabase dashboard → **SQL Editor**
2. Run query:
```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('profiles', 'attendance', 'daily_qr_tokens');
```
3. For each table, go to **Authentication → Policies** and verify

**Expected:**
- ✓ All three tables have "Row Level Security" enabled
- ✓ Policies exist for student and office roles

### Test 3: Passwords Never Returned by API

**Method:**
1. Open browser DevTools → **Network tab**
2. Make login request
3. Inspect JSON response

**Expected:**
- ✗ No password field in response
- ✗ No password hash in response
- ✓ Only access_token, user (name, email, role, etc.)

### Test 4: Student Cannot Access Another Student's Data

**Method:**
1. Inspect network request to `/api/student/today`
2. Manually modify localStorage to different user ID
3. Reload page and try to access other student's attendance

**Expected:**
- ✗ Access denied (RLS policy blocks it)
- ✗ Server returns 403 Forbidden or empty result
- ✓ Student can only see their own attendance

### Test 5: Office Cannot Access Another Unit

**Method:**
1. Office account is assigned to "DCP Zone 3"
2. Try to access attendance for "DCP Zone 1" student
3. May require manual API testing (not visible in UI)

**Expected:**
- ✗ RLS blocks access to other unit's attendance
- ✗ Empty results or 403 error

### Test 6: No Hardcoded Credentials in Code

**Method:**
```bash
grep -r "office123" .
grep -r "password=" .
grep -r "SUPABASE_SERVICE_ROLE" public/
```

**Expected:**
- ✗ No demo passwords in production code
- ✗ No service role key in frontend
- ✓ Only `.env.example` has placeholders

## Performance Testing

### Load Test

Open 5–10 browser windows and log in simultaneously:

**Expected:**
- ✓ All sessions load within 2–3 seconds
- ✓ No "Connection timeout" errors
- ✓ No 503 Service Unavailable

### QR Scanning Performance

Multiple students scanning simultaneously:

**Expected:**
- ✓ Each QR verification completes in < 1 second
- ✓ Live attendance table updates smoothly
- ✓ No race conditions (duplicate attendance impossible)

### Database Indexes

**Verify:**
```sql
-- In Supabase SQL Editor
SELECT * FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (indexname LIKE '%attendance%' 
       OR indexname LIKE '%date%'
       OR indexname LIKE '%student%');
```

**Expected:**
- ✓ Indexes exist on frequently-queried columns
- ✓ (student_id, attendance_date) is indexed for performance

## Troubleshooting During Testing

### Issue: "Cannot connect to Supabase"

**Solution:**
1. Verify `.env` has correct `VITE_SUPABASE_URL`
2. Verify project is active in Supabase dashboard
3. Check internet connection
4. Verify anon key is correct (starts with `eyJ...`)

### Issue: "RLS policy denied" error

**Solution:**
1. Verify all 3 migrations ran successfully
2. Check user's profile has correct role
3. Check in Supabase **Authentication → Policies** that policies exist
4. Check **Authentication → Roles** that policies reference correct role

### Issue: "Office account login fails"

**Solution:**
1. Verify office auth user exists in **Authentication → Users**
2. Verify office profile exists in `profiles` table with `role = 'office'`
3. Verify `unit_id` and `police_station_id` are not NULL
4. Verify email in auth user matches profile email

### Issue: "QR code not displaying"

**Solution:**
1. Check server console for errors
2. Verify office is logged in
3. Verify Bearer token is valid
4. Check `/api/office/qr` endpoint returns QR data

### Issue: "Student can see another student's data"

**Solution:**
1. This means RLS is NOT working
2. Go to Supabase **Authentication → Policies**
3. Verify policies for `profiles` and `attendance` tables exist
4. Verify `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` ran in migration
5. Re-run migration 002 (RLS policies)

## Deployment to Production

### Before Going Live

1. **Change all defaults:**
   - `OFFICE_PASSWORD` (not `office123`)
   - `SESSION_SECRET` (not placeholder)

2. **Enable HTTPS:**
   - Set `NODE_ENV=production`
   - Deploy behind reverse proxy with SSL certificate
   - This enables secure-only cookies

3. **Supabase Security:**
   - Go to **Settings → Auth**
   - Verify email confirmation is required
   - Set up SMTP for real emails (not demo emails)
   - Configure JWT expiry (default: 1 hour)

4. **Hosting Options:**
   - **Railway.app** (recommended, easy)
   - **Render.com**
   - **Fly.io**
   - **AWS/Google Cloud/Azure** (more complex)

### Deployment Steps (Railway Example)

1. Push this code to GitHub
2. Go to Railway.app, sign up
3. Import GitHub repo
4. Add environment variables from `.env`
5. Deploy
6. Railway gives you a public URL

### Post-Deployment Verification

After going live:

1. Test login from public internet
2. Verify HTTPS certificate is valid
3. Test QR scanning on actual devices
4. Verify emails are sent for authentication
5. Monitor Supabase logs for errors
6. Set up backups in Supabase

## Known Limitations

1. **QR is valid all day** — If you need per-60-second expiry, that's a different architecture
2. **One office account** — Multiple offices require backend changes
3. **No offline mode** — Requires internet connection
4. **No multi-language** — Currently English only
5. **No biometric auth** — Only email/password

## What to Do Next

### Phase 1 (Week 1)
- [ ] Complete all testing scenarios above
- [ ] Fix any bugs found
- [ ] Get security clearance from IT

### Phase 2 (Week 2)
- [ ] Deploy to staging server
- [ ] Test with real students/office staff
- [ ] Gather feedback

### Phase 3 (Week 3–4)
- [ ] Deploy to production
- [ ] Migrate old SQLite data (if any)
- [ ] Monitor for 2 weeks

### Phase 4+ (Ongoing)
- [ ] Monitor logs and usage
- [ ] Update units/stations as needed
- [ ] Handle student reassignments (admin-only)
- [ ] Maintain backups

## Support & Contacts

- **Supabase Help:** https://supabase.com/docs
- **Node.js Issues:** https://nodejs.org/en/
- **This Project:** Check README.md and SETUP_SUPABASE.md

---

**Version:** 4.0.0  
**Last Updated:** September 2026  
**Status:** Ready for deployment
