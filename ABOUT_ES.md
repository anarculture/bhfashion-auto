# Guía para el Colaborador — BH Fashion Ads Automation

¡Bienvenido al equipo! Este documento te pone al día en 10 minutos.

---

## Qué estamos construyendo

Un sistema que toma posts de Instagram ya publicados por BH Fashion y los convierte en anuncios pagos en Meta con un clic desde Google Sheets. Sin entrar a Meta Ads Manager, sin subir imágenes, sin copiar IDs manualmente.

El cliente llena filas en Sheets (URL del post IG, presupuesto, audiencia, fechas), marca un checkbox, hace clic en "Desplegar Marcadas" y el sistema hace el resto.

---

## Documentos que debes leer antes de tocar código

1. **Este archivo** — contexto rápido.
2. **[CONTEXT.md](CONTEXT.md)** — glosario canónico. Si hay duda sobre qué significa un término (Fila Pendiente, Claim, Boost de IG Post, etc.), la respuesta está aquí.
3. **[PRD y Guía Técnica V2](PRD%20y%20Guía%20Técnica_%20Automatización%20de%20Meta%20Ads%20-%20BH%20FASHION%20(V2).txt)** — arquitectura completa, pilares, restricciones de diseño.
4. **[SETUP.md](SETUP.md)** — IDs de producción Meta y qué credentials configurar en n8n.
5. **[docs/adr/](docs/adr/)** — decisiones ya tomadas y por qué. Léelas antes de proponer cambios de arquitectura.

---

## Marco de trabajo: Boris Tane Framework

Todo desarrollo sigue este ciclo antes de considerarse terminado:

1. **Research** — lee la documentación de los endpoints que vas a tocar (Meta Graph API v25.0, n8n nodes, Apps Script). Entiende el JSON que espera la API.
2. **Plan** — mapea el flujo. ¿Qué pasa si el post de IG está privado? ¿Qué pasa si Meta devuelve rate limit? Responde antes de codear.
3. **Annotate** — define los payloads JSON y la lógica antes de construir en n8n. Documenta cualquier decisión no obvia.
4. **Implement** — construye en Sandbox de Meta primero (`act_sandbox`), luego producción (`act_5314378785280789`).

---

## Por dónde empezar

1. Lee `CONTEXT.md` completo — 10 minutos.
2. Revisa los [GitHub Issues](https://github.com/anarculture/bhfashion-auto/issues) — están en orden de dependencia. El Issue #1 no tiene bloqueantes: es tu punto de entrada.
3. Configura las credenciales en n8n según `SETUP.md` (tokens en 1Password, pídelos a Mau).
4. Importa `Meta Ads Auto Deploy (Fixed).json` en tu instancia de prueba de n8n como referencia del flujo anterior — **este workflow requiere refactoring mayor** según Issue #2. No lo uses en producción tal cual.

---

## Decisiones que ya están tomadas (no re-debatir)

- **Paradigma creativo**: Boost de post IG existente. Sin subida de imágenes, sin Gemini. Ver [ADR-0003](docs/adr/0003-boost-ig-post-paradigm.md).
- **Trigger**: manual vía Apps Script. Sin cron auto-deploy. Ver [ADR-0002](docs/adr/0002-manual-trigger-via-apps-script.md).
- **State-of-truth**: Postgres, no Sheets. Ver [ADR-0001](docs/adr/0001-postgres-state-machine.md).
- **Notificaciones**: Telegram (bot cliente + grupo ops). Ver [ADR-0004](docs/adr/0004-telegram-notifications.md).

Si encuentras una razón técnica para cambiar alguna de estas decisiones, crea un nuevo ADR con el contexto antes de modificar código.

---

## Canales de comunicación

- **Telegram bot `bh-ads-alerts`** — alertas de negocio al cliente (CPA alto, frecuencia, etc.)
- **Grupo Telegram `bh-ads-ops`** — errores de infraestructura al operador (tú y Mau)

Para configurar los `chat_id` de Telegram: abre el bot con el cliente, escribe `/start`, luego llama `https://api.telegram.org/bot<TOKEN>/getUpdates` para obtener el `chat_id`.

---

*Preparado por: Mau Dávila-Barbe / colectivo htmk://*
