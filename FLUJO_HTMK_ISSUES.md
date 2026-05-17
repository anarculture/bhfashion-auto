# Resolución de Issues: Cómo instruir a tu IA con HTMK Flow

Este documento explica a los colaboradores cómo delegar el desarrollo y la resolución de **GitHub Issues** a su Asistente de IA (Claude, Cursor, etc.) utilizando nuestra metodología (skill) **HTMK Flow (RPI + Karpathy Guidelines + Caveman)**.

El objetivo **NO es que tú apliques este flujo manualmente**. El objetivo es que **instruyas a tu IA** utilizando este skill para que ella investigue, planifique e implemente bajo tu estricta supervisión.

## Instrucciones para el Colaborador

Cada vez que tomes un **GitHub Issue**, tu primer paso en el chat con tu IA debe ser invocar el skill. 

**Ejemplo de Prompt inicial para tu IA:**
> "Quiero resolver este GitHub Issue: [enlace o descripción del issue]. Para abordarlo, por favor utiliza obligatoriamente el skill `@htmk-flow` y sigue su proceso de 3 fases bloqueadas."

A partir de ahí, tu rol como humano es actuar como el **Líder / Aprobador (Gatekeeper)** de tu IA a lo largo de 3 fases:

### Fase 1: Research (Investigación por parte de la IA)
La IA explorará la base de código sin modificar nada y generará un artefacto de investigación en `.features/[nombre-del-issue]/RESEARCH.md`.
- **Tu Rol:** Revisa el `RESEARCH.md` generado por la IA. Verifica que entienda qué archivos tocar, los riesgos y la estimación. 
- **Acción:** Si todo tiene sentido, dale un **GO** en el chat a la IA para que pase a la planificación. Si no, dale feedback y pide que ajuste la investigación (NO-GO / NEEDS CLARIFICATION).

### Fase 2: Plan (Planificación por parte de la IA)
La IA creará el archivo `.features/[nombre-del-issue]/PLAN.md`, donde detallará las decisiones de arquitectura, pasos secuenciales y "Test Gates" verificables para cada paso.
- **Tu Rol:** Revisa críticamente el plan propuesto. Asegúrate de que los pasos sean incrementales y que las pruebas (Test Gates) sean reales y ejecutables.
- **Acción:** Si el plan es sólido, dale el **GO** a la IA para que comience a escribir código.

### Fase 3: Implement (Implementación guiada)
La IA comenzará a ejecutar el código paso a paso según el `PLAN.md`.
- **Tu Rol:** Actuar como el puente de ejecución y validación. Deberás ejecutar los tests (Test Gates) que la IA propone y pasarle los resultados (logs, errores).
- **Regla Estricta:** Si una prueba falla, la IA debe detenerse y presentarte opciones. Tú decides cómo proceder (arreglar, revisar plan, etc.). *No dejes que la IA improvise fuera del plan original.*

---

## Principios Clave del Skill (Para que audites a tu IA)

Cuando la IA esté trabajando, asegúrate de que respete los principios del HTMK Flow:
* **Simplicidad ante todo:** No dejes que la IA te construya abstracciones complejas o código especulativo. Debe escribir el mínimo código posible.
* **Cambios Quirúrgicos:** La IA solo debe tocar lo que el paso actual requiere. Si se desvía y empieza a refactorizar otras cosas, detenla.
* **Comunicación Caveman:** Exige a tu IA que se comunique contigo de manera directa, sin adornos ni palabras de relleno (`[Problema] [Acción] [Razón]. [Siguiente paso].`).

Tu trabajo es dirigir la orquesta de la IA, asegurándote de que los sistemas de BH FASHION crezcan de manera estable, predecible y perfectamente documentada.
