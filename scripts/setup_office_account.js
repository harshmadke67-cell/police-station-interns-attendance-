/**
 * StationTrack — Provision Single Authorized Office Account in Supabase
 *
 * This script uses the Supabase service-role client to:
 * 1. Ensure the single office user exists in Supabase Auth.
 * 2. Assign the office user to the designated Unit (default: DCP Zone 3) and Police Station.
 * 3. Create or update their profile in the `profiles` table with role = 'office'.
 *
 * Usage:
 *   node scripts/setup_office_account.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OFFICE_EMAIL = process.env.OFFICE_EMAIL || 'office@stationtrack.local';
const OFFICE_PASSWORD = process.env.OFFICE_PASSWORD || 'office123';
const ASSIGNED_UNIT = process.env.OFFICE_UNIT || 'DCP Zone 3';

async function setupOfficeAccount() {
  console.log('\n=====================================================================');
  console.log('  STATIONTRACK — SINGLE OFFICE ACCOUNT INITIALIZATION');
  console.log('=====================================================================\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_URL.includes('your-project') || SUPABASE_URL.includes('PLACEHOLDER')) {
    console.error('❌ ERROR: Supabase credentials not configured in .env');
    console.error('Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before running this script.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log(`[1/4] Checking assigned unit "${ASSIGNED_UNIT}"...`);
  const { data: unit, error: unitErr } = await supabase
    .from('units')
    .select('id, name')
    .eq('name', ASSIGNED_UNIT)
    .single();

  if (unitErr || !unit) {
    console.error(`❌ Unit "${ASSIGNED_UNIT}" not found. Did you run the database migrations (001_initial_schema.sql and 003_seed_units.sql)?`);
    process.exit(1);
  }

  console.log(`[2/4] Fetching police station for "${ASSIGNED_UNIT}"...`);
  const { data: station, error: stErr } = await supabase
    .from('police_stations')
    .select('id, name')
    .eq('unit_id', unit.id)
    .limit(1)
    .single();

  if (stErr || !station) {
    console.error(`❌ Police station not found for unit "${ASSIGNED_UNIT}".`);
    process.exit(1);
  }

  console.log(`[3/4] Ensuring office account in Supabase Auth (${OFFICE_EMAIL})...`);
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Failed to list users:', listErr.message);
    process.exit(1);
  }

  let officeAuthUser = users.find(u => u.email.toLowerCase() === OFFICE_EMAIL.toLowerCase());

  if (!officeAuthUser) {
    console.log(`Creating new Supabase Auth user for ${OFFICE_EMAIL}...`);
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: OFFICE_EMAIL,
      password: OFFICE_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'office', full_name: 'Cybersecurity Internship Command Desk' }
    });

    if (createErr) {
      console.error('❌ Failed to create office auth user:', createErr.message);
      process.exit(1);
    }
    officeAuthUser = newUser.user;
    console.log('✓ Office Auth user created successfully.');
  } else {
    console.log(`✓ Office Auth user exists (ID: ${officeAuthUser.id}). Updating password & metadata...`);
    await supabase.auth.admin.updateUserById(officeAuthUser.id, {
      password: OFFICE_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'office', full_name: 'Cybersecurity Internship Command Desk' }
    });
  }

  console.log('[4/4] Upserting office profile in profiles table...');
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', officeAuthUser.id)
    .single();

  const profilePayload = {
    auth_user_id: officeAuthUser.id,
    full_name: 'Cybersecurity Internship Command Desk',
    email: OFFICE_EMAIL,
    role: 'office',
    unit_id: unit.id,
    police_station_id: station.id
  };

  if (existingProfile) {
    const { error: updateErr } = await supabase
      .from('profiles')
      .update(profilePayload)
      .eq('id', existingProfile.id);
    if (updateErr) {
      console.error('❌ Failed to update office profile:', updateErr.message);
      process.exit(1);
    }
  } else {
    const { error: insertErr } = await supabase
      .from('profiles')
      .insert(profilePayload);
    if (insertErr) {
      console.error('❌ Failed to insert office profile:', insertErr.message);
      process.exit(1);
    }
  }

  console.log('\n=====================================================================');
  console.log('  ✅ OFFICE ACCOUNT PROVISIONED SUCCESSFULLY');
  console.log('=====================================================================');
  console.log(`  Role            : office`);
  console.log(`  Email           : ${OFFICE_EMAIL}`);
  console.log(`  Password        : ${OFFICE_PASSWORD}`);
  console.log(`  Assigned Unit   : ${unit.name} (${unit.id})`);
  console.log(`  Assigned Station: ${station.name} (${station.id})`);
  console.log('=====================================================================\n');
}

setupOfficeAccount().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
