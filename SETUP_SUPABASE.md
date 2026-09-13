# StationTrack Supabase Setup Guide

## ⚠️ IMPORTANT: Environment Variables

**NEVER commit `.env` to git. This file contains sensitive secrets.**

All sensitive configuration is in `.env` (gitignored). Use `.env.example` as a template.

---

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/log in
2. Click **"New Project"**
3. Enter:
   - **Name:** `stationtrack` (or your preference)
   - **Database Password:** Generate a strong password
   - **Region:** Select the region closest to your police department
   - **Pricing Plan:** Free tier is fine for testing
4. Click **"Create new project"** and wait for initialization (~2 minutes)

---

## Step 2: Get Your Credentials

Once the project is ready:

1. Go to **Settings → API** in the left sidebar
2. You'll see two keys:
   - **Project URL** - Copy this (looks like `https://xxxxx.supabase.co`)
   - **anon public** - Copy this
   - **service_role secret** - Copy this (keep private!)

---

## Step 3: Create `.env` File

In the project root (`police_station_attendance/`), create a `.env` file:

```bash
# Frontend (safe to expose)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# Backend ONLY (NEVER expose to frontend)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Application
PORT=3000
NODE_ENV=development

# Office Account (initial setup only)
OFFICE_EMAIL=office@stationtrack.local
OFFICE_PASSWORD=your_very_secure_password_here
```

**REPLACE:**
- `https://xxxxx.supabase.co` with your actual Project URL
- `your_anon_key_here` with your anon public key
- `your_service_role_key_here` with your service role key
- Set a very strong password for `OFFICE_PASSWORD`

---

## Step 4: Run Database Migrations

These SQL scripts set up all tables, RLS policies, and seed data.

### Via Supabase SQL Editor:

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the content of **`supabase/migrations/001_initial_schema.sql`** and paste it
4. Click **"Run"**
5. Repeat for:
   - **`supabase/migrations/002_rls_policies.sql`**
   - **`supabase/migrations/003_seed_units.sql`**

### Via `psql` (if you prefer command line):

```bash
psql -U postgres -h db.xxxxx.supabase.co -f supabase/migrations/001_initial_schema.sql
psql -U postgres -h db.xxxxx.supabase.co -f supabase/migrations/002_rls_policies.sql
psql -U postgres -h db.xxxxx.supabase.co -f supabase/migrations/003_seed_units.sql
```

When prompted for password, use your database password from project creation.

---

## Step 5: Create Office Account

**Once migrations are complete**, you need to create the single office account.

Two options:

### Option A: Via Supabase Auth UI (Easiest)

1. Go to **Authentication → Users** in Supabase dashboard
2. Click **"Create User"**
3. Enter:
   - **Email:** `office@stationtrack.local`
   - **Password:** The value from your `.env` `OFFICE_PASSWORD`
   - Check **"Auto confirm user"**
4. Click **"Create User"**

Then manually insert the office profile:

1. Go to **SQL Editor**
2. Run this query (replace `xxx` with the auth user ID from the user you just created):

```sql
INSERT INTO public.profiles (
  auth_user_id,
  full_name,
  email,
  role,
  unit_id,
  police_station_id
) VALUES (
  'xxx-xxx-xxx',  -- Replace with auth user ID
  'Office Control Center',
  'office@stationtrack.local',
  'office',
  (SELECT id FROM public.units WHERE name = 'DCP Zone 3' LIMIT 1),
  (SELECT id FROM public.police_stations WHERE name = 'DCP Zone 3' LIMIT 1)
);
```

### Option B: Via Application (After startup)

The application will attempt to auto-create the office account on first run if it doesn't exist. However, **Option A is recommended** for full control.

---

## Step 6: Install Dependencies

```bash
npm install
```

---

## Step 7: Start the Application

```bash
npm start
```

The server will start on `http://localhost:3000`

Open in your browser and verify:
- ✓ Home page loads
- ✓ Student Portal, Office Control Center, and Admin login pages appear

---

## Step 8: Test the Application

### Test Student Signup:
1. Click **"Student Portal"**
2. Click **"Register once"**
3. Fill in:
   - Student ID: `INT001`
   - Full Name: `Test Student`
   - Email: `student@example.com`
   - Password: `TestPass123!`
   - Unit: `DCP Zone 3`
   - Station: `DCP Zone 3`
4. Click **"Create account"**
5. You should see a success message

### Test Student Login:
1. Go back to **"Student Portal"**
2. Enter:
   - Email: `student@example.com`
   - Password: `TestPass123!`
3. Click **"Secure login"**
4. You should see your dashboard

### Test Office Login:
1. Click **"Office Control Center"**
2. Enter:
   - Email: `office@stationtrack.local`
   - Password: Whatever you set in `.env` as `OFFICE_PASSWORD`
3. Click **"Secure sign in"**
4. You should see the QR code generation screen

---

## Security Checklist

- [ ] `.env` file is in `.gitignore` (check with `git status`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never used in frontend code
- [ ] Database tables have Row Level Security (RLS) enabled
- [ ] Students cannot see other students' data (test by checking RLS policies)
- [ ] Office can only see their assigned unit/station's attendance
- [ ] Passwords are hashed in Supabase Auth (never plain text)
- [ ] HTTPS is enabled in production
- [ ] Office password is strong and changed from default

---

## Troubleshooting

### "Missing required environment variable"
- Verify `.env` file exists
- Check variable names match exactly: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### "Cannot connect to Supabase"
- Verify your Project URL is correct
- Check your internet connection
- Verify the anon key is correct

### "Authentication failed" after office login
- Verify office profile exists in `public.profiles` table with `role = 'office'`
- Verify email and password are correct
- Check that the auth user is confirmed in **Authentication → Users**

### "RLS policy denied" errors
- Run migration 002 again (RLS policies)
- Verify your user has the correct role in the profiles table
- Check Supabase logs for more details

### QR Code not generating
- Verify backend is running (`npm start`)
- Check browser console for error messages
- Verify office account exists and is authenticated

---

## Resetting Everything (For Development)

If you want to start fresh:

1. In Supabase dashboard, go to **Settings → Danger Zone**
2. Click **"Reset Database"** (this deletes all data!)
3. Re-run all migrations (Step 4)
4. Create office account again (Step 5)

**WARNING: This is destructive and permanent. Only use in development.**

---

## Production Deployment

When deploying to production:

1. **Use strong passwords and environment variables**
   - Generate random `OFFICE_PASSWORD`
   - Generate random `SESSION_SECRET`

2. **Enable HTTPS**
   - Set `NODE_ENV=production`
   - Deploy behind reverse proxy with HTTPS

3. **Supabase Security**
   - Review RLS policies
   - Enable Row Level Security on all tables
   - Review authentication settings

4. **Monitoring**
   - Check Supabase logs regularly
   - Monitor attendance records for anomalies
   - Keep backups

5. **Backups**
   - Supabase includes automatic backups
   - Configure additional backups if needed

---

## Support

For Supabase issues, see:
- [Supabase Docs](https://supabase.com/docs)
- [Supabase Discord Community](https://discord.supabase.com)

For StationTrack issues, check:
- `.env` configuration
- Database migration logs
- Browser console for errors
- Server logs (`npm start` output)
