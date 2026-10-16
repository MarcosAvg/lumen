<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import ProgressMeter from '#lib/components/app/progress-meter.svelte';
	import type { AttentionWork } from '#lib/server/domain/dashboard';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const role = $derived(data.user.role);
	const approvedPercent = $derived(
		data.summary.totalTargets === 0
			? 0
			: Math.round((data.summary.approvedTargets / data.summary.totalTargets) * 100)
	);
	const workPercent = $derived(
		data.summary.workTotal === 0
			? 0
			: Math.round((data.summary.workApproved / data.summary.workTotal) * 100)
	);
	// El tablero del técnico trabaja a nivel de **trabajo**: un dividido con
	// varios elementos afectados es una sola fila.
	const rejected = $derived(data.attention.filter((work) => work.elementRejected > 0));
	const inProgress = $derived(data.attention.filter((work) => work.elementRejected === 0));
	const servicesHref = $derived(
		role === 'admin' ? resolve('/(app)/admin/services') : resolve('/(app)/services')
	);

	// Muchos pendientes aglomeran el panel: se muestran los primeros y el resto
	// se despliega bajo demanda. Seleccionar un servicio vive en su propia pestaña.
	const PENDING_LIMIT = 5;
	let showAllPending = $state(false);
	const visibleInProgress = $derived(
		showAllPending ? inProgress : inProgress.slice(0, PENDING_LIMIT)
	);
</script>

<svelte:head>
	<title>Inicio · Lumen</title>
</svelte:head>

{#snippet workList(works: AttentionWork[])}
	<ul class="divide-y overflow-hidden rounded-lg border">
		{#each works as work (work.workId)}
			<li class="relative flex min-h-14 items-start justify-between gap-3 p-3 active:bg-muted/50">
				<div class="min-w-0 space-y-0.5">
					<p class="flex flex-wrap items-center gap-2">
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							class="font-medium text-foreground after:absolute after:inset-0"
							href={resolve('/(app)/works/[workId]', { workId: work.workId })}
						>
							{work.workName}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<StatusBadge status={work.status} />
					</p>
					<p class="text-xs text-muted-foreground">
						{work.serviceName}{#if work.mode === 'divided'}
							· {work.elementApproved}/{work.elementTotal}
							elementos{/if}
					</p>
					{#if work.status === 'rejected' && work.rejectionReason}
						<p class="text-sm">Motivo: {work.rejectionReason}</p>
					{:else if work.elementRejected > 0}
						<p class="tnum text-sm text-muted-foreground">
							{work.elementRejected} elemento(s) por corregir
						</p>
					{:else}
						<p class="tnum text-sm text-muted-foreground">
							{work.elementPending} elemento(s) por completar
						</p>
					{/if}
				</div>
				<span class="relative z-10 shrink-0 pt-0.5 text-sm font-medium text-primary">
					{work.status === 'rejected' ? 'Corregir' : 'Continuar'} →
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="space-y-6">
	<PageIntro
		description={role === 'technician'
			? 'Tu evidencia pendiente y rechazada.'
			: role === 'supervisor'
				? 'Entregas por revisar de tus servicios.'
				: 'Resumen global y revisiones pendientes.'}
	></PageIntro>

	{#if role === 'technician'}
		<section aria-label="Tu resumen" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<Card.Root>
				<Card.Content>
					<p class="text-sm text-muted-foreground">Servicios</p>
					<p class="tnum text-2xl font-semibold">{data.summary.serviceCount}</p>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="space-y-2">
					<p class="text-sm text-muted-foreground">Aprobados</p>
					<ProgressMeter
						approved={data.summary.workApproved}
						total={data.summary.workTotal}
						percent={workPercent}
						completed={data.summary.workTotal > 0 &&
							data.summary.workApproved === data.summary.workTotal}
					/>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content>
					<p class="text-sm text-muted-foreground">Por corregir</p>
					<p class="tnum text-2xl font-semibold" class:text-destructive={rejected.length > 0}>
						{rejected.length}
					</p>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content>
					<p class="text-sm text-muted-foreground">En curso</p>
					<p class="tnum text-2xl font-semibold">{inProgress.length}</p>
				</Card.Content>
			</Card.Root>
		</section>

		{#if rejected.length > 0}
			<section class="space-y-2">
				<h2 class="text-sm font-medium">Requiere tu atención</h2>
				{@render workList(rejected)}
			</section>
		{/if}
		{#if inProgress.length > 0}
			<section class="space-y-2">
				<h2 class="text-sm font-medium">Pendientes</h2>
				{@render workList(visibleInProgress)}
				{#if inProgress.length > PENDING_LIMIT}
					<Button variant="outline" size="sm" onclick={() => (showAllPending = !showAllPending)}>
						{showAllPending ? 'Mostrar menos' : `Mostrar todos (${inProgress.length})`}
					</Button>
				{/if}
			</section>
		{/if}
		{#if data.attention.length === 0}
			<p class="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
				No tienes evidencia pendiente. Buen trabajo.
			</p>
		{/if}
	{:else}
		<div class="grid gap-2 md:hidden">
			{#if data.summary.pendingReviews > 0}
				<Button href={resolve('/(app)/reviews')} class="w-full justify-between">
					<span>Revisar pendientes</span>
					<span class="tnum">{data.summary.pendingReviews}</span>
				</Button>
			{/if}
			<Button href={servicesHref} variant="outline" class="w-full justify-between">
				<span>Servicios</span>
				<span class="tnum">{data.summary.serviceCount}</span>
			</Button>
		</div>

		<div class="grid gap-3 sm:grid-cols-3">
			<Card.Root>
				<Card.Content>
					<p class="text-sm text-muted-foreground">
						{role === 'admin' ? 'Servicios' : 'Servicios asignados'}
					</p>
					<p class="tnum text-2xl font-semibold">{data.summary.serviceCount}</p>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="space-y-2">
					<p class="text-sm text-muted-foreground">Objetivos aprobados</p>
					<ProgressMeter
						approved={data.summary.approvedTargets}
						total={data.summary.totalTargets}
						percent={approvedPercent}
						completed={data.summary.totalTargets > 0 &&
							data.summary.approvedTargets === data.summary.totalTargets}
					/>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content>
					<p class="text-sm text-muted-foreground">Revisiones pendientes</p>
					<p class="tnum text-2xl font-semibold">{data.summary.pendingReviews}</p>
				</Card.Content>
			</Card.Root>
		</div>

		<section class="space-y-2">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-medium">Entregas por revisar</h2>
				{#if data.pendingTotal > 0}
					<Button href={resolve('/(app)/reviews')} variant="ghost" size="sm">Ver todas</Button>
				{/if}
			</div>
			{#if data.pending.length === 0}
				<EmptyState
					title="Sin revisiones pendientes"
					description="Cuando los técnicos envíen evidencia, aparecerá aquí."
				/>
			{:else}
				<ul class="divide-y overflow-hidden rounded-lg border">
					{#each data.pending as item (item.submissionId)}
						<li class="relative flex items-center justify-between gap-3 p-3 active:bg-muted/50">
							<div class="space-y-0.5">
								<a
									class="font-medium text-foreground after:absolute after:inset-0"
									href={resolve('/(app)/submissions/[submissionId]', {
										submissionId: item.submissionId
									})}
								>
									{item.label}
								</a>
								<p class="text-xs text-muted-foreground">
									{item.serviceName} · {item.workName} · #{item.sequenceNo} ·
									{item.submittedByName ?? 'Autor desconocido'}
								</p>
							</div>
							<StatusBadge status="in_review" />
						</li>
					{/each}
				</ul>
				{#if data.pendingTotal > data.pending.length}
					<Button href={resolve('/(app)/reviews')} variant="outline" size="sm">
						Ver las {data.pendingTotal} pendientes
					</Button>
				{/if}
			{/if}
		</section>
	{/if}
</div>
