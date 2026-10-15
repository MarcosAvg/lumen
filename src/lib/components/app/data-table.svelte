<script lang="ts">
	import * as Table from '#lib/components/ui/table';
	import type { Snippet } from 'svelte';

	/**
	 * Contenedor de tabla para escritorio: borde, cabecera compacta y filas
	 * alineadas. En móvil el contenedor permite desplazamiento horizontal.
	 */
	let { children, class: className = '' }: { children: Snippet; class?: string } = $props();
</script>

<div class="overflow-x-auto rounded-xl border bg-card">
	<Table.Root
		class="[&_td]:px-4 [&_td]:py-3 [&_th]:h-11 [&_th]:px-4 [&_th]:text-xs [&_th]:font-medium [&_th]:tracking-normal [&_th]:text-muted-foreground {className}"
	>
		{@render children()}
	</Table.Root>
</div>
