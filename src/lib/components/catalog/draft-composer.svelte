<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { LabeledCheckbox } from '#lib/components/ui/labeled-checkbox';
	import * as Tabs from '#lib/components/ui/tabs';
	import CatalogItemMultiPicker from './catalog-item-multi-picker.svelte';
	import type { CatalogGroup } from './types';

	type Draft = { catalogItemId: string; name: string };

	let {
		catalogs,
		value = $bindable<Draft[]>([]),
		itemLabel = 'elemento',
		itemPlural = 'elementos',
		catalogPlaceholder,
		namePlaceholder,
		showRequired = false,
		required = $bindable(true),
		disabled = false
	}: {
		catalogs: CatalogGroup[];
		value?: Draft[];
		itemLabel?: string;
		itemPlural?: string;
		catalogPlaceholder?: string;
		namePlaceholder?: string;
		showRequired?: boolean;
		required?: boolean;
		disabled?: boolean;
	} = $props();

	const uid = $props.id();
	const hasCatalogs = $derived(catalogs.length > 0);
	let mode = $state<'catalog' | 'custom'>('catalog');
	let catalogSelection = $state<string[]>([]);
	let nameDraft = $state('');

	function nameFor(draft: Draft): string {
		if (draft.catalogItemId) {
			for (const catalog of catalogs) {
				const match = catalog.items.find((item) => item.id === draft.catalogItemId);
				if (match) return match.name;
			}
			return '(ítem)';
		}
		return draft.name;
	}

	function addFromCatalog() {
		const chosen = catalogSelection.filter(
			(id) => !value.some((draft) => draft.catalogItemId === id)
		);
		if (chosen.length === 0) return;
		value = [...value, ...chosen.map((id) => ({ catalogItemId: id, name: '' }))];
		catalogSelection = [];
	}

	function addByName() {
		const name = nameDraft.trim();
		if (!name) return;
		value = [...value, { catalogItemId: '', name }];
		nameDraft = '';
	}

	function removeAt(index: number) {
		value = value.filter((_, position) => position !== index);
	}
</script>

<div class="space-y-4" data-slot="draft-composer" data-kind={itemPlural}>
	{#if showRequired}
		<LabeledCheckbox bind:checked={required} {disabled} label="Obligatorio por defecto" />
	{/if}

	{#if hasCatalogs}
		<Tabs.Root bind:value={mode}>
			<Tabs.List class="grid w-full grid-cols-2">
				<Tabs.Trigger value="catalog" {disabled}>Desde catálogo</Tabs.Trigger>
				<Tabs.Trigger value="custom" {disabled}>Nombre propio</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	{:else}
		<p class="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
			No hay catálogos disponibles para este servicio. Escribe un nombre propio.
		</p>
	{/if}

	{#if hasCatalogs && mode === 'catalog'}
		<div class="space-y-3">
			<p class="text-xs text-muted-foreground">
				Filtra por tipo, elige un catálogo y añade uno o varios {itemPlural}.
			</p>
			<CatalogItemMultiPicker
				{catalogs}
				bind:value={catalogSelection}
				itemPlaceholder={catalogPlaceholder ?? `Elegir ${itemPlural}…`}
				{disabled}
			/>
			<Button
				type="button"
				variant="outline"
				class="w-full sm:w-auto"
				disabled={disabled || catalogSelection.length === 0}
				onclick={addFromCatalog}
			>
				Añadir {catalogSelection.length > 0 ? `(${catalogSelection.length})` : ''}
			</Button>
		</div>
	{:else}
		<div class="space-y-3">
			<div class="space-y-1.5">
				<Label for={`draft-name-${uid}`}>Nombre del {itemLabel}</Label>
				<Input
					id={`draft-name-${uid}`}
					bind:value={nameDraft}
					placeholder={namePlaceholder ?? `Nombre del ${itemLabel}`}
					{disabled}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							addByName();
						}
					}}
				/>
			</div>
			<Button
				type="button"
				variant="outline"
				class="w-full sm:w-auto"
				disabled={disabled || nameDraft.trim().length === 0}
				onclick={addByName}
			>
				Añadir
			</Button>
		</div>
	{/if}

	{#if value.length > 0}
		<div class="space-y-2">
			<p class="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
				Añadidos ({value.length})
			</p>
			<ul class="divide-y overflow-hidden rounded-xl border border-border bg-card">
				{#each value as draft, index (index)}
					<li class="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
						<span class="flex min-w-0 items-center gap-2">
							<span class="truncate font-medium">{nameFor(draft)}</span>
							{#if draft.catalogItemId}
								<Badge variant="secondary" class="shrink-0 font-normal">catálogo</Badge>
							{:else}
								<Badge variant="outline" class="shrink-0 font-normal">propio</Badge>
							{/if}
						</span>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={`Quitar ${nameFor(draft)}`}
							{disabled}
							onclick={() => removeAt(index)}
						>
							<X class="size-3.5" aria-hidden="true" />
						</Button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
