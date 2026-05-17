# CONTEXT — BH Fashion Meta Ads Automation

Glosario del dominio. Sin detalles de implementación.

---

## Términos

### Fila Pendiente
Registro en Google Sheets con `Estado = Pendiente`. Unidad atómica de despliegue.
Una Fila Pendiente contiene los inputs mínimos (briefing, media, presupuesto, segmentación) necesarios para producir un AdSet completo con sus Ads.

### Despliegue Single
Modo de ejecución: una Fila Pendiente → 1 Campaign + 1 AdSet + 1 Ad (Boost de IG post) en Meta.
Trigger: cliente marca checkbox `Desplegar` en una fila, clic botón global → Apps Script POST webhook n8n con 1 fila.
Latencia objetivo: ~5 segundos por fila.

### Despliegue Batch
Modo de ejecución: múltiples Filas Pendientes seleccionadas → ejecución en lote bajo el mismo workflow. Cada fila = 1 Ad (Boost).
Trigger: cliente marca checkbox en N filas, clic botón → Apps Script POST webhook con array de filas.

Estructura del batch:
1. **Fase Preparación (serial)**: deduplica `Campaña` del payload. Para cada Campaña única: lookup en Postgres `campaigns_meta` → fallback lookup Meta → fallback crear. Cachea `nombre → campaign_id` para la ejecución.
2. **Fase Deploy (paralelo limitado N=5)**: Split In Batches de 5. Cada fila usa `campaign_id` ya resuelto. Sin race en Campaign.
3. **Retry**: error Meta 17/32 (rate limit) → backoff 30s, máx 3 intentos por fila.

### Tabla Postgres `campaigns_meta`
Cache persistente nombre→ID Meta. Schema: `(nombre PRIMARY KEY, campaign_id, objective, created_at)`. Evita lookups Meta repetidos entre ejecuciones. `INSERT ... ON CONFLICT (nombre) DO NOTHING RETURNING id` para resolver race si dos workflows concurrentes intentan crear misma Campaña.

### Checkbox `Desplegar`
Columna booleana en Sheets. Cliente marca filas a desplegar. Único selector de alcance para ambos modos. Apps Script lee checkboxes marcadas al clic del botón global.

### Botón Global
Menú custom Apps Script `BH Ads → Desplegar Marcadas`. Envía POST a webhook n8n con filas donde `Desplegar=TRUE AND Estado=Pendiente`. Después del POST, Apps Script desmarca los checkboxes.

### Alertas (Pilar 6)
Workflow `meta-ads-alerts`. Trigger: post-`meta-ads-metrics`. Evalúa snapshots recientes contra umbrales por Campaña.

Reglas Fase 1:
| Regla | Lógica | Ventana |
|---|---|---|
| `cpa_critico` | `spend / purchases_count > campaign.cpa_max` | today |
| `spend_sin_conversiones` | `spend > campaign.spend_sin_conv_max AND purchases_count = 0` | today |
| `frequency_alta` | `frequency > campaign.frequency_max` | last_7d |
| `roas_bajo` | `purchases_value / spend < campaign.roas_min` | last_7d |
| `ctr_bajo` | `inline_link_clicks / impressions < campaign.ctr_min` | last_7d |
| `pacing_alto` | `today.spend > daily_budget * 0.8 AND hora_local < 18` | today |

Umbrales viven en hoja `Campañas` (columnas extra: `cpa_max`, `roas_min`, `ctr_min`, `frequency_max`, `spend_sin_conv_max`). Razón: campañas de awareness toleran CPA alto, campañas de venta no.

Cooldown: tabla Postgres `alerts_sent (ad_id, regla, last_sent_at)`. Máximo 1 alerta por `(ad_id, regla)` cada 24h.

Slack payload: ad_id, nombre Campaña, regla disparada, valor actual vs umbral, link directo a Meta Ads Manager del ad.

### Métricas (Pilar 5)
Workflow `meta-ads-metrics`. Cron 2x/día (08:00 y 20:00 hora cliente). Por cada ad en estado `Desplegado`: llama `GET /<ad_id>/insights` con 2 ventanas (`today` y `last_7d`), inserta snapshot en Postgres.

Tabla `metrics_snapshots`:
```
ad_id              text
captured_at        timestamptz
window             text          -- 'today' | 'last_7d'
spend              numeric
impressions        bigint
inline_link_clicks bigint
purchases_count    int
purchases_value    numeric
frequency          numeric
reach              bigint
raw_insights       jsonb         -- respuesta Meta completa
PRIMARY KEY (ad_id, captured_at, window)
```

CPA, ROAS, CTR, CPM no se almacenan: derivados en views SQL desde primitivas. Evita drift entre snapshot y cálculo.

### Lifecycle / Cleanup
Workflow `meta-ads-cleanup`. Cron diario 03:00 Caracas. Lee Postgres `WHERE estado='Desplegado' AND fecha_fin < today` → pausa ad en Meta (`status=PAUSED`, no DELETE) → marca Postgres `estado='Finalizado'`. Pilar 5 ignora ads `Finalizado`.

Status agregado a la máquina de estados: `Finalizado`. Transición: `Desplegado → Finalizado`.

### Status inicial del Ad
Todo ad creado por el workflow nace `status=PAUSED`. Cliente revisa en Meta Ads Manager y activa manualmente. Safety net contra errores de input que pasen validación.

### Inmutabilidad de filas desplegadas
Una fila en estado `Desplegado` o `Finalizado` es inmutable desde el sistema. Editar columnas (presupuesto, audiencia, fechas) en Sheets no propaga a Meta. Para cambiar = clonar fila nueva. Razón: updates Meta requieren endpoint y máquina de estados adicional; Fase 2.

### Timezone
`America/Caracas` (UTC-4) para todas las operaciones de tiempo cliente-facing: crons (`08:00`/`20:00`/`03:00`), interpretación de `Fecha inicio`/`Fecha fin`, hora en `pacing_alto`. Postgres almacena `timestamptz` UTC; conversión en queries.

### Canales Telegram
- **Bot cliente** (`bh-ads-alerts`): alertas de negocio Pilar 6. Mensaje directo al chat del cliente.
- **Grupo ops** (`bh-ads-ops`): errores workflow / infra. Chat compartido operador + cliente si escala. n8n error trigger global → POST aquí.

Setup: bot creado via @BotFather → token en n8n credentials → `chat_id` cliente almacenado en Variables Globales n8n.

### Dependencia Pixel ID
Pilar 6 reglas `cpa_critico`, `roas_bajo`, `spend_sin_conversiones` dependen de `purchases_count` / `purchases_value` correctos. Estos requieren Pixel ID configurado y eventos `purchase` reportando desde el sitio. Pilar 6 NO se habilita hasta verificación pixel. Pilar 1 y Pilar 5 funcionan sin pixel (snapshots existen, solo `purchases=0`).

### Multi-cliente
NO Fase 1. Sistema hardcoded BH Fashion (Ad Account, Page, IG, App IDs en Variables Globales). Re-uso para otro cliente = fork workflow + nuevas credenciales.

### Alcance Fase 1
PRD Pilares incluidos:
- **Pilar 1** Despliegue (workflow `meta-ads-deploy`).
- **Pilar 5** Extracción de Métricas (workflow `meta-ads-metrics`, cron 2x/día 08:00 y 20:00 Caracas).
- **Pilar 6** Filtro de Alertas Slack (workflow `meta-ads-alerts`, depende de Pilar 5).

PRD Pilares excluidos:
- Pilar 2 (Ingeniería Imagen), Pilar 4 (Síntesis Gemini): muertos por Boost paradigm (ADR-0003).
- Pilar 3 (Espionaje Ad Library): diferido a Fase 2.

### Boost de IG Post
Paradigma creativo de Fase 1: la URL de un post Instagram existente se usa como AdCreative referencial. El ad **es** ese post — mismo copy, mismo media, mismas interacciones acumuladas (likes/comments persisten).

Implementación Meta: AdCreative con `instagram_permalink_url` + `instagram_actor_id` (o `effective_object_story_id` si el post tiene equivalente Page).

1 URL IG → 1 Ad. Sin Gemini, sin upload de media, sin variaciones de copy en Fase 1. Ver ADR-0003.

### Jerarquía Meta
`Campaign → AdSet → AdCreative → Ad`. Cada nivel obtiene un `id` que se inyecta al siguiente.

Por fila desplegada: 1 AdSet + 1 Ad nuevos. Campaign puede ser nueva o reusada (ver Agrupación por Campaña).

### Agrupación por Campaña
Columna `Campaña` en Sheets. Cliente escribe nombre (ej: "Lanzamiento Verano 2026"). Workflow busca Campaign con ese nombre en la Ad Account BH Fashion:
- Existe → reusa `campaign_id`.
- No existe → lee parámetros Campaign-level desde hoja `Campañas` y crea Campaign nueva.

Si `Campaña` vacía → fallback `Default <YYYY-MM>`.

### Hoja `Campañas` (Campaign-level config)
Hoja separada en el mismo Spreadsheet. Cliente la llena 1 vez por temporada/intención. Columnas:

| Columna | Tipo | Notas |
|---|---|---|
| `nombre` | string | clave única, referenciada desde columna `Campaña` |
| `objective` | enum | `OUTCOME_SALES`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`, `OUTCOME_AWARENESS`, `OUTCOME_LEADS`, `OUTCOME_APP_PROMOTION` |
| `special_ad_categories` | array | default `[]` para fashion |

Validación pre-claim: si `Campaña` referenciada en fila no existe en hoja `Campañas` → fila va a `Error` antes de tocar Meta.

### Hoja `Audiencias` (alias → ID Meta)
Hoja separada. Mapea nombres amigables a IDs de audiencias pre-creadas por cliente en Meta Ads Manager. Columnas:

| Columna | Tipo | Notas |
|---|---|---|
| `alias` | string | nombre legible, ej: "Compradores 90d" |
| `meta_audience_id` | string | ID numérico Meta |
| `tipo` | enum | `custom`, `lookalike`, `saved` (informativo) |

Cliente crea audiencias visualmente en Meta Ads Manager (donde ve tamaño, demografía, solapamiento), copia ID a esta hoja con un alias. En filas de deploy escribe el alias, no el ID.

### Hoja principal `Deploys` (1 fila = 1 Ad)

Columnas que llena el cliente:

| Columna | Tipo | Requerido |
|---|---|---|
| `Campaña` | string (FK a hoja Campañas) | ✅ |
| `IG Post URL` | URL Instagram | ✅ |
| `Presupuesto diario USD` | number | ✅ |
| `Fecha inicio` | date | ✅ |
| `Fecha fin` | date | ✅ |
| `Audiencia` | string (FK a hoja Audiencias) | ✅ |
| `Placements` | enum | default `automatic`, override opcional |
| `Desplegar` | checkbox | trigger |

Columnas read-only escritas por n8n:

| Columna | Notas |
|---|---|
| `Estado` | máquina de estados |
| `campaign_id` | ID Meta |
| `adset_id` | ID Meta |
| `ad_id` | ID Meta |
| `error_log` | si Estado=Error |
| `desplegado_at` | timestamp ISO |

### Estado (campo Sheets)
Máquina de estados de la fila. Valores y transiciones:

| Estado | Significado | Escrito por |
|--------|-------------|-------------|
| `Borrador` | Cliente llenando, no listo | Cliente |
| `Pendiente` | Listo para desplegar | Cliente |
| `Desplegando` | Workflow tomó la fila, en progreso | n8n (al iniciar) |
| `Desplegado` | OK, IDs Meta escritos en fila | n8n (al terminar) |
| `Error` | Falló, ver `error_log` | n8n (en catch) |
| `Finalizado` | Fecha fin pasada, ad pausado en Meta | n8n (`meta-ads-cleanup`) |

Transiciones válidas: `Borrador → Pendiente → Desplegando → {Desplegado | Error}`, luego `Desplegado → Finalizado`. Retry: cliente cambia `Error → Pendiente` manualmente.

Columnas asociadas en Sheets: `campaign_id`, `adset_id`, `ad_ids` (CSV), `error_log`, `desplegado_at`.

### Reclamo de Fila (claim)
Acto de marcar una Fila Pendiente como `Desplegando` en Postgres mediante `UPDATE ... WHERE estado='Pendiente' RETURNING *` (atómico). Si el UPDATE retorna 0 filas, otro workflow ganó el race → abort silencioso. Ver ADR-0001.

### Orden de operaciones por fila
1. **Validar local**: formato, FKs entre hojas (Campañas, Audiencias), presencia required, rangos fecha/presupuesto.
2. **Verificar IG post**: `GET /<ig_media_id>?fields=id` para confirmar acceso al post.
3. **Claim atómico** en Postgres.
4. **Resolver Campaña**: lookup o crear Campaign en Meta.
5. **Crear AdSet → AdCreative → Ad**.
6. **Update Postgres + sync Sheets**.

Fallos en pasos 1-2 marcan fila `Error` sin pasar por `Desplegando` (no consumen slot).

### State-of-truth
Postgres tabla `deployments`. Sheets es solo UI para el cliente. Ver ADR-0001.

### Sync Sheets ↔ Postgres
Modelo *Sheets-push, Postgres-pull-back*:
- **Inputs** (briefing, media URL, presupuesto, segmentación): cliente escribe en Sheets. Workflow lee Sheets al claim, copia a Postgres.
- **Outputs** (Estado, IDs Meta, error_log, desplegado_at): n8n escribe primero en Postgres, luego sincroniza de vuelta a columnas read-only de Sheets para display.
- Sheets es siempre espejo display de Postgres; Postgres manda en conflictos.
