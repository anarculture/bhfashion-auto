# Walkthrough: Pilar 5 — Extracción de métricas: snapshots 2x/día en Postgres

**Issue**: #5
**Estado**: 🚀 Listo para Pruebas
**Fecha**: 2026-05-20
**Rama**: `Issue-5-metricas-snapshots`

---

## 1. Cambios Realizados

### Archivos Nuevos (sin modificar nada existente)

| Archivo | Descripción |
|---------|-------------|
| `build_metrics_workflow.js` | Script Node.js Builder que compila el workflow |
| `meta-ads-metrics-compiled.json` | Workflow n8n listo para importar |
| `.features/issue-5-metricas-snapshots/RESEARCH.md` | Investigación (Fase 1 HTMK) |
| `.features/issue-5-metricas-snapshots/PLAN.md` | Plan de arquitectura (Fase 2 HTMK) |
| `.features/issue-5-metricas-snapshots/walkthrough.md` | Este archivo |

**`build_workflow.js` (deploy) y `sql/001_create_schemas.sql` no fueron tocados.**

---

## 2. Arquitectura del Workflow

```
Schedule Trigger (08:00 / 20:00 UTC-4)
  → Variables Globales
  → Postgres: SELECT ad_id WHERE estado='Desplegado'
  → IF: ¿hay resultados?
      [No]  → Sin Ads Activos (NoOp, termina OK)
      [Sí]  → Split Ads (N=5)
                → Preparar Request (inyecta ad_id + captured_at + api_version)
                    ↓                        ↓
              Insights TODAY           Insights LAST_7D
                    ↓                        ↓
            Normalizar Today          Normalizar Last7d
                    ↓                        ↓
         INSERT metrics_snapshots  INSERT metrics_snapshots
         (ON CONFLICT DO NOTHING)  (ON CONFLICT DO NOTHING)
                    ↓                        ↓
                        Ad Completado (NoOp)
                              ↓
                         [loop Split Ads]
```

---

## 3. Test Gates — Guía de Pruebas Manuales

### Test Gate 1 ✅ Compilación (ya verificado)
```bash
node build_metrics_workflow.js
# Output: Workflow compiled: meta-ads-metrics-compiled.json
```

### Test Gate 2: Caso vacío (0 ads activos)
1. Asegúrate de que no hay rows con `estado='Desplegado'` en `deployments` (o temporalmente cambia todas a `'Finalizado'`).
2. Importa `meta-ads-metrics-compiled.json` en n8n.
3. Ejecuta el workflow manualmente.
4. **Esperado**: El nodo `IF Hay Ads Activos` toma la rama falsa → `Sin Ads Activos` → ✅ sin errores.

### Test Gate 3: Snapshot completo con ad real
1. Asegúrate de tener ≥1 row con `estado='Desplegado'` y `ad_id` válido en `deployments`.
2. Ejecuta el workflow manualmente.
3. Verifica en Postgres:
```sql
SELECT ad_id, captured_at, "window", spend, impressions, purchases_count
FROM metrics_snapshots
ORDER BY captured_at DESC
LIMIT 10;
```
4. **Esperado**: 2 rows por cada `ad_id` activo (una `today`, una `last_7d`). `raw_insights` contiene el JSON completo de Meta.

### Test Gate 4: Ad sin impresiones (data vacía)
1. Usa un `ad_id` de un ad muy reciente (sin actividad).
2. Meta retorna `{ "data": [], "paging": {...} }`.
3. **Esperado**: Se inserta la row con `spend=0, impressions=0, purchases_count=0`, etc. Sin error en el workflow.

### Test Gate 5: Prevención de duplicados
1. Ejecuta el workflow dos veces seguidas (dentro del mismo minuto, mismo `captured_at`).
2. Comprueba:
```sql
SELECT COUNT(*) FROM metrics_snapshots;
```
3. **Esperado**: El conteo es idéntico en ambas ejecuciones. La segunda no lanza error por constraint.
