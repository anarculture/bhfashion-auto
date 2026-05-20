-- ============================================================
-- BH Fashion — DDL: Schemas para Issue #1
-- Echo E2E: Sheets → Apps Script → n8n → Postgres → ack
-- ============================================================
-- Idempotente: seguro de ejecutar múltiples veces.
-- ============================================================

-- ── ENUM para estado de deployment ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_deploy') THEN
    CREATE TYPE estado_deploy AS ENUM (
      'Borrador',
      'Pendiente',
      'Desplegando',
      'Desplegado',
      'Error',
      'Finalizado'
    );
  END IF;
END
$$;

-- ── Tabla 1: deployments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS deployments (
  id              SERIAL PRIMARY KEY,
  campaña         TEXT NOT NULL,
  ig_post_url     TEXT NOT NULL,
  presupuesto_diario NUMERIC NOT NULL,
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  audiencia       TEXT NOT NULL,
  placements      TEXT DEFAULT 'automatic',
  fila_sheets     INT,
  spreadsheet_id  TEXT,
  estado          estado_deploy NOT NULL DEFAULT 'Pendiente',
  campaign_id     TEXT,
  adset_id        TEXT,
  ad_id           TEXT,
  error_log       TEXT,
  desplegado_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tabla 2: campaigns_meta ────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns_meta (
  nombre          TEXT PRIMARY KEY,
  campaign_id     TEXT,
  objective       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT campaigns_meta_nombre_unique UNIQUE (nombre)
);

-- ── Tabla 3: metrics_snapshots ─────────────────────────────
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  ad_id              TEXT NOT NULL,
  captured_at        TIMESTAMPTZ NOT NULL,
  "window"           TEXT NOT NULL,
  spend              NUMERIC,
  impressions        BIGINT,
  inline_link_clicks BIGINT,
  purchases_count    INT,
  purchases_value    NUMERIC,
  frequency          NUMERIC,
  reach              BIGINT,
  raw_insights       JSONB,
  PRIMARY KEY (ad_id, captured_at, "window")
);

-- ── Tabla 4: alerts_sent ───────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts_sent (
  id              SERIAL PRIMARY KEY,
  ad_id           TEXT NOT NULL,
  regla           TEXT NOT NULL,
  last_sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alerts_sent_cooldown UNIQUE (ad_id, regla)
);

-- ── Índices útiles ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deployments_estado
  ON deployments (estado);

CREATE INDEX IF NOT EXISTS idx_deployments_campaña
  ON deployments (campaña);

CREATE INDEX IF NOT EXISTS idx_metrics_ad_window
  ON metrics_snapshots (ad_id, "window");

CREATE INDEX IF NOT EXISTS idx_alerts_sent_cooldown
  ON alerts_sent (ad_id, regla, last_sent_at);
