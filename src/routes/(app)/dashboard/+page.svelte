<script lang="ts">
	import { resolve } from '$app/paths';
	import Building2 from '@lucide/svelte/icons/building-2';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Clock3 from '@lucide/svelte/icons/clock-3';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Users from '@lucide/svelte/icons/users';
	import { Button } from '#lib/components/ui/button';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import MetricCard from '#lib/components/app/metric-card.svelte';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import RecentDecisions from '#lib/components/app/recent-decisions.svelte';
	import RecentEvidence from '#lib/components/app/recent-evidence.svelte';
	import ReviewQueue from '#lib/components/app/review-queue.svelte';
	import ReviewTrend from '#lib/components/app/review-trend.svelte';
	import ScopePulse from '#lib/components/app/scope-pulse.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import StatusSpectrum from '#lib/components/app/status-spectrum.svelte';
	import ProgressMeter from '#lib/components/app/progress-meter.svelte';
	import { formatRelativeAge } from '#lib/utils';
	import type { AttentionWork } from '#lib/server/domain/dashboard';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const role = $derived(data.user.role);
	const workPercent = $derived(
		data.summary.workTotal === 0
			? 0
			: Math.round((data.summary.workApproved / data.summary.workTotal) * 100)
	);
	// El tablero del técnico trabaja a nivel de **trabajo**: un dividido con
	// varios elementos afectados es una sola fila.
	const rejected = $derived(data.attention.filter((work) => work.elementRejected > 0));
	const inProgress = $derived(data.attention.filter((work) => work.elementRejected === 0));

	// El panel es un resumen acotado: el resto se consulta desde Servicios.
	const REJECTED_LIMIT = 3;
	const PENDING_LIMIT = 5;
	const visibleRejected = $derived(rejected.slice(0, REJECTED_LIMIT));
	const visibleInProgress = $derived(inProgress.slice(0, PENDING_LIMIT));
	const remainingRejected = $derived(Math.max(0, rejected.length - REJECTED_LIMIT));
	const remainingInProgress = $derived(Math.max(0, inProgress.length - PENDING_LIMIT));
	const oldestPendingLabel = $derived(
		data.pending[0]?.submittedAt
			? formatRelativeAge(data.pending[0].submittedAt).replace('hace ', '')
			: '—'
	);
</script>

<svelte:head>
	<title>Inicio · Lumen</title>
</svelte:head>

{#snippet workList(works: AttentionWork[])}
	<ul class="divide-y overflow-hidden rounded-xl border border-border bg-card">
		{#each works as work (work.workId)}
			<li
				class="relative flex min-h-14 items-start justify-between gap-3 border-l-2 p-3.5 transition-colors {work.status ===
				'rejected'
					? 'border-l-state-rejected bg-state-rejected/[0.04] hover:bg-state-rejected/[0.07]'
					: work.status === 'approved'
						? 'border-l-state-approved hover:bg-state-approved/[0.05]'
						: work.status === 'in_progress'
							? 'border-l-state-attention hover:bg-state-attention/[0.05]'
							: 'border-l-state-pending/70 hover:bg-muted/30'}"
			>
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
				? 'Cola de revisión y carga de tus servicios.'
				: 'Estado global de la operación y bloqueos que requieren atención.'}
	>
		{#if role === 'admin'}
			<Button href={resolve('/(app)/admin/services')} variant="outline" size="sm">Servicios</Button>
			<Button href={resolve('/(app)/admin/users')} variant="outline" size="sm">Usuarios</Button>
			<Button href={resolve('/(app)/admin/catalogs')} variant="outline" size="sm">Catálogos</Button>
			<Button href={resolve('/(app)/contracts')} variant="outline" size="sm">Contratos</Button>
		{:else if role === 'supervisor'}
			<Button href={resolve('/(app)/reviews')} variant="outline" size="sm">Revisar cola</Button>
			<Button href={resolve('/(app)/services')} variant="outline" size="sm">Servicios</Button>
		{/if}
	</PageIntro>

	{#if role === 'technician'}
		<section aria-label="Tu resumen" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<MetricCard label="Servicios activos" value={data.summary.serviceCount} Icon={Building2} />
			<MetricCard label="Aprobados" Icon={CircleCheck} tone="teal">
				<ProgressMeter
					approved={data.summary.workApproved}
					total={data.summary.workTotal}
					percent={workPercent}
					completed={data.summary.workTotal > 0 &&
						data.summary.workApproved === data.summary.workTotal}
				/>
			</MetricCard>
			<MetricCard
				label="Por corregir"
				value={rejected.length}
				Icon={TriangleAlert}
				tone={rejected.length > 0 ? 'rejected' : 'neutral'}
			/>
			<MetricCard
				label="En curso"
				value={inProgress.length}
				Icon={Clock3}
				tone={inProgress.length > 0 ? 'attention' : 'neutral'}
			/>
		</section>

		{#if rejected.length > 0}
			<section class="space-y-2">
				<h2
					class="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>
					<span class="h-3 w-0.5 rounded-full bg-state-rejected" aria-hidden="true"></span>
					Requiere tu atención
				</h2>
				{@render workList(visibleRejected)}
				{#if remainingRejected > 0}
					<Button href={resolve('/(app)/services')} variant="ghost" size="sm">
						{remainingRejected === 1
							? 'Ver el restante en Servicios'
							: `Ver los ${remainingRejected} restantes en Servicios`}
					</Button>
				{/if}
			</section>
		{/if}
		{#if inProgress.length > 0}
			<section class="space-y-2">
				<h2
					class="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>
					<span class="h-3 w-0.5 rounded-full bg-state-attention" aria-hidden="true"></span>
					Pendientes
				</h2>
				{@render workList(visibleInProgress)}
				{#if remainingInProgress > 0}
					<Button href={resolve('/(app)/services')} variant="ghost" size="sm">
						{remainingInProgress === 1
							? 'Ver el restante en Servicios'
							: `Ver los ${remainingInProgress} restantes en Servicios`}
					</Button>
				{/if}
			</section>
		{/if}
		{#if data.attention.length === 0}
			{#if data.summary.serviceCount === 0}
				<EmptyState
					Icon={Building2}
					tone="neutral"
					title="Sin servicios asignados"
					description="Cuando te asignen un servicio, tus trabajos aparecerán aquí."
				/>
			{:else}
				<EmptyState
					Icon={CircleCheck}
					tone="approved"
					title="No tienes evidencia pendiente"
					description="Buen trabajo. Cuando necesites continuar, tus trabajos aparecerán aquí."
				/>
			{/if}
		{/if}

		{#if data.summary.serviceCount > 0}
			<RecentEvidence photos={data.recentPhotos} />
		{/if}
	{:else}
		<section
			aria-label="Resumen operativo"
			class="grid grid-cols-2 gap-3 sm:grid-cols-3 {role === 'admin'
				? 'xl:grid-cols-6'
				: 'xl:grid-cols-5'}"
		>
			{#if role === 'admin'}
				<MetricCard
					label="Contratos activos"
					value={data.summary.contractCount ?? 0}
					Icon={ShieldCheck}
				/>
				<MetricCard label="Servicios activos" value={data.summary.serviceCount} Icon={Building2} />
				<MetricCard
					label="Usuarios activos"
					value={data.summary.activeUsers ?? 0}
					Icon={Users}
					tone="neutral"
				/>
				<MetricCard
					label="Revisiones pendientes"
					value={data.summary.pendingReviews}
					Icon={ClipboardCheck}
					tone={data.summary.pendingReviews > 0 ? 'pending' : 'neutral'}
				/>
				<MetricCard
					label="Aprobados 7 días"
					value={data.summary.approvedLast7}
					Icon={CircleCheck}
					tone="teal"
				/>
				<MetricCard
					label="Rechazados"
					value={data.summary.statusCounts.rejected}
					Icon={TriangleAlert}
					tone={data.summary.statusCounts.rejected > 0 ? 'rejected' : 'neutral'}
				/>
			{:else}
				<MetricCard label="Servicios activos" value={data.summary.serviceCount} Icon={Building2} />
				<MetricCard
					label="Revisiones pendientes"
					value={data.summary.pendingReviews}
					Icon={ClipboardCheck}
					tone={data.summary.pendingReviews > 0 ? 'pending' : 'neutral'}
				/>
				<MetricCard
					label="Por corregir"
					value={data.summary.statusCounts.rejected}
					Icon={TriangleAlert}
					tone={data.summary.statusCounts.rejected > 0 ? 'rejected' : 'neutral'}
				/>
				<MetricCard
					label="Aprobados 7 días"
					value={data.summary.approvedLast7}
					Icon={CircleCheck}
					tone="teal"
				/>
				<MetricCard
					label="Antigüedad máxima"
					value={oldestPendingLabel}
					Icon={Clock3}
					tone={data.summary.pendingReviews > 0 ? 'attention' : 'neutral'}
				/>
			{/if}
		</section>

		<div class="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
			<StatusSpectrum counts={data.summary.statusCounts} />
			<ReviewTrend points={data.trend} />
		</div>

		<div class="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
			{#if role === 'admin'}
				<ScopePulse
					kind="contract"
					title="Contratos"
					description="Volumen, avance y bloqueos por contrato"
					items={data.contractPulse.map((contract) => ({
						id: contract.contractId,
						name: contract.name,
						serviceCount: contract.serviceCount,
						totalTargets: contract.totalTargets,
						approvedTargets: contract.approvedTargets,
						pendingReviews: contract.pendingReviews,
						rejectedTargets: contract.rejectedTargets,
						lastActivity: contract.lastActivity
					}))}
				/>
			{:else}
				<ScopePulse
					kind="service"
					title="Servicios a tu cargo"
					description="Carga, avance y atención por servicio"
					items={data.servicePulse.map((service) => ({
						id: service.serviceId,
						name: service.name,
						totalTargets: service.totalTargets,
						approvedTargets: service.approvedTargets,
						pendingReviews: service.pendingReviews,
						rejectedTargets: service.rejectedTargets,
						lastActivity: service.lastActivity
					}))}
				/>
			{/if}

			<ReviewQueue items={data.pending} total={data.pendingTotal} />
		</div>

		<div class="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
			<RecentDecisions decisions={data.recentDecisions} />
			{#if data.summary.serviceCount > 0}
				<RecentEvidence photos={data.recentPhotos} layout="grid" />
			{/if}
		</div>
	{/if}
</div>
