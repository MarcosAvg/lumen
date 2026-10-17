<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { LabeledCheckbox } from '#lib/components/ui/labeled-checkbox';
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

<div class="space-y-4">
	<LabeledCheckbox bind:checked={required} {disabled} label="Obligatorio por defecto" />

	{#if value.length > 0}
		<div class="space-y-2">
			<p class="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
				Añadidos ({value.length})
			</p>
			<ul class="divide-y overflow-hidden rounded-xl border border-border bg-card">
				{#each value as requirement, index (index)}
					<li class="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
						<span class="flex min-w-0 items-center gap-2">
							<span class="truncate">{nameFor(requirement)}</span>
							{#if requirement.catalogItemId}
								<span class="shrink-0 text-xs text-muted-foreground">catálogo</span>
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
		</div>
	{/if}

	<div class="grid gap-3 sm:grid-cols-2">
		<section class="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
			<div class="space-y-1">
				<p class="text-sm font-semibold">Desde catálogo</p>
				<p class="text-xs text-muted-foreground">Puedes seleccionar varios requisitos.</p>
			</div>
			<CatalogItemMultiPicker
				{catalogs}
				bind:value={catalogSelection}
				itemPlaceholder="Elegir requisitos…"
				{disabled}
			/>
			<Button
				type="button"
				variant="outline"
				class="w-full"
				disabled={disabled || catalogSelection.length === 0}
				onclick={addFromCatalog}
			>
				Agregar {catalogSelection.length > 0 ? `(${catalogSelection.length})` : ''}
			</Button>
		</section>

		<section class="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
			<div class="space-y-1">
				<Label for="requirement-name-draft">Nombre propio</Label>
				<p class="text-xs text-muted-foreground">Para requisitos que no están en catálogo.</p>
			</div>
			<Input
				id="requirement-name-draft"
				bind:value={nameDraft}
				placeholder="Nombre del requisito"
				{disabled}
			/>
			<Button
				type="button"
				variant="outline"
				class="w-full"
				disabled={disabled || nameDraft.trim().length === 0}
				onclick={addByName}
			>
				Agregar
			</Button>
		</section>
	</div>
</div>
