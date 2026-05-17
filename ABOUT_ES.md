# Acerca de este Proyecto - Guía para el Colaborador

¡Bienvenido al equipo de implementación de **BH FASHION**!

Este documento está diseñado para ponerte al día rápidamente sobre cómo operamos, la arquitectura que estamos construyendo y cómo puedes aportar valor desde el primer día.

## Nuestra Misión

Estamos construyendo un "motor" autónomo para desplegar campañas publicitarias en Meta. El objetivo es que nadie tenga que entrar al Ads Manager a hacer clics manuales. Todo se controlará desde Google Sheets, orquestado por **n8n**, y potenciado por **Gemini** para la redacción de copies y análisis de datos.

## Marco de Trabajo: Boris Tane Framework

En este equipo operamos bajo el framework de Boris Tane. Todo desarrollo técnico debe seguir este ciclo de 4 pasos antes de considerarse terminado:

1. **Research (Investigación):** Antes de tocar el código o la interfaz de n8n, lee la documentación de las APIs involucradas (Meta Graph API v23, Google Sheets, Gemini). Debes tener claro los endpoints, tokens requeridos y la estructura del JSON que la API espera recibir.
2. **Plan (Planificación):** Mapea el flujo lógico. Define los gatillos (triggers), las iteraciones (loops) y el manejo de errores. Hazte preguntas: *¿Qué pasa si la imagen no carga? ¿Qué pasa si el CPA se dispara?*
3. **Annotate (Anotación):** Estructura tu solución en papel o en un documento de texto. Define los objetos JSON base (payloads) que vas a enviar a la API (Campaña -> Adset -> Creative -> Ad). Anota cualquier función en JavaScript que se vaya a requerir en los nodos "Code" de n8n para formateo de datos.
4. **Implement (Implementación):** Construye el flujo en n8n, preferiblemente empezando en un entorno de pruebas (Sandbox). Valida los datos y maneja las excepciones. Si algo falla, el error debe registrarse en la hoja de Sheets o alertar vía Slack.

## Primeros Pasos para Ti

1. **Revisa la documentación:** Lee los archivos de texto `PRD y Guía Técnica` disponibles en este repositorio. Te darán el panorama detallado de la infraestructura.
2. **Analiza el flujo actual:** Importa el archivo `Meta Ads Auto Deploy (Fixed).json` en una instancia de prueba de n8n para ver cómo están conectados los nodos.
3. **Familiarízate con los datos:** Revisa `Plantilla_Meta_Ads.csv` para entender las columnas y variables que dispara el flujo.
4. **Itera y Documenta:** Este repositorio es un ente vivo. Si durante tu fase de *Implementación* descubres un nuevo requisito de la API de Meta que no habíamos contemplado, regresa a la fase de *Research* y actualiza nuestros documentos.

Cualquier duda, no dudes en levantar la mano. ¡Mucho éxito en la implementación!
