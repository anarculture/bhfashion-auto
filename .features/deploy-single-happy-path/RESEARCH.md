# Research: Despliegue Single Happy Path (1 Fila → 1 Ad Boost)

**Issue**: #2
**Estado**: 🔍 En Investigación (Fase 1)
**Fecha**: 2026-05-19

---

## 1. Entendimiento del problema y objetivos

El objetivo de este issue es implementar el flujo de despliegue automatizado para **una única fila** (Single Deploy) siguiendo el **paradigma Boost** (ADR-0003). 
El trigger inicial proviene del menú custom de Google Sheets ("BH Ads → Desplegar Marcadas"), el cual envía un payload JSON a n8n con la información de la fila a desplegar.

### Flujo secuencial esperado por fila:
1. **Recepción & Registro inicial**: Recibir el webhook de Sheets e insertar la fila en Postgres con estado `Pendiente`.
2. **Claim Atómico**: Reclamar la fila atómicamente cambiando su estado de `Pendiente` a `Desplegando` en la tabla `deployments`.
3. **Resolución de Datos Auxiliares**:
   - Buscar configuración de la campaña en la hoja `Campañas` (objective, special_ad_categories).
   - Mapear el alias de audiencia de la fila a un ID de Meta (`meta_audience_id`) y su tipo (`custom`/`lookalike`/`saved`) usando la hoja `Audiencias`.
4. **Resolución de Campaña**:
   - Buscar campaña en Postgres (`campaigns_meta`).
   - Fallback: Buscar campaña en Meta por nombre.
   - Fallback: Crear campaña en Meta usando los datos resueltos del Spreadsheet. Cachear el resultado en Postgres.
5. **Crear AdSet**: Crear el AdSet en Meta usando el ID de la campaña, presupuesto diario (en centavos), fechas de inicio/fin (en formato ISO con timezone America/Caracas), placements automáticos, y la segmentación (por ID de audiencia según su tipo).
6. **Crear AdCreative (Paradigma Boost)**: Crear el Creative en Meta vinculando directamente el post mediante `instagram_permalink_url` e `instagram_actor_id`. Sin Gemini, sin subida de archivos de imagen locales.
7. **Crear Ad**: Crear el Ad en Meta con `status: PAUSED` asociándole el Creative creado.
8. **Actualizar Postgres**: Guardar los IDs de Meta (`campaign_id`, `adset_id`, `ad_id`), cambiar el estado de la fila a `Desplegado` y establecer `desplegado_at` al timestamp actual.
9. **Sincronizar Sheets**: Escribir de vuelta a Google Sheets el nuevo `Estado`, los 3 IDs de Meta y la fecha de despliegue en la fila correspondiente.

---

## 2. Investigación de Archivos y Componentes

### Archivos a Modificar / Crear:
- **Workflows en n8n**:
  - Reemplazar/extender el workflow `meta-ads-echo` (ID: `eR6JKMnS1Fsq8MVa`) para implementar el flujo real en lugar del comportamiento "echo".
- **Postgres DDL**:
  - No requiere modificaciones en los esquemas (ya creados en el Issue #1).
- **Google Apps Script**:
  - `apps-script/Code.gs` no requiere modificaciones para el camino feliz de 1 fila, ya que envía el payload en el formato correcto con `fila_sheets` y desmarca los checkboxes al recibir código 200.

### Endpoints de Meta API (v25.0):
1. **GET Campañas (Búsqueda por nombre)**:
   `GET /v25.0/act_{ad_account_id}/campaigns`
   - Parámetros:
     - `fields=id,name,objective`
     - `filtering=[{"field":"name","operator":"EQUAL","value":"<CAMPAIGN_NAME>"}]`
2. **POST Crear Campaña**:
   `POST /v25.0/act_{ad_account_id}/campaigns`
   - Payload:
     ```json
     {
       "name": "<campaign_name>",
       "objective": "<objective>",
       "status": "PAUSED",
       "special_ad_categories": [],
       "is_adset_budget_sharing_enabled": false
     }
     ```
3. **POST Crear AdSet**:
   `POST /v25.0/act_{ad_account_id}/adsets`
   - Payload:
     ```json
     {
       "name": "<campaign_name> - AdSet",
       "campaign_id": "<campaign_id>",
       "daily_budget": <presupuesto_diario_cents>,
       "billing_event": "IMPRESSIONS",
       "optimization_goal": "IMPRESSIONS",
       "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
       "automatic_placements": true,
       "start_time": "<start_time_iso>",
       "end_time": "<end_time_iso>",
       "status": "ACTIVE",
       "saved_audience_id": "<meta_audience_id>" // Si tipo = saved
       // "targeting": { "custom_audiences": [{"id": "<meta_audience_id>"}] } // Si tipo = custom/lookalike
     }
     ```
4. **POST Crear AdCreative (Boost IG)**:
   `POST /v25.0/act_{ad_account_id}/adcreatives`
   - Payload:
     ```json
     {
       "name": "<campaign_name> - Creative",
       "instagram_actor_id": "<instagram_actor_id>",
       "instagram_permalink_url": "<ig_post_url>"
     }
     ```
5. **POST Crear Ad**:
   `POST /v25.0/act_{ad_account_id}/ads`
   - Payload:
     ```json
     {
       "name": "<campaign_name> - Ad",
       "adset_id": "<adset_id>",
       "creative": { "creative_id": "<creative_id>" },
       "status": "PAUSED"
     }
     ```

---

## 3. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Race conditions concurrentes** | Doble despliegue accidental y cargos de presupuesto duplicados al cliente. | Implementar el **Claim Atómico** en Postgres al inicio del deploy (`UPDATE ... WHERE estado='Pendiente' AND id=? RETURNING *`). Si retorna 0 filas, abortar inmediatamente de forma silenciosa. |
| **Drift de Campaña** | Crear campañas duplicadas si no se detecta que ya existen. | Implementar lookup jerárquico estricto: Postgres caché local → API Meta lookup → Crear sólo como último recurso. |
| **Timezone mismatch** | Desajuste en el inicio/fin del AdSet. | Usar explícitamente el timezone `America/Caracas` (UTC-4) configurado en Apps Script y formateado como ISO 8601 con offset en n8n. |
| **API Rate limits (Meta 17/32)** | Fallas a mitad de flujo en llamadas HTTP. | n8n maneja reintentos automáticos a nivel de nodo. Para este issue (Single Deploy) usaremos reintentos estándar en HTTP Request. |

---

## 4. Estimación de Esfuerzo

- **Fase 1: Research (Investigación)**: ~15 minutos (Completado).
- **Fase 2: Plan (Planificación)**: ~20 minutos.
- **Fase 3: Implement (Implementación)**: ~45 minutos.
- **Validación y Pruebas**: ~20 minutos.
- **Esfuerzo Total Estimado**: **~1h 40m**

---

¿Me das el **GO** para pasar a la **Fase 2 (Planificación)**?
