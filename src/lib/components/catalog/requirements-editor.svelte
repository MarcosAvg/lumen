<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { Button } from '#lib/components/ui/button';
	import CatalogItemMultiPicker from './catalog-item-multi-picker.svelte';
	import type { CatalogGroup, RequirementDraft } from './types';

	/**
	 * Editor de requisitos: añade **varios ítems** de catálogos de requisitos a la
	 * vez o nombres propios, mantiene la lista con opción de quitar y un único
	 * interruptor «Obligatorio» para todo el conjunto.
	 */
	let {
		catalogs,
		value = $bindable<RequirementDraft[]>([]),
		required = $bindable(true),
		disabled = false
	}: {
		catalogs: CatalogGroup[];
		value?: RequirementDraft[];
		required?: boolean;
		disabled?: boolean;
	} = $props();

	let catalogSelection = $state<string[]>([]);
	let nameDraft = $state('');

	function nameFor(requirement: RequirementDraft): string {
		if (requirement.catalogItemId) {
			for (const catalog of catalogs) {
				const match = catalog.items.find((item) => item.id === requirement.catalogItemId);
				if (match) return match.name;
			}
			return '(ítem)';
		}
		return requirement.name;
	}

	function addFromCatalog() {
		const chosen = catalogSelection.filter(
			(id) => !value.some((requirement) => requirement.catalogItemId === id)
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
	<label class="flex items-center gap-2 text-sm">
		<input type="checkbox" bind:checked={required} {disabled} /> Obligatorio
	</label>

	{#if value.length > 0}
		<ul class="divide-y rounded-lg border">
			{#each value as requirement, index (index)}
				<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
					<span class="flex items-center gap-2">
						{nameFor(requirement)}
						{#if requirement.catalogItemId}
							<span class="text-xs text-muted-foreground">catálogo</span>
						{/if}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label={`Quitar ${nameFor(requirement)}`}
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
					itemPlaceholder="Elegir requisitos…"
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
		<Label for="requirement-name-draft">Nombre propio</Label>
		<div class="flex items-end gap-2">
			<div class="flex-1">
				<Input
					id="requirement-name-draft"
					bind:value={nameDraft}
					placeholder="Nombre del requisito"
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
