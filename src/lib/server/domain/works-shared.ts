import { sql } from 'drizzle-orm';
import { catalogItems, elements, works } from '#lib/server/db/schema';

/**
 * Nombres visibles (ítem de catálogo o nombre propio) compartidos por los módulos
 * de `works` y `works-generation`.
 */

export const visibleWorkName = sql<string>`coalesce(${catalogItems.name}, ${works.customName})`;
export const visibleElementName = sql<string>`coalesce(${catalogItems.name}, ${elements.customName})`;
