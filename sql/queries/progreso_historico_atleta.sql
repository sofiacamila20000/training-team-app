-- ============================================================
-- ¿Cómo viene entrenando un atleta en los últimos 3 meses?
-- ============================================================
-- Alimenta la pestaña "Progreso" del portal del atleta (vista Año).
-- Combina el cumplimiento (completado sí/no), el volumen real vs.
-- el pedido, y el feedback de ritmo que el propio atleta cargó.
--
-- La comparación km_reales vs. (dist_min_km + dist_max_km) / 2 es lo
-- que permite mostrarle al atleta si viene corriendo más o menos de
-- lo pedido, sin que el entrenador tenga que calcularlo a mano.
-- ============================================================

select
  r.fecha,
  r.tipo,
  r.completado,
  r.km_reales,
  round((r.dist_min_km + coalesce(r.dist_max_km, r.dist_min_km)) / 2.0, 1) as km_pedidos_promedio,
  r.km_reales - round((r.dist_min_km + coalesce(r.dist_max_km, r.dist_min_km)) / 2.0, 1) as diferencia_km,
  r.ritmo_feedback,
  r.observacion
from registro_entrenamientos r
where r.atleta_id = $1
  and r.fecha >= current_date - interval '3 months'
order by r.fecha desc;
