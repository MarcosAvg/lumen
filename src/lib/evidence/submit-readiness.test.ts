import { describe, expect, it } from 'vitest';
import { missingRequirementMessage, submitReadiness } from './submit-readiness';

describe('submitReadiness', () => {
	it('exige al menos una foto cuando no hay requisitos obligatorios', () => {
		const empty = submitReadiness([], []);
		expect(empty.ready).toBe(false);
		expect(empty.needsAnyPhoto).toBe(true);
		expect(missingRequirementMessage(empty)).toBe('Añade al menos una fotografía para enviar.');

		expect(submitReadiness([], [{ requirementId: null }]).ready).toBe(true);
	});

	it('marca los requisitos obligatorios sin fotografía', () => {
		const requirements = [
			{ id: 'a', name: 'Antes', isRequired: true },
			{ id: 'b', name: 'Después', isRequired: true },
			{ id: 'c', name: 'Extra', isRequired: false }
		];
		const readiness = submitReadiness(requirements, [{ requirementId: 'a' }]);
		expect(readiness.ready).toBe(false);
		expect(readiness.missingNames).toEqual(['Después']);
		expect(missingRequirementMessage(readiness)).toBe(
			'Falta al menos una fotografía en «Después».'
		);
	});

	it('las fotografías adicionales no satisfacen un requisito obligatorio', () => {
		const requirements = [{ id: 'a', name: 'Antes', isRequired: true }];
		const readiness = submitReadiness(requirements, [{ requirementId: null }]);
		expect(readiness.ready).toBe(false);
		expect(readiness.missingNames).toEqual(['Antes']);
	});

	it('está listo cuando cada requisito obligatorio tiene al menos una foto', () => {
		const requirements = [
			{ id: 'a', name: 'Antes', isRequired: true },
			{ id: 'b', name: 'Extra', isRequired: false }
		];
		expect(submitReadiness(requirements, [{ requirementId: 'a' }]).ready).toBe(true);
	});
});
