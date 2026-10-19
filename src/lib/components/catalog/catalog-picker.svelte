<script lang="ts">
	import { Label } from '#lib/components/ui/label';
	import { NativeSelect } from '#lib/components/ui/native-select';
	import { SvelteMap } from 'svelte/reactivity';
	import type { CatalogGroup } from './types';

	let {
		catalogs,
		value = $bindable(''),
		placeholder = 'Selecciona un catálogo',
		disabled = false
	}: {
		catalogs: CatalogGroup[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	const uid = $props.id();
	const typeSelectId = `catalog-type-${uid}`;
	const catalogSelectId = `catalog-${uid}`;

	let typeFilter = $state('all');
	let lastValue = $state('');

	const typeOptions = $derived.by(() => {
		const map = new SvelteMap<string, { id: string; name: string; sortOrder: number }>();
		for (const catalog of catalogs) {
			const typeId = catalog.typeId ?? 'other';
			if (!map.has(typeId)) {
				map.set(typeId, {
					id: typeId,
					name: catalog.typeName ?? 'Otros',
					sortOrder: catalog.typeSortOrder ?? 999
				});
			}
		}
		return [...map.values()].sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es')
		);
	});

	const selectedCatalog = $derived(catalogs.find((catalog) => catalog.id === value) ?? null);
	const selectedType = $derived(typeOptions.find((type) => type.id === typeFilter) ?? null);

	const visibleCatalogs = $derived(
		catalogs
			.filter((catalog) => typeFilter === 'all' || catalog.typeId === typeFilter)
			.sort(
				(a, b) =>
					(a.typeSortOrder ?? 999) - (b.typeSortOrder ?? 999) || a.name.localeCompare(b.name, 'es')
			)
	);

	const groups = $derived.by(() => {
		if (typeFilter !== 'all') {
			return [{ typeId: 'current', label: '', catalogs: visibleCatalogs }];
		}
		const map = new SvelteMap<
			string,
			{ typeId: string; label: string; sortOrder: number; catalogs: CatalogGroup[] }
		>();
		for (const catalog of visibleCatalogs) {
			const typeId = catalog.typeId ?? 'other';
			const entry = map.get(typeId) ?? {
				typeId,
				label: catalog.typeName ?? 'Otros',
				sortOrder: catalog.typeSortOrder ?? 999,
				catalogs: []
			};
			entry.catalogs.push(catalog);
			map.set(typeId, entry);
		}
		return [...map.values()].sort(
			(a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es')
		);
	});

	const catalogPlaceholder = $derived(
		catalogs.length === 0
			? 'No hay catálogos disponibles'
			: visibleCatalogs.length === 0
				? 'Sin catálogos para este tipo'
				: placeholder
	);

	$effect(() => {
		if (value === lastValue) return;
		lastValue = value;
		if (!value) return;
		const owner = catalogs.find((catalog) => catalog.id === value);
		if (owner?.typeId && typeFilter !== 'all' && owner.typeId !== typeFilter) {
			typeFilter = owner.typeId;
		}
	});

	$effect(() => {
		if (typeFilter !== 'all' && !typeOptions.some((type) => type.id === typeFilter)) {
			typeFilter = 'all';
		}
	});

	$effect(() => {
		if (value && !catalogs.some((catalog) => catalog.id === value)) value = '';
	});

	function changeType(next: string) {
		typeFilter = next;
		if (!value) return;
		const selected = catalogs.find((catalog) => catalog.id === value);
		if (selected && next !== 'all' && selected.typeId !== next) value = '';
	}
</script>

<div class="space-y-3" data-slot="catalog-picker">
	<div class="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
		<div class="space-y-1.5">
			<Label for={typeSelectId}>Tipo de catálogo</Label>
			<NativeSelect
				id={typeSelectId}
				data-slot="catalog-type-select"
				value={typeFilter}
				disabled={disabled || typeOptions.length === 0}
				onchange={(event) => changeType(event.currentTarget.value)}
			>
				<option value="all">Todos los tipos</option>
				{#each typeOptions as type (type.id)}
					<option value={type.id}>{type.name}</option>
				{/each}
			</NativeSelect>
		</div>

		<div class="space-y-1.5">
			<Label for={catalogSelectId}>Catálogo</Label>
			<NativeSelect
				id={catalogSelectId}
				data-slot="catalog-select"
				bind:value
				disabled={disabled || visibleCatalogs.length === 0}
			>
				<option value="" disabled>{catalogPlaceholder}</option>
				{#each groups as group (group.typeId)}
					{#if group.label}
						<optgroup label={group.label}>
							{#each group.catalogs as catalog (catalog.id)}
								<option value={catalog.id}>{catalog.name}</option>
							{/each}
						</optgroup>
					{:else}
						{#each group.catalogs as catalog (catalog.id)}
							<option value={catalog.id}>{catalog.name}</option>
						{/each}
					{/if}
				{/each}
			</NativeSelect>
		</div>
	</div>

	{#if selectedCatalog}
		<p class="text-xs text-muted-foreground">
			{selectedCatalog.typeName ?? 'Catálogo'} · {selectedCatalog.items.length} ítem(s)
			{#if selectedCatalog.description}
				· {selectedCatalog.description}{/if}
		</p>
	{:else if selectedType}
		<p class="text-xs text-muted-foreground">
			{visibleCatalogs.length} catálogo(s) en {selectedType.name}
		</p>
	{/if}
</div>
