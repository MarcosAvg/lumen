<script lang="ts">
	import CatalogItemCombobox from './catalog-item-combobox.svelte';
	import CatalogPicker from './catalog-picker.svelte';
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
		name?: string;
		catalogs: CatalogGroup[];
		value?: string;
		itemPlaceholder?: string;
		disabled?: boolean;
	} = $props();

	let catalogId = $state('');

	// Mantén el catálogo del valor actual; si no hay valor, no se preselecciona nada.
	$effect(() => {
		if (catalogs.length === 0) return;
		const owner = catalogs.find((catalog) => catalog.items.some((item) => item.id === value));
		if (owner) {
			if (catalogId !== owner.id) catalogId = owner.id;
			return;
		}
		if (catalogId && !catalogs.some((catalog) => catalog.id === catalogId)) {
			catalogId = '';
		}
	});

	const currentItems = $derived(catalogs.find((catalog) => catalog.id === catalogId)?.items ?? []);

	// Si el valor no pertenece al catálogo elegido, se limpia.
	$effect(() => {
		if (catalogId && value && !currentItems.some((item) => item.id === value)) {
			value = '';
		}
	});
</script>

{#if name}
	<input type="hidden" {name} {value} />
{/if}
<div class="space-y-2">
	<div class="space-y-1">
		<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
			Catálogo
		</span>
		<CatalogPicker {catalogs} bind:value={catalogId} disabled={disabled || catalogs.length === 0} />
	</div>
	<CatalogItemCombobox
		items={currentItems}
		bind:value
		disabled={disabled || !catalogId}
		placeholder={catalogId ? itemPlaceholder : 'Selecciona un catálogo primero'}
	/>
</div>
