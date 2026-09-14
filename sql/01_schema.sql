-- ============================================================
-- GRAVITY RUN CLUB — Esquema de base de datos (PostgreSQL / Supabase)
-- ============================================================
-- Este archivo refleja el estado real de producción, verificado
-- columna por columna contra information_schema.columns (no es
-- un resumen escrito a mano). Las constraints (PRIMARY KEY,
-- FOREIGN KEY, UNIQUE) se mantienen tal como se diseñaron
-- originalmente; el resto de cada columna (tipo, nullability,
-- default) fue confirmado contra la base real.
--
-- No incluye la función que envía las notificaciones push en sí
-- (ver docs de la Edge Function correspondiente) — la tabla de
-- suscripciones (push_subscripciones) sí está en producción y
-- se puebla activamente desde el portal del atleta.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- ATLETAS
-- ============================================================
create table if not exists atletas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  subgrupo          text not null,
  whatsapp          text,
  pin               char(4) not null unique,
  slug              text not null unique,
  disciplina        text,
  fecha_ingreso     date,
  peso_kg           numeric(5,2),
  altura_m          numeric(4,2),
  fecha_nacimiento  date,
  tiene_running     boolean not null default true,
  nivel_fuerza      text not null default 'ninguno', -- 'ninguno' | 'mantenimiento' | 'completo'
  intentos_fallidos int not null default 0,
  bloqueado_hasta   timestamptz,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  -- Columna legacy: precede al modelo actual (tiene_running + nivel_fuerza),
  -- que reemplazó a este campo único para permitir combinaciones (un atleta
  -- puede tener running Y fuerza a la vez). No la usa ningún archivo del
  -- frontend — se conserva en la tabla pero es candidata a eliminarse.
  tipo_plan         text not null default 'running'
);

-- ============================================================
-- PERFIL DE REFERENCIA (zonas, ritmos, marcas, rutina de mantenimiento)
-- ============================================================
create table if not exists perfil_zonas_fc (
  id             uuid primary key default gen_random_uuid(),
  atleta_id      uuid not null references atletas(id) on delete cascade,
  zona           text not null,
  nombre_zona    text,
  porcentaje_max numeric(5,2) not null,
  porcentaje_min numeric(5,2),
  pulso_max      numeric(5,1) not null,
  pulso_min      numeric(5,1),
  actualizado_en timestamptz not null default now(),
  unique (atleta_id, zona)
);

create table if not exists perfil_ritmos (
  id           uuid primary key default gen_random_uuid(),
  atleta_id    uuid not null references atletas(id) on delete cascade,
  porcentaje   numeric(5,2) not null,
  ritmo        text not null,
  distancia    text,
  orden        int not null default 0
);

create table if not exists marcas_proyectadas (
  id             uuid primary key default gen_random_uuid(),
  atleta_id      uuid not null references atletas(id) on delete cascade,
  distancia      text not null,
  tiempo         text not null,
  notas          text,
  orden          int not null default 0,
  actualizado_en timestamptz not null default now()
);

-- rutina_pf: atleta_id null + subgrupo null = rutina genérica del club.
-- atleta_id null + subgrupo puesto = rutina de ese subgrupo.
-- atleta_id puesto = rutina personal (tiene prioridad sobre las otras dos).
create table if not exists rutina_pf (
  id           uuid primary key default gen_random_uuid(),
  atleta_id    uuid references atletas(id) on delete cascade,
  subgrupo     text,
  ejercicio    text not null,
  series       int,
  repeticiones text,
  orden        int not null default 0
);

-- ============================================================
-- PLANES SEMANALES (contenido editorial — se borra a los 30 días)
-- ============================================================
create table if not exists planes_semanales (
  id                 uuid primary key default gen_random_uuid(),
  atleta_id          uuid not null references atletas(id) on delete cascade,
  semana_inicio      date not null,
  dia                text not null,
  fase               text,        -- 'Entrada en calor' | 'Principal' | 'Afloje' | null
  tipo               text not null,
  zona               text,
  sesion             text,
  descripcion        text,
  dist_min_km        numeric(5,1),
  dist_max_km        numeric(5,1),
  completado         boolean not null default false,
  km_reales          numeric(5,1),
  ritmo_feedback     text,        -- 'debajo' | 'en_rango' | 'encima'
  observacion_atleta text,
  creado_en          timestamptz not null default now(),
  unique (atleta_id, semana_inicio, dia, fase)
);

create table if not exists planes_fuerza_semanales (
  id             uuid primary key default gen_random_uuid(),
  atleta_id      uuid not null references atletas(id) on delete cascade,
  semana_inicio  date not null,
  bloque         text not null,
  tipo           text not null, -- 'Entrada en calor' | 'Ejercicio' | 'Afloje'
  ejercicio      text not null,
  series         int,
  repeticiones   text,
  peso           text,          -- lo que pidió el entrenador
  peso_logrado   text,          -- lo que el atleta reporta
  detalle        text,
  completado     boolean not null default false,
  orden          int not null default 0,
  creado_en      timestamptz not null default now()
);

create table if not exists cargas (
  id                    uuid primary key default gen_random_uuid(),
  archivo_nombre        text not null,
  subido_en             timestamptz not null default now(),
  filas_totales         int not null default 0,
  filas_publicadas      int not null default 0,
  filas_advertencia     int not null default 0,
  detalle_advertencias  jsonb,
  estado                text not null default 'procesado'
);

-- ============================================================
-- PROGRESO (histórico — nunca se borra, a diferencia de los planes)
-- ============================================================
create table if not exists registro_entrenamientos (
  id             uuid primary key default gen_random_uuid(),
  atleta_id      uuid not null references atletas(id) on delete cascade,
  fecha          date not null,
  tipo           text not null, -- 'running' | 'fuerza'
  completado     boolean not null default true,
  dist_min_km    numeric(5,1),
  dist_max_km    numeric(5,1),
  km_reales      numeric(5,1),
  ritmo_feedback text,
  observacion    text,
  visto          boolean not null default false, -- lo usa el panel de Seguimiento del coach
  creado_en      timestamptz not null default now(),
  unique (atleta_id, fecha, tipo)
);

create table if not exists registro_pesos (
  id           uuid primary key default gen_random_uuid(),
  atleta_id    uuid not null references atletas(id) on delete cascade,
  ejercicio    text not null,
  fecha        date not null,
  peso_logrado text not null,
  creado_en    timestamptz not null default now()
);

create table if not exists marcas_historial (
  id              uuid primary key default gen_random_uuid(),
  atleta_id       uuid not null references atletas(id) on delete cascade,
  distancia       text not null,
  tiempo_anterior text,
  tiempo_nuevo    text not null,
  fecha           date not null default current_date,
  creado_en       timestamptz not null default now()
);

-- Nota: la columna real de esta tabla es "semana_inicio" (a pesar del
-- nombre de la tabla, que sugiere "mensual"). Confirmado contra la
-- base real luego de una discrepancia con una versión anterior de
-- este documento — ver README, sección "Desafíos".
create table if not exists observaciones_mensuales (
  id             uuid primary key default gen_random_uuid(),
  atleta_id      uuid not null references atletas(id) on delete cascade,
  semana_inicio  date not null,
  texto          text not null,
  actualizado_en timestamptz not null default now(),
  unique (atleta_id, semana_inicio)
);

-- ============================================================
-- NOTIFICACIONES PUSH (infraestructura desplegada; el envío
-- todavía no — ver README, sección "Próximos pasos")
-- ============================================================
create table if not exists push_subscripciones (
  id         uuid primary key default gen_random_uuid(),
  atleta_id  uuid not null references atletas(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  creado_en  timestamptz not null default now(),
  unique (atleta_id, endpoint)
);

-- ============================================================
-- ÍNDICES
-- ============================================================
create index if not exists idx_planes_atleta_semana on planes_semanales (atleta_id, semana_inicio);
create index if not exists idx_fuerza_atleta_semana on planes_fuerza_semanales (atleta_id, semana_inicio);
create index if not exists idx_atletas_slug on atletas (slug);
create index if not exists idx_atletas_pin on atletas (pin);
create index if not exists idx_registro_atleta_fecha on registro_entrenamientos (atleta_id, fecha);
create index if not exists idx_pesos_atleta_ejercicio on registro_pesos (atleta_id, ejercicio, fecha);

-- ============================================================
-- Verificación final
-- ============================================================
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
