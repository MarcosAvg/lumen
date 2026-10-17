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

	let direction = $state<'outgoing' | 'incoming' | ''>('');
	let currentItemIds = $state<string[]>([]);
	let otherItemId = $state('');
	let relationType = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) {
			direction = '';
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
		direction && otherItemId
			? currentItemIds.filter((id) =>
					direction === 'outgoing'
						? existingKeys.has(`${id}:${otherItemId}:${selectedType}`)
						: existingKeys.has(`${otherItemId}:${id}:${selectedType}`)
				).length
			: 0
	);
	const toCreate = $derived(direction ? currentItemIds.length - already : 0);

	async function apply() {
		if (!direction || !otherItemId || currentItemIds.length === 0) return;
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
	<Dialog.Content size="lg">
		<Dialog.Header>
			<Dialog.Title>Relacionar en lote</Dialog.Title>
			<Dialog.Description>
				Enlaza varios ítems de este catálogo con un único ítem de otro catálogo, en el sentido que
				elijas. Ejemplo: todos los pisos → un edificio.
			</Dialog.Description>
		</Dialog.Header>

		<Dialog.Body class="space-y-5">
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

				<Dialog.Section
					title="Configuración"
					description="Elige el sentido, los ítems y el tipo de relación."
				>
					<div class="space-y-4">
						<fieldset class="space-y-2">
							<legend class="text-sm font-medium">Sentido</legend>
							<div class="grid gap-2 sm:grid-cols-2">
								<label
									class="relative cursor-pointer rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 {direction ===
									'outgoing'
										? 'border-primary bg-primary/5'
										: 'border-border hover:bg-muted/40'}"
								>
									<input type="radio" bind:group={direction} value="outgoing" class="sr-only" />
									<span class="block text-sm font-semibold">Este catálogo → otro</span>
									<span class="mt-1 block text-xs text-muted-foreground">
										Los ítems elegidos apuntan al ítem destino.
									</span>
								</label>
								<label
									class="relative cursor-pointer rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 {direction ===
									'incoming'
										? 'border-primary bg-primary/5'
										: 'border-border hover:bg-muted/40'}"
								>
									<input type="radio" bind:group={direction} value="incoming" class="sr-only" />
									<span class="block text-sm font-semibold">Otro → este catálogo</span>
									<span class="mt-1 block text-xs text-muted-foreground">
										El ítem destino apunta a los ítems elegidos.
									</span>
								</label>
							</div>
						</fieldset>

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
							<CatalogItemPicker
								catalogs={otherCatalogs}
								bind:value={otherItemId}
								disabled={busy}
							/>
						</div>

						<div class="space-y-2">
							<Label for="batch-type">Tipo (opcional)</Label>
							<Input id="batch-type" bind:value={relationType} maxlength={80} disabled={busy} />
						</div>

						<div
							class="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground"
						>
							{#if !direction || currentItemIds.length === 0 || !otherItemId}
								Elige el sentido, al menos un ítem de este catálogo y un ítem del otro catálogo.
							{:else}
								Se crearán <strong>{toCreate}</strong> relación(es); {already} ya existirán y se omitirán.
							{/if}
						</div>
					</div>
				</Dialog.Section>
			{/if}
		</Dialog.Body>

		<Dialog.Footer>
			<Dialog.Close>Cancelar</Dialog.Close>
			<Button
				type="button"
				disabled={busy || !direction || !otherItemId || currentItemIds.length === 0}
				onclick={apply}
			>
				{busy ? 'Aplicando…' : 'Relacionar'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
