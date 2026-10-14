<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import * as Command from '#lib/components/ui/command';
	import * as Popover from '#lib/components/ui/popover';
	import { Button } from '#lib/components/ui/button';
	import { cn } from '#lib/utils';
	import type { CatalogItemRef } from './types';

	/**
	 * Combobox múltiple de ítems de **un** catálogo. La selección (`values`) es
	 * global, así que se pueden acumular ítems de varios catálogos sin perderlos.
	 */
	let {
		items,
		values = $bindable<string[]>([]),
		placeholder = 'Añadir ítems…',
		disabled = false,
		id
	}: {
		items: CatalogItemRef[];
		values?: string[];
		placeholder?: string;
		disabled?: boolean;
		id?: string;
	} = $props();

	let open = $state(false);

	function toggle(itemId: string) {
		values = values.includes(itemId)
			? values.filter((entry) => entry !== itemId)
			: [...values, itemId];
	}
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
			>
				<span class="truncate">{placeholder}</span>
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
					<Command.Item value={item.name} onSelect={() => toggle(item.id)}>
						<Check
							class={cn('mr-2 size-4', values.includes(item.id) ? 'opacity-100' : 'opacity-0')}
							aria-hidden="true"
						/>
						<span class="flex-1 truncate">{item.name}</span>
					</Command.Item>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
