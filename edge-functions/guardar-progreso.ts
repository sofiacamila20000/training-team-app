// ============================================================
// GRAVITY RUN CLUB — Edge Function: guardar-progreso
// ============================================================
// Desplegada en Supabase como "rapid-task" (el nombre del archivo
// no coincide con el nombre real de la función — Supabase asigna
// el nombre al momento del deploy, no lo toma del archivo fuente;
// mismo caso que plan-atleta, que en algún momento se llamó
// "dynamic-processor"). El frontend la referencia como
// FUNCION_GUARDAR = 'rapid-task' en portal-atleta-conectado.html.
//
// Recibe el feedback que carga el atleta (marcar como hecho, km
// reales, ritmo, peso logrado) y lo guarda en dos lugares:
//   1. La fila de esa semana puntual (para que se vea ahí mismo)
//   2. El registro permanente (para los gráficos de progreso,
//      que sobreviven aunque el plan detallado se borre al mes)
//
// Valida el PIN igual que la función de lectura — nunca confía en
// el slug solo.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const { slug, pin, tipo } = body; // tipo: 'running' | 'fuerza' | 'push_subscribe'
    if (!slug || !pin || !tipo) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: cors });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // Misma validación de PIN que la función de lectura (sin el
    // bloqueo por intentos acá, porque para llegar a esta pantalla
    // ya tuvo que pasar por el login del portal antes).
    const { data: atleta } = await sb
      .from('atletas')
      .select('id, pin, activo')
      .eq('slug', slug)
      .eq('activo', true)
      .maybeSingle();

    if (!atleta || atleta.pin !== pin) {
      return new Response(JSON.stringify({ error: 'PIN incorrecto' }), { status: 401, headers: cors });
    }

    if (tipo === 'running') {
      const { semanaInicio, dia, fase, completado, kmReales, ritmoFeedback, observacion, distMin, distMax } = body;
      if (!semanaInicio || !dia) {
        return new Response(JSON.stringify({ error: 'Falta semana o día' }), { status: 400, headers: cors });
      }

      // 1. Actualiza la fila (o filas, si el día tiene fases) de esa semana
      let q = sb.from('planes_semanales').update({
        completado: completado ?? true,
        km_reales: kmReales ?? null,
        ritmo_feedback: ritmoFeedback ?? null,
        observacion_atleta: observacion ?? null,
      }).eq('atleta_id', atleta.id).eq('semana_inicio', semanaInicio).eq('dia', dia);
      if (fase) q = q.eq('fase', fase); else q = q.is('fase', null);
      const { error: errUpdate } = await q;
      if (errUpdate) throw errUpdate;

      // 2. Guarda (o actualiza) el registro permanente para esa fecha exacta.
      // El onConflict acá sí está confirmado: coincide con la unique
      // constraint (atleta_id, fecha, tipo) de registro_entrenamientos.
      const DIA_ORDEN = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
      const offset = DIA_ORDEN.indexOf(dia);
      const fechaExacta = new Date(semanaInicio + 'T00:00:00Z');
      fechaExacta.setUTCDate(fechaExacta.getUTCDate() + offset);
      const fechaISO = fechaExacta.toISOString().slice(0, 10);

      const { error: errRegistro } = await sb.from('registro_entrenamientos').upsert({
        atleta_id: atleta.id,
        fecha: fechaISO,
        tipo: 'running',
        completado: completado ?? true,
        dist_min_km: distMin ?? null,
        dist_max_km: distMax ?? null,
        km_reales: kmReales ?? null,
        ritmo_feedback: ritmoFeedback ?? null,
        observacion: observacion ?? null,
      }, { onConflict: 'atleta_id,fecha,tipo' });
      if (errRegistro) throw errRegistro;

    } else if (tipo === 'fuerza') {
      const { semanaInicio, bloque, completado, pesos, fecha } = body; // pesos: [{ id, pesoLogrado }]
      if (!semanaInicio || !bloque) {
        return new Response(JSON.stringify({ error: 'Falta semana o bloque' }), { status: 400, headers: cors });
      }

      // 1. Marca como hecho todas las filas de ese bloque, y guarda el peso logrado por ejercicio
      const { error: errCompletado } = await sb.from('planes_fuerza_semanales')
        .update({ completado: completado ?? true })
        .eq('atleta_id', atleta.id).eq('semana_inicio', semanaInicio).eq('bloque', bloque);
      if (errCompletado) throw errCompletado;

      if (Array.isArray(pesos)) {
        for (const p of pesos) {
          if (!p.id) continue;
          const { error: errPeso } = await sb.from('planes_fuerza_semanales')
            .update({ peso_logrado: p.pesoLogrado ?? null })
            .eq('id', p.id).eq('atleta_id', atleta.id);
          if (errPeso) throw errPeso;
          if (p.pesoLogrado && p.ejercicio) {
            await sb.from('registro_pesos').insert({
              atleta_id: atleta.id,
              ejercicio: p.ejercicio,
              fecha: fecha || new Date().toISOString().slice(0, 10),
              peso_logrado: p.pesoLogrado,
            });
          }
        }
      }

      // 2. Registro permanente del bloque completado
      const { error: errRegistro } = await sb.from('registro_entrenamientos').upsert({
        atleta_id: atleta.id,
        fecha: fecha || new Date().toISOString().slice(0, 10),
        tipo: 'fuerza',
        completado: completado ?? true,
      }, { onConflict: 'atleta_id,fecha,tipo' });
      if (errRegistro) throw errRegistro;

    } else if (tipo === 'push_subscribe') {
      const { endpoint, p256dh, authKey } = body;
      if (!endpoint || !p256dh || !authKey) {
        return new Response(JSON.stringify({ error: 'Falta la suscripción completa' }), { status: 400, headers: cors });
      }
// Guarda o actualiza la suscripción push del atleta. onConflict
// confirmado contra producción: existe la unique constraint
// push_subscripciones_atleta_id_endpoint_key sobre (atleta_id, endpoint).
      const { error: errSub } = await sb.from('push_subscripciones').upsert({
        atleta_id: atleta.id, endpoint, p256dh, auth: authKey,
      }, { onConflict: 'atleta_id,endpoint' });
      if (errSub) throw errSub;

    } else {
      return new Response(JSON.stringify({ error: 'Tipo inválido' }), { status: 400, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'No se pudo guardar: ' + (e.message || e) }), { status: 500, headers: cors });
  }
});
