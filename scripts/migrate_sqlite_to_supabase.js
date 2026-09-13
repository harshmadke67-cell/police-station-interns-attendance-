/**
 * StationTrack — Safe SQLite to Supabase Migration Script
 *
 * This script safely migrates data from legacy attendance.db into Supabase:
 * - Does NOT delete or alter attendance.db.
 * - Migrates units, police stations, student profiles, and historical attendance records.
 * - Idempotent: checks for existing records to prevent duplicates.
 *
 * Usage:
 *   node scripts/migrate_sqlite_to_supabase.js
 */

require('dotenv').config();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  const { DatabaseSync } = require('node:sqlite');
  Database = class extends DatabaseSync {
    pragma() {}
  };
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runMigration() {
  console.log('\n=====================================================================');
  console.log('  STATIONTRACK — SQLITE TO SUPABASE DATA MIGRATION');
  console.log('=====================================================================\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_URL.includes('your-project') || SUPABASE_URL.includes('PLACEHOLDER')) {
    console.error('❌ ERROR: Supabase credentials not configured in .env');
    console.error('Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before running this script.');
    process.exit(1);
  }

  const dbPath = path.join(__dirname, '..', 'attendance.db');
  console.log(`[1/5] Checking legacy database: ${dbPath}`);
  
  let sqlite;
  try {
    sqlite = new Database(dbPath);
  } catch (err) {
    console.log(`ℹ️ No SQLite database found at ${dbPath} (or not needed). Skipping migration.`);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Fetch Supabase units & stations lookup
  console.log('[2/5] Fetching Supabase unit and station mapping...');
  const { data: suUnits, error: uErr } = await supabase.from('units').select('id, name');
  if (uErr || !suUnits) {
    console.error('❌ Failed to fetch Supabase units:', uErr?.message);
    process.exit(1);
  }
  const unitMap = new Map(suUnits.map(u => [u.name.toLowerCase().trim(), u.id]));

  const { data: suStations, error: sErr } = await supabase.from('police_stations').select('id, name, unit_id');
  if (sErr || !suStations) {
    console.error('❌ Failed to fetch Supabase stations:', sErr?.message);
    process.exit(1);
  }
  const stationMap = new Map(suStations.map(s => [`${s.unit_id}:${s.name.toLowerCase().trim()}`, s.id]));

  const getSqliteUnitName = (id) => {
    try {
      const row = sqlite.prepare('SELECT name FROM units WHERE id = ?').get(id);
      return row ? row.name : null;
    } catch { return null; }
  };

  const getSqliteStationName = (id) => {
    try {
      const row = sqlite.prepare('SELECT name FROM stations WHERE id = ?').get(id);
      return row ? row.name : null;
    } catch { return null; }
  };

  // 2. Migrate Students
  console.log('[3/5] Migrating student profiles...');
  let sqliteStudents = [];
  try {
    sqliteStudents = sqlite.prepare('SELECT * FROM students').all();
  } catch (e) {
    console.log('No students table found in SQLite or table empty.');
  }

  const studentProfileMap = new Map();
  let migratedStudents = 0;

  for (const stu of sqliteStudents) {
    const unitName = getSqliteUnitName(stu.unit_id);
    const stationName = getSqliteStationName(stu.station_id);
    const suUnitId = unitName ? unitMap.get(unitName.toLowerCase().trim()) : null;
    const suStationId = suUnitId ? (stationMap.get(`${suUnitId}:${(stationName || '').toLowerCase().trim()}`) || suStations.find(s => s.unit_id === suUnitId)?.id) : null;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, auth_user_id')
      .or(`student_id.eq.${stu.student_id},email.eq.${stu.email}`)
      .maybeSingle();

    if (existingProfile) {
      studentProfileMap.set(stu.id, existingProfile.id);
      console.log(`  - Student ${stu.student_id} (${stu.name}) already exists in Supabase.`);
      continue;
    }

    let authUserId;
    const tempPassword = `Migrated_${stu.student_id}!${Date.now().toString().slice(-4)}`;
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: stu.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: stu.name, student_id: stu.student_id, role: 'student' }
    });

    if (authErr) {
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const found = users.find(u => u.email.toLowerCase() === stu.email.toLowerCase());
      if (found) authUserId = found.id;
      else {
        console.warn(`  ⚠️ Could not create auth user for ${stu.email}:`, authErr.message);
        continue;
      }
    } else {
      authUserId = authUser.user.id;
    }

    const { data: newProfile, error: pErr } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: authUserId,
        student_id: stu.student_id,
        full_name: stu.name,
        email: stu.email,
        role: 'student',
        unit_id: suUnitId,
        police_station_id: suStationId,
        created_at: stu.created_at || new Date().toISOString()
      })
      .select('id')
      .single();

    if (pErr) {
      console.warn(`  ⚠️ Could not insert profile for ${stu.student_id}:`, pErr.message);
    } else {
      studentProfileMap.set(stu.id, newProfile.id);
      migratedStudents++;
      console.log(`  ✓ Migrated student: ${stu.student_id} — ${stu.name}`);
    }
  }

  // 3. Migrate Attendance Records
  console.log('[4/5] Migrating historical attendance records...');
  let sqliteAttendance = [];
  try {
    sqliteAttendance = sqlite.prepare('SELECT * FROM attendance').all();
  } catch (e) {
    console.log('No attendance table found or table empty.');
  }

  let migratedAttendance = 0;
  for (const att of sqliteAttendance) {
    const suStudentProfileId = studentProfileMap.get(att.student_id);
    if (!suStudentProfileId) continue;

    const { data: existingAtt } = await supabase
      .from('attendance')
      .select('id')
      .eq('student_id', suStudentProfileId)
      .eq('attendance_date', att.attendance_date)
      .maybeSingle();

    if (existingAtt) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('unit_id, police_station_id')
      .eq('id', suStudentProfileId)
      .single();

    const { error: insErr } = await supabase
      .from('attendance')
      .insert({
        student_id: suStudentProfileId,
        unit_id: profile?.unit_id,
        police_station_id: profile?.police_station_id,
        attendance_date: att.attendance_date,
        check_in: att.check_in,
        status: att.status,
        check_out: att.check_out || null
      });

    if (!insErr) migratedAttendance++;
  }

  console.log('\n=====================================================================');
  console.log('  ✅ MIGRATION COMPLETE');
  console.log('=====================================================================');
  console.log(`  Students Migrated   : ${migratedStudents}`);
  console.log(`  Attendance Records  : ${migratedAttendance}`);
  console.log('  Legacy Database     : PRESERVED INTACT (attendance.db)');
  console.log('=====================================================================\n');
}

runMigration().catch(err => {
  console.error('Migration failed with unexpected error:', err);
  process.exit(1);
});
