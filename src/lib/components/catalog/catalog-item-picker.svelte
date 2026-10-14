<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import * as Command from '#lib/components/ui/command';
	import * as Popover from '#lib/components/ui/popover';
	import { Button } from '#lib/components/ui/button';
	import { cn } from '#lib/utils';
	import type { CatalogItemOption } from './types';

	let {
		name,
		items,
		value = $bindable(''),
		placeholder = 'Selecciona un ítem…',
		disabled = false
	}: {
		name: string;
		items: CatalogItemOption[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	let open = $state(false);
	const selected = $derived(items.find((item) => item.id === value) ?? null);
</script>

<input type="hidden" {name} {value} />
<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
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
			<Command.Input placeholder="Buscar por nombre o catálogo…" />
			<Command.List>
				<Command.Empty>Sin resultados.</Command.Empty>
				{#each items as item (item.id)}
					<Command.Item
						value={`${item.name} ${item.catalogName}`}
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
						<span class="text-xs text-muted-foreground">{item.catalogName}</span>
					</Command.Item>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
