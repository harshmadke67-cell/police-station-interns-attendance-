-- ============================================================
-- STATIONTRACK SUPABASE SCHEMA - Initial Migration
-- Created for Police Cybersecurity Internship Attendance
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- UNITS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT units_name_not_empty CHECK (TRIM(name) != '')
);

CREATE INDEX IF NOT EXISTS idx_units_name ON public.units(name);
CREATE INDEX IF NOT EXISTS idx_units_code ON public.units(code);

-- ============================================================
-- POLICE STATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.police_stations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT police_stations_unit_name_unique UNIQUE(unit_id, name),
  CONSTRAINT police_stations_name_not_empty CHECK (TRIM(name) != '')
);

CREATE INDEX IF NOT EXISTS idx_police_stations_unit ON public.police_stations(unit_id);
CREATE INDEX IF NOT EXISTS idx_police_stations_name ON public.police_stations(name);

-- ============================================================
-- PROFILES TABLE (connected to auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('student', 'office')),
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  police_station_id UUID REFERENCES public.police_stations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT profile_full_name_not_empty CHECK (TRIM(full_name) != '')
);

CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON public.profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON public.profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_unit_id ON public.profiles(unit_id);
CREATE INDEX IF NOT EXISTS idx_profiles_police_station_id ON public.profiles(police_station_id);

-- ============================================================
-- DAILY QR TOKENS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_qr_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT NOT NULL UNIQUE,
  office_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  police_station_id UUID NOT NULL REFERENCES public.police_stations(id) ON DELETE CASCADE,
  qr_date DATE NOT NULL,
  active BOOLEAN DEFAULT true,
  generation INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT daily_qr_tokens_unique_date UNIQUE(office_user_id, qr_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_qr_tokens_date ON public.daily_qr_tokens(qr_date);
CREATE INDEX IF NOT EXISTS idx_daily_qr_tokens_office ON public.daily_qr_tokens(office_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_qr_tokens_token ON public.daily_qr_tokens(token);
CREATE INDEX IF NOT EXISTS idx_daily_qr_tokens_active ON public.daily_qr_tokens(active);

-- ============================================================
-- ATTENDANCE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  police_station_id UUID NOT NULL REFERENCES public.police_stations(id) ON DELETE CASCADE,
  qr_token_id UUID REFERENCES public.daily_qr_tokens(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'late')),
  check_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT attendance_unique_student_date UNIQUE(student_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_unit ON public.attendance(unit_id);
CREATE INDEX IF NOT EXISTS idx_attendance_station ON public.attendance(police_station_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, attendance_date);

-- ============================================================
-- AUDIT LOG TABLE (optional but recommended)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at);

-- ============================================================
-- COMMENT ON TABLES (for clarity)
-- ============================================================
COMMENT ON TABLE public.units IS 'Police department units/zones for the internship program';
COMMENT ON TABLE public.police_stations IS 'Police stations within each unit';
COMMENT ON TABLE public.profiles IS 'User profiles connected to auth.users - tracks students and office account';
COMMENT ON TABLE public.daily_qr_tokens IS 'Day-long QR verification tokens for attendance check-in';
COMMENT ON TABLE public.attendance IS 'Student attendance records - one per student per day';
COMMENT ON TABLE public.audit_logs IS 'Audit trail for security-sensitive operations';

-- Set up timestamps trigger function (for updated_at)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
