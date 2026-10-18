<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import ExportDialog from '#lib/components/app/export-dialog.svelte';
	import LifecycleBadge from '#lib/components/app/lifecycle-badge.svelte';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import ParticipantManager from '#lib/components/app/participant-manager.svelte';
	import ProgressMeter from '#lib/components/app/progress-meter.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import type { PageProps } from './$types';

	type ActionData = {
		success?: string;
		message?: string;
		backgroundMessage?: string;
		marginMessage?: string;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	const roleLabel = { technician: 'Técnico', supervisor: 'Supervisor' } as const;
	const accessLabel = $derived(
		data.isAdmin ? 'Administrador' : data.isSupervisor ? 'Supervisor' : 'Técnico'
	);
	const technicians = $derived(data.assignable.filter((user) => user.role === 'technician'));
	const supervisors = $derived(data.assignable.filter((user) => user.role === 'supervisor'));

	let editOpen = $state(false);
	let membersOpen = $state(false);
	let deleteOpen = $state(false);
	let archiveOpen = $state(false);
	let revokeTarget = $state<{ id: string; displayName: string } | null>(null);

	const hasRunningServices = $derived(
		data.services.some(
			(service) => service.lifecycle === 'active' || service.lifecycle === 'planned'
		)
	);
	const hasUnarchivedServices = $derived(
		data.services.some((service) => service.lifecycle !== 'archived')
	);
	// Fondo del PDF: el selector nativo se oculta tras un botón visible.
	let backgroundInput = $state<HTMLInputElement | null>(null);
	let backgroundName = $state('');

	const submitEdit: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') editOpen = false;
		};
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
	const submitDelete: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ update }) => {
			await update({ reset: false });
			deleteOpen = false;
		};
	const submitLifecycle: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ update }) => {
			await update({ reset: false });
			archiveOpen = false;
		};
	// Los márgenes se guardan sin recargar y sin resetear los campos.
	const submitMargins: NonNullable<Parameters<typeof enhance>[1]> =
		() =>
		async ({ update }) => {
			await update({ reset: false });
		};
</script>

<svelte:head>
	<title>{data.contract.name} · Contrato · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader>
		<AppBreadcrumbs
			items={[
				{ label: 'Inicio', href: resolve('/(app)/dashboard') },
				{ label: 'Contratos', href: resolve('/(app)/contracts') },
				{ label: data.contract.name }
			]}
		/>
		{#if data.contract.description}
			<p class="line-clamp-2 max-w-prose text-sm text-muted-foreground">
				{data.contract.description}
			</p>
		{/if}
		<div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
			<span class="flex items-baseline gap-1.5">
				<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
					>Servicios</span
				>
				<span class="tnum font-semibold text-foreground">{data.services.length}</span>
			</span>
			<span class="flex items-baseline gap-1.5">
				<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
					>Participantes</span
				>
				<span class="tnum font-semibold text-foreground">{data.assignments.length}</span>
			</span>
			<span class="flex items-baseline gap-1.5">
				<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
					>Tu acceso</span
				>
				<span class="font-semibold text-foreground">{accessLabel}</span>
			</span>
			<LifecycleBadge lifecycle={data.contract.lifecycle} kind="contract" />
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
			{#if data.canManage || data.isAdmin}
				<ExportDialog
					href={`/api/contracts/${data.contract.id}/export.zip`}
					class="w-full sm:w-auto"
					allowCompiledPdf
				/>
				{#if data.isAdmin}
					{#if data.contract.lifecycle === 'active'}
						<form method="POST" action="?/setLifecycle" use:enhance={submitLifecycle}>
							<input type="hidden" name="contractId" value={data.contract.id} />
							<input type="hidden" name="lifecycle" value="inactive" />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								class="w-full sm:w-auto"
								disabled={hasRunningServices}
								title={hasRunningServices
									? 'Pausa o archiva antes los servicios activos o en espera.'
									: undefined}>Pausar contrato</Button
							>
						</form>
					{:else if data.contract.lifecycle === 'inactive'}
						<form method="POST" action="?/setLifecycle" use:enhance={submitLifecycle}>
							<input type="hidden" name="contractId" value={data.contract.id} />
							<input type="hidden" name="lifecycle" value="active" />
							<Button type="submit" variant="outline" size="sm" class="w-full sm:w-auto"
								>Reactivar contrato</Button
							>
						</form>
					{/if}
					{#if data.contract.lifecycle !== 'archived'}
						<Button
							variant="outline"
							size="sm"
							class="w-full sm:w-auto"
							disabled={hasUnarchivedServices}
							title={hasUnarchivedServices
								? 'Archiva todos los servicios antes de archivar el contrato.'
								: undefined}
							onclick={() => (archiveOpen = true)}>Archivar contrato</Button
						>
					{/if}
					{#if data.contract.lifecycle !== 'archived'}
						<Button
							variant="outline"
							size="sm"
							class="w-full sm:w-auto"
							onclick={() => (editOpen = true)}>Editar contrato</Button
						>
					{/if}
				{/if}
			{/if}
		{/snippet}
	</PageHeader>

	{#if action?.success}
		<Alert role="status"><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
		<div class="space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Servicios ({data.services.length})</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if data.services.length === 0}
						<p class="text-sm text-muted-foreground">Este contrato no tiene servicios todavía.</p>
					{:else}
						<ul class="space-y-3">
							{#each data.services as service (service.id)}
								<li class="relative">
									<Card.Root
										class="border-l-2 transition-colors active:bg-muted/50 {service.totalTargets >
											0 && service.approvedTargets === service.totalTargets
											? 'border-l-teal'
											: 'border-l-primary/40'}"
									>
										<Card.Content class="space-y-2">
											<div class="flex flex-wrap items-center justify-between gap-2">
												<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
												<a
													class="font-medium text-foreground after:absolute after:inset-0"
													href={resolve('/(app)/services/[serviceId]', { serviceId: service.id })}
												>
													{service.name}
												</a>
												<LifecycleBadge lifecycle={service.lifecycle} />
											</div>
											{#if service.description}
												<p class="line-clamp-1 text-sm text-muted-foreground">
													{service.description}
												</p>
											{/if}
											{#if service.buildingName}
												<p class="text-xs text-muted-foreground">
													Edificio: {service.buildingName}
												</p>
											{/if}
											<ProgressMeter
												approved={service.approvedTargets}
												total={service.totalTargets}
												percent={service.percent}
												completed={service.totalTargets > 0 &&
													service.approvedTargets === service.totalTargets}
											/>
										</Card.Content>
									</Card.Root>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>

		<div class="mt-6 space-y-6 lg:mt-0">
			<Card.Root>
				<Card.Header class="flex flex-wrap items-center justify-between gap-2">
					<Card.Title class="text-base">Participantes</Card.Title>
					{#if data.canManage && data.contract.lifecycle !== 'archived'}
						<Button variant="outline" size="sm" onclick={() => (membersOpen = true)}
							>Gestionar participantes</Button
						>
					{/if}
				</Card.Header>
				<Card.Content>
					{#if data.assignments.length === 0}
						<p class="text-sm text-muted-foreground">
							{#if data.canManage && data.contract.lifecycle !== 'archived'}
								Sin participantes.
								<button
									type="button"
									class="ml-1 underline underline-offset-4"
									onclick={() => (membersOpen = true)}>Añadir participantes</button
								>.
							{:else}
								Sin participantes.
							{/if}
						</p>
					{:else}
						<ul class="divide-y">
							{#each data.assignments as assignment (assignment.id)}
								<li class="flex items-center justify-between gap-3 py-2 text-sm">
									<span>{assignment.displayName}</span>
									<Badge variant="secondary">{roleLabel[assignment.assignmentRole]}</Badge>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>

			{#if data.isAdmin && data.contract.lifecycle !== 'archived'}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base">PDF de evidencia</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						<p class="text-sm text-muted-foreground">
							Fondo y márgenes compartidos por los PDF de evidencia de todos los servicios de este
							contrato.
						</p>
						{#if data.hasPdfBackground}
							<img
								src={`/api/contracts/${data.contract.id}/pdf-background`}
								alt="Fondo actual del PDF"
								class="max-h-40 rounded-lg border object-contain"
							/>
						{/if}
						{#if action?.backgroundMessage}
							<p class="text-sm text-destructive">{action.backgroundMessage}</p>
						{/if}
						<form
							method="POST"
							action="?/uploadBackground"
							enctype="multipart/form-data"
							class="space-y-3"
						>
							<div class="space-y-2">
								<Label for="pdf-background">Imagen (PNG o JPG, máx. 5 MB)</Label>
								<div class="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => backgroundInput?.click()}
									>
										Elegir imagen
									</Button>
									<span class="min-w-0 truncate text-sm text-muted-foreground">
										{backgroundName || 'Ningún archivo seleccionado'}
									</span>
									<input
										bind:this={backgroundInput}
										id="pdf-background"
										name="background"
										type="file"
										accept="image/png,image/jpeg"
										required
										class="sr-only"
										onchange={(event) => {
											backgroundName = event.currentTarget.files?.[0]?.name ?? '';
										}}
									/>
								</div>
							</div>
							<Button type="submit" variant="outline" size="sm" disabled={!backgroundName}>
								Subir fondo
							</Button>
						</form>
						{#if data.hasPdfBackground}
							<form method="POST" action="?/removeBackground">
								<Button type="submit" variant="destructive" size="sm">Quitar fondo</Button>
							</form>
						{/if}

						<form
							method="POST"
							action="?/updateMargins"
							class="space-y-3"
							use:enhance={submitMargins}
						>
							<input type="hidden" name="contractId" value={data.contract.id} />
							<p class="text-sm font-medium">Márgenes (mm)</p>
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-2">
									<Label for="margin-top">Arriba</Label>
									<Input
										id="margin-top"
										name="marginTop"
										type="number"
										min="10"
										max="80"
										value={String(data.pdfMargins.top)}
										required
									/>
								</div>
								<div class="space-y-2">
									<Label for="margin-bottom">Abajo</Label>
									<Input
										id="margin-bottom"
										name="marginBottom"
										type="number"
										min="10"
										max="80"
										value={String(data.pdfMargins.bottom)}
										required
									/>
								</div>
								<div class="space-y-2">
									<Label for="margin-left">Izquierda</Label>
									<Input
										id="margin-left"
										name="marginLeft"
										type="number"
										min="10"
										max="80"
										value={String(data.pdfMargins.left)}
										required
									/>
								</div>
								<div class="space-y-2">
									<Label for="margin-right">Derecha</Label>
									<Input
										id="margin-right"
										name="marginRight"
										type="number"
										min="10"
										max="80"
										value={String(data.pdfMargins.right)}
										required
									/>
								</div>
							</div>
							{#if action?.marginMessage}
								<p class="text-sm text-destructive">{action.marginMessage}</p>
							{/if}
							<Button type="submit" variant="outline" size="sm">Guardar márgenes</Button>
						</form>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header><Card.Title class="text-base">Zona de peligro</Card.Title></Card.Header>
					<Card.Content class="space-y-2">
						<p class="text-sm text-muted-foreground">
							Eliminar el contrato es permanente y revoca a sus participantes. Solo es posible si no
							tiene servicios: muévelos o elimínalos antes.
						</p>
						<Button variant="destructive" size="sm" onclick={() => (deleteOpen = true)}
							>Eliminar contrato</Button
						>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>

{#if data.isAdmin}
	<Dialog.Root bind:open={editOpen}>
		<Dialog.Content>
			<form
				method="POST"
				action="?/updateContract"
				class="flex min-h-0 flex-1 flex-col"
				use:enhance={submitEdit}
			>
				<input type="hidden" name="contractId" value={data.contract.id} />
				<Dialog.Header>
					<Dialog.Title>Editar contrato</Dialog.Title>
					<Dialog.Description>Nombre y descripción del contrato.</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body class="space-y-5">
					<div class="space-y-2">
						<Label for="contract-name">Nombre</Label>
						<Input id="contract-name" name="name" value={data.contract.name} required />
					</div>
					<div class="space-y-2">
						<Label for="contract-description">Descripción</Label>
						<Input
							id="contract-description"
							name="description"
							value={data.contract.description ?? ''}
						/>
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
{/if}

{#if data.canManage}
	<Dialog.Root bind:open={membersOpen}>
		<Dialog.Content size="lg">
			<Dialog.Header>
				<Dialog.Title>Participantes</Dialog.Title>
				<Dialog.Description>
					Los técnicos capturan y envían; los supervisores revisan. Solo los participantes acceden a
					los servicios del contrato.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="space-y-6">
				<ParticipantManager
					assignAction="?/assignMember"
					scopeField="contractId"
					scopeId={data.contract.id}
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
{/if}

<AlertDialog.Root
	open={revokeTarget !== null}
	onOpenChange={(open) => {
		if (!open) revokeTarget = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title
				>¿Revocar a «{revokeTarget?.displayName ?? ''}» del contrato?</AlertDialog.Title
			>
			<AlertDialog.Description>
				Dejará de pertenecer al contrato y se revocarán sus asignaciones de servicio dentro de él.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<form method="POST" action="?/revokeMember" use:enhance={submitRevoke}>
				<input type="hidden" name="assignmentId" value={revokeTarget?.id ?? ''} />
				<Button type="submit" variant="destructive">Revocar del contrato</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={archiveOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>¿Archivar el contrato «{data.contract.name}»?</AlertDialog.Title>
			<AlertDialog.Description>
				Quedará en solo lectura y no podrá reactivarse. Sus servicios archivados, entregas y fotos
				se conservan.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<form method="POST" action="?/setLifecycle" use:enhance={submitLifecycle}>
				<input type="hidden" name="contractId" value={data.contract.id} />
				<input type="hidden" name="lifecycle" value="archived" />
				<Button type="submit" variant="destructive">Archivar contrato</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>¿Eliminar el contrato «{data.contract.name}»?</AlertDialog.Title>
			<AlertDialog.Description>
				Esta acción es permanente. Solo es posible si el contrato no tiene servicios.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<form method="POST" action="?/deleteContract" use:enhance={submitDelete}>
				<Button type="submit" variant="destructive">Eliminar contrato</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
