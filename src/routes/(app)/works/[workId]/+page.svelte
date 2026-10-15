<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import ConvertWorkMode from '#lib/components/convert-work-mode.svelte';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import RenameDialog from '#lib/components/app/rename-dialog.svelte';
	import EvidenceCapture from '#lib/components/evidence/evidence-capture.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import ElementsEditor from '#lib/components/catalog/elements-editor.svelte';
	import RequirementsEditor from '#lib/components/catalog/requirements-editor.svelte';
	import type { CatalogGroup, ElementDraft, RequirementDraft } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';

	type ActionData = { success?: string; message?: string; elementErrors?: Record<string, string> };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let elementOpen = $state(false);
	let newElements = $state<ElementDraft[]>([]);
	let elementRequirements = $state<RequirementDraft[]>([]);
	let elementRequirementsRequired = $state(true);

	const catalogsForPicker = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose !== 'buildings' && catalog.purpose !== 'requirements')
			.map((catalog) => ({
				id: catalog.id,
				name: catalog.name,
				items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
			}))
	);

	const requirementCatalogs = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose === 'requirements')
			.map((catalog) => ({
				id: catalog.id,
				name: catalog.name,
				items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
			}))
	);

	const elementsJson = $derived(JSON.stringify(newElements));
	const elementRequirementsJson = $derived(JSON.stringify(elementRequirements));

	$effect(() => {
		if (action?.success) {
			elementOpen = false;
			newElements = [];
			elementRequirements = [];
			elementRequirementsRequired = true;
		}
	});

	// Edición del trabajo en modal.
	let editOpen = $state(false);
	const submitWork: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') editOpen = false;
		};
</script>

<svelte:head>
	<title>{data.work.name} · Trabajo · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<AppBreadcrumbs
				items={[
					{ label: 'Inicio', href: resolve('/(app)/dashboard') },
					{
						label: data.work.serviceName,
						href: resolve('/(app)/services/[serviceId]', { serviceId: data.work.serviceId })
					},
					{ label: data.work.name }
				]}
			/>
			<div class="mt-2 flex items-center gap-2">
				<Badge variant="secondary">{data.work.mode === 'direct' ? 'Directo' : 'Dividido'}</Badge>
			</div>
			{#if data.work.description}
				<p class="line-clamp-2 text-sm text-muted-foreground">{data.work.description}</p>
			{/if}
		</div>
		{#if data.isAdmin}
			<Button variant="outline" size="sm" class="w-full sm:w-auto" onclick={() => (editOpen = true)}
				>Editar trabajo</Button
			>
		{/if}
	</div>

	{#if action?.success}
		<Alert role="status">
			<AlertDescription>{action.success}</AlertDescription>
		</Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<div class="space-y-6">
		<div class="space-y-6">
			{#if data.work.mode === 'divided'}
				<Card.Root>
					<Card.Header class="flex flex-wrap items-center justify-between gap-2">
						<Card.Title class="text-base">Elementos</Card.Title>
						{#if data.isAdmin}
							<Button size="sm" onclick={() => (elementOpen = true)}>Añadir elementos</Button>
						{/if}
					</Card.Header>
					<Card.Content>
						{#if data.elements.length === 0}
							<p class="text-sm text-muted-foreground">
								Sin elementos. Un trabajo dividido sin elementos nunca se considera aprobado.
							</p>
						{:else}
							<ul class="divide-y overflow-hidden rounded-lg border">
								{#each data.elements as element (element.id)}
									<li>
										<div
											class="relative flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-muted/50 active:bg-muted/70"
										>
											<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
											<a
												class="min-w-0 truncate text-sm underline-offset-4 after:absolute after:inset-0 hover:underline"
												href={resolve('/(app)/elements/[elementId]', { elementId: element.id })}
											>
												{element.name}
											</a>
											<span class="shrink-0"><StatusBadge status={element.status} /></span>
										</div>
										{#if data.isAdmin}
											<div class="mt-2 flex flex-wrap items-center gap-2">
												<RenameDialog
													action="?/updateElement"
													hiddenName="elementId"
													id={element.id}
													currentName={element.name}
												/>
												<DestructiveDelete
													label="Eliminar elemento"
													endpoint={`/api/elements/${element.id}`}
													itemName={element.name}
													description="Se eliminarán su evidencia, entregas y fotos."
												/>
											</div>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</Card.Content>
				</Card.Root>

				<Dialog.Root bind:open={elementOpen}>
					<Dialog.Content class="max-h-[85vh] overflow-y-auto">
						<form method="POST" action="?/createElements" class="space-y-4">
							<input type="hidden" name="workId" value={data.work.id} />
							<input type="hidden" name="elements" value={elementsJson} />
							<input type="hidden" name="requirements" value={elementRequirementsJson} />
							<input
								type="hidden"
								name="requirementIsRequired"
								value={elementRequirementsRequired ? 'true' : 'false'}
							/>
							<Dialog.Header>
								<Dialog.Title>Añadir elementos</Dialog.Title>
								<Dialog.Description>
									Añade varios ítems de un catálogo o escribe nombres propios.
								</Dialog.Description>
							</Dialog.Header>
							<ElementsEditor catalogs={catalogsForPicker} bind:value={newElements} />
							{#if requirementCatalogs.length > 0}
								<div class="space-y-2 rounded-lg border p-3">
									<Label>Requisitos (opcional)</Label>
									<p class="text-xs text-muted-foreground">Se aplicarán a cada elemento nuevo.</p>
									<RequirementsEditor
										catalogs={requirementCatalogs}
										bind:value={elementRequirements}
										bind:required={elementRequirementsRequired}
									/>
								</div>
							{/if}
							{#if action?.elementErrors?._form}
								<p role="alert" class="text-sm text-destructive">{action.elementErrors._form}</p>
							{/if}
							<Dialog.Footer>
								<Dialog.Close>Cancelar</Dialog.Close>
								<Button type="submit" disabled={newElements.length === 0}>Añadir elementos</Button>
							</Dialog.Footer>
						</form>
					</Dialog.Content>
				</Dialog.Root>
			{:else if data.evidence}
				<EvidenceCapture
					targetId={data.evidence.target.id}
					label={data.work.name}
					status={data.evidence.target.status}
					editable={data.editable}
					version={data.evidence.target.version}
					requirements={data.evidence.requirements}
					photos={data.evidence.photos}
					history={data.history}
					rejection={data.rejection}
					isAdmin={data.isAdmin}
					{requirementCatalogs}
				/>
			{/if}

			{#if data.isAdmin && data.conversion}
				<ConvertWorkMode
					workId={data.work.id}
					mode={data.conversion.mode}
					hasSubmissions={data.conversion.hasSubmissions}
					direct={data.conversion.direct}
					elements={data.conversion.elements}
				/>
			{/if}
		</div>
	</div>

	{#if data.isAdmin}
		<Dialog.Root bind:open={editOpen}>
			<Dialog.Content>
				<form method="POST" action="?/updateWork" class="space-y-4" use:enhance={submitWork}>
					<input type="hidden" name="workId" value={data.work.id} />
					<Dialog.Header>
						<Dialog.Title>Editar trabajo</Dialog.Title>
						<Dialog.Description>
							Renombrar un trabajo vinculado a catálogo lo desvincula y conserva el nombre propio.
						</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-2">
						<Label for="work-name">Nombre</Label>
						<Input id="work-name" name="name" value={data.work.name} required />
					</div>
					<div class="space-y-2">
						<Label for="work-desc">Descripción</Label>
						<Input id="work-desc" name="description" value={data.work.description ?? ''} />
					</div>
					{#if action?.message}
						<p class="text-sm text-destructive">{action.message}</p>
					{/if}
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit">Guardar</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
</div>
