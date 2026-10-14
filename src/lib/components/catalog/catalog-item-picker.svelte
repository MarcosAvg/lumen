<script lang="ts">
	import CatalogItemCombobox from './catalog-item-combobox.svelte';
	import type { CatalogGroup } from './types';

	/**
	 * Selección en dos pasos: primero el catálogo y después uno de sus ítems
	 * (con búsqueda). Emite un `input` oculto con el id seleccionado.
	 */
	let {
		name,
		catalogs,
		value = $bindable(''),
		itemPlaceholder = 'Elige ítem…',
		disabled = false
	}: {
		name: string;
		catalogs: CatalogGroup[];
		value?: string;
		itemPlaceholder?: string;
		disabled?: boolean;
	} = $props();

	let catalogId = $state('');

	// Mantén el catálogo del valor actual; si no, el primero disponible.
	$effect(() => {
		if (catalogs.length === 0) return;
		const owner = catalogs.find((catalog) => catalog.items.some((item) => item.id === value));
		if (owner) {
			if (catalogId !== owner.id) catalogId = owner.id;
			return;
		}
		if (!catalogs.some((catalog) => catalog.id === catalogId)) {
			catalogId = catalogs[0].id;
		}
	});

	const currentItems = $derived(catalogs.find((catalog) => catalog.id === catalogId)?.items ?? []);

	// Si el valor no pertenece al catálogo elegido, se limpia.
	$effect(() => {
		if (value && !currentItems.some((item) => item.id === value)) {
			value = '';
		}
	});
</script>

<input type="hidden" {name} {value} />
<div class="space-y-2">
	<select
		class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
		aria-label="Catálogo"
		bind:value={catalogId}
	>
		{#each catalogs as catalog (catalog.id)}
			<option value={catalog.id}>{catalog.name}</option>
		{/each}
	</select>
	<CatalogItemCombobox items={currentItems} bind:value {disabled} placeholder={itemPlaceholder} />
</div>
