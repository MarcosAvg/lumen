<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import * as Command from '#lib/components/ui/command';
	import * as Popover from '#lib/components/ui/popover';
	import { Button } from '#lib/components/ui/button';
	import { cn } from '#lib/utils';
	import type { CatalogItemRef } from './types';

	/** Combobox de ítems de **un** catálogo, con búsqueda. */
	let {
		items,
		value = $bindable(''),
		placeholder = 'Elige ítem…',
		disabled = false,
		id
	}: {
		items: CatalogItemRef[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		id?: string;
	} = $props();

	let open = $state(false);
	const selected = $derived(items.find((item) => item.id === value) ?? null);
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				variant="outline"
				class="w-full justify-between font-normal"
				{disabled}
				aria-label={selected ? `Ítem seleccionado: ${selected.name}` : placeholder}
			>
				<span class="truncate">{selected ? selected.name : placeholder}</span>
				<ChevronsUpDown class="size-4 shrink-0 opacity-50" aria-hidden="true" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-72 p-0" align="start">
		<Command.Root>
			<Command.Input placeholder="Buscar ítem…" />
			<Command.List>
				<Command.Empty>Sin resultados.</Command.Empty>
				{#each items as item (item.id)}
					<Command.Item
						value={item.name}
						onSelect={() => {
							value = item.id === value ? '' : item.id;
							open = false;
						}}
					>
						<Check
							class={cn('mr-2 size-4', value === item.id ? 'opacity-100' : 'opacity-0')}
							aria-hidden="true"
						/>
						<span class="flex-1 truncate">{item.name}</span>
					</Command.Item>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
