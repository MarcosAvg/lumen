# Investigación de UX — Lumen

Este directorio guarda el plan y los resultados de la investigación de
usabilidad de Lumen. El objetivo no es "tener research", sino **tomar mejores
decisiones de producto** sobre la captura de evidencia (técnicos), la revisión
(supervisores) y la estructura administrativa.

> Regla base: una prueba de usabilidad con 5 personas revela ~80% de los
> problemas de usabilidad. Investigar es más barato que rediseñar a ciegas.

## Decisiones que informa esta investigación

| Pregunta                                                          | Decisión que desbloquea                    |
| ----------------------------------------------------------------- | ------------------------------------------ |
| ¿Qué necesita ver el técnico al abrir la app?                     | Rediseño del Tablero ("Mi jornada")        |
| ¿Completa captura + envío sin ayuda?                              | Formato de la captura y checklist de envío |
| ¿Gestiona el supervisor la cola con eficiencia?                   | Contadores y filtros de revisión           |
| ¿Se entiende la estructura admin (catálogos/trabajos/requisitos)? | Ayuda contextual y onboarding              |
| ¿Qué diseño de Tablero funciona mejor?                            | A/B o comparación moderada                 |

## Métodos por pregunta

| Pregunta                     | Método                         | Tiempo      | Confianza |
| ---------------------------- | ------------------------------ | ----------- | --------- |
| ¿Qué necesita el técnico?    | Indagación contextual (obra)   | 2–4 semanas | Alta      |
| ¿Puede completar la tarea?   | Prueba de usabilidad           | 1–2 semanas | Alta      |
| ¿Qué diseño es mejor?        | A/B test                       | 2–4 semanas | Muy alta  |
| ¿Por qué se confunden?       | Protocolo "pensar en voz alta" | 1 semana    | Alta      |
| ¿Cuántos tienen el problema? | Encuesta                       | 1–2 semanas | Media     |
| ¿Qué esperan encontrar?      | Card sorting (navegación)      | 1 semana    | Media     |

## Participantes

- **3–5 técnicos** reales, en obra, con su propio móvil (Android e iOS).
- **2–3 supervisores** habituales.
- **1–2 administradores**.
- Criterios: usan apps móviles con soltura; **sin formación previa en Lumen**.
- Nunca más de 5 por ronda (rendimiento decreciente).

## Guion de prueba de usabilidad (~30 min)

**Antes (5 min):** agradecer, explicar el formato, "no hay respuestas
incorrectas, probamos el diseño, no a ti". Grabar pantalla y audio.

**Tareas (20 min):**

1. (Técnico) "Entra y encuentra el servicio en el que trabajas hoy."
2. (Técnico) "Sube una foto al requisito «Antes» y envía la evidencia."
3. (Técnico) "Te rechazaron una entrega: búscala y corrígela."
4. (Supervisor) "Revisa la entrega pendiente y recházala con motivo."
5. (Admin) "Crea «Edificio B», un trabajo dividido con 2 elementos y un
   requisito «Después»."

**Después (5 min):** "¿Impresión general?", "¿Qué fue lo más frustrante?",
"Si pudieras cambiar una sola cosa, ¿cuál sería?".

**Métricas por tarea:** éxito (sí/no con ayuda), tiempo, número de errores,
pistas solicitadas y **SEQ** (_Single Ease Question_, 1–7).

## Protocolo de entrevista

```ts
interface InterviewQuestion {
	category: 'context' | 'behavior' | 'motivation' | 'pain-point';
	question: string;
	followUp?: string;
	avoid?: string; // palabras que dirigen la respuesta
}

const questions: InterviewQuestion[] = [
	{
		category: 'context',
		question: 'Cuéntame un día típico de trabajo.',
		followUp: '¿Qué herramientas usas más?'
	},
	{
		category: 'behavior',
		question: 'Háblame de la última vez que documentaste una inspección.',
		followUp: '¿Qué intentaste primero? ¿Qué pasó después?',
		avoid: '¿Por qué lo hiciste así?' // suena acusatorio
	},
	{
		category: 'motivation',
		question: '¿Qué te haría más fácil esto?',
		avoid: '¿Usarías la función X?' // todo el mundo dice que sí
	}
];
```

## Síntesis (affinity mapping)

1. Una idea por nota adhesiva.
2. Agrupar notas relacionadas.
3. Nombrar cada grupo (tema emergente).
4. Buscar patrones entre grupos.
5. Priorizar por **frecuencia × impacto**.

Plantilla de tema:

```markdown
### Tema: [nombre]

- Idea 1 (3/5 participantes)
- Idea 2 (4/5 participantes)

### Prioridad: [Alta/Media/Baja]

### Recomendación: [acción concreta]
```

## Anti-patrones (evitar)

- "¿Usarías esto?" — observa lo que hacen, no lo que dicen.
- Probar con más de 5 personas por ronda.
- Dirigir: "¿no crees que esto confunde?".
- Saltarse el debrief (los hallazgos se desvanecen).
- Investigar sin acción: cada estudio debe informar una decisión.

## Estructura del repositorio

```
research/
  participants/   # P001-entrevista.md, P002-usabilidad.md
  themes/         # navegacion.md, onboarding.md
  reports/        # 2026-q1-auditoria.md
  artifacts/      # journey-maps/, personas/
```

## Cronograma sugerido

- **Semana 1:** reclutamiento + guion.
- **Semana 2:** 5 sesiones de usabilidad + debrief inmediato.
- **Semana 3:** síntesis, informe y decisión sobre Tablero / revisión / ayuda.

## Criterios de éxito

- ≥80% de éxito en tareas críticas sin ayuda.
- SEQ medio ≥ 5.5.
- Cero errores de comprensión sobre "estado" y "rol".
- Cada hallazgo priorizado deriva en una decisión (implementar, descartar o
  volver a investigar).
