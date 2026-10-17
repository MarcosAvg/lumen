<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Table from '#lib/components/ui/table';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import ConvertWorkMode from '#lib/components/convert-work-mode.svelte';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import RenameDialog from '#lib/components/app/rename-dialog.svelte';
	import EvidenceCapture from '#lib/components/evidence/evidence-capture.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import TableActions from '#lib/components/app/table-actions.svelte';
	import ExportDialog from '#lib/components/app/export-dialog.svelte';
	import ElementsEditor from '#lib/components/catalog/elements-editor.svelte';
	import RequirementsEditor from '#lib/components/catalog/requirements-editor.svelte';
	import type { CatalogGroup, ElementDraft, RequirementDraft } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';

	type ActionData = { success?: string; message?: string; elementErrors?: Record<string, string> };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let elementOpen = $state(false);
	let showElementRequirements = $state(false);
	let newElements = $state<ElementDraft[]>([]);
	let elementRequirements = $state<RequirementDraft[]>([]);
	let elementRequirementsRequired = $state(true);

	const catalogsForPicker = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose !== 'buildings' && catalog.purpose !== 'requirements')
			.map((catalog) => ({
				id: catalog.id,
				name: catalog.name,
				description: catalog.description,
				purpose: catalog.purpose,
				items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
			}))
	);

	const requirementCatalogs = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose === 'requirements')
			.map((catalog) => ({
				id: catalog.id,
				name: catalog.name,
				description: catalog.description,
				purpose: catalog.purpose,
				items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
			}))
	);

	const elementsJson = $derived(JSON.stringify(newElements));
	const elementRequirementsJson = $derived(JSON.stringify(elementRequirements));

	$effect(() => {
		if (action?.success) {
			elementOpen = false;
			showElementRequirements = false;
			newElements = [];
			elementRequirements = [];
			elementRequirementsRequired = true;
		}
	});

	function toggleElementRequirements() {
		showElementRequirements = !showElementRequirements;
		if (!showElementRequirements) elementRequirements = [];
	}

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
	<PageHeader>
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
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant="secondary">{data.work.mode === 'direct' ? 'Directo' : 'Dividido'}</Badge>
		</div>
		{#if data.work.description}
			<p class="line-clamp-2 text-sm text-muted-foreground">{data.work.description}</p>
		{/if}
		{#snippet actions()}
			{#if data.canExport}
				<ExportDialog href={`/api/works/${data.work.id}/export.zip`} class="w-full sm:w-auto" />
			{/if}
			{#if data.isAdmin}
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					onclick={() => (editOpen = true)}>Editar trabajo</Button
				>
			{/if}
		{/snippet}
	</PageHeader>

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
							<Button
								size="sm"
								onclick={() => {
									showElementRequirements = false;
									elementOpen = true;
								}}>Añadir elementos</Button
							>
						{/if}
					</Card.Header>
					<Card.Content>
						{#if data.elements.length === 0}
							<p class="text-sm text-muted-foreground">
								Sin elementos. Un trabajo dividido sin elementos nunca se considera aprobado.
							</p>
						{:else}
							<ul class="space-y-3 md:hidden">
								{#each data.elements as element (element.id)}
									<li class="relative">
										<Card.Root
											class="border-l-2 transition-colors active:bg-muted/50 {element.status ===
											'approved'
												? 'border-l-state-approved'
												: element.status === 'rejected'
													? 'border-l-state-rejected'
													: element.status === 'in_review'
														? 'border-l-state-pending/60'
														: element.status === 'in_progress'
															? 'border-l-primary/40'
															: 'border-l-border'}"
										>
											<Card.Content class="space-y-2">
												<div class="flex items-start justify-between gap-2">
													<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
													<a
														class="min-w-0 font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
														href={resolve('/(app)/elements/[elementId]', { elementId: element.id })}
													>
														{element.name}
													</a>
													<span class="shrink-0"><StatusBadge status={element.status} /></span>
												</div>
												{#if data.isAdmin}
													<div class="relative z-10 flex flex-wrap items-center gap-2">
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
											</Card.Content>
										</Card.Root>
									</li>
								{/each}
							</ul>

							<div class="hidden md:block">
								<DataTable>
									<Table.Header>
										<Table.Row>
											<Table.Head>Elemento</Table.Head>
											<Table.Head>Estado</Table.Head>
											{#if data.isAdmin}
												<Table.Head class="w-px text-right">Acciones</Table.Head>
											{/if}
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each data.elements as element (element.id)}
											<Table.Row class="relative">
												<Table.Cell class="whitespace-normal">
													<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
													<a
														class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
														href={resolve('/(app)/elements/[elementId]', { elementId: element.id })}
													>
														{element.name}
													</a>
												</Table.Cell>
												<Table.Cell>
													<StatusBadge status={element.status} />
												</Table.Cell>
												{#if data.isAdmin}
													<Table.Cell class="relative z-10 text-right">
														<TableActions>
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
														</TableActions>
													</Table.Cell>
												{/if}
											</Table.Row>
										{/each}
									</Table.Body>
								</DataTable>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>

				<Dialog.Root bind:open={elementOpen}>
					<Dialog.Content size="lg">
						<form method="POST" action="?/createElements" class="flex min-h-0 flex-1 flex-col">
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
							<Dialog.Body class="space-y-6">
								<Dialog.Section
									eyebrow="Paso 1"
									title="Elementos"
									description="Añade ítems de catálogo o nombres propios."
								>
									<ElementsEditor catalogs={catalogsForPicker} bind:value={newElements} />
								</Dialog.Section>

								{#if requirementCatalogs.length > 0}
									<Dialog.Section
										eyebrow="Paso 2 · opcional"
										title="Requisitos iniciales"
										description="Se aplicarán a cada elemento nuevo. Puedes añadirlos después."
									>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onclick={toggleElementRequirements}
										>
											{showElementRequirements ? 'Quitar requisitos' : 'Añadir requisitos'}
										</Button>
										{#if showElementRequirements}
											<RequirementsEditor
												catalogs={requirementCatalogs}
												bind:value={elementRequirements}
												bind:required={elementRequirementsRequired}
											/>
										{/if}
									</Dialog.Section>
								{/if}

								{#if action?.elementErrors?._form}
									<p role="alert" class="text-sm text-destructive">{action.elementErrors._form}</p>
								{/if}
							</Dialog.Body>
							<Dialog.Footer>
								<p class="mr-auto text-xs text-muted-foreground">
									{newElements.length} elemento(s){#if showElementRequirements && elementRequirements.length > 0}
										· {elementRequirements.length} requisito(s)
									{/if}
								</p>
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
				<form
					method="POST"
					action="?/updateWork"
					class="flex min-h-0 flex-1 flex-col"
					use:enhance={submitWork}
				>
					<input type="hidden" name="workId" value={data.work.id} />
					<Dialog.Header>
						<Dialog.Title>Editar trabajo</Dialog.Title>
						<Dialog.Description>
							Renombrar un trabajo vinculado a catálogo lo desvincula y conserva el nombre propio.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body class="space-y-5">
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
					</Dialog.Body>
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit">Guardar</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
</div>
