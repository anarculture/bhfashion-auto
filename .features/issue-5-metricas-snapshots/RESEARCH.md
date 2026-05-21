# Research: Pilar 5 — Extracción de métricas: snapshots 2x/día en Postgres

**Issue**: #5
**Estado**: 🔍 En Investigación (Fase 1)
**Fecha**: 2026-05-20
**Rama**: `Issue-5-metricas-snapshots`

---

## 1. Entendimiento del problema y objetivos

Construir un **nuevo workflow independiente** llamado `meta-ads-metrics` que:

1. Se dispara **automáticamente 2 veces al día** (08:00 y 20:00, hora Caracas UTC-4) usando un nodo `Schedule Trigger`.
2. Consulta Postgres para obtener todos los `ad_id` con `estado = 'Desplegado'`.
3. Por cada `ad_id`, llama a Meta API (`GET /<ad_id>/insights`) con **2 ventanas**:
   - `today` — desde las 00:00 hora Caracas del día actual
   - `last_7d` — rolling 7 días
4. Extrae los campos: `spend`, `impressions`, `inline_link_clicks`, `purchases_count` (desde `actions` filtrando `action_type=purchase`), `purchases_value` (desde `action_values` filtrando `action_type=purchase`), `frequency`, `reach`.
5. Inserta **1 row por ad por ventana** en la tabla `metrics_snapshots` con el campo `raw_insights` (JSONB completo).
6. Si un `ad_id` no retorna datos (ad nuevo, sin impresiones), inserta la row con todos los valores numéricos en `0` — **no falla**.
7. Si Postgres retorna 0 ads activos, el workflow termina limpiamente sin error.

### Lo que NO se almacena
CPA, ROAS, CTR y CPM **no se persisten** — se calcularán on-the-fly desde las primitivas via queries/views para evitar drift.

---

## 2. Investigación de Archivos y Componentes

### Archivos a Crear:
- **`build_metrics_workflow.js`** (nuevo): Script Node.js independiente que compila el nuevo workflow `meta-ads-metrics` en un archivo JSON. Sigue el mismo patrón de `build_workflow.js`.
- **`meta-ads-metrics-compiled.json`** (nuevo): Output del compilador, listo para importar en n8n.
- **`.features/issue-5-metricas-snapshots/RESEARCH.md`**: Este archivo.

### Archivos a NO Modificar:
- `build_workflow.js`: Pertenece al workflow `meta-ads-deploy`. No se toca.
- `sql/001_create_schemas.sql`: La tabla `metrics_snapshots` **ya existe** con el schema correcto.

### Schema destino ya existente (`metrics_snapshots`):
```sql
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  ad_id              TEXT NOT NULL,
  captured_at        TIMESTAMPTZ NOT NULL,
  "window"           TEXT NOT NULL,          -- 'today' | 'last_7d'
  spend              NUMERIC,
  impressions        BIGINT,
  inline_link_clicks BIGINT,
  purchases_count    INT,
  purchases_value    NUMERIC,
  frequency          NUMERIC,
  reach              BIGINT,
  raw_insights       JSONB,
  PRIMARY KEY (ad_id, captured_at, "window") -- previene duplicados
);
```

### Endpoints de Meta API:
- **URL**: `GET https://graph.facebook.com/v25.0/<ad_id>/insights`
- **Parámetros**:
  - `fields`: `spend,impressions,inline_link_clicks,actions,action_values,frequency,reach`
  - `date_preset`: `today` (ventana 1) / `last_7d` (ventana 2)
- **Autenticación**: Bearer token (misma credencial `AQ2tmf94MUYVp0JI` ya configurada en n8n)

### Flujo de Datos Técnico por ad_id:

```
Postgres (ad_id) 
  → Meta GET /insights?date_preset=today
  → Code: Parse y normalizar campos
  → Postgres INSERT INTO metrics_snapshots (ventana today)
  
  → Meta GET /insights?date_preset=last_7d
  → Code: Parse y normalizar campos
  → Postgres INSERT INTO metrics_snapshots (ventana last_7d)
```

### Lógica de parseo de `purchases_count` y `purchases_value`:
Meta retorna los campos `actions` y `action_values` como arrays de objetos. Hay que filtrar:
```javascript
// purchases_count
const actions = insights.actions || [];
const purchaseAction = actions.find(a => a.action_type === 'purchase');
const purchases_count = purchaseAction ? parseInt(purchaseAction.value) : 0;

// purchases_value
const actionValues = insights.action_values || [];
const purchaseValue = actionValues.find(a => a.action_type === 'purchase');
const purchases_value = purchaseValue ? parseFloat(purchaseValue.value) : 0;
```

---

## 3. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Ad nuevo sin impresiones** | `insights` retorna array vacío `data: []` | Detectar `data.length === 0` y construir la row con todos los campos numéricos en `0`. No lanzar error. |
| **Duplicado de snapshot** | Si el workflow corre más de 2 veces en el mismo día (reintentos manuales), la PK `(ad_id, captured_at, window)` rechazará el insert con error de constraint | Usar `INSERT ... ON CONFLICT DO NOTHING` para que los duplicados sean silenciosos. |
| **Rate limit de Meta** | Con muchos ads activos, las llamadas dobles (today + last_7d) pueden saturar el rate limit | Procesar los ads en el `Split In Batches` con lote pequeño (N=5) y añadir un nodo `Wait` de 1s entre lotes si es necesario. |
| **0 ads activos en Postgres** | La query retorna 0 filas; n8n detiene la ejecución sin error | Agregar un nodo IF que detecte el caso vacío y finalice limpiamente sin pasar al loop de insights. |

---

## 4. Estimación de Esfuerzo

- **Fase 1: Research**: ~20 min (Completado)
- **Fase 2: Plan**: ~20 min
- **Fase 3: Implement**: ~45 min
- **Validación**: ~20 min
- **Total**: ~1h 45min
