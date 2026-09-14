// ============================================================
// GRAVITY RUN CLUB — Notificaciones (3 disparadores)
// ============================================================
// Se invoca desde el frontend como FUNCION_NOTIFICACIONES =
// 'notificaciones-function' (placeholder hasta confirmar el
// nombre real una vez desplegada — ver comentario en
// cargar-planilla-conectado.html y editor-perfil.html).
//
// 1. Recordatorio diario (sin body, la llama el cron a las 7am):
//    revisa quién entrena hoy y le avisa.
// 2. Plan nuevo publicado (la llama cargar-planilla-conectado.html):
//    body = { tipo: 'plan_nuevo', atletaIds: [...] }
// 3. Nota nueva del entrenador (la llama editor-perfil.html):
//    body = { tipo: 'nota_nueva', atletaId: '...' }
//
// LÍMITE CONOCIDO (a propósito, no un descuido): el disparador 1
// solo consulta planes_semanales (running), que es la única tabla
// con estructura por día de la semana. planes_fuerza_semanales se
// organiza por "bloque" sin día fijo asociado, porque los días de
// entreno de fuerza varían de atleta a atleta y no siguen un
// calendario semanal regular como sí lo hace running — forzarle
// esa estructura al modelo hubiera sido inventar una regularidad
// que no existe. Hoy el grupo de atletas de fuerza pura
// (tiene_running: false) es chico, así que el costo de esta
// brecha es bajo; revisar si crece.
//
// IMPORTANTE: cargar la clave privada VAPID como "secret" de esta
// función (Project Settings → Edge Functions → Secrets), con el
// nombre VAPID_PRIVATE_KEY. Nunca va escrita en este archivo.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

// Clave pública VAPID — a diferencia de la privada, esta SÍ es
// pública por diseño (viaja también al navegador del atleta, ver
// portal-atleta-conectado.html). Placeholder acá por consistencia
// con el resto del repo, pero no requiere el mismo cuidado que un
// secret real.
const VAPID_PUBLIC_KEY = 'TU_VAPID_PUBLIC_KEY';

const DIAS_JS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function lunesDeHoy() {
  const hoy = new Date();
  const dow = hoy.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const d = new Date(hoy);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// Envía a todas las suscripciones activas de una lista de atletas.
// Si una suscripción devuelve 410 (Gone) o 404, el navegador la
// invalidó del lado del atleta (por ejemplo, reinstaló la app o
// borró datos del sitio) — se borra sola de la tabla en vez de
// seguir intentando enviarle para siempre.
async function enviarATodos(sb, atletaIds, titulo, cuerpo) {
  const { data: suscripciones } = await sb
    .from('push_subscripciones')
    .select('*')
    .in('atleta_id', atletaIds);

  let enviados = 0, fallidos = 0;
  for (const sus of (suscripciones || [])) {
    try {
      await webpush.sendNotification(
        { endpoint: sus.endpoint, keys: { p256dh: sus.p256dh, auth: sus.auth } },
        JSON.stringify({ title: titulo, body: cuerpo })
      );
      enviados++;
    } catch (e) {
      fallidos++;
      if (e.statusCode === 410 || e.statusCode === 404) {
        await sb.from('push_subscripciones').delete().eq('id', sus.id);
      }
    }
  }
  return { enviados, fallidos };
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    webpush.setVapidDetails(
      'mailto:contacto@gravityrunclub.online',
      VAPID_PUBLIC_KEY,
      Deno.env.get('VAPID_PRIVATE_KEY')
    );

    let body = {};
    try { body = await req.json(); } catch (e) { /* sin body = disparo diario del cron */ }

    // --- Disparador 2: plan nuevo publicado ---
    if (body.tipo === 'plan_nuevo') {
      if (!Array.isArray(body.atletaIds) || !body.atletaIds.length) {
        return new Response(JSON.stringify({ error: 'Falta la lista de atletas' }), { status: 400, headers: cors });
      }
      const r = await enviarATodos(sb, body.atletaIds, 'Gravity Run Club', 'Tu entrenador subió tu plan de la semana — ya lo podés ver.');
      return new Response(JSON.stringify({ ok: true, ...r }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // --- Disparador 3: nota nueva del entrenador ---
    if (body.tipo === 'nota_nueva') {
      if (!body.atletaId) {
        return new Response(JSON.stringify({ error: 'Falta el atleta' }), { status: 400, headers: cors });
      }
      const r = await enviarATodos(sb, [body.atletaId], 'Gravity Run Club', 'Tu entrenador te dejó una devolución nueva — mirala en Progreso.');
      return new Response(JSON.stringify({ ok: true, ...r }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // --- Disparador 1: recordatorio diario (default, sin body) ---
    // Ver la nota al principio del archivo: esto solo cubre running.
    const hoyNombre = DIAS_JS[new Date().getDay()];
    const semanaInicio = lunesDeHoy();

    const { data: entrenaRunning } = await sb
      .from('planes_semanales')
      .select('atleta_id')
      .eq('semana_inicio', semanaInicio)
      .eq('dia', hoyNombre)
      .eq('tipo', 'Entreno');

    const idsRunning = [...new Set((entrenaRunning || []).map(r => r.atleta_id))];
    if (!idsRunning.length) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, motivo: 'nadie entrena hoy' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const r = await enviarATodos(sb, idsRunning, 'Gravity Run Club', 'Hoy tenés entreno — abrí la app para ver el plan del día.');
    return new Response(JSON.stringify({ ok: true, ...r }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500, headers: cors });
  }
});
