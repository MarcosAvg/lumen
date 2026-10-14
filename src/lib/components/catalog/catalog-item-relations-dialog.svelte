<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import CatalogItemPicker from './catalog-item-picker.svelte';
	import type { CatalogGroup } from './types';

	interface RelationRow {
		id: string;
		fromItemId: string;
		fromName: string;
		toItemId: string;
		toName: string;
		relationType: string | null;
	}

	/** Relaciones de **un** ítem: ver, añadir y quitar. */
	let {
		open = $bindable(false),
		catalogId,
		item = null,
		relations,
		otherCatalogs
	}: {
		open?: boolean;
		catalogId: string;
		item?: { id: string; name: string } | null;
		relations: RelationRow[];
		otherCatalogs: CatalogGroup[];
	} = $props();

	let direction = $state<'outgoing' | 'incoming'>('outgoing');
	let otherItemId = $state('');
	let relationType = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	const itemRelations = $derived(
		item ? relations.filter((row) => row.fromItemId === item.id || row.toItemId === item.id) : []
	);
	const outgoing = $derived(item ? itemRelations.filter((row) => row.fromItemId === item.id) : []);
	const incoming = $derived(item ? itemRelations.filter((row) => row.toItemId === item.id) : []);

	$effect(() => {
		if (!open) {
			direction = 'outgoing';
			otherItemId = '';
			relationType = '';
			error = null;
		}
	});

	async function add() {
		if (!item || !otherItemId) return;
		busy = true;
		error = null;
		try {
			const fromItemIds = direction === 'outgoing' ? [item.id] : [otherItemId];
			const toItemIds = direction === 'outgoing' ? [otherItemId] : [item.id];
			const response = await fetch(`/api/catalogs/${catalogId}/relations/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fromItemIds, toItemIds, relationType })
			});
			const body = (await response.json().catch(() => ({}))) as {
				created?: number;
				message?: string;
			};
			if (!response.ok) throw new Error(body.message ?? 'No se pudo crear la relación.');
			if ((body.created ?? 0) === 0) toast.info('Esa relación ya existía.');
			else toast.success('Relación creada.');
			otherItemId = '';
			relationType = '';
			await invalidateAll();
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}

	async function remove(relationId: string) {
		busy = true;
		error = null;
		try {
			const response = await fetch(`/api/catalogs/${catalogId}/relations/${relationId}`, {
				method: 'DELETE'
			});
			const body = (await response.json().catch(() => ({}))) as { message?: string };
			if (!response.ok) throw new Error(body.message ?? 'No se pudo quitar la relación.');
			toast.success('Relación eliminada.');
			await invalidateAll();
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[85vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Relaciones de «{item?.name ?? ''}»</Dialog.Title>
			<Dialog.Description>
				Las relaciones enlazan ítems de catálogos distintos. El sentido (origen → destino) importa
				para la generación en lote.
			</Dialog.Description>
		</Dialog.Header>

		{#if otherCatalogs.length === 0}
			<Alert>
				<AlertDescription>
					No hay otros catálogos. Crea otro catálogo para poder relacionar ítems.
				</AlertDescription>
			</Alert>
		{/if}

		{#if error}
			<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
		{/if}

		<div class="space-y-5">
			{#if otherCatalogs.length > 0}
				<form
					class="space-y-3"
					onsubmit={(event) => {
						event.preventDefault();
						add();
					}}
				>
					<h3 class="text-sm font-medium">Añadir relación</h3>
					<div class="space-y-2">
						<Label for="rel-direction">Sentido</Label>
						<select
							id="rel-direction"
							bind:value={direction}
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						>
							<option value="outgoing">Este ítem → otro ítem</option>
							<option value="incoming">Otro ítem → este ítem</option>
						</select>
					</div>
					<div class="space-y-2">
						<Label>Ítem del otro catálogo</Label>
						<CatalogItemPicker catalogs={otherCatalogs} bind:value={otherItemId} disabled={busy} />
					</div>
					<div class="space-y-2">
						<Label for="rel-type">Tipo (opcional)</Label>
						<Input id="rel-type" bind:value={relationType} maxlength={80} disabled={busy} />
					</div>
					<Button type="submit" size="sm" disabled={busy || !otherItemId}>
						{busy ? 'Añadiendo…' : 'Añadir'}
					</Button>
				</form>
			{/if}

			<div class="space-y-2 border-t pt-4">
				<h3 class="text-sm font-medium">Este ítem → otros ({outgoing.length})</h3>
				{#if outgoing.length === 0}
					<p class="text-sm text-muted-foreground">Sin relaciones.</p>
				{:else}
					<ul class="divide-y">
						{#each outgoing as relation (relation.id)}
							<li class="flex items-center justify-between gap-2 py-2 text-sm">
								<span class="flex flex-wrap items-center gap-2">
									{relation.toName}
									{#if relation.relationType}
										<Badge variant="secondary">{relation.relationType}</Badge>
									{/if}
								</span>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={busy}
									onclick={() => remove(relation.id)}>Quitar</Button
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="space-y-2 border-t pt-4">
				<h3 class="text-sm font-medium">Otros → este ítem ({incoming.length})</h3>
				{#if incoming.length === 0}
					<p class="text-sm text-muted-foreground">Sin relaciones.</p>
				{:else}
					<ul class="divide-y">
						{#each incoming as relation (relation.id)}
							<li class="flex items-center justify-between gap-2 py-2 text-sm">
								<span class="flex flex-wrap items-center gap-2">
									{relation.fromName}
									{#if relation.relationType}
										<Badge variant="secondary">{relation.relationType}</Badge>
									{/if}
								</span>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={busy}
									onclick={() => remove(relation.id)}>Quitar</Button
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Dialog.Close>Cerrar</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
