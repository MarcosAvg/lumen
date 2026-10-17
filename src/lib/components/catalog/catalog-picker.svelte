<script lang="ts">
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import * as Command from '#lib/components/ui/command';
	import * as Popover from '#lib/components/ui/popover';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import type { CatalogGroup } from './types';

	let {
		catalogs,
		value = $bindable(''),
		placeholder = 'Selecciona catálogo',
		disabled = false,
		id
	}: {
		catalogs: CatalogGroup[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		id?: string;
	} = $props();

	const purposeOrder = ['general', 'buildings', 'requirements'] as const;
	const purposeLabel = {
		general: 'Generales',
		buildings: 'Edificios',
		requirements: 'Requisitos'
	} as const;

	let open = $state(false);
	let query = $state('');

	$effect(() => {
		if (!open) query = '';
	});

	const selected = $derived(catalogs.find((catalog) => catalog.id === value) ?? null);
	const groups = $derived.by(() => {
		const term = query.trim().toLowerCase();
		return purposeOrder
			.map((purpose) => ({
				purpose,
				label: purposeLabel[purpose],
				catalogs: catalogs.filter((catalog) => {
					const catalogPurpose = catalog.purpose ?? 'general';
					if (catalogPurpose !== purpose) return false;
					if (!term) return true;
					return `${catalog.name} ${catalog.description ?? ''}`.toLowerCase().includes(term);
				})
			}))
			.filter((group) => group.catalogs.length > 0);
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				data-slot="catalog-picker-trigger"
				variant="outline"
				class="h-10 w-full justify-between font-normal"
				{disabled}
				aria-label={selected ? `Catálogo seleccionado: ${selected.name}` : placeholder}
			>
				<span class="min-w-0 truncate">{selected?.name ?? placeholder}</span>
				<span class="flex shrink-0 items-center gap-2">
					{#if selected}
						<span class="text-xs text-muted-foreground">{selected.items.length} ítems</span>
					{/if}
					<ChevronsUpDown class="size-4 opacity-50" aria-hidden="true" />
				</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[min(420px,calc(100vw-2rem))] p-0" align="start">
		<Command.Root>
			<Command.Input bind:value={query} placeholder="Buscar catálogo…" />
			<Command.List>
				<Command.Empty>Sin catálogos.</Command.Empty>
				{#each groups as group (group.purpose)}
					<Command.Group heading={group.label}>
						{#each group.catalogs as catalog (catalog.id)}
							<Command.Item
								value={`${catalog.name} ${catalog.id}`}
								data-checked={value === catalog.id}
								onSelect={() => {
									value = catalog.id;
									open = false;
								}}
							>
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium">{catalog.name}</p>
									{#if catalog.description}
										<p class="truncate text-xs text-muted-foreground">{catalog.description}</p>
									{/if}
								</div>
								<Badge variant="secondary" class="shrink-0">{catalog.items.length}</Badge>
							</Command.Item>
						{/each}
					</Command.Group>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
