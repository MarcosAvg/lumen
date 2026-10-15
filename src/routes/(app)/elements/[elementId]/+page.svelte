<script lang="ts">
	import { resolve } from '$app/paths';
	import AppBreadcrumbs from '#lib/components/app/app-breadcrumbs.svelte';
	import EvidenceCapture from '#lib/components/evidence/evidence-capture.svelte';
	import type { CatalogGroup } from '#lib/components/catalog/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const crumbs = $derived([
		{ label: 'Inicio', href: resolve('/(app)/dashboard') },
		{
			label: data.element.serviceName,
			href: resolve('/(app)/services/[serviceId]', { serviceId: data.element.serviceId })
		},
		{
			label: data.element.workName,
			href: resolve('/(app)/works/[workId]', { workId: data.element.workId })
		},
		{ label: data.element.name }
	]);

	const requirementCatalogs = $derived<CatalogGroup[]>(
		data.catalogs
			.filter((catalog) => catalog.purpose === 'requirements')
			.map((catalog) => ({
				id: catalog.id,
				name: catalog.name,
				items: catalog.items.map((item) => ({ id: item.id, name: item.name }))
			}))
	);
</script>

<svelte:head>
	<title>{data.element.name} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<AppBreadcrumbs items={crumbs} />
		<h1 class="mt-2 text-xl font-semibold tracking-tight lg:text-3xl">{data.element.name}</h1>
		{#if data.element.description}
			<p class="line-clamp-2 text-sm text-muted-foreground">{data.element.description}</p>
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
		history={data.history}
		rejection={data.rejection}
		isAdmin={data.isAdmin}
		{requirementCatalogs}
	/>
</div>
