<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Badge } from '#lib/components/ui/badge';
	import CatalogItemMultiCombobox from './catalog-item-multi-combobox.svelte';
	import CatalogPicker from './catalog-picker.svelte';
	import type { CatalogGroup } from './types';

	/**
	 * Selección múltiple en dos pasos (catálogo → ítems). Los ítems elegidos se
	 * **acumulan entre catálogos** como chips y se emite un `input` por id.
	 */
	let {
		name,
		catalogs,
		value = $bindable<string[]>([]),
		itemPlaceholder = 'Añadir ítems…',
		disabled = false
	}: {
		name?: string;
		catalogs: CatalogGroup[];
		value?: string[];
		itemPlaceholder?: string;
		disabled?: boolean;
	} = $props();

	let catalogId = $state('');

	$effect(() => {
		if (catalogId && !catalogs.some((catalog) => catalog.id === catalogId)) {
			catalogId = '';
		}
	});

	const currentItems = $derived(catalogs.find((catalog) => catalog.id === catalogId)?.items ?? []);
	const nameById = $derived(
		new Map(
			catalogs.flatMap((catalog) => catalog.items.map((item) => [item.id, item.name] as const))
		)
	);
	const selected = $derived(value.map((id) => ({ id, name: nameById.get(id) ?? id })));

	function remove(id: string) {
		value = value.filter((entry) => entry !== id);
	}
</script>

{#if name}
	{#each value as id (id)}
		<input type="hidden" {name} value={id} />
	{/each}
{/if}

<div class="space-y-3" data-slot="catalog-item-multi-picker">
	{#if selected.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each selected as item (item.id)}
				<Badge variant="secondary" class="gap-1">
					{item.name}
					<button
						type="button"
						class="rounded-full hover:bg-muted"
						aria-label={`Quitar ${item.name}`}
						onclick={() => remove(item.id)}
					>
						<X class="size-3" aria-hidden="true" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}
	{#if catalogs.length > 0}
		<CatalogPicker {catalogs} bind:value={catalogId} {disabled} />
		<div class="space-y-1.5">
			<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
				Ítems
			</span>
			<CatalogItemMultiCombobox
				items={currentItems}
				bind:values={value}
				disabled={disabled || !catalogId}
				placeholder={catalogId ? itemPlaceholder : 'Selecciona un catálogo primero'}
			/>
		</div>
	{:else}
		<p class="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
			No hay catálogos disponibles.
		</p>
	{/if}
</div>
