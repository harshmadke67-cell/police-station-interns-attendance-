-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Disable the public access by default
ALTER TABLE public.units DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.police_stations DISABLE ROW LEVEL SECURITY;

-- PROFILES: Students can read their own, office can read all
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_users_own" ON public.profiles;
CREATE POLICY "profiles_users_own" ON public.profiles
  FOR SELECT USING (
    auth.uid() = auth_user_id
    OR
    (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'office'
  );

DROP POLICY IF EXISTS "profiles_office_read_all" ON public.profiles;
CREATE POLICY "profiles_office_read_all" ON public.profiles
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'office'
  );

-- Students cannot insert/update/delete profiles (done server-side)
-- Office cannot modify profiles (done server-side)

-- DAILY_QR_TOKENS: Office can read their own, students cannot see
ALTER TABLE public.daily_qr_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_tokens_office_own" ON public.daily_qr_tokens;
CREATE POLICY "qr_tokens_office_own" ON public.daily_qr_tokens
  FOR SELECT USING (
    office_user_id = auth.uid()
    AND
    (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'office'
  );

-- Tokens are created/updated/deleted server-side only (no direct client access)

-- ATTENDANCE: Students can see their own, office can see their unit/station
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_students_own" ON public.attendance;
CREATE POLICY "attendance_students_own" ON public.attendance
  FOR SELECT USING (
    student_id = auth.uid()
  );

DROP POLICY IF EXISTS "attendance_office_read_own_station" ON public.attendance;
CREATE POLICY "attendance_office_read_own_station" ON public.attendance
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'office'
    AND
    police_station_id = (
      SELECT police_station_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
    AND
    unit_id = (
      SELECT unit_id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Attendance records are created/updated server-side only

-- AUDIT_LOGS: Authenticated users can view, sensitive data logged by server
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_authenticated_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authenticated_read" ON public.audit_logs
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'office'
  );

-- Logs created by server-side functions only
