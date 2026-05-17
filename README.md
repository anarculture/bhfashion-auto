# BH Fashion — Automatización de Meta Ads

Sistema de despliegue y monitoreo de anuncios en Meta para BH Fashion, orquestado desde Google Sheets vía n8n.

---

## Qué hace este sistema

El cliente selecciona posts de Instagram existentes en Google Sheets y los convierte en ads pagos en Meta con un clic — sin entrar a Meta Ads Manager. El sistema también monitorea el rendimiento y alerta por Telegram cuando algo falla.

**Pilares activos en Fase 1:**
- **Despliegue** (Pilar 1): 1 post IG → 1 Ad Boost en Meta. Modos Single (1 fila) y Batch (N filas).
- **Métricas** (Pilar 5): snapshots de rendimiento 2x/día en Postgres.
- **Alertas** (Pilar 6): notificaciones Telegram cuando CPA, ROAS, frecuencia u otras métricas se salen de umbral.

**Diferido a Fase 2:** Espionaje Ad Library (Pilar 3).

---

## Documentación

| Documento | Para qué |
|---|---|
| [`ABOUT_ES.md`](ABOUT_ES.md) | Guía de onboarding para el colaborador — leer primero |
| [`CONTEXT.md`](CONTEXT.md) | Glosario del dominio — terminología canónica del sistema |
| [`PRD y Guía Técnica V2.txt`](PRD%20y%20Guía%20Técnica_%20Automatización%20de%20Meta%20Ads%20-%20BH%20FASHION%20(V2).txt) | Requerimientos, arquitectura y roadmap técnico |
| [`SETUP.md`](SETUP.md) | IDs de producción Meta, credenciales n8n, estado del setup |
| [`docs/adr/`](docs/adr/) | Decisiones de arquitectura (hard-to-reverse) |

---

## Arquitectura resumida

```
Google Sheets (UI cliente)
  ├── Hoja Deploys     → 1 fila = 1 ad
  ├── Hoja Campañas    → config Campaign-level + umbrales de alerta
  └── Hoja Audiencias  → alias → ID de audiencia Meta

Apps Script (botón "BH Ads → Desplegar Marcadas")
  └── POST webhook → n8n

n8n (orquestación)
  ├── meta-ads-deploy    → Pilar 1
  ├── meta-ads-metrics   → Pilar 5 (cron 08:00/20:00 Caracas)
  ├── meta-ads-alerts    → Pilar 6 (post-metrics)
  └── meta-ads-cleanup   → pausa ads expirados (cron 03:00 Caracas)

Postgres (state-of-truth)
  ├── deployments        → estado por fila, IDs Meta
  ├── campaigns_meta     → cache nombre→campaign_id
  ├── metrics_snapshots  → historial rendimiento
  └── alerts_sent        → cooldown alertas

Meta Graph API v25.0
Telegram (alertas cliente + ops)
```

---

## Issues de implementación

Ver [GitHub Issues](https://github.com/anarculture/bhfashion-auto/issues) para el desglose en vertical slices listos para implementar.

---

*Preparado por: Mau Dávila-Barbe / colectivo htmk://*
