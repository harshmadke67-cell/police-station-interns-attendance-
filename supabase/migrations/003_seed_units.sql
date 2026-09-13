-- ============================================================
-- SEED DATA: Official Units (Zones)
-- This data is static and should only be run once
-- ============================================================

INSERT INTO public.units (name, code) VALUES
  ('DCP Zone 1', 'dcp_z1'),
  ('DCP Zone 2', 'dcp_z2'),
  ('DCP Zone 3', 'dcp_z3'),
  ('DCP Zone 4', 'dcp_z4'),
  ('DCP Zone 5', 'dcp_z5'),
  ('DCP Zone 6', 'dcp_z6'),
  ('Cyber PS', 'cyber_ps'),
  ('MT', 'mt'),
  ('DCP EOW', 'dcp_eow'),
  ('Wireless', 'wireless'),
  ('IT Section / Wireless', 'it_wireless'),
  ('DCP HQ', 'dcp_hq'),
  ('DCP Crime Reader', 'dcp_crime_reader'),
  ('DCP Crime', 'dcp_crime'),
  ('DCP SB', 'dcp_sb'),
  ('Jt CP', 'jt_cp'),
  ('Add. CP Crime', 'add_cp_crime'),
  ('Add. CP North Region', 'add_cp_north')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Create default police stations for each unit
-- Each unit gets one default station (same name as unit)
-- ============================================================

INSERT INTO public.police_stations (unit_id, name)
SELECT id, name FROM public.units
ON CONFLICT (unit_id, name) DO NOTHING;

-- Note: Admins can add additional stations per unit via API
