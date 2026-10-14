<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import DestructiveDelete from '#lib/components/destructive-delete.svelte';
	import type { PageProps } from './$types';

	type ActionData = {
		success?: string;
		message?: string;
		workErrors?: Record<string, string>;
		elementErrors?: Record<string, string>;
	};

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	const accessLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;
	const participantLabel = { technician: 'Técnico', supervisor: 'Supervisor' } as const;
	const statusLabel = {
		pending: 'Pendiente',
		in_progress: 'En progreso',
		in_review: 'En revisión',
		rejected: 'Rechazado',
		approved: 'Aprobado'
	} as const;

	const dividedWorks = $derived(data.works.filter((work) => work.mode === 'divided'));
</script>

<svelte:head>
	<title>{data.service.name} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">{data.service.name}</h1>
		{#if data.service.description}
			<p class="text-sm text-muted-foreground">{data.service.description}</p>
		{/if}
		<div class="mt-2 flex flex-wrap items-center gap-2">
			{#if data.service.buildingName}
				<Badge variant="secondary">Edificio: {data.service.buildingName}</Badge>
			{/if}
			<Badge variant="secondary">Tu acceso: {accessLabel[data.access]}</Badge>
			<Badge variant={data.progress.completed ? 'default' : 'outline'}>
				{data.progress.completed ? 'Completado' : 'Incompleto'} · {data.progress
					.approvedTargets}/{data.progress.totalTargets} ({data.progress.percent}%)
			</Badge>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Button href={`/api/services/${data.service.id}/export.zip`} variant="outline" size="sm">
			Exportar evidencias aprobadas (ZIP)
		</Button>
		<span class="text-xs text-muted-foreground">
			Solo incluye entregas aprobadas; el ZIP lleva un resumen de las pendientes omitidas.
		</span>
	</div>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	{#if data.isAdmin}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Datos del servicio</Card.Title></Card.Header>
			<Card.Content>
				<form method="POST" action="?/updateService" class="grid gap-4 sm:grid-cols-3">
					<input type="hidden" name="serviceId" value={data.service.id} />
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
						<select
							id="svc-building"
							name="buildingItemId"
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						>
							<option value="">Sin edificio</option>
							{#each data.catalogs as catalog (catalog.id)}
								{#if catalog.items.length > 0}
									<optgroup label={catalog.name}>
										{#each catalog.items as item (item.id)}
											<option value={item.id}>{item.name}</option>
										{/each}
									</optgroup>
								{/if}
							{/each}
						</select>
					</div>
					<div class="sm:col-span-3">
						<Button type="submit" variant="outline" size="sm">Guardar cambios</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header class="flex items-center justify-between">
			<Card.Title class="text-base">Trabajos</Card.Title>
			{#if data.isAdmin}
				<Button
					href={resolve('/(app)/admin/services/[serviceId]/generate', {
						serviceId: data.service.id
					})}
					variant="outline"
					size="sm">Generar en lote</Button
				>
			{/if}
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.works.length === 0}
				<p class="text-sm text-muted-foreground">
					Sin trabajos. Un servicio sin trabajos nunca se considera completado.
				</p>
			{:else}
				<ul class="divide-y">
					{#each data.works as work (work.id)}
						<li class="flex flex-wrap items-center justify-between gap-2 py-3">
							<div>
								<p class="flex items-center gap-2 font-medium">
									{work.name}
									<Badge variant="secondary"
										>{work.mode === 'direct' ? 'Directo' : 'Dividido'}</Badge
									>
									{#if work.approved}
										<Badge>Aprobado</Badge>
									{:else if work.mode === 'divided' && work.elementCount === 0}
										<Badge variant="destructive">Sin elementos</Badge>
									{/if}
								</p>
								{#if work.mode === 'divided'}
									<p class="text-sm text-muted-foreground">
										{work.approvedElements}/{work.elementCount} elemento(s) aprobado(s)
									</p>
								{:else if work.workStatus}
									<p class="text-sm text-muted-foreground">
										Estado: {statusLabel[work.workStatus]}
									</p>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<Button
									href={resolve('/(app)/works/[workId]', { workId: work.id })}
									variant="outline"
									size="sm">Abrir</Button
								>
								{#if data.isAdmin}
									<DestructiveDelete
										label="Eliminar"
										endpoint={`/api/works/${work.id}`}
										itemName={work.name}
										description="Se eliminarán sus elementos, entregas y fotos."
									/>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.isAdmin}
				<form method="POST" action="?/createWork" class="grid gap-3 border-t pt-4 sm:grid-cols-4">
					<input type="hidden" name="serviceId" value={data.service.id} />
					<div class="space-y-1">
						<Label for="work-mode">Modo</Label>
						<select
							id="work-mode"
							name="mode"
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						>
							<option value="direct">Directo</option>
							<option value="divided">Dividido</option>
						</select>
					</div>
					<div class="space-y-1">
						<Label for="work-catalog">Desde catálogo (opcional)</Label>
						<select
							id="work-catalog"
							name="catalogItemId"
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						>
							<option value="">— Nombre propio —</option>
							{#each data.catalogs as catalog (catalog.id)}
								{#if catalog.items.length > 0}
									<optgroup label={catalog.name}>
										{#each catalog.items as item (item.id)}
											<option value={item.id}>{item.name}</option>
										{/each}
									</optgroup>
								{/if}
							{/each}
						</select>
					</div>
					<div class="space-y-1">
						<Label for="work-name">Nombre propio</Label>
						<Input id="work-name" name="name" placeholder="Solo si no eliges catálogo" />
					</div>
					<div class="flex items-end">
						<Button type="submit" size="sm">Crear trabajo</Button>
					</div>
				</form>
				{#if action?.workErrors?.name}
					<p class="text-sm text-destructive">{action.workErrors.name}</p>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>

	{#if data.isAdmin && dividedWorks.length > 0}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Añadir elemento</Card.Title></Card.Header>
			<Card.Content>
				<form method="POST" action="?/createElement" class="grid gap-3 sm:grid-cols-4">
					<div class="space-y-1">
						<Label for="el-work">Trabajo dividido</Label>
						<select
							id="el-work"
							name="workId"
							required
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						>
							{#each dividedWorks as work (work.id)}
								<option value={work.id}>{work.name}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-1">
						<Label for="el-catalog">Desde catálogo (opcional)</Label>
						<select
							id="el-catalog"
							name="catalogItemId"
							class="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
						>
							<option value="">— Nombre propio —</option>
							{#each data.catalogs as catalog (catalog.id)}
								{#if catalog.items.length > 0}
									<optgroup label={catalog.name}>
										{#each catalog.items as item (item.id)}
											<option value={item.id}>{item.name}</option>
										{/each}
									</optgroup>
								{/if}
							{/each}
						</select>
					</div>
					<div class="space-y-1">
						<Label for="el-name">Nombre propio</Label>
						<Input id="el-name" name="name" />
					</div>
					<div class="flex items-end">
						<Button type="submit" size="sm">Añadir elemento</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Participantes</Card.Title></Card.Header>
		<Card.Content>
			{#if data.participants.length === 0}
				<p class="text-sm text-muted-foreground">Sin participantes asignados.</p>
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
</div>
