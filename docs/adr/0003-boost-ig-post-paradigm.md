# ADR 0003 — Boost de IG post como paradigma creativo (Fase 1)

**Fecha:** 2026-05-16
**Estado:** Aceptado

## Contexto

PRD Pilar 4 ("Síntesis Creativos") propone que Gemini 2.5 Flash genere 5 variaciones de copy por fila, y que el workflow suba imágenes y construya 5 AdCreatives. Workflow auditado está construido en torno a esta premisa (nodes `Download Media`, `Upload AdImage`, llamada Gemini, fan-out a 5 ads).

Conversación con el cliente reveló intención diferente: la URL en Sheets es un **post de Instagram existente** que debe convertirse directamente en ad (boost). El cliente cura el contenido en IG primero; el ad reusa ese post tal cual.

## Decisión

Fase 1 implementa **únicamente el paradigma Boost**: 1 URL IG → 1 Ad que referencia el post existente vía `instagram_permalink_url` + `instagram_actor_id` en AdCreative.

Eliminado de Fase 1:
- Nodo `Download Media`
- Nodo `Upload AdImage`
- Llamada Gemini para variaciones de copy
- Fan-out a 5 ads

Estructura jerárquica resultante por fila: 1 Campaign + 1 AdSet + 1 Ad.

## Alternativas consideradas

- **B (media-only)**: extraer imagen del IG post, regenerar copy con Gemini, crear 5 ads. Rechazado — pierde interacciones acumuladas del post, contradice intención cliente.
- **C (híbrido boost/variar)**: columna `Modo` por fila. Diferido a Fase 2 — añade complejidad sin demanda actual.

## Consecuencias

- PRD Pilar 4 queda fuera de alcance Fase 1. Documentar como diferido.
- Workflow se simplifica: 11 nodos → estimado ~6 nodos.
- Gemini API y costos asociados no aplican en Fase 1.
- Métricas (PRD Pilar 5) y Alertas (Pilar 6) se mantienen como worflows separados.
- Ventaja: ads heredan social proof del post original (likes/comments visibles).
- Restricción: cliente debe publicar en IG antes de poder hacer ad — flujo de trabajo cambia.
