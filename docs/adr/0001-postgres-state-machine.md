# ADR 0001 — Postgres como state-of-truth, Sheets como UI

**Fecha:** 2026-05-16
**Estado:** Aceptado

## Contexto

El sistema soporta dos modos de ejecución concurrentes:
- **Despliegue Single** (webhook por fila editada)
- **Despliegue Batch** (cron sobre Filas Pendientes)

Ambos modos pueden leer la misma fila en ventanas de carrera de 200-800ms (latencia Sheets API). Sin lock atómico → doble despliegue en Meta → costo duplicado al cliente.

Google Sheets no soporta compare-and-swap. Workarounds en Sheets (re-leer y verificar) son frágiles.

## Decisión

Postgres es el state-of-truth del sistema. Google Sheets queda como capa de UI para el cliente.

- Tabla `deployments` en Postgres contiene: estado, claim metadata, IDs Meta, timestamps, error logs.
- Claim atómico vía `UPDATE ... WHERE estado='Pendiente' RETURNING *` (single-statement, atómico).
- Sheets recibe sync de vuelta solo para display (columnas `Estado`, IDs, `error_log`).

## Alternativas consideradas

- **Claim-first en Sheets**: compare-and-swap manual. Frágil, requiere re-lectura y verificación.
- **Redis solo para locks**: resuelve race pero deja state en Sheets — historial pobre, sin queries.
- **Supabase**: equivalente funcional a Postgres pero agrega servicio nuevo. Postgres ya en stack.

## Consecuencias

- Workflow gana paso de claim Postgres antes de Meta API.
- Reportes y dashboards futuros consultan Postgres, no Sheets.
- Cliente nunca toca Postgres — sigue editando Sheets como hoy.
- Sync Sheets ↔ Postgres requiere definición (ver Q4).
