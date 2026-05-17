# ADR 0002 — Trigger manual vía Apps Script, no cron ni onEdit

**Fecha:** 2026-05-16
**Estado:** Aceptado

## Contexto

Cliente quiere control total sobre cuándo se publica a Meta — no quiere que cambios accidentales en Sheets disparen despliegues, ni quiere esperar a un cron.

## Decisión

Despliegue Single y Batch comparten el mismo trigger manual: checkbox por fila + botón global en menú custom Apps Script. Cliente marca filas, clic botón, Apps Script POSTea al webhook n8n.

No hay cron. No hay onEdit. Sin acción explícita del cliente, nada se publica a Meta.

## Alternativas consideradas

- **Cron cada X minutos**: barre Pendientes solo. Rechazado — cliente quiere decidir cuándo gastar presupuesto Meta.
- **onEdit trigger (cambio Estado → webhook)**: rechazado — edición accidental dispara gasto real.
- **Form n8n separado**: rechazado — cliente sale de Sheets, peor UX.
- **Híbrido auto+manual**: rechazado — dos rutas que mantener, contradice "cliente decide".

## Consecuencias

- Apps Script debe vivir en el Sheet del cliente. Mantenimiento mínimo (~30 líneas).
- Webhook n8n acepta payload con array de filas (single = array de 1).
- Apps Script desmarca checkbox tras POST exitoso para evitar doble-clic accidental.
- Sin trigger automático = sin escape para filas olvidadas. Aceptable porque cliente revisa Sheet a diario.
