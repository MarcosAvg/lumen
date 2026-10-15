<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Table from '#lib/components/ui/table';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import DataTable from '#lib/components/app/data-table.svelte';
	import type { PageProps } from './$types';

	type ActionData = { success?: string; message?: string };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);

	const eventLabel = {
		'submission.submitted': 'Nueva entrega',
		'submission.approved': 'Aprobada',
		'submission.rejected': 'Rechazada'
	} as const;

	function formatDate(value: Date | string): string {
		return new Date(value).toLocaleString();
	}

	const totalPages = $derived(Math.max(Math.ceil(data.total / data.pageSize), 1));
	const unread = $derived(data.items.some((item) => !item.readAt));
</script>

<svelte:head>
	<title>Notificaciones · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Notificaciones" description="Avisos de entregas y revisiones."
		>{#if unread}
			<form method="POST" action="?/readAll">
				<Button type="submit" variant="outline" size="sm">Marcar todas como leídas</Button>
			</form>
		{/if}</PageHeader
	>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	{#if data.items.length === 0}
		<EmptyState
			title="No tienes notificaciones"
			description="Aquí verás las entregas y revisiones."
		/>
	{:else}
		<DataTable>
			<Table.Header>
				<Table.Row>
					<Table.Head>Notificación</Table.Head>
					<Table.Head class="hidden lg:table-cell">Tipo</Table.Head>
					<Table.Head class="hidden lg:table-cell">Fecha</Table.Head>
					<Table.Head class="w-px text-right">Acciones</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.items as item (item.id)}
					<Table.Row class={item.readAt ? 'opacity-60' : ''}>
						<Table.Cell class="whitespace-normal">
							<div class="flex items-center gap-2 font-medium text-foreground">
								{item.title}
								{#if !item.readAt}<Badge class="lg:hidden">Sin leer</Badge>{/if}
							</div>
							<p class="line-clamp-1 text-sm text-muted-foreground">{item.body}</p>
						</Table.Cell>
						<Table.Cell class="hidden lg:table-cell">
							<Badge variant="secondary">{eventLabel[item.eventType]}</Badge>
							{#if !item.readAt}<Badge class="ml-1">Sin leer</Badge>{/if}
						</Table.Cell>
						<Table.Cell class="tnum hidden text-muted-foreground lg:table-cell">
							{formatDate(item.createdAt)}
						</Table.Cell>
						<Table.Cell class="text-right">
							<div class="flex items-center justify-end gap-2">
								<Button href={item.deepLink} variant="outline" size="sm">Abrir</Button>
								{#if !item.readAt}
									<form method="POST" action="?/read">
										<input type="hidden" name="notificationId" value={item.id} />
										<Button type="submit" variant="ghost" size="sm">Marcar leído</Button>
									</form>
								{/if}
							</div>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</DataTable>
	{/if}

	<p class="text-xs text-muted-foreground">
		¿Quieres recibir avisos en el dispositivo? Configúralo en
		<a class="underline" href={resolve('/(app)/settings')}>Ajustes</a>.
	</p>

	{#if totalPages > 1}
		<div class="flex items-center justify-between gap-3">
			<span class="tnum text-sm text-muted-foreground">Página {data.page} de {totalPages}</span>
			<div class="flex gap-2">
				{#if data.page > 1}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<Button href={`?page=${data.page - 1}`} variant="outline" size="sm">Anterior</Button>
				{/if}
				{#if data.page < totalPages}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<Button href={`?page=${data.page + 1}`} variant="outline" size="sm">Siguiente</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
