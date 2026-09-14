-- ============================================================
-- ROSTER FICTICIO — solo para demo/portfolio
-- ============================================================
-- Reemplaza al roster real de 28 atletas. Mantiene la misma
-- estructura y la misma variedad de combinaciones (subgrupo,
-- tiene_running, nivel_fuerza) que existe en producción, para que
-- cualquiera que levante este esquema desde cero pueda probar
-- todos los caminos de la app sin ver datos reales de nadie.
-- ============================================================

insert into atletas (nombre, subgrupo, whatsapp, pin, slug, disciplina, tiene_running, nivel_fuerza, fecha_ingreso)
values
  ('Lucía Fernández',   '10k-21k',           '5491100000001', '1001', 'lucia-fernandez',   'Running',            true,  'ninguno',       '2024-03-01'),
  ('Martín Gómez',      '21k-30k',           '5491100000002', '1002', 'martin-gomez',      'Running',            true,  'mantenimiento', '2023-11-15'),
  ('Sofía Ibarra',      '3k-5k',             '5491100000003', '1003', 'sofia-ibarra',      'Running',            true,  'ninguno',       '2025-01-20'),
  ('Nicolás Paz',       '42k',               '5491100000004', '1004', 'nicolas-paz',       'Running',            true,  'completo',      '2022-06-10'),
  ('Camila Ríos',       'Juvenil',           '5491100000005', '1005', 'camila-rios',       'Running',            true,  'mantenimiento', '2024-09-05'),
  ('Federico Suárez',   'Preparación Física','5491100000006', '1006', 'federico-suarez',   'Preparación Física', false, 'completo',      '2024-02-14'),
  ('Valentina Torres',  '10k-21k',           '5491100000007', '1007', 'valentina-torres',  'Running',            true,  'completo',      '2023-08-22'),
  ('Agustín Vega',      '3k-5k',             '5491100000008', '1008', 'agustin-vega',      'Running',            true,  'ninguno',       '2025-04-11');

-- Zonas de FC, ritmos y marcas de ejemplo para un solo atleta
-- (Martín Gómez), a modo de referencia de cómo se cargan.
insert into perfil_zonas_fc (atleta_id, zona, nombre_zona, porcentaje_max, porcentaje_min, pulso_max, pulso_min)
select id, z.zona, z.nombre, z.pmax, z.pmin, z.fmax, z.fmin
from atletas, (values
  ('Z1', 'Aeróbica base',      75,  60, 138, 110),
  ('Z2', 'Aeróbica media',     85,  75, 156, 138),
  ('Z3', 'Umbral aeróbico',    90,  85, 165, 156),
  ('Z4', 'Umbral anaeróbico',  95,  90, 174, 165),
  ('Z5', 'Anaeróbico láctico', 100, 95, 183, 174)
) as z(zona, nombre, pmax, pmin, fmax, fmin)
where atletas.slug = 'martin-gomez';
