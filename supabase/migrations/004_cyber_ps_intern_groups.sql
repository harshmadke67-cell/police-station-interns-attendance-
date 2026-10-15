-- Provide distinct, assignment-scoped attendance groups for Cyber PS interns.
INSERT INTO public.police_stations (unit_id, name)
SELECT id, group_name
FROM public.units
CROSS JOIN (VALUES ('South Interns'), ('North Interns')) AS groups(group_name)
WHERE public.units.name = 'Cyber PS'
ON CONFLICT (unit_id, name) DO NOTHING;
