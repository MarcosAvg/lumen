<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import CatalogItemMultiPicker from './catalog-item-multi-picker.svelte';
	import CatalogItemPicker from './catalog-item-picker.svelte';
	import type { CatalogGroup } from './types';
	import { NativeSelect } from '#lib/components/ui/native-select';

	interface RelationRow {
		fromItemId: string;
		toItemId: string;
		relationType: string | null;
	}

	/**
	 * Relación en lote muchos ↔ uno: varios ítems de este catálogo con un único
	 * ítem de otro catálogo, en cualquiera de los dos sentidos.
	 */
	let {
		open = $bindable(false),
		catalogId,
		currentCatalog,
		otherCatalogs,
		relations
	}: {
		open?: boolean;
		catalogId: string;
		currentCatalog: CatalogGroup;
		otherCatalogs: CatalogGroup[];
		relations: RelationRow[];
	} = $props();

	let direction = $state<'outgoing' | 'incoming'>('outgoing');
	let currentItemIds = $state<string[]>([]);
	let otherItemId = $state('');
	let relationType = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) {
			direction = 'outgoing';
			currentItemIds = [];
			otherItemId = '';
			relationType = '';
			error = null;
		}
	});

	const selectedType = $derived(relationType.trim());
	const existingKeys = $derived(
		new Set(
			relations.map((row) => `${row.fromItemId}:${row.toItemId}:${(row.relationType ?? '').trim()}`)
		)
	);
	const already = $derived(
		otherItemId
			? currentItemIds.filter((id) =>
					direction === 'outgoing'
						? existingKeys.has(`${id}:${otherItemId}:${selectedType}`)
						: existingKeys.has(`${otherItemId}:${id}:${selectedType}`)
				).length
			: 0
	);
	const toCreate = $derived(currentItemIds.length - already);

	async function apply() {
		if (!otherItemId || currentItemIds.length === 0) return;
		busy = true;
		error = null;
		try {
			const fromItemIds = direction === 'outgoing' ? currentItemIds : [otherItemId];
			const toItemIds = direction === 'outgoing' ? [otherItemId] : currentItemIds;
			const response = await fetch(`/api/catalogs/${catalogId}/relations/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fromItemIds, toItemIds, relationType })
			});
			const body = (await response.json().catch(() => ({}))) as {
				created?: number;
				skipped?: number;
				message?: string;
			};
			if (!response.ok) throw new Error(body.message ?? 'No se pudieron crear las relaciones.');
			toast.success(
				`Relaciones: ${body.created ?? 0} creada(s), ${body.skipped ?? 0} ya existían.`
			);
			open = false;
			await invalidateAll();
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Relacionar en lote</Dialog.Title>
			<Dialog.Description>
				Enlaza varios ítems de este catálogo con un único ítem de otro catálogo, en el sentido que
				elijas. Ejemplo: todos los pisos → un edificio.
			</Dialog.Description>
		</Dialog.Header>

		{#if otherCatalogs.length === 0}
			<Alert>
				<AlertDescription>
					No hay otros catálogos para relacionar. Crea otro catálogo primero.
				</AlertDescription>
			</Alert>
		{:else}
			{#if error}
				<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
			{/if}

			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="batch-direction">Sentido</Label>
					<NativeSelect id="batch-direction" bind:value={direction}>
						<option value="outgoing">Este catálogo → otro catálogo</option>
						<option value="incoming">Otro catálogo → este catálogo</option>
					</NativeSelect>
				</div>

				<div class="space-y-2">
					<Label>Ítems de este catálogo</Label>
					<CatalogItemMultiPicker
						catalogs={[currentCatalog]}
						bind:value={currentItemIds}
						itemPlaceholder="Elegir ítems…"
						disabled={busy}
					/>
				</div>

				<div class="space-y-2">
					<Label>Ítem del otro catálogo</Label>
					<CatalogItemPicker catalogs={otherCatalogs} bind:value={otherItemId} disabled={busy} />
				</div>

				<div class="space-y-2">
					<Label for="batch-type">Tipo (opcional)</Label>
					<Input id="batch-type" bind:value={relationType} maxlength={80} disabled={busy} />
				</div>

				<p class="text-sm text-muted-foreground">
					{#if currentItemIds.length === 0 || !otherItemId}
						Elige al menos un ítem de este catálogo y un ítem del otro catálogo.
					{:else}
						Se crearán <strong>{toCreate}</strong> relación(es); {already} ya existirán y se omitirán.
					{/if}
				</p>
			</div>
		{/if}

		<Dialog.Footer>
			<Dialog.Close>Cancelar</Dialog.Close>
			<Button
				type="button"
				disabled={busy || !otherItemId || currentItemIds.length === 0}
				onclick={apply}
			>
				{busy ? 'Aplicando…' : 'Relacionar'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
