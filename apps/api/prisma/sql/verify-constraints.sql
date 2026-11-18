-- Run after `prisma migrate dev` to confirm every hand-written constraint from
-- constraints.sql exists:  psql "$DATABASE_URL" -f prisma/sql/verify-constraints.sql
-- Every row should say "ok".

WITH expected(name, kind) AS (
  VALUES
    ('users_designer_has_permission',  'check'),
    ('machines_quantity_positive',     'check'),
    ('machine_revisions_rev_range',    'check'),
    ('machine_revisions_release_info', 'check'),
    ('machine_revisions_release_notes','check'),
    ('cabinets_positive_size',         'check'),
    ('platens_positive_size',          'check'),
    ('components_size_non_negative',   'check'),
    ('components_phases',              'check'),
    ('components_rail_offset',         'check'),
    ('components_profile_shape',       'check'),
    ('components_builtin_rail',        'check'),
    ('placements_rotation',            'check'),
    ('cabinet_openings_shape',         'check'),
    ('machine_revisions_one_working',  'index'),
    ('users_username_lower_key',       'index'),
    ('components_one_rail',            'index')
)
SELECT e.name,
       e.kind,
       CASE
         WHEN e.kind = 'check' AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = e.name AND c.contype = 'c') THEN 'ok'
         WHEN e.kind = 'index' AND EXISTS (SELECT 1 FROM pg_indexes i WHERE i.indexname = e.name) THEN 'ok'
         ELSE 'MISSING'
       END AS status
FROM expected e
ORDER BY status DESC, e.name;
