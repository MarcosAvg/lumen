/**
 * Construcción de los mensajes de notificación (inbox + Web Push) de entregas y
 * revisiones. Es un módulo **puro** (sin imports de entorno ni de base de datos)
 * para poder probarlo de forma unitaria y para que el texto del inbox y el del
 * push no diverjan.
 */

/** Carga útil enviada por Web Push (mismo formato que espera el service worker). */
export interface PushMessage {
	title: string;
	body: string;
	url: string;
	tag: string;
}

/** Texto para el inbox y el push, con la clave de evento idempotente. */
export interface NotificationMessage {
	eventKey: string;
	title: string;
	body: string;
	deepLink: string;
	push: PushMessage;
}

export interface TargetDescription {
	serviceName: string;
	workName: string;
	label: string;
}

/** `Servicio · Trabajo` (con la etiqueta del elemento si aporta contexto). */
function describeTarget(context: TargetDescription): string {
	const parts = [context.serviceName, context.workName];
	if (context.label && context.label !== context.workName) parts.push(context.label);
	return parts.join(' · ');
}

export interface SubmissionSubmittedContext extends TargetDescription {
	submissionId: string;
	sequenceNo: number;
}

/** Entrega nueva para los supervisores asignados. */
export function submissionSubmittedMessage(
	context: SubmissionSubmittedContext
): NotificationMessage {
	const eventKey = `submission:${context.submissionId}:submitted`;
	const deepLink = `/submissions/${context.submissionId}`;
	return {
		eventKey,
		title: `Nueva entrega #${context.sequenceNo}`,
		body: describeTarget(context),
		deepLink,
		push: {
			title: `Nueva entrega #${context.sequenceNo}`,
			body: describeTarget(context),
			url: deepLink,
			tag: eventKey
		}
	};
}

export interface SubmissionReviewedContext extends TargetDescription {
	submissionId: string;
	decision: 'approved' | 'rejected';
	targetDeepLink: string;
}

/** Decisión de una revisión para los técnicos asignados. */
export function submissionReviewedMessage(context: SubmissionReviewedContext): NotificationMessage {
	const eventKey = `submission:${context.submissionId}:reviewed`;
	const title = context.decision === 'approved' ? 'Entrega aprobada' : 'Entrega rechazada';
	return {
		eventKey,
		title,
		body: describeTarget(context),
		deepLink: context.targetDeepLink,
		push: {
			title,
			body: describeTarget(context),
			url: context.targetDeepLink,
			tag: eventKey
		}
	};
}
