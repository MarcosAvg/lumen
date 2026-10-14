/** Tipos compartidos entre cliente y servidor (sin lógica ni secretos). */

export type Role = 'admin' | 'supervisor' | 'technician';

export type AssignmentRole = 'technician' | 'supervisor';

export type CatalogPurpose = 'general' | 'buildings';

export type WorkMode = 'direct' | 'divided';

export type TargetStatus = 'pending' | 'in_progress' | 'in_review' | 'rejected' | 'approved';

/** Usuario autenticado y activo, tal como lo ven los guardas de autorización. */
export interface SessionUser {
	id: string;
	username: string;
	displayName: string;
	role: Role;
}
