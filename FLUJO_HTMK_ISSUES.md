# Flujo de Trabajo: Resolución de Issues con HTMK Flow

Este documento explica cómo abordamos el desarrollo y la resolución de **GitHub Issues** en este proyecto utilizando nuestra metodología estructurada: **HTMK Flow (RPI + Karpathy Guidelines + Caveman)**. 

El objetivo de este flujo es garantizar que no escribamos código a ciegas, que cada decisión técnica esté documentada y que mantengamos la base de código simple y limpia.

## El Proceso de 3 Fases (RPI)

Cada vez que te asignes un **GitHub Issue**, debes invocar o seguir mentalmente el `@htmk-flow`. Nunca saltamos directamente a programar. El trabajo se divide en tres fases bloqueadas, y cada una requiere una aprobación explícita (GO/NO-GO) antes de pasar a la siguiente.

### Fase 1: Research (Investigación)
**Objetivo:** Explorar la viabilidad, identificar riesgos y hacer preguntas clave antes de tocar el código.

1. **Lee el Issue:** Entiende exactamente qué se está pidiendo.
2. **Explora sin modificar:** No escribas código de implementación todavía. Revisa los archivos existentes, nodos de n8n, o configuraciones actuales que se verán afectadas.
3. **Crea el artefacto de investigación:** Redacta un documento en `.features/[nombre-del-issue]/RESEARCH.md`.
   - Documenta qué existe hoy.
   - Qué archivos/nodos necesitan modificarse o crearse.
   - Qué riesgos técnicos existen.
   - Haz estimaciones de esfuerzo.
4. **Gate (Compuerta):** Detente. Presenta este `RESEARCH.md` al líder del proyecto y espera un **GO** o **NO-GO** antes de avanzar.

### Fase 2: Plan (Planificación)
**Objetivo:** Definir decisiones de arquitectura, pasos exactos de implementación y un plan de pruebas.

1. Tras recibir el "GO" de la Fase 1, crea el archivo `.features/[nombre-del-issue]/PLAN.md`.
2. **Resuelve las decisiones:** Documenta por qué elegiste un camino sobre otro.
3. **Define pasos accionables:** Escribe pasos secuenciales que se puedan probar de manera independiente.
4. **Establece "Test Gates":** Cada paso debe tener un criterio de éxito claro y verificable (ej. "El nodo X de n8n debe devolver un estado 200").
5. **Gate (Compuerta):** Detente. Presenta el plan para revisión y espera aprobación. Todavía no escribimos código.

### Fase 3: Implement (Implementación)
**Objetivo:** Ejecutar el código paso a paso, asegurando que las pruebas pasen antes de avanzar.

1. **Sigue el plan al pie de la letra:** Implementa *solo* lo que el paso especifica. No añadas funciones "por si acaso" (Simplicity First).
2. **Cambios quirúrgicos:** Toca solo lo necesario y limpia solo lo que tú rompas. Mantén el estilo existente.
3. **Pasa los Test Gates:** Verifica que el código/nodo funciona exactamente como se planeó.
4. **Si algo falla:** Reporta el error, diagnostica la causa y presenta opciones de solución. **No improvises arreglos**. Si es necesario, se revisa el plan.
5. Una vez terminados todos los pasos y pasadas las pruebas, el Issue puede marcarse como resuelto y hacer el Pull Request o Push correspondiente.

---

## Principios Clave a Recordar

* **Piensa antes de codificar:** No asumas nada. Haz explícitas tus suposiciones.
* **Simplicidad ante todo:** Escribe el código mínimo necesario para resolver el Issue.
* **Comunicación "Caveman" (Directa y al grano):** Al comunicar avances o problemas en los tickets, sé directo. Elimina los adornos y ve al sustento técnico: `[Problema] [Acción tomada] [Razón]. [Siguiente paso].`
* **Cambios quirúrgicos:** No refactorices cosas fuera del alcance de tu Issue actual a menos que sea estrictamente necesario y esté en el Plan.

Al seguir este flujo, nos aseguramos de que todos los desarrollos en *BH FASHION* sean estables, predecibles y estén perfectamente documentados.
