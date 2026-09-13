# StationTrack — Cybersecurity Internship Attendance System (Supabase Edition)

A secure, zone/unit-based attendance platform for police-department cybersecurity internship programs. This version uses **Supabase for authentication and database** with Row Level Security (RLS) for data access control.

## ✨ Key Features

- **Supabase Authentication** - Secure email/password auth for students and office accounts
- **PostgreSQL Database** - Managed by Supabase with automatic backups
- **Row Level Security (RLS)** - Database-level access control (no data cross-contamination)
- **One-time student registration** - Permanently locked unit/zone and police station assignment
- **Single Office Control Center** - One account manages the entire station's daily QR
- **Day-long verification QR** - Valid from 12:00 AM to 11:59 PM IST (not rolling 60 seconds)
- **Server-side time & rules** - All attendance timing happens server-side (IST timezone)
- **One attendance per student per day** - Enforced by database constraint
- **Check-in / Check-out** - Mark arrival and departure with live "currently inside" tracking
- **Live Attendance Monitor** - Real-time student attendance dashboard for office
- **Student attendance history** - Read-only view of past attendance records
- **Cybersecurity theme** - Premium command-center UI with subtle animations

## 🏗️ Architecture

- **Backend:** Node.js + Express + Supabase PostgreSQL
- **Frontend:** Vanilla HTML/CSS/JS (no build step required)
- **Authentication:** Supabase Auth (built on PostgREST)
- **QR Scanner:** `html5-qrcode` library
- **Styling:** Space Grotesk, IBM Plex Mono fonts

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or newer
- Supabase account (free tier OK)
- A web browser

### Installation

1. **Clone/download this project**

2. **Create Supabase project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Get your Project URL and anon key

3. **Configure environment**
   ```bash
   cd police_station_attendance
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

4. **Run database migrations**
   - See `SETUP_SUPABASE.md` for detailed instructions
   - TL;DR: Copy/paste SQL from `supabase/migrations/*.sql` into Supabase SQL Editor

5. **Install and start**
   ```bash
   npm install
   npm start
   ```

6. **Open browser**
   - Navigate to `http://localhost:3000`
   - Test student signup, office login, QR scanning

**For detailed setup with screenshots, see [SETUP_SUPABASE.md](./SETUP_SUPABASE.md)**

## 📋 User Workflows

### Student Workflow
1. **Register** with Student ID, name, email, password, unit, and police station
   - Unit and station are permanently locked after registration
2. **Login** with email and password
3. **Scan QR** when arriving at the station
4. **View attendance** status and history
5. **Record exit** when leaving

### Office Workflow
1. **Login** with office email and password
2. **View generated QR** (auto-generated daily, valid all day)
3. **Display fullscreen** QR for students to scan
4. **Regenerate QR** if needed (old copies become invalid)
5. **Monitor attendance** live with animated counters
6. **Search and filter** by status (Present/Late/Inside/Checked-out)

### Admin Workflow
1. **Login** as admin
2. **Manage units and stations**
3. **View all students**
4. **Reassign students** to different units/stations
5. **Review attendance history**

## 🔒 Security Features

### Authentication
- ✓ Supabase Auth (managed authentication service)
- ✓ Email/password signup and login
- ✓ Session tokens stored securely
- ✓ Passwords never handled locally

### Database
- ✓ Row Level Security (RLS) on all tables
- ✓ Students can only access their own data
- ✓ Office can only see their assigned unit/station
- ✓ Admin can see all data with proper authorization

### Secrets Management
- ✓ `.env` file for sensitive configuration (gitignored)
- ✓ `SUPABASE_SERVICE_ROLE_KEY` never exposed to frontend
- ✓ Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` sent to browser
- ✓ All privileged operations use backend API with role verification

### Attendance Verification
- ✓ QR tokens validated server-side
- ✓ Duplicate attendance prevented by database constraint
- ✓ IST timezone enforced server-side (not browser timezone)
- ✓ Check-in time immutable after creation

## 📅 Attendance Timing Rules

- **10:00 AM – 11:00 AM (IST)** → **Present**
- **After 11:00 AM (IST)** → **Late**
- **No 5:00 PM cutoff** - Students can check in anytime during the day (will be marked Late if after 11:00 AM)
- **Server time only** - The server's `Asia/Kolkata` clock decides, not the student's device

## 🗂️ Database Schema

### Tables
- **`units`** - Police department zones/units (18 official units pre-seeded)
- **`police_stations`** - Police stations (one per unit by default, more can be added)
- **`profiles`** - User profiles (linked to Supabase auth.users, stores student_id, role, unit, station)
- **`daily_qr_tokens`** - Day-long QR tokens (one per office per day)
- **`attendance`** - Attendance records (one per student per day)
- **`audit_logs`** - Security audit trail (optional but recommended)

### Row Level Security (RLS)
- **Students** can read/update only their own data
- **Office** can read attendance for their assigned unit/station only
- **Admins** have elevated access (configured in backend)

## 📁 Project Structure

```
police_station_attendance/
├── server.js                    # Express backend + Supabase integration
├── package.json                 # Dependencies
├── .env.example                 # Template for environment variables
├── .gitignore                   # Prevents .env from being committed
├── public/
│   ├── index.html              # All UI screens (student/office/admin)
│   ├── app.js                  # Frontend logic + Supabase client usage
│   └── style.css               # Dark cybersecurity theme
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql      # Table creation + indexes
│       ├── 002_rls_policies.sql        # Row Level Security policies
│       └── 003_seed_units.sql          # Pre-seed 18 official units
├── README.md                    # This file
└── SETUP_SUPABASE.md           # Detailed Supabase setup guide
```

## 🌍 IST Timezone

All attendance timing uses **Asia/Kolkata (IST)** timezone:
- Dates are computed in IST (not UTC or browser timezone)
- Present/Late status determined by IST time
- QR valid from midnight to 11:59 PM IST

This is handled entirely server-side, so there's no ambiguity or client-side manipulation.

## 🔑 Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Frontend (exposed to browser)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx

# Backend ONLY
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# Server
PORT=3000
NODE_ENV=development

# Office account setup
OFFICE_EMAIL=office@stationtrack.local
OFFICE_PASSWORD=change_me_in_production
```

**IMPORTANT:** Never commit `.env` to git. It's in `.gitignore`.

## ⚙️ Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | Required |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend privileged access | Required for some operations |
| `PORT` | HTTP server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `OFFICE_EMAIL` | Office account email | office@stationtrack.local |
| `OFFICE_PASSWORD` | Office account password | (set in .env) |

## 🧪 Testing

### Test Signup
```bash
# Go to Student Portal → Register once
Student ID: TEST001
Email: test@example.com
Password: TestPass123!
Unit: DCP Zone 3
Station: DCP Zone 3
```

### Test Login
```bash
# Go to Student Portal
Email: test@example.com
Password: TestPass123!
```

### Test Office
```bash
# Go to Office Control Center
Email: office@stationtrack.local
Password: (from your .env)
```

### Test QR Scanning
1. Login as office → QR appears
2. Login as student in another browser/device
3. Click "Scan Attendance QR"
4. Point phone camera at office's QR
5. Should see "Attendance Verified" ✓

## 🚨 Migration from SQLite

If you had an older version using SQLite:

1. **Export old data** (if needed):
   ```sql
   SELECT * FROM students;
   SELECT * FROM attendance;
   ```

2. **Export to CSV** and import into Supabase PostgreSQL

3. **Delete old SQLite files**:
   ```bash
   rm attendance.db attendance.db-wal attendance.db-shm
   ```

4. **Update dependencies**:
   ```bash
   npm install
   ```

## 📊 Performance Notes

- Attendance queries are indexed on date and student_id
- RLS policies are evaluated per query (minimal overhead)
- QR tokens are computed, not stored (saves storage)
- Live attendance refreshes every 15 seconds (office dashboard)

## 🐛 Troubleshooting

### "Cannot connect to Supabase"
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`
- Check internet connection
- Verify Supabase project is active

### "Authentication failed"
- Confirm office profile exists with `role = 'office'`
- Verify email and password are correct
- Check Supabase **Auth → Users** to confirm user exists

### "RLS policy denied"
- Verify migrations were run (all 3 SQL files)
- Check user's role in `public.profiles` table
- See Supabase logs for detailed error

### Students can see other students' data
- RLS policies may not be enabled
- Check `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` ran
- Verify policies exist in Supabase **Authentication → Policies**

## 📚 Resources

- **Supabase Docs:** https://supabase.com/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Row Level Security:** https://supabase.com/docs/guides/database/postgres/row-level-security
- **Supabase Auth:** https://supabase.com/docs/guides/auth

## 💼 Production Deployment

### Before Going Live

1. **Change all default passwords**
   - Office password in `.env`
   - Admin password (if added)

2. **Enable HTTPS**
   - Set `NODE_ENV=production`
   - Deploy behind reverse proxy with SSL

3. **Review Security**
   - Check all RLS policies are enabled
   - Review Supabase security settings
   - Test unauthorized access scenarios

4. **Supabase Settings**
   - Configure backups
   - Set up monitoring/alerts
   - Review authentication email settings

5. **Deployment Options**
   - Railway, Render, Fly.io (Node.js hosting)
   - Heroku (with paid dyno)
   - AWS, Google Cloud, Azure (via their Node.js deployment guides)

### Recommended Deployment Architecture

```
┌─────────────────┐
│ Student/Office  │ (browser)
│    Browser      │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│  Express.js     │ (your server, e.g., Railway)
│  + Supabase JS  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Supabase      │ (managed PostgreSQL + Auth)
│  PostgreSQL     │
│  + Auth Service │
└─────────────────┘
```

## 📝 License

This project is private to the police department's cybersecurity internship program.

## 📞 Support

For setup help:
1. Read `SETUP_SUPABASE.md` carefully
2. Check Supabase logs in dashboard
3. Verify all environment variables are set
4. Ensure migrations ran without errors

---

**Version:** 4.0.0 (Supabase Edition)  
**Last Updated:** September 2026  
**Timezone:** Asia/Kolkata (IST)
