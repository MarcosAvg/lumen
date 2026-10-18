<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Table from '#lib/components/ui/table';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Tabs from '#lib/components/ui/tabs';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import TableActions from '#lib/components/app/table-actions.svelte';
	import ExportDialog from '#lib/components/app/export-dialog.svelte';
	import LifecycleBadge from '#lib/components/app/lifecycle-badge.svelte';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import ParticipantManager from '#lib/components/app/participant-manager.svelte';
	import CatalogItemPicker from '#lib/components/catalog/catalog-item-picker.svelte';
	import ElementsEditor from '#lib/components/catalog/elements-editor.svelte';
	import GenerateStructureDialog from '#lib/components/catalog/generate-structure-dialog.svelte';
	import RequirementsEditor from '#lib/components/catalog/requirements-editor.svelte';
	import ProgressMeter from '#lib/components/app/progress-meter.svelte';
	import MiniMeter from '#lib/components/app/mini-meter.svelte';
	import Chip from '#lib/components/app/chip.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import type { CatalogGroup, ElementDraft, RequirementDraft } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';
	import { NativeSelect } from '#lib/components/ui/native-select';

	type ActionData = {
		success?: string;
		message?: string;
		workErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	let workOpen = $state(false);
	let generateOpen = $state(false);
	let workSource = $state<'catalog' | 'custom'>('catalog');
	let workMode = $state<'direct' | 'divided' | ''>('');
	let workElements = $state<ElementDraft[]>([]);
	let workRequirements = $state<RequirementDraft[]>([]);
	let workRequirementsRequired = $state(true);
	let sourceSeeded = false;
	$effect(() => {
		// Origen por defecto: catálogo si hay alguno, si no nombre propio.
		if (!sourceSeeded) {
			workSource = catalogsForPicker.length > 0 ? 'catalog' : 'custom';
			sourceSeeded = true;
		}
		if (action?.success) {
			workOpen = false;
			workSource = catalogsForPicker.length > 0 ? 'catalog' : 'custom';
			workMode = '';
			workElements = [];
			workRequirements = [];
			workRequirementsRequired = true;
		}
	});

	const elementsJson = $derived(JSON.stringify(workElements));
	const requirementsJson = $derived(JSON.stringify(workRequirements));

	// Participantes (asignar/revocar) en modal, solo admin.
	let assignmentsOpen = $state(false);
	let revokeTarget = $state<{ id: string; displayName: string } | null>(null);
	const technicians = $derived(data.members.filter((member) => member.role === 'technician'));
	const supervisors = $derived(data.members.filter((member) => member.role === 'supervisor'));
	const submitAssign: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ update }) => {
			await update({ reset: true });
		};
	const submitRevoke: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: true });
			if (result.type === 'success') revokeTarget = null;
		};

	const accessLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;
	const participantLabel = { technician: 'Técnico', supervisor: 'Supervisor' } as const;

	// Catálogos ofrecidos en los pickers: generales (ni edificios ni requisitos).
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
	// Requisitos: solo catálogos marcados como tales.
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
	// Edificios: solo catálogos marcados como tales (si no hay ninguno, todos).
	const buildingCatalogs = $derived.by<CatalogGroup[]>(() => {
		const buildings = data.catalogs.filter((catalog) => catalog.purpose === 'buildings');
		// Respaldo: cualquier catálogo que no sea de requisitos.
		const source =
			buildings.length > 0
				? buildings
				: data.catalogs.filter((catalog) => catalog.purpose !== 'requirements');
		return source.map((catalog) => ({
			id: catalog.id,
			name: catalog.name,
			description: catalog.description,
			purpose: catalog.purpose,
			items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
		}));
	});

	let buildingItemId = $state('');
	let buildingSeeded = false;
	$effect(() => {
		if (!buildingSeeded) {
			buildingItemId = data.service.buildingCatalogItemId ?? '';
			buildingSeeded = true;
		}
	});

	// Edición del servicio en modal: cierra solo al confirmarse el éxito.
	let editServiceOpen = $state(false);
	let archiveServiceOpen = $state(false);
	const isArchived = $derived(data.service.lifecycle === 'archived');
	const submitService: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') editServiceOpen = false;
		};
	const submitLifecycle: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ update }) => {
			await update({ reset: false });
			archiveServiceOpen = false;
		};
</script>

<svelte:head>
	<title>{data.service.name} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader>
		<AppBreadcrumbs
			items={[{ label: 'Inicio', href: resolve('/(app)/dashboard') }, { label: data.service.name }]}
		/>
		{#if data.service.description}
			<p class="line-clamp-2 max-w-prose text-sm text-muted-foreground">
				{data.service.description}
			</p>
		{/if}
		<div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
			<span class="flex items-baseline gap-1.5">
				<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
					>Contrato</span
				>
				<span class="font-semibold text-foreground">{data.service.contractName}</span>
			</span>
			{#if data.service.buildingName}
				<span class="flex items-baseline gap-1.5">
					<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
						>Edificio</span
					>
					<span class="font-semibold text-foreground">{data.service.buildingName}</span>
				</span>
			{/if}
			<span class="flex items-baseline gap-1.5">
				<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
					>Tu acceso</span
				>
				<span class="font-semibold text-foreground">{accessLabel[data.access]}</span>
			</span>
			<LifecycleBadge lifecycle={data.service.lifecycle} />
			<StatusBadge
				status={data.progress.completed ? 'approved' : 'in_progress'}
				label={data.progress.completed ? 'Completado' : 'Incompleto'}
			/>
		</div>
		<div class="max-w-md">
			<ProgressMeter
				approved={data.progress.approvedTargets}
				total={data.progress.totalTargets}
				percent={data.progress.percent}
				completed={data.progress.completed}
			/>
		</div>
		{#snippet actions()}
			{#if data.isAdmin && !isArchived}
				{#if data.service.lifecycle === 'planned'}
					<form method="POST" action="?/setLifecycle" use:enhance={submitLifecycle}>
						<input type="hidden" name="serviceId" value={data.service.id} />
						<input type="hidden" name="lifecycle" value="active" />
						<Button type="submit" variant="outline" size="sm" class="w-full sm:w-auto"
							>Activar servicio</Button
						>
					</form>
				{:else if data.service.lifecycle === 'active'}
					<form method="POST" action="?/setLifecycle" use:enhance={submitLifecycle}>
						<input type="hidden" name="serviceId" value={data.service.id} />
						<input type="hidden" name="lifecycle" value="inactive" />
						<Button type="submit" variant="outline" size="sm" class="w-full sm:w-auto"
							>Pausar servicio</Button
						>
					</form>
				{:else if data.service.lifecycle === 'inactive'}
					<form method="POST" action="?/setLifecycle" use:enhance={submitLifecycle}>
						<input type="hidden" name="serviceId" value={data.service.id} />
						<input type="hidden" name="lifecycle" value="active" />
						<Button type="submit" variant="outline" size="sm" class="w-full sm:w-auto"
							>Reactivar servicio</Button
						>
					</form>
				{/if}
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					disabled={!data.progress.completed}
					title={!data.progress.completed
						? 'Solo puedes archivar un servicio cuando todos sus trabajos están aprobados.'
						: undefined}
					onclick={() => (archiveServiceOpen = true)}>Archivar servicio</Button
				>
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					onclick={() => (editServiceOpen = true)}>Editar servicio</Button
				>
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					onclick={() => (assignmentsOpen = true)}>Gestionar asignaciones</Button
				>
			{/if}
			{#if data.access !== 'technician'}
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					href={`/api/services/${data.service.id}/export.pdf`}
					disabled={data.progress.approvedTargets === 0}
					title={data.progress.approvedTargets === 0
						? 'El servicio aún no tiene evidencia aprobada.'
						: undefined}>PDF del servicio</Button
				>
				<ExportDialog
					href={`/api/services/${data.service.id}/export.zip`}
					class="w-full sm:w-auto"
					allowCompiledPdf
				/>
			{/if}
		{/snippet}
	</PageHeader>

	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}
	{#if data.service.lifecycle !== 'active'}
		<Alert>
			<AlertDescription>
				{#if data.service.lifecycle === 'planned'}
					Este servicio está en espera: puedes preparar su estructura, pero la evidencia no se puede
					capturar hasta activarlo.
				{:else if data.service.lifecycle === 'inactive'}
					Este servicio está inactivo: la evidencia y las revisiones son de solo lectura.
				{:else}
					Este servicio está archivado: todo su contenido es de solo lectura.
				{/if}
			</AlertDescription>
		</Alert>
	{/if}

	<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
		<div class="space-y-6">
			<Card.Root>
				<Card.Header class="flex flex-wrap items-center justify-between gap-2">
					<Card.Title class="text-base">Trabajos</Card.Title>
					{#if data.isAdmin && !isArchived}
						<div class="flex flex-wrap gap-2">
							<Button size="sm" onclick={() => (workOpen = true)}>Nuevo trabajo</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={catalogsForPicker.length === 0}
								onclick={() => (generateOpen = true)}>Generar en lote</Button
							>
						</div>
					{/if}
				</Card.Header>
				<Card.Content class="space-y-4">
					{#if data.works.length === 0}
						<p class="text-sm text-muted-foreground">
							Sin trabajos. Un servicio sin trabajos nunca se considera completado.
						</p>
					{:else}
						<ul class="space-y-3 md:hidden">
							{#each data.works as work (work.id)}
								<li class="relative">
									<Card.Root class="transition-colors active:bg-muted/50">
										<Card.Content class="space-y-2">
											<div class="flex items-start justify-between gap-2">
												<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
												<a
													class="min-w-0 font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
													href={resolve('/(app)/works/[workId]', { workId: work.id })}
												>
													{work.name}
												</a>
												<div class="flex shrink-0 items-center gap-2">
													<Chip tone="neutral"
														>{work.mode === 'direct' ? 'Directo' : 'Dividido'}</Chip
													>
													{#if work.approved}
														<Chip tone="approved">Aprobado</Chip>
													{:else if work.mode === 'divided' && work.elementCount === 0}
														<Chip tone="rejected">Sin elementos</Chip>
													{:else if work.mode === 'direct' && work.workStatus}
														<StatusBadge status={work.workStatus} />
													{/if}
												</div>
											</div>
											{#if work.mode === 'divided'}
												<MiniMeter value={work.approvedElements} total={work.elementCount} />
											{/if}
											{#if data.isAdmin && !isArchived}
												<div class="relative z-10">
													<DestructiveDelete
														label="Eliminar"
														endpoint={`/api/works/${work.id}`}
														itemName={work.name}
														description="Se eliminarán sus elementos, entregas y fotos."
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
										<Table.Head>Trabajo</Table.Head>
										<Table.Head class="hidden lg:table-cell">Tipo</Table.Head>
										<Table.Head class="hidden lg:table-cell">Progreso</Table.Head>
										<Table.Head>Estado</Table.Head>
										{#if data.isAdmin && !isArchived}
											<Table.Head class="w-px text-right">Acciones</Table.Head>
										{/if}
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each data.works as work (work.id)}
										<Table.Row class="relative">
											<Table.Cell class="whitespace-normal">
												<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
												<a
													class="font-medium text-foreground underline-offset-4 after:absolute after:inset-0 hover:underline"
													href={resolve('/(app)/works/[workId]', { workId: work.id })}
												>
													{work.name}
												</a>
											</Table.Cell>
											<Table.Cell class="hidden lg:table-cell">
												<Chip tone="neutral">{work.mode === 'direct' ? 'Directo' : 'Dividido'}</Chip
												>
											</Table.Cell>
											<Table.Cell class="hidden lg:table-cell">
												{#if work.mode === 'divided'}
													<MiniMeter value={work.approvedElements} total={work.elementCount} />
												{:else}
													<span class="text-muted-foreground">—</span>
												{/if}
											</Table.Cell>
											<Table.Cell>
												{#if work.approved}
													<Chip tone="approved">Aprobado</Chip>
												{:else if work.mode === 'divided' && work.elementCount === 0}
													<Chip tone="rejected">Sin elementos</Chip>
												{:else if work.mode === 'direct' && work.workStatus}
													<StatusBadge status={work.workStatus} />
												{:else}
													<span class="text-muted-foreground">—</span>
												{/if}
											</Table.Cell>
											{#if data.isAdmin && !isArchived}
												<Table.Cell class="relative z-10 text-right">
													<TableActions>
														<DestructiveDelete
															label="Eliminar"
															endpoint={`/api/works/${work.id}`}
															itemName={work.name}
															description="Se eliminarán sus elementos, entregas y fotos."
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
		</div>

		<div class="mt-6 space-y-6 lg:mt-0">
			<Card.Root>
				<Card.Header class="flex flex-wrap items-center justify-between gap-2">
					<Card.Title class="text-base">Participantes</Card.Title>
					{#if data.isAdmin && !isArchived}
						<Button variant="outline" size="sm" onclick={() => (assignmentsOpen = true)}
							>Asignar</Button
						>
					{/if}
				</Card.Header>
				<Card.Content>
					{#if data.participants.length === 0}
						<p class="text-sm text-muted-foreground">
							Sin participantes asignados.{#if data.isAdmin && !isArchived}
								<button
									type="button"
									class="underline underline-offset-4"
									onclick={() => (assignmentsOpen = true)}>Asignar participantes</button
								>.{/if}
						</p>
					{:else}
						<ul class="divide-y">
							{#each data.participants as participant (participant.userId + participant.assignmentRole)}
								<li class="flex items-center justify-between gap-3 py-2 text-sm">
									<span>{participant.displayName}</span>
									<Badge variant="secondary">{participantLabel[participant.assignmentRole]}</Badge>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>

			{#if data.isAdmin && !isArchived}
				<Card.Root>
					<Card.Header><Card.Title class="text-base">Zona de peligro</Card.Title></Card.Header>
					<Card.Content class="space-y-2">
						<p class="text-sm text-muted-foreground">
							Eliminar el servicio borra de forma permanente sus trabajos, elementos, evidencia,
							entregas y asignaciones.
						</p>
						<DestructiveDelete
							label="Eliminar servicio"
							endpoint={`/api/services/${data.service.id}`}
							itemName={data.service.name}
							onDeleted={() => {
								void goto(resolve('/(app)/dashboard'));
							}}
						/>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>

	{#if data.isAdmin && !isArchived}
		<AlertDialog.Root bind:open={archiveServiceOpen}>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>¿Archivar el servicio «{data.service.name}»?</AlertDialog.Title>
					<AlertDialog.Description>
						Quedará en solo lectura y no podrá reactivarse. Sus trabajos aprobados, entregas y fotos
						se conservan.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
					<form method="POST" action="?/setLifecycle" use:enhance={submitLifecycle}>
						<input type="hidden" name="serviceId" value={data.service.id} />
						<input type="hidden" name="lifecycle" value="archived" />
						<Button type="submit" variant="destructive">Archivar servicio</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>
	{/if}

	{#if data.canManageAssignments && !isArchived}
		<Dialog.Root bind:open={assignmentsOpen}>
			<Dialog.Content size="lg">
				<Dialog.Header>
					<Dialog.Title>Participantes</Dialog.Title>
					<Dialog.Description>
						Los técnicos capturan y envían; los supervisores revisan. Solo estos usuarios acceden al
						servicio.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body class="space-y-6">
					<ParticipantManager
						assignAction="?/assign"
						scopeField="serviceId"
						scopeId={data.service.id}
						{technicians}
						{supervisors}
						assignments={data.assignments}
						enhanceAssign={submitAssign}
						onRevoke={(assignment) =>
							(revokeTarget = {
								id: assignment.id,
								displayName: assignment.displayName
							})}
					/>
				</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Close>Cerrar</Dialog.Close>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<AlertDialog.Root
			open={revokeTarget !== null}
			onOpenChange={(open) => {
				if (!open) revokeTarget = null;
			}}
		>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title
						>¿Revocar la asignación de «{revokeTarget?.displayName ?? ''}»?</AlertDialog.Title
					>
					<AlertDialog.Description>
						Dejará de tener acceso a este servicio. Podrás volver a asignarle cuando quieras.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
					<form method="POST" action="?/revoke" use:enhance={submitRevoke}>
						<input type="hidden" name="assignmentId" value={revokeTarget?.id ?? ''} />
						<Button type="submit" variant="destructive">Revocar asignación</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>

		<Dialog.Root bind:open={editServiceOpen}>
			<Dialog.Content>
				<form
					method="POST"
					action="?/updateService"
					class="flex min-h-0 flex-1 flex-col"
					use:enhance={submitService}
				>
					<input type="hidden" name="serviceId" value={data.service.id} />
					<Dialog.Header>
						<Dialog.Title>Editar servicio</Dialog.Title>
						<Dialog.Description>
							Cambia el nombre, la descripción y el edificio. No altera entregas ni revisiones.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body class="space-y-5">
						<div class="space-y-2">
							<Label for="svc-name">Nombre</Label>
							<Input id="svc-name" name="name" value={data.service.name} required />
						</div>
						<div class="space-y-2">
							<Label for="svc-desc">Descripción</Label>
							<Input id="svc-desc" name="description" value={data.service.description ?? ''} />
						</div>
						<div class="space-y-2">
							<Label for="svc-building">Edificio</Label>
							<CatalogItemPicker
								name="buildingItemId"
								catalogs={buildingCatalogs}
								bind:value={buildingItemId}
								itemPlaceholder="Sin edificio"
							/>
						</div>
						<div class="space-y-2">
							<Label for="svc-contract">Contrato</Label>
							<NativeSelect
								id="svc-contract"
								name="contractId"
								value={data.service.contractId}
								required
							>
								{#each data.contracts.filter((contract) => contract.lifecycle === 'active' || contract.id === data.service.contractId) as contract (contract.id)}
									<option value={contract.id}>{contract.name}</option>
								{/each}
							</NativeSelect>
							<p class="text-xs text-muted-foreground">
								Al cambiar de contrato se revocan las asignaciones de usuarios que no pertenezcan al
								nuevo.
							</p>
						</div>
						{#if action?.message}
							<p class="text-sm text-destructive">{action.message}</p>
						{/if}
					</Dialog.Body>
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit">Guardar cambios</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>

		<Dialog.Root bind:open={workOpen}>
			<Dialog.Content size="lg">
				<form method="POST" action="?/createWork" class="flex min-h-0 flex-1 flex-col">
					<input type="hidden" name="serviceId" value={data.service.id} />
					<Dialog.Header>
						<Dialog.Title>Nuevo trabajo</Dialog.Title>
						<Dialog.Description>
							Los trabajos directos tienen su propia evidencia; los divididos se componen de
							elementos.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body class="space-y-5">
						<Dialog.Section eyebrow="Paso 1" title="Tipo de trabajo">
							<fieldset class="space-y-2">
								<legend class="sr-only">Tipo de trabajo</legend>
								<div class="grid gap-2 sm:grid-cols-2">
									<label
										class="relative cursor-pointer rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 {workMode ===
										'direct'
											? 'border-primary bg-primary/5'
											: 'border-border hover:bg-muted/40'}"
									>
										<input
											type="radio"
											name="mode"
											value="direct"
											bind:group={workMode}
											required
											class="sr-only"
										/>
										<span class="block text-sm font-semibold">Directo</span>
										<span class="mt-1 block text-xs leading-relaxed text-muted-foreground">
											Una evidencia única para todo el trabajo.
										</span>
									</label>
									<label
										class="relative cursor-pointer rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 {workMode ===
										'divided'
											? 'border-primary bg-primary/5'
											: 'border-border hover:bg-muted/40'}"
									>
										<input
											type="radio"
											name="mode"
											value="divided"
											bind:group={workMode}
											required
											class="sr-only"
										/>
										<span class="block text-sm font-semibold">Dividido</span>
										<span class="mt-1 block text-xs leading-relaxed text-muted-foreground">
											La evidencia se organiza por elementos.
										</span>
									</label>
								</div>
							</fieldset>
						</Dialog.Section>
						<Dialog.Section eyebrow="Paso 2" title="Datos y estructura">
							<div class="space-y-2">
								<p class="text-xs text-muted-foreground">
									Elige un ítem del catálogo o escribe un nombre propio.
								</p>
								<Tabs.Root bind:value={workSource}>
									<Tabs.List class="grid w-full grid-cols-2">
										<Tabs.Trigger value="catalog">Desde catálogo</Tabs.Trigger>
										<Tabs.Trigger value="custom">Nombre propio</Tabs.Trigger>
									</Tabs.List>
								</Tabs.Root>
								{#if workSource === 'catalog'}
									<div class="space-y-1 pt-2">
										<Label for="work-catalog">Ítem del catálogo</Label>
										<CatalogItemPicker
											name="catalogItemId"
											catalogs={catalogsForPicker}
											itemPlaceholder="Elige ítem…"
										/>
									</div>
								{:else}
									<div class="space-y-1 pt-2">
										<Label for="work-name">Nombre propio</Label>
										<Input
											id="work-name"
											name="name"
											required
											aria-invalid={action?.workErrors?.name ? true : undefined}
											aria-describedby={action?.workErrors?.name ? 'work-name-error' : undefined}
										/>
										{#if action?.workErrors?.name}
											<p id="work-name-error" class="text-sm text-destructive">
												{action.workErrors.name}
											</p>
										{/if}
									</div>
								{/if}
							</div>
							{#if workMode === 'divided'}
								<div class="space-y-3 rounded-xl border border-border p-3">
									<Label>Elementos</Label>
									<ElementsEditor catalogs={catalogsForPicker} bind:value={workElements} />
								</div>
							{/if}
							{#if requirementCatalogs.length > 0}
								<div class="space-y-3 rounded-xl border border-border p-3">
									<Label>Requisitos</Label>
									<p class="text-xs text-muted-foreground">
										{#if workMode === 'divided'}
											Se aplicarán a cada elemento creado.
										{:else}
											Se aplicarán al trabajo.
										{/if}
									</p>
									<RequirementsEditor
										catalogs={requirementCatalogs}
										bind:value={workRequirements}
										bind:required={workRequirementsRequired}
									/>
								</div>
							{/if}
						</Dialog.Section>
						<input type="hidden" name="elements" value={elementsJson} />
						<input type="hidden" name="requirements" value={requirementsJson} />
						<input
							type="hidden"
							name="requirementIsRequired"
							value={workRequirementsRequired ? 'true' : 'false'}
						/>
					</Dialog.Body>
					<Dialog.Footer>
						<Dialog.Close>Cancelar</Dialog.Close>
						<Button type="submit" disabled={!workMode}>Crear trabajo</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>

		<GenerateStructureDialog
			serviceId={data.service.id}
			catalogs={catalogsForPicker}
			{requirementCatalogs}
			bind:open={generateOpen}
		/>
	{/if}
</div>
