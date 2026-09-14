// ============================================================
// GRAVITY RUN CLUB — Edge Function: plan-atleta
// ============================================================
// Corre en Supabase Edge Functions (Deno). Es el único punto de
// acceso del atleta a sus propios datos: valida slug + PIN,
// aplica rate limiting (5 intentos → bloqueo de 15 minutos), y si
// todo está bien, trae en una sola llamada el plan de la semana
// y todo el historial de progreso.
//
// Corre con la Service Role Key (bypassa RLS), así que toda la
// lógica de "a qué puede acceder este atleta" vive acá adentro,
// no en políticas SQL — ver sql/02_rls_policies.sql para el porqué.
//
// Evolución: la primera versión de esta función solo resolvía el
// login y devolvía el plan de la semana. Se extendió más tarde
// para traer también el historial de progreso (registro_
// entrenamientos, registro_pesos, marcas_historial, observaciones_
// mensuales) y así alimentar la pestaña "Progreso" que se sumó
// después — ver README, sección "Cómo se construyó".
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function obtenerRutinaPF(sb, atleta) {
  // Prioridad: rutina personal del atleta > rutina de su subgrupo >
  // rutina genérica del club. La primera que tenga filas, gana.
  const { data: propia } = await sb.from('rutina_pf').select('*').eq('atleta_id', atleta.id).order('orden');
  if (propia && propia.length) return propia;
  const { data: delSubgrupo } = await sb.from('rutina_pf').select('*').eq('subgrupo', atleta.subgrupo).is('atleta_id', null).order('orden');
  if (delSubgrupo && delSubgrupo.length) return delSubgrupo;
  const { data: generica } = await sb.from('rutina_pf').select('*').is('atleta_id', null).is('subgrupo', null).order('orden');
  return generica || [];
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { slug, pin } = await req.json();
    if (!slug || !pin) {
      return new Response(JSON.stringify({ error: 'Falta slug o pin' }), { status: 400, headers: cors });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const MAX_INTENTOS = 5;
    const BLOQUEO_MINUTOS = 15;

    const { data: atletaBase } = await sb
      .from('atletas')
      .select('id, pin, intentos_fallidos, bloqueado_hasta')
      .eq('slug', slug)
      .eq('activo', true)
      .maybeSingle();

    const errorGenerico = () => new Response(JSON.stringify({ error: 'PIN incorrecto' }), { status: 401, headers: cors });

    if (!atletaBase) return errorGenerico();

    if (atletaBase.bloqueado_hasta && new Date(atletaBase.bloqueado_hasta) > new Date()) {
      return new Response(JSON.stringify({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' }), { status: 429, headers: cors });
    }

    if (atletaBase.pin !== pin) {
      const nuevosIntentos = (atletaBase.intentos_fallidos || 0) + 1;
      const update = { intentos_fallidos: nuevosIntentos };
      if (nuevosIntentos >= MAX_INTENTOS) {
        update.bloqueado_hasta = new Date(Date.now() + BLOQUEO_MINUTOS * 60000).toISOString();
        update.intentos_fallidos = 0;
      }
      await sb.from('atletas').update(update).eq('id', atletaBase.id);
      return errorGenerico();
    }

    await sb.from('atletas').update({ intentos_fallidos: 0, bloqueado_hasta: null }).eq('id', atletaBase.id);

    const { data: atleta, error: errAtleta } = await sb
      .from('atletas')
      .select('id, nombre, subgrupo, disciplina, slug, tiene_running, nivel_fuerza')
      .eq('id', atletaBase.id)
      .single();

    if (errAtleta || !atleta) return errorGenerico();

    const respuesta = {
      atleta, plan: [], zonas: [], ritmos: [], marcas: [], pf: [], planFuerza: [],
      registro: [], registroPesos: [], marcasHistorial: [], observaciones: []
    };

    const consultas = [];
    if (atleta.tiene_running) {
      consultas.push(
        sb.from('planes_semanales').select('*').eq('atleta_id', atleta.id).order('semana_inicio', { ascending: false }).then(r => respuesta.plan = r.data || []),
        sb.from('perfil_zonas_fc').select('*').eq('atleta_id', atleta.id).then(r => respuesta.zonas = r.data || []),
        sb.from('perfil_ritmos').select('*').eq('atleta_id', atleta.id).order('orden').then(r => respuesta.ritmos = r.data || []),
        sb.from('marcas_proyectadas').select('*').eq('atleta_id', atleta.id).order('orden').then(r => respuesta.marcas = r.data || []),
      );
    }
    if (atleta.nivel_fuerza === 'mantenimiento') {
      consultas.push(obtenerRutinaPF(sb, atleta).then(r => respuesta.pf = r));
    }
    if (atleta.nivel_fuerza === 'completo') {
      consultas.push(
        sb.from('planes_fuerza_semanales').select('*').eq('atleta_id', atleta.id).order('semana_inicio', { ascending: false }).order('orden').then(r => respuesta.planFuerza = r.data || [])
      );
    }
    // Progreso — siempre se trae, sin importar el tipo de plan
    consultas.push(
      sb.from('registro_entrenamientos').select('*').eq('atleta_id', atleta.id).order('fecha', { ascending: true }).then(r => respuesta.registro = r.data || []),
      sb.from('registro_pesos').select('*').eq('atleta_id', atleta.id).order('fecha', { ascending: true }).then(r => respuesta.registroPesos = r.data || []),
      sb.from('marcas_historial').select('*').eq('atleta_id', atleta.id).order('fecha', { ascending: true }).then(r => respuesta.marcasHistorial = r.data || []),
      sb.from('observaciones_mensuales').select('*').eq('atleta_id', atleta.id).order('semana_inicio', { ascending: false }).then(r => respuesta.observaciones = r.data || []),
    );
    await Promise.all(consultas);

    return new Response(JSON.stringify(respuesta), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: cors });
  }
});
