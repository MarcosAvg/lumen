<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { Button } from '#lib/components/ui/button';
	import CatalogItemMultiPicker from './catalog-item-multi-picker.svelte';
	import type { CatalogGroup, ElementDraft } from './types';

	/**
	 * Editor de elementos para un trabajo dividido: añade **varios ítems** de un
	 * catálogo a la vez o nombres propios, y mantiene la lista con opción de quitar.
	 */
	let {
		catalogs,
		value = $bindable<ElementDraft[]>([]),
		disabled = false
	}: {
		catalogs: CatalogGroup[];
		value?: ElementDraft[];
		disabled?: boolean;
	} = $props();

	let catalogSelection = $state<string[]>([]);
	let nameDraft = $state('');

	function nameFor(element: ElementDraft): string {
		if (element.catalogItemId) {
			for (const catalog of catalogs) {
				const match = catalog.items.find((item) => item.id === element.catalogItemId);
				if (match) return match.name;
			}
			return '(ítem)';
		}
		return element.name;
	}

	function addFromCatalog() {
		const chosen = catalogSelection.filter(
			(id) => !value.some((element) => element.catalogItemId === id)
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

<div class="space-y-3">
	{#if value.length > 0}
		<ul class="divide-y rounded-lg border">
			{#each value as element, index (index)}
				<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
					<span class="flex items-center gap-2">
						{nameFor(element)}
						{#if element.catalogItemId}
							<span class="text-xs text-muted-foreground">catálogo</span>
						{/if}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label={`Quitar ${nameFor(element)}`}
						{disabled}
						onclick={() => removeAt(index)}
					>
						<X class="size-3" aria-hidden="true" />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="space-y-1">
		<Label>Desde catálogo (puedes elegir varios)</Label>
		<div class="flex items-end gap-2">
			<div class="flex-1">
				<CatalogItemMultiPicker
					{catalogs}
					bind:value={catalogSelection}
					itemPlaceholder="Elegir ítems…"
					{disabled}
				/>
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={disabled || catalogSelection.length === 0}
				onclick={addFromCatalog}
			>
				Agregar {catalogSelection.length > 0 ? `(${catalogSelection.length})` : ''}
			</Button>
		</div>
	</div>

	<div class="space-y-1">
		<Label for="element-name-draft">Nombre propio</Label>
		<div class="flex items-end gap-2">
			<div class="flex-1">
				<Input
					id="element-name-draft"
					bind:value={nameDraft}
					placeholder="Nombre del elemento"
					{disabled}
				/>
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={disabled || nameDraft.trim().length === 0}
				onclick={addByName}
			>
				Agregar
			</Button>
		</div>
	</div>
</div>
