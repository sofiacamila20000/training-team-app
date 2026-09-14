-- ============================================================
-- GRAVITY RUN CLUB — Tareas programadas
-- ============================================================
-- Los planes semanales (contenido editorial, no histórico) se
-- borran automáticamente pasados 30 días, con una ventana rodante.
-- Esto mantiene esas tablas livianas indefinidamente sin
-- intervención manual — el histórico real de lo que el atleta
-- efectivamente hizo vive aparte, en registro_entrenamientos y
-- registro_pesos, que nunca se borran (ver 01_schema.sql).
-- ============================================================

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'limpieza-planes-mensual',
  '0 3 * * *', -- todos los días a las 3am, revisa y borra lo vencido
  $$
    delete from planes_semanales
    where semana_inicio < (current_date - interval '30 days');

    delete from planes_fuerza_semanales
    where semana_inicio < (current_date - interval '30 days');
  $$
);
