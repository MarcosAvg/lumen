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

	let direction = $state<'outgoing' | 'incoming' | ''>('');
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
			direction = '';
			otherItemId = '';
			relationType = '';
			error = null;
		}
	});

	async function add() {
		if (!direction || !otherItemId) return;
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
	<Dialog.Content size="lg">
		<Dialog.Header>
			<Dialog.Title>Relaciones de «{item?.name ?? ''}»</Dialog.Title>
			<Dialog.Description>
				Las relaciones enlazan ítems de catálogos distintos. El sentido (origen → destino) importa
				para la generación en lote.
			</Dialog.Description>
		</Dialog.Header>

		<Dialog.Body class="space-y-5">
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

			{#if otherCatalogs.length > 0}
				<Dialog.Section
					eyebrow="Nueva relación"
					title="Configura el vínculo"
					description="Elige el sentido y el ítem de destino."
					class="rounded-xl border border-border bg-muted/20 p-4"
				>
					<form
						class="space-y-4"
						onsubmit={(event) => {
							event.preventDefault();
							add();
						}}
					>
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
									<span class="block text-sm font-semibold">Este ítem → otro</span>
								</label>
								<label
									class="relative cursor-pointer rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 {direction ===
									'incoming'
										? 'border-primary bg-primary/5'
										: 'border-border hover:bg-muted/40'}"
								>
									<input type="radio" bind:group={direction} value="incoming" class="sr-only" />
									<span class="block text-sm font-semibold">Otro → este ítem</span>
								</label>
							</div>
						</fieldset>
						<div class="space-y-2">
							<Label>Ítem del otro catálogo</Label>
							<CatalogItemPicker
								catalogs={otherCatalogs}
								bind:value={otherItemId}
								disabled={busy}
							/>
						</div>
						<div class="space-y-2">
							<Label for="rel-type">Tipo (opcional)</Label>
							<Input id="rel-type" bind:value={relationType} maxlength={80} disabled={busy} />
						</div>
						<Button
							type="submit"
							disabled={busy || !direction || !otherItemId}
							class="w-full sm:w-auto"
						>
							{busy ? 'Añadiendo…' : 'Añadir relación'}
						</Button>
					</form>
				</Dialog.Section>
			{/if}

			<Dialog.Section title={`Relaciones existentes (${outgoing.length + incoming.length})`}>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<p class="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
							Este ítem → otros ({outgoing.length})
						</p>
						{#if outgoing.length === 0}
							<p
								class="rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
							>
								Sin relaciones.
							</p>
						{:else}
							<ul class="divide-y overflow-hidden rounded-xl border border-border">
								{#each outgoing as relation (relation.id)}
									<li class="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
										<span class="flex min-w-0 flex-wrap items-center gap-2">
											<span class="truncate">{relation.toName}</span>
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

					<div class="space-y-2">
						<p class="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
							Otros → este ítem ({incoming.length})
						</p>
						{#if incoming.length === 0}
							<p
								class="rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
							>
								Sin relaciones.
							</p>
						{:else}
							<ul class="divide-y overflow-hidden rounded-xl border border-border">
								{#each incoming as relation (relation.id)}
									<li class="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
										<span class="flex min-w-0 flex-wrap items-center gap-2">
											<span class="truncate">{relation.fromName}</span>
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
			</Dialog.Section>
		</Dialog.Body>

		<Dialog.Footer>
			<Dialog.Close>Cerrar</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
