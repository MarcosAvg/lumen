<script lang="ts">
	import { resolve } from '$app/paths';
	import EvidenceCapture from '#lib/components/evidence/evidence-capture.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.element.name} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<p class="text-sm text-muted-foreground">
			<a
				class="underline"
				href={resolve('/(app)/services/[serviceId]', { serviceId: data.element.serviceId })}
				>{data.element.serviceName}</a
			>
			·
			<a class="underline" href={resolve('/(app)/works/[workId]', { workId: data.element.workId })}
				>{data.element.workName}</a
			>
		</p>
		<h1 class="text-2xl font-semibold tracking-tight">{data.element.name}</h1>
		{#if data.element.description}
			<p class="text-sm text-muted-foreground">{data.element.description}</p>
		{/if}
	</div>

	<EvidenceCapture
		targetId={data.evidence.target.id}
		label="Evidencia actual"
		status={data.evidence.target.status}
		editable={data.editable}
		version={data.evidence.target.version}
		requirements={data.evidence.requirements}
		photos={data.evidence.photos}
		isAdmin={data.isAdmin}
	/>
</div>
