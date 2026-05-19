# Issue #1 — Echo E2E: Sheets → Apps Script → n8n → Postgres → ack

**Status**: ✅ Completado
**Fecha**: 2026-05-18

---

## Criterios de aceptación del Issue

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | Schemas de Postgres creados con tipos y restricciones correctas | ✅ | 4 tablas: `deployments`, `campaigns_meta`, `metrics_snapshots`, `alerts_sent` |
| 2 | `deployments.estado` acepta solo valores del ENUM | ✅ | Tipo `estado_deploy` con 6 valores |
| 3 | `campaigns_meta` tiene `UNIQUE(nombre)` | ✅ | Segundo INSERT falla con violación de unicidad |
| 4 | `metrics_snapshots` tiene `PRIMARY KEY (ad_id, captured_at, window)` | ✅ | PK compuesto verificado con `\d` |
| 5 | Plantilla Sheets tiene hojas Deploys, Campañas, Audiencias | ✅ | Creadas por `setupSpreadsheet()` |
| 6 | Columna Desplegar en Deploys es checkbox | ✅ | `insertCheckboxes()` en setup |
| 7 | Columna Estado tiene dropdown con valores del ENUM | ✅ | Data validation con 6 valores |
| 8 | Menú Apps Script aparece bajo BH Ads | ✅ | `onOpen()` → menú con 2 ítems |
| 9 | Clic en Desplegar Marcadas con 1 fila hace POST al webhook | ✅ | Response 200 confirmado en screenshot |
| 10 | Apps Script desmarca checkbox después del POST | ✅ | `setValue(false)` post-success |
| 11 | n8n recibe payload e inserta fila en `deployments` | ✅ | `id:2, estado:Pendiente` en Postgres |
| 12 | n8n responde 200 en menos de 3 segundos | ✅ | Response instantáneo |

---

## Artefactos creados

| Archivo | Descripción |
|---------|-------------|
| `sql/001_create_schemas.sql` | DDL idempotente para las 4 tablas Postgres |
| `apps-script/Code.gs` | Menú BH Ads + setup automático de 3 hojas + POST webhook |
| `apps-script/README.md` | Instrucciones de setup para colaboradores |
| `.features/echo-e2e-sheets-n8n-postgres/RESEARCH.md` | Fase 1: investigación |
| `.features/echo-e2e-sheets-n8n-postgres/PLAN.md` | Fase 2: plan con Test Gates |

## Workflow n8n

| Campo | Valor |
|-------|-------|
| Nombre | `meta-ads-echo` |
| ID | `eR6JKMnS1Fsq8MVa` |
| Nodos | Webhook Deploy → Preparar Filas → Insert Deployment → Formatear Respuesta → Respond OK |
| Credencial | `Postgres BH Fashion` (ID: `zRsMDLm7WeomuzE3`) |
| Webhook path | `/webhook/meta-ads-deploy` |

## Infraestructura local configurada

| Componente | Detalle |
|---|---|
| PostgreSQL 18.3 | `localhost:5432`, DB `bhfashion`, user `postgres` |
| n8n 2.16.2 | `localhost:5678`, workflow activo |
| ngrok | Tunnel para exponer webhook a Apps Script |

---

## Nota para próximos issues

El workflow `meta-ads-echo` es el esqueleto base. Los issues siguientes lo extenderán con:
- Validación contra hojas Campañas/Audiencias
- Claim atómico (`UPDATE...WHERE estado='Pendiente' RETURNING *`)
- Llamadas a Meta API
- Sync de vuelta a Sheets
