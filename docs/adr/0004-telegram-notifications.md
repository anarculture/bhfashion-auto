# ADR 0004 — Telegram para notificaciones (no Slack)

**Fecha:** 2026-05-16
**Estado:** Aceptado

## Contexto

Pilar 6 requiere canal de notificación push para alertas de negocio (CPA crítico, frequency alta, etc.) y errores operacionales. PRD V1 asumía Slack.

La cliente no usa Slack. Usa Telegram y WhatsApp activamente.

## Decisión

Telegram como canal de notificaciones para Fase 1.

- **Bot `bh-ads-alerts`**: alertas de negocio al cliente vía mensaje directo.
- **Grupo `bh-ads-ops`**: errores de infraestructura al operador.

## Alternativas consideradas

- **Slack**: cliente no lo usa, requiere onboarding. Rechazado.
- **WhatsApp Business API**: requiere aprobación Meta separada (proceso días/semanas) + costo por mensaje. Rechazado para Fase 1.
- **WhatsApp no-oficial (3rd party)**: frágil, viola ToS Meta/WhatsApp. Rechazado.
- **Gmail**: no es push real-time. Aceptable como fallback pero peor UX para alertas urgentes.

## Consecuencias

- Setup adicional: crear bot via @BotFather, obtener token, obtener `chat_id` cliente.
- n8n tiene nodo Telegram nativo — sin HTTP crudo.
- Token bot almacenado en n8n credentials (nunca en Variables Globales ni Sheets).
- Si en Fase 2 se necesita WhatsApp: agregar nodo WA Business Cloud en paralelo, Telegram sigue activo.
