<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
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
</script>

<svelte:head>
	<title>Notificaciones · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Notificaciones</h1>
		{#if data.items.some((item) => !item.readAt)}
			<form method="POST" action="?/readAll">
				<Button type="submit" variant="outline" size="sm">Marcar todas como leídas</Button>
			</form>
		{/if}
	</div>

	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}
	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}

	{#if data.items.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-sm text-muted-foreground">
				No tienes notificaciones.
			</Card.Content>
		</Card.Root>
	{:else}
		<ul class="space-y-3">
			{#each data.items as item (item.id)}
				<li>
					<Card.Root class={item.readAt ? 'opacity-70' : ''}>
						<Card.Content class="flex flex-wrap items-start justify-between gap-3 py-4">
							<div class="min-w-0 flex-1">
								<p class="flex items-center gap-2 font-medium">
									{item.title}
									<Badge variant="secondary">{eventLabel[item.eventType]}</Badge>
									{#if !item.readAt}<Badge>Sin leer</Badge>{/if}
								</p>
								<p class="truncate text-sm text-muted-foreground">{item.body}</p>
								<p class="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
							</div>
							<div class="flex items-center gap-2">
								<Button href={item.deepLink} variant="outline" size="sm">Abrir</Button>
								{#if !item.readAt}
									<form method="POST" action="?/read">
										<input type="hidden" name="notificationId" value={item.id} />
										<Button type="submit" variant="ghost" size="sm">Marcar leído</Button>
									</form>
								{/if}
							</div>
						</Card.Content>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="text-xs text-muted-foreground">
		¿Quieres recibir avisos en el dispositivo? Configúralo en
		<a class="underline" href={resolve('/(app)/settings')}>Ajustes</a>.
	</p>

	{#if totalPages > 1}
		<div class="flex items-center justify-between gap-3">
			<span class="text-sm text-muted-foreground">Página {data.page} de {totalPages}</span>
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
