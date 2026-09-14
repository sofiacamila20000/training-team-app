-- ============================================================
-- Atletas activos sin ningún registro en los últimos 10 días
-- ============================================================
-- Pensada para que Eze (el entrenador) pueda priorizar a quién
-- contactar, en vez de revisar atleta por atleta a mano. Un LEFT
-- JOIN + filtro por fecha máxima nula o vieja detecta tanto a los
-- que nunca cargaron nada como a los que dejaron de hacerlo.
-- ============================================================

select
  a.id,
  a.nombre,
  a.subgrupo,
  a.whatsapp,
  max(r.fecha) as ultimo_registro,
  coalesce(current_date - max(r.fecha), 9999) as dias_sin_actividad
from atletas a
left join registro_entrenamientos r on r.atleta_id = a.id
where a.activo = true
group by a.id, a.nombre, a.subgrupo, a.whatsapp
having max(r.fecha) is null or max(r.fecha) < current_date - interval '10 days'
order by dias_sin_actividad desc;
