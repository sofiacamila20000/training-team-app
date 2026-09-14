-- ============================================================
-- % de adherencia del mes, por atleta
-- ============================================================
-- Es la query detrás del bloque "4/5 entrenos completados · 80%
-- adherencia" que ve el atleta en la pestaña Progreso, y la base
-- para que el entrenador identifique rápido quién se está
-- despegando del plan antes de que sea un problema de semanas.
--
-- Adherencia = entrenos marcados completado=true sobre el total de
-- entrenos con tipo='Entreno' registrados ese mes (los días de
-- descanso no entran en el cálculo).
-- ============================================================

select
  a.id as atleta_id,
  a.nombre,
  a.subgrupo,
  count(*) filter (where r.tipo = 'running')                              as entrenos_running,
  count(*) filter (where r.tipo = 'running' and r.completado)             as running_completados,
  count(*) filter (where r.tipo = 'fuerza')                               as entrenos_fuerza,
  count(*) filter (where r.tipo = 'fuerza' and r.completado)              as fuerza_completados,
  round(
    100.0 * count(*) filter (where r.completado)
    / nullif(count(*), 0)
  , 0) as pct_adherencia
from atletas a
join registro_entrenamientos r
  on r.atleta_id = a.id
 and date_trunc('month', r.fecha) = date_trunc('month', current_date)
where a.activo = true
group by a.id, a.nombre, a.subgrupo
order by pct_adherencia asc; -- los que necesitan seguimiento primero
