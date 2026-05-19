# Plan: Echo E2E — Sheets → Apps Script → n8n → Postgres → ack

**Issue**: [#1](https://github.com/anarculture/bhfashion-auto/issues/1)
**Date**: 2026-05-18
**Status**: ✅ COMPLETED (2026-05-18)

---

## Pre-condiciones cumplidas

- [x] Postgres 18.3 corriendo en localhost:5432
- [x] Database `bhfashion` creada
- [x] n8n corriendo en localhost:5678
- [x] Credencial `Postgres BH Fashion` (ID: `zRsMDLm7WeomuzE3`) creada en n8n
- [x] Apps Script `Code.gs` escrito con setup automático

---

## Paso 1: Ejecutar DDL en Postgres

**Acción**: Crear archivo `sql/001_create_schemas.sql` con las 4 tablas y ejecutar contra `bhfashion`.

**Tablas**:
1. `deployments` — estado como ENUM, `created_at` default now()
2. `campaigns_meta` — UNIQUE(nombre)
3. `metrics_snapshots` — PRIMARY KEY compuesto (ad_id, captured_at, window)
4. `alerts_sent` — para cooldown 24h por (ad_id, regla)

**Test Gate 1**:
```sql
-- Verificar que las 4 tablas existen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Esperado: alerts_sent, campaigns_meta, deployments, metrics_snapshots

-- Verificar ENUM de estado
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'estado_deploy'::regtype
ORDER BY enumsortorder;
-- Esperado: Borrador, Pendiente, Desplegando, Desplegado, Error, Finalizado

-- Verificar UNIQUE en campaigns_meta
INSERT INTO campaigns_meta (nombre, objective) VALUES ('test', 'OUTCOME_SALES');
INSERT INTO campaigns_meta (nombre, objective) VALUES ('test', 'OUTCOME_SALES');
-- Esperado: segundo INSERT falla con unique violation
DELETE FROM campaigns_meta WHERE nombre = 'test';

-- Verificar PK compuesto en metrics_snapshots
-- (se verifica visualmente con \d metrics_snapshots)
```

**Criterio de aceptación**: Las 4 consultas pasan. 0 errores en DDL.

---

## Paso 2: Crear workflow `meta-ads-echo` en n8n

**Acción**: Crear workflow nuevo via MCP con 4 nodos:

```
Webhook POST /meta-ads-deploy (responseMode=lastNode)
  → Code: extraer y validar campos del payload
    → Postgres: INSERT INTO deployments
      → Respond: 200 {status: "ok", rows_inserted: N}
```

**Nodos**:
1. **Webhook**: `POST`, path `meta-ads-deploy`, `responseMode=lastNode`
2. **Code (Validar Payload)**: extrae `filas[]` del body, valida campos requeridos
3. **Postgres (Insert Deployment)**: INSERT con credencial `Postgres BH Fashion`
4. **Respond**: JSON con status y count

**Decisión de diseño**: `responseMode=lastNode` (no `onReceived`) para que el response incluya el resultado del INSERT. El issue pide "responde 200" — respondemos con confirmación real.

**Test Gate 2**:
```bash
# POST manual al webhook con curl
curl -X POST http://localhost:5678/webhook-test/meta-ads-deploy \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheet_id": "test123",
    "filas": [{
      "campaña": "Test Echo",
      "ig_post_url": "https://instagram.com/p/test/",
      "presupuesto_diario": 10,
      "fecha_inicio": "2026-05-19",
      "fecha_fin": "2026-05-25",
      "audiencia": "Test Audience",
      "placements": "automatic",
      "fila_sheets": 2
    }],
    "timestamp": "2026-05-18T12:00:00Z"
  }'
# Esperado: HTTP 200, body con {status: "ok", rows_inserted: 1}
```

```sql
-- Verificar fila insertada en Postgres
SELECT id, campaña, estado, ig_post_url FROM deployments;
-- Esperado: 1 fila con estado='Pendiente'
```

**Criterio de aceptación**: curl retorna 200 en <3s. Fila existe en Postgres con estado=Pendiente.

---

## Paso 3: Reiniciar n8n con tunnel + configurar Apps Script

**Acción**:
1. Detener n8n actual
2. Reiniciar con `n8n start --tunnel`
3. Copiar URL del tunnel
4. Santi: crear Spreadsheet en Google Sheets
5. Santi: pegar `Code.gs` en Apps Script, configurar `WEBHOOK_URL` con URL del tunnel
6. Santi: ejecutar **BH Ads → Setup** para crear hojas y datos de prueba

**Test Gate 3**:
- Menú `BH Ads` aparece en la barra de herramientas de Sheets
- Setup crea 3 hojas: Deploys, Campañas, Audiencias
- Columna `Desplegar` muestra checkboxes
- Columna `Estado` muestra dropdown con 6 valores
- Fila 2 de Deploys tiene datos de prueba con `Desplegar=TRUE, Estado=Pendiente`

**Criterio de aceptación**: Las 3 hojas existen con validaciones funcionales.

---

## Paso 4: Test E2E — Desplegar Marcadas

**Acción**: Santi hace clic en **BH Ads → Desplegar Marcadas** desde el Spreadsheet.

**Test Gate 4** (criterios de aceptación del issue):
- [ ] Apps Script lee fila con `Desplegar=TRUE AND Estado=Pendiente`
- [ ] Apps Script hace POST al webhook n8n con payload JSON
- [ ] Apps Script desmarca checkbox `Desplegar` después del POST
- [ ] n8n recibe payload e inserta fila en `deployments` con `estado=Pendiente`
- [ ] n8n responde 200 en menos de 3 segundos
- [ ] Alert en Sheets muestra "✅ 1 fila(s) enviada(s)"

```sql
-- Verificación final en Postgres
SELECT id, campaña, ig_post_url, presupuesto_diario, estado, created_at
FROM deployments
ORDER BY created_at DESC LIMIT 1;
-- Esperado: fila con datos del Spreadsheet, estado='Pendiente'
```

**Criterio de aceptación**: Todos los checkboxes del Test Gate 4 marcados.

---

## Resumen de secuencia

| Paso | Qué | Quién | Depende de |
|------|-----|-------|------------|
| 1 | DDL Postgres | IA (yo) | Pre-cond ✅ |
| 2 | Workflow n8n | IA (yo) | Paso 1 |
| 3 | Tunnel + Sheets setup | IA + Santi | Paso 2 |
| 4 | Test E2E | Santi | Paso 3 |

**Estimación total**: ~30 min (pasos 1-2 automáticos, paso 3-4 requieren Santi)

---

## Archivos que se crean/modifican

| Archivo | Acción | Notas |
|---------|--------|-------|
| `sql/001_create_schemas.sql` | **NUEVO** | DDL idempotente |
| Workflow `meta-ads-echo` en n8n | **NUEVO** | Via MCP, no toca archivos |
| `apps-script/Code.gs` | **YA CREADO** | Solo actualizar WEBHOOK_URL |
| `apps-script/README.md` | **YA CREADO** | — |
| Archivos existentes | **NO SE TOCAN** | — |

---

**Decision**: [ ] GO  [ ] NO-GO  [ ] NEEDS CLARIFICATION
