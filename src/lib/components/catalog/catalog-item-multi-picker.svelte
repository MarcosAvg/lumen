<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import X from '@lucide/svelte/icons/x';
	import * as Command from '#lib/components/ui/command';
	import * as Popover from '#lib/components/ui/popover';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import { cn } from '#lib/utils';
	import type { CatalogItemOption } from './types';

	let {
		name,
		items,
		value = $bindable<string[]>([]),
		placeholder = 'Selecciona ítems…',
		disabled = false
	}: {
		name: string;
		items: CatalogItemOption[];
		value?: string[];
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	let open = $state(false);
	const selectedItems = $derived(items.filter((item) => value.includes(item.id)));

	function toggle(id: string) {
		value = value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id];
	}
</script>

{#each value as id (id)}
	<input type="hidden" {name} value={id} />
{/each}

<div class="space-y-2">
	{#if selectedItems.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each selectedItems as item (item.id)}
				<Badge variant="secondary" class="gap-1">
					{item.name}
					<button
						type="button"
						class="rounded-full hover:bg-muted"
						aria-label={`Quitar ${item.name}`}
						onclick={() => toggle(item.id)}
					>
						<X class="size-3" aria-hidden="true" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" class="w-full justify-between font-normal" {disabled}>
					<span class="truncate">
						{selectedItems.length > 0 ? `${selectedItems.length} seleccionado(s)` : placeholder}
					</span>
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
							onSelect={() => toggle(item.id)}
						>
							<Check
								class={cn('mr-2 size-4', value.includes(item.id) ? 'opacity-100' : 'opacity-0')}
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
</div>
