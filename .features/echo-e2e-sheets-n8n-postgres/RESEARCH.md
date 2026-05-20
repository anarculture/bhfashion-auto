# Research: Echo E2E — Sheets → Apps Script → n8n → Postgres → ack

**Issue**: [#1 — Echo extremo a extremo](https://github.com/anarculture/bhfashion-auto/issues/1)
**Date**: 2026-05-18
**Status**: PENDING DECISION

---

## Resumen del Issue

Conectar todas las capas de infraestructura para que un clic en Google Sheets viaje de extremo a extremo: **Apps Script → webhook n8n → Postgres → respuesta 200**. Sin llamadas a Meta API. Valida credenciales, conectividad y schema antes de cualquier gasto publicitario.

---

## Qué Existe Hoy

### Repo `bhfashion-auto`
- **CONTEXT.md**: define schema completo de tablas Postgres, hojas Sheets, estados, y flujo de datos. Es la fuente de verdad del dominio.
- **SETUP.md**: IDs Meta, credenciales n8n requeridas (Bearer Auth, Telegram Bot, Postgres BH Fashion), variables globales.
- **ADR-0001**: Postgres = state-of-truth, Sheets = UI. Claim atómico via `UPDATE...WHERE estado='Pendiente' RETURNING *`.
- **Workflow existente** (`Meta Ads Auto Deploy (Fixed).json`, ID `OlnXVeUxaptFE3r5`): workflow V1 legacy que va directo a Meta API. Incluye Gemini AI, Upload AdImage, Create Campaign/AdSet/Ad. **NO tiene nodo Postgres**. **NO tiene validación de payload**. Irrelevante para este issue — se construirá un workflow nuevo.

### n8n Instance
- URL: `https://n8n.gsnline.com`
- **Estado actual: NO RESPONDE** (verificado via MCP — `NO_RESPONSE`). Posiblemente caída o sin acceso de red desde este entorno.
- Credencial Postgres: referenciada en SETUP.md como `Postgres BH Fashion`, tipo Postgres. **Existencia no verificable sin n8n activo.**

### Google Sheets / Apps Script
- **No existe plantilla creada todavía.** CONTEXT.md define estructura de 3 hojas pero no hay spreadsheet real.
- **No existe código Apps Script todavía.**

### Postgres
- **Schemas no creados todavía.** CONTEXT.md define las 4 tablas pero no hay SQL DDL en el repo.

---

## Qué Hay que Construir (4 Capas)

### Capa 1: Postgres — DDL de Schemas

Tablas requeridas según CONTEXT.md + criterios del issue:

| Tabla | Campos clave | Restricciones |
|-------|-------------|---------------|
| `deployments` | id, campaña, ig_post_url, presupuesto_diario, fecha_inicio, fecha_fin, audiencia, estado, campaign_id, adset_id, ad_id, error_log, desplegado_at, created_at | `estado` = ENUM (Borrador, Pendiente, Desplegando, Desplegado, Error, Finalizado) |
| `campaigns_meta` | nombre, campaign_id, objective, created_at | `UNIQUE(nombre)` |
| `metrics_snapshots` | ad_id, captured_at, window, spend, impressions, inline_link_clicks, purchases_count, purchases_value, frequency, reach, raw_insights | `PRIMARY KEY (ad_id, captured_at, window)` |
| `alerts_sent` | ad_id, regla, last_sent_at | Cooldown 24h por (ad_id, regla) |

**Archivos a crear:**
- `sql/001_create_schemas.sql` — DDL completo, idempotente (`CREATE TABLE IF NOT EXISTS` + tipo ENUM)

### Capa 2: Google Sheets — Plantilla con 3 Hojas

| Hoja | Columnas | Validaciones |
|------|----------|--------------|
| **Deploys** | Campaña, IG Post URL, Presupuesto diario USD, Fecha inicio, Fecha fin, Audiencia, Placements, Desplegar (checkbox), Estado (dropdown), campaign_id, adset_id, ad_id, error_log, desplegado_at | `Desplegar` = checkbox. `Estado` = dropdown ENUM. |
| **Campañas** | nombre, objective, special_ad_categories | `objective` = dropdown con valores Meta. |
| **Audiencias** | alias, meta_audience_id, tipo | `tipo` = dropdown (custom, lookalike, saved). |

**Archivos a crear:**
- `apps-script/README.md` — instrucciones para crear Spreadsheet manualmente + setup de Apps Script
- Documentar estructura exacta de columnas para que el cliente la cree

### Capa 3: Apps Script — Menú "BH Ads → Desplegar Marcadas"

**Lógica:**
1. `onOpen()` → crea menú `BH Ads` con ítem `Desplegar Marcadas`
2. Al clic: lee hoja `Deploys`, filtra filas donde `Desplegar=TRUE AND Estado=Pendiente`
3. Para cada fila: construye objeto JSON con todos los campos
4. POST al webhook n8n (`https://n8n.gsnline.com/webhook/meta-ads-deploy`) con payload = array de filas
5. Al recibir 200: desmarca checkbox `Desplegar` en cada fila procesada
6. Muestra toast/alert con resultado

**Archivos a crear:**
- `apps-script/Code.gs` — código completo

### Capa 4: n8n Workflow `meta-ads-echo`

**Workflow nuevo** (NO modifica el existente). Flujo mínimo:

```
Webhook POST /meta-ads-deploy
  → Set node (log payload)
    → Postgres INSERT INTO deployments (estado='Pendiente')
      → Respond 200 {status: "ok", rows_inserted: N}
```

**Nodos:**
1. **Webhook**: POST, path `meta-ads-deploy`, `responseMode=lastNode`
2. **Code/Set**: extrae y valida campos del payload
3. **Postgres**: INSERT con campos mapeados, estado='Pendiente'
4. **Respond**: 200 con confirmación

**Archivos a crear:**
- `workflows/meta-ads-echo.json` — workflow exportable para import en n8n

---

## Archivos a Tocar

| Archivo | Acción | Riesgo |
|---------|--------|--------|
| `sql/001_create_schemas.sql` | **NUEVO** | Bajo — DDL idempotente |
| `apps-script/Code.gs` | **NUEVO** | Bajo — código aislado |
| `apps-script/README.md` | **NUEVO** | Ninguno |
| `workflows/meta-ads-echo.json` | **NUEVO** | Bajo — workflow independiente |
| Archivos existentes | **NO SE TOCAN** | — |

---

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| n8n instance caída | **Alta** (verificado) | Alto — no se puede desplegar workflow ni probar webhook | Crear JSON offline. Deploy cuando n8n esté activa. Santi confirma acceso. |
| Credencial Postgres no existe en n8n | Media | Alto — INSERT falla | Verificar post-deploy. Cliente crea credential en UI si no existe. |
| Postgres server no accesible | Media | Alto — DDL no ejecutable | Santi confirma connection string y acceso. SQL queda listo para ejecutar. |
| Schema Sheets incorrecto | Baja | Medio — Apps Script falla leyendo columnas | Documentar posición exacta de columnas en README. |
| Webhook path conflicto con workflow V1 | Baja | Medio — ambos escuchan mismo path | V1 usa `meta-ads-deploy`. Echo usa mismo path (es el correcto según CONTEXT.md). Desactivar V1 antes de activar echo. |
| Apps Script no tiene permiso POST externo | Baja | Bajo — Google pide autorización | Documentar paso de autorización en README. |

---

## Dependencias Bloqueantes

1. **n8n instance**: debe estar corriendo para deploy del workflow y test E2E
2. **Postgres**: debe tener connection string accesible para ejecutar DDL y para que n8n conecte
3. **Google Sheets**: Santi debe crear el Spreadsheet (o compartir uno existente) y conectar Apps Script

---

## Estimación

| Capa | Tiempo | Confianza |
|------|--------|-----------|
| SQL DDL | 10 min | Alta |
| Apps Script | 20 min | Alta |
| n8n Workflow JSON | 15 min | Alta |
| Docs/README | 10 min | Alta |
| **Total construcción** | **~55 min** | **Alta** |
| Testing E2E (depende de infra) | +30 min | Media (requiere n8n + Postgres up) |

---

## Recomendación

**GO** — proceder a Fase 2 (Plan).

Estrategia: construir las 4 capas como artefactos offline (SQL, Apps Script, workflow JSON, docs). Deploy y test E2E cuando Santi confirme que n8n y Postgres están accesibles.

**Nota importante**: n8n no responde en este momento. Todo el código se puede construir y validar offline, pero el test E2E requiere que la instancia esté activa.

---

**Decision**: [ ] GO  [ ] NO-GO  [ ] NEEDS CLARIFICATION
