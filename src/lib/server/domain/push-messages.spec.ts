import { describe, expect, it } from 'vitest';
import { submissionReviewedMessage, submissionSubmittedMessage } from './push-messages';

const target = { serviceName: 'Mantenimiento', workName: 'Piso 1', label: 'UMA 03' };

describe('mensajes de notificación de entregas', () => {
	it('construye la entrega nueva con deep link y etiqueta idempotente', () => {
		const message = submissionSubmittedMessage({ ...target, submissionId: 'sub-1', sequenceNo: 3 });
		expect(message.title).toBe('Nueva entrega #3');
		expect(message.body).toBe('Mantenimiento · Piso 1 · UMA 03');
		expect(message.deepLink).toBe('/submissions/sub-1');
		expect(message.eventKey).toBe('submission:sub-1:submitted');
		expect(message.push).toEqual({
			title: 'Nueva entrega #3',
			body: 'Mantenimiento · Piso 1 · UMA 03',
			url: '/submissions/sub-1',
			tag: 'submission:sub-1:submitted'
		});
	});

	it('omite la etiqueta cuando coincide con el nombre del trabajo', () => {
		const message = submissionSubmittedMessage({
			...target,
			label: 'Piso 1',
			submissionId: 'sub-2',
			sequenceNo: 1
		});
		expect(message.body).toBe('Mantenimiento · Piso 1');
	});

	it('marca aprobada con el deep link del objetivo', () => {
		const message = submissionReviewedMessage({
			...target,
			submissionId: 'sub-1',
			decision: 'approved',
			targetDeepLink: '/works/w1'
		});
		expect(message.title).toBe('Entrega aprobada');
		expect(message.eventKey).toBe('submission:sub-1:reviewed');
		expect(message.push.url).toBe('/works/w1');
		expect(message.push.tag).toBe('submission:sub-1:reviewed');
	});

	it('marca rechazada con el mismo deep link', () => {
		const message = submissionReviewedMessage({
			...target,
			submissionId: 'sub-1',
			decision: 'rejected',
			targetDeepLink: '/elements/e1'
		});
		expect(message.title).toBe('Entrega rechazada');
		expect(message.push).toEqual({
			title: 'Entrega rechazada',
			body: 'Mantenimiento · Piso 1 · UMA 03',
			url: '/elements/e1',
			tag: 'submission:sub-1:reviewed'
		});
	});
});
