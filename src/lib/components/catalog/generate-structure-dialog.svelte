<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import CatalogItemMultiPicker from '#lib/components/catalog/catalog-item-multi-picker.svelte';
	import type { CatalogGroup } from '#lib/components/catalog/types';

	interface PlanElement {
		catalogItemId: string | null;
		name: string;
		include: boolean;
	}
	interface PlanWork {
		catalogItemId: string | null;
		name: string;
		include: boolean;
		elements: PlanElement[];
	}
	interface Plan {
		works: PlanWork[];
		totalWorks: number;
		totalElements: number;
		warnings: string[];
	}

	let {
		serviceId,
		catalogs,
		open = $bindable(false)
	}: { serviceId: string; catalogs: CatalogGroup[]; open?: boolean } = $props();

	let step = $state<'select' | 'plan'>('select');
	let workItemIds = $state<string[]>([]);
	let elementItemIds = $state<string[]>([]);
	let plan = $state<Plan | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) {
			step = 'select';
			workItemIds = [];
			elementItemIds = [];
			plan = null;
			error = null;
		}
	});

	async function preview() {
		busy = true;
		error = null;
		try {
			const response = await fetch(`/api/services/${serviceId}/generate/preview`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ workItemIds, elementItemIds })
			});
			const body = (await response.json().catch(() => ({}))) as Plan & { message?: string };
			if (!response.ok) throw new Error(body.message ?? 'No se pudo previsualizar.');
			plan = body;
			step = 'plan';
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}

	async function apply() {
		if (!plan) return;
		busy = true;
		error = null;
		try {
			const response = await fetch(`/api/services/${serviceId}/generate/apply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ works: plan.works })
			});
			const body = (await response.json().catch(() => ({}))) as {
				worksCreated?: number;
				elementsCreated?: number;
				message?: string;
			};
			if (!response.ok) throw new Error(body.message ?? 'No se pudo aplicar.');
			toast.success(
				`Estructura generada: ${body.worksCreated ?? 0} trabajo(s), ${body.elementsCreated ?? 0} elemento(s).`
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
			<Dialog.Title>Generar estructura en lote</Dialog.Title>
			<Dialog.Description>
				Crea trabajos y elementos desde catálogos, con vista previa antes de aplicar.
			</Dialog.Description>
		</Dialog.Header>

		{#if error}
			<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
		{/if}

		{#if step === 'select'}
			<div class="space-y-4">
				<div class="space-y-1">
					<Label>Trabajos (ítems de catálogo)</Label>
					<CatalogItemMultiPicker
						{catalogs}
						bind:value={workItemIds}
						itemPlaceholder="Elegir trabajos…"
						disabled={busy}
					/>
				</div>
				<div class="space-y-1">
					<Label>Elementos por trabajo (opcional)</Label>
					<CatalogItemMultiPicker
						{catalogs}
						bind:value={elementItemIds}
						itemPlaceholder="Elegir elementos…"
						disabled={busy}
					/>
				</div>
			</div>
		{:else if plan}
			<div class="space-y-3">
				{#if plan.warnings.length > 0}
					<Alert>
						<AlertDescription>
							<ul class="list-disc pl-5">
								{#each plan.warnings as warning, index (index)}
									<li>{warning}</li>
								{/each}
							</ul>
						</AlertDescription>
					</Alert>
				{/if}
				<p class="text-sm text-muted-foreground">
					{plan.totalWorks} trabajo(s), {plan.totalElements} elemento(s).
				</p>
				{#each plan.works as work, index (index)}
					<div class="space-y-2 rounded-lg border p-3">
						<div class="flex flex-wrap items-center gap-3">
							<label class="flex items-center gap-2 text-sm">
								<input type="checkbox" bind:checked={work.include} /> Incluir trabajo
							</label>
							<Input bind:value={work.name} class="max-w-xs" aria-label="Nombre del trabajo" />
						</div>
						{#if work.elements.length > 0}
							<ul class="ml-4 space-y-2 border-l pl-4">
								{#each work.elements as element, elementIndex (elementIndex)}
									<li class="flex flex-wrap items-center gap-3">
										<label class="flex items-center gap-2 text-sm">
											<input type="checkbox" bind:checked={element.include} /> Incluir
										</label>
										<Input
											bind:value={element.name}
											class="max-w-xs"
											aria-label="Nombre del elemento"
										/>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<Dialog.Footer>
			{#if step === 'plan'}
				<Button type="button" variant="outline" disabled={busy} onclick={() => (step = 'select')}
					>Volver</Button
				>
			{/if}
			<Dialog.Close>Cancelar</Dialog.Close>
			{#if step === 'select'}
				<Button type="button" disabled={busy || workItemIds.length === 0} onclick={preview}>
					{busy ? 'Previsualizando…' : 'Previsualizar'}
				</Button>
			{:else}
				<Button type="button" disabled={busy} onclick={apply}>
					{busy ? 'Aplicando…' : 'Aplicar generación'}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
