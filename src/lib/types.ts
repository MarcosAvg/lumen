/** Tipos compartidos entre cliente y servidor (sin lógica ni secretos). */

/** Nombre visible del grupo sin requisito cuando el objetivo no tiene requisitos. */
export const NO_REQUIREMENT_GROUP_LABEL = 'Fotografías';

/** Nombre visible del grupo «Adicionales» cuando el objetivo sí tiene requisitos. */
export const ADDITIONAL_GROUP_LABEL = 'Adicionales';

export type Role = 'admin' | 'supervisor' | 'technician';

/**
 * Quién puede exportar los ZIP de entrega/servicio. Los técnicos capturan y
 * envían evidencia, pero no exportan (docs/producto/reglas.md).
 */
export function canExportZip(role: Role): boolean {
	return role !== 'technician';
}

export type AssignmentRole = 'technician' | 'supervisor';

export type ContractLifecycle = 'active' | 'inactive' | 'archived';

export type ServiceLifecycle = 'planned' | 'active' | 'inactive' | 'archived';

export type CatalogPurpose = 'general' | 'buildings' | 'requirements';

export type WorkMode = 'direct' | 'divided';

export type TargetStatus = 'pending' | 'in_progress' | 'in_review' | 'rejected' | 'approved';

/** Usuario autenticado y activo, tal como lo ven los guardas de autorización. */
export interface SessionUser {
	id: string;
	username: string;
	displayName: string;
	role: Role;
}
