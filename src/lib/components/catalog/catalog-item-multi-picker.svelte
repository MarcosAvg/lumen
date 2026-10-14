<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Badge } from '#lib/components/ui/badge';
	import CatalogItemMultiCombobox from './catalog-item-multi-combobox.svelte';
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
		name: string;
		catalogs: CatalogGroup[];
		value?: string[];
		itemPlaceholder?: string;
		disabled?: boolean;
	} = $props();

	let catalogId = $state('');

	$effect(() => {
		if (catalogs.length === 0) return;
		if (!catalogs.some((catalog) => catalog.id === catalogId)) {
			catalogId = catalogs[0].id;
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

{#each value as id (id)}
	<input type="hidden" {name} value={id} />
{/each}

<div class="space-y-2">
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
	<select
		class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
		aria-label="Catálogo"
		bind:value={catalogId}
	>
		{#each catalogs as catalog (catalog.id)}
			<option value={catalog.id}>{catalog.name}</option>
		{/each}
	</select>
	<CatalogItemMultiCombobox
		items={currentItems}
		bind:values={value}
		{disabled}
		placeholder={itemPlaceholder}
	/>
</div>
