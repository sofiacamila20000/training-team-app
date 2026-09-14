-- ============================================================
-- GRAVITY RUN CLUB — Row Level Security
-- ============================================================
-- Modelo de acceso:
--   - El ENTRENADOR se autentica con Supabase Auth (email + contraseña)
--     y, una vez autenticado, tiene acceso total a todas las tablas.
--   - El ATLETA no tiene ninguna política propia. Sin política = sin
--     acceso directo a la base. Todo lo que el atleta ve o guarda pasa
--     por Edge Functions que corren con la Service Role Key (que
--     ignora RLS) y validan el PIN manualmente antes de responder.
--
-- Esta separación es deliberada: evita tener que replicar la lógica
-- de "a qué fila puede acceder este atleta" en política SQL, y la
-- concentra en un solo lugar (la Edge Function), donde también vive
-- el rate limiting de intentos de PIN.
-- ============================================================

alter table atletas enable row level security;
alter table perfil_zonas_fc enable row level security;
alter table perfil_ritmos enable row level security;
alter table rutina_pf enable row level security;
alter table marcas_proyectadas enable row level security;
alter table planes_semanales enable row level security;
alter table planes_fuerza_semanales enable row level security;
alter table cargas enable row level security;
alter table registro_entrenamientos enable row level security;
alter table registro_pesos enable row level security;
alter table marcas_historial enable row level security;
alter table observaciones_mensuales enable row level security;

-- push_subscripciones: se escribe desde el portal del atleta vía Edge
-- Function (Service Role, ignora RLS igual) y se lee solo desde la
-- futura función de envío de notificaciones (también Service Role).
-- No confirmado si RLS está habilitado en esta tabla en producción —
-- verificar antes de asumir el mismo patrón que el resto.

-- ------------------------------------------------------------
-- NOTA TÉCNICA: PostgreSQL no soporta "IF NOT EXISTS" en
-- CREATE POLICY (a diferencia de CREATE TABLE o CREATE INDEX).
-- El patrón correcto para que este script sea re-ejecutable sin
-- error es DROP POLICY IF EXISTS seguido de CREATE POLICY.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'atletas','perfil_zonas_fc','perfil_ritmos','rutina_pf','marcas_proyectadas',
    'planes_semanales','planes_fuerza_semanales','cargas',
    'registro_entrenamientos','registro_pesos','marcas_historial','observaciones_mensuales'
  ]
  loop
    execute format('drop policy if exists "coach acceso total" on %I;', t);
    execute format(
      'create policy "coach acceso total" on %I for all to authenticated using (true) with check (true);', t
    );
  end loop;
end $$;
