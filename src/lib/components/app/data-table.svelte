<script lang="ts">
	import * as Table from '#lib/components/ui/table';
	import type { Snippet } from 'svelte';

	/**
	 * Contenedor de tabla para escritorio: borde, cabecera compacta y filas
	 * alineadas. En móvil el contenedor permite desplazamiento horizontal.
	 */
	let { children, class: className = '' }: { children: Snippet; class?: string } = $props();
</script>

<div class="overflow-x-auto rounded-xl border border-border bg-card">
	<Table.Root
		class="[&_td]:px-4 [&_td]:py-3 [&_th]:h-10 [&_th]:border-b [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-4 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:tracking-[0.06em] [&_th]:text-muted-foreground [&_th]:uppercase {className}"
	>
		{@render children()}
	</Table.Root>
</div>
