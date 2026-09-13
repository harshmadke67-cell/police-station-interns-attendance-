# StationTrack Migration Guide: SQLite → Supabase

If you had StationTrack v3.0.0 running with SQLite, this guide explains how to migrate your existing data to Supabase.

## Assessment

### Do you have existing data?

**Check for these files in the project root:**
- `attendance.db`
- `attendance.db-wal`
- `attendance.db-shm`

If these files exist, you have data to migrate.

**If you only have SQLite files (no v4.0.0 setup yet):**

1. Back up your SQLite files:
```bash
cp attendance.db attendance.db.backup
cp attendance.db-wal attendance.db.backup-wal
cp attendance.db-shm attendance.db.backup-shm
```

2. Follow the main SETUP_SUPABASE.md to set up v4.0.0

3. Come back to this guide to migrate your data

## Data Schema Mapping

### Old SQLite → New Supabase

| Old Table | Old Columns | New Table | New Columns | Notes |
|-----------|-------------|-----------|-------------|-------|
| `students` | id, student_id, name, password_hash, email, unit_id, station_id | `auth.users` + `profiles` | auth.users: email, encrypted_password; profiles: student_id, full_name, email, role, unit_id, police_station_id | Passwords CANNOT be migrated (Supabase Auth handles new ones) |
| `attendance` | id, student_id, date, check_in, status, check_out | `attendance` | student_id, attendance_date, check_in, status, check_out | Similar structure |
| `units` | id, name | `units` | id, name | Can be copied directly |
| `stations` | id, name, unit_id | `police_stations` | id, name, unit_id | Direct copy |

## Migration Steps

### Option A: Manual Copy (Recommended for small datasets)

**Step 1: Export data from SQLite**

If you have command-line SQLite tools:

```bash
# Export each table as CSV
sqlite3 attendance.db "SELECT id, student_id, name, email, unit_id, station_id FROM students;" > students_export.csv
sqlite3 attendance.db "SELECT id, student_id, attendance_date, check_in, status, check_out FROM attendance;" > attendance_export.csv
sqlite3 attendance.db "SELECT id, name FROM units;" > units_export.csv
sqlite3 attendance.db "SELECT id, name, unit_id FROM stations;" > stations_export.csv
```

Or use a GUI tool like SQLiteStudio to export tables as CSV.

**Step 2: Create students in Supabase Auth**

For each student, you must:

1. Create an auth user in Supabase (email/password)
2. Set a temporary password (they must reset it on first login)
3. Copy their `auth_user_id` UUID

**Best practice: Script this**

Create a Node.js script `migrate.js`:

```javascript
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const results = [];
fs.createReadStream('students_export.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', async () => {
    console.log(`Migrating ${results.length} students...`);
    
    for (const student of results) {
      try {
        // 1. Create auth user with temporary password
        const tempPassword = 'TempPass' + Math.random().toString(36).substr(2, 9) + '!';
        
        const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
          email: student.email,
          password: tempPassword,
          email_confirm: true
        });

        if (authError) {
          console.error(`Failed to create auth for ${student.email}:`, authError.message);
          continue;
        }

        // 2. Create profile with student's original unit/station
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            auth_user_id: user.id,
            student_id: student.student_id,
            full_name: student.name,
            email: student.email,
            role: 'student',
            unit_id: student.unit_id,  // Must exist in units table
            police_station_id: student.station_id  // Must exist in police_stations table
          });

        if (profileError) {
          console.error(`Failed to create profile for ${student.email}:`, profileError.message);
        } else {
          console.log(`✓ Migrated: ${student.student_id} (${student.email})`);
        }
      } catch (e) {
        console.error(`Error migrating ${student.email}:`, e.message);
      }
    }
    
    console.log('Student migration complete!');
  });
```

Run this with:
```bash
npm install csv-parser
node migrate.js
```

**Step 3: Migrate attendance records**

Import your attendance CSV into Supabase:

1. Export attendance data from SQLite (see Step 1)
2. In Supabase dashboard → **Table Editor**
3. Select `attendance` table
4. Click "Insert" → "CSV"
5. Upload `attendance_export.csv`
6. Map columns correctly:
   - `student_id` → student_id (UUID of auth user, not old SQLite ID)
   - `date` → attendance_date
   - `check_in` → check_in
   - `status` → status
   - `check_out` → check_out

**Warning:** The `student_id` in old SQLite is probably an integer. The new `student_id` in attendance table must reference the auth user UUID. You'll need to do a JOIN to map old student IDs to new UUIDs.

### Option B: Programmatic Migration (Advanced)

If you have complex data or many records:

```javascript
// Complete migration script - full_migrate.js
require('dotenv').config();
const sqlite3 = require('sqlite3');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const db = new sqlite3.Database('attendance.db');

async function migrateAll() {
  console.log('Starting full migration...\n');

  // 1. Migrate units
  console.log('Migrating units...');
  const units = await new Promise((resolve, reject) => {
    db.all('SELECT id, name FROM units', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  for (const unit of units) {
    try {
      await supabase.from('units').insert({
        id: unit.id,
        name: unit.name,
        created_at: new Date().toISOString()
      });
      console.log(`✓ Unit: ${unit.name}`);
    } catch (e) {
      console.warn(`! Unit already exists: ${unit.name}`);
    }
  }

  // 2. Migrate stations
  console.log('\nMigrating police stations...');
  const stations = await new Promise((resolve, reject) => {
    db.all('SELECT id, name, unit_id FROM stations', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  for (const station of stations) {
    try {
      await supabase.from('police_stations').insert({
        id: station.id,
        name: station.name,
        unit_id: station.unit_id,
        created_at: new Date().toISOString()
      });
      console.log(`✓ Station: ${station.name}`);
    } catch (e) {
      console.warn(`! Station already exists: ${station.name}`);
    }
  }

  // 3. Migrate students (create auth users + profiles)
  console.log('\nMigrating students...');
  const students = await new Promise((resolve, reject) => {
    db.all('SELECT student_id, name, email, unit_id, station_id FROM students', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  const studentMap = {}; // old student_id → new auth user UUID

  for (const student of students) {
    try {
      // Create temp password for student to reset on first login
      const tempPass = 'TempPass123!';

      const { data: { user }, error } = await supabase.auth.admin.createUser({
        email: student.email,
        password: tempPass,
        email_confirm: true
      });

      if (error && !error.message.includes('duplicate')) {
        throw error;
      }

      if (user) {
        studentMap[student.student_id] = user.id;

        await supabase.from('profiles').insert({
          auth_user_id: user.id,
          student_id: student.student_id,
          full_name: student.name,
          email: student.email,
          role: 'student',
          unit_id: student.unit_id,
          police_station_id: student.station_id
        });

        console.log(`✓ Student: ${student.student_id} (${student.email})`);
      }
    } catch (e) {
      console.error(`✗ Failed to migrate student ${student.student_id}:`, e.message);
    }
  }

  // 4. Migrate attendance records
  console.log('\nMigrating attendance...');
  const attendance = await new Promise((resolve, reject) => {
    db.all('SELECT student_id, date, check_in, status, check_out FROM attendance', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  let migrated = 0;
  for (const record of attendance) {
    const newStudentId = studentMap[record.student_id];
    if (!newStudentId) {
      console.warn(`! Skipping attendance: student ${record.student_id} not migrated`);
      continue;
    }

    try {
      // You'll need to query the student's unit/station from the profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('unit_id, police_station_id')
        .eq('auth_user_id', newStudentId)
        .single();

      if (!profile) {
        console.warn(`! Could not find profile for ${newStudentId}`);
        continue;
      }

      await supabase.from('attendance').insert({
        student_id: newStudentId,
        attendance_date: record.date,
        check_in: record.check_in,
        status: record.status,
        check_out: record.check_out,
        unit_id: profile.unit_id,
        police_station_id: profile.police_station_id
      });

      migrated++;
      if (migrated % 50 === 0) console.log(`✓ Migrated ${migrated} attendance records...`);
    } catch (e) {
      console.error(`✗ Failed to migrate attendance for ${record.student_id}:`, e.message);
    }
  }

  console.log(`\n✓ Migration complete! Migrated ${migrated} attendance records`);
  db.close();
}

migrateAll().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
```

Run with:
```bash
npm install sqlite3
node full_migrate.js
```

## Post-Migration Verification

### 1. Verify Units Migrated

In Supabase **SQL Editor**:
```sql
SELECT COUNT(*) as total_units FROM public.units;
-- Should show 18 if you used seed_units.sql, or your custom count
```

### 2. Verify Students Migrated

```sql
SELECT COUNT(*) as total_students FROM public.profiles WHERE role = 'student';
-- Should match your old students count
```

### 3. Verify Attendance Migrated

```sql
SELECT COUNT(*) as total_attendance FROM public.attendance;
-- Should match your old attendance records count
```

### 4. Test Old Students

Try logging in as an old student:
1. Go to Student Portal
2. Use old email and the temporary password you set
3. Should redirect to Student Dashboard
4. Try viewing attendance history - should see migrated records

## Cleaning Up Old Files

Once migration is verified:

```bash
# Back up just in case
mkdir old_sqlite_backup
cp attendance.db attendance.db.backup
cp attendance.db-wal attendance.db.backup-wal
cp attendance.db-shm attendance.db.backup-shm

# Remove old files (they're in .gitignore now)
rm attendance.db
rm attendance.db-wal
rm attendance.db-shm
```

**These files are safe to delete** because their data now exists in Supabase PostgreSQL.

## Troubleshooting

### Issue: "Migration script fails on auth.admin.createUser"

**Cause:** You may not have admin access

**Solution:**
1. Generate an admin API key in Supabase
2. Use `service_role_key`, not `anon_key`

### Issue: "student_id mismatch in attendance"

**Cause:** Old attendance records reference SQLite student IDs, not auth UUIDs

**Solution:**
Use a mapping dict to translate old IDs to new UUIDs (as shown in Option B script)

### Issue: "Units or stations don't exist"

**Cause:** Foreign key constraint violation

**Solution:**
Ensure you migrated units/stations BEFORE students/attendance. The order matters.

### Issue: "Email already exists" errors

**Cause:** Some students might have been created in v4.0.0 already

**Solution:**
1. Check Supabase **Authentication → Users** for existing accounts
2. Skip those in migration script, or handle duplicates gracefully

## Verification Checklist

After migration:

- [ ] All units exist in Supabase
- [ ] All stations exist with correct unit_id
- [ ] All students have auth users
- [ ] All students have profiles with role='student'
- [ ] All attendance records exist
- [ ] Old students can log in
- [ ] Attendance history displays correctly
- [ ] QR scanning works with migrated data
- [ ] Old SQLite files backed up and can be deleted

## Support

If you encounter issues:

1. Check Supabase logs in dashboard
2. Review error messages in console
3. Verify constraints (email uniqueness, foreign keys)
4. Contact Supabase support if data is corrupted

---

**Migration Version:** 3.0.0 → 4.0.0  
**Last Updated:** September 2026
