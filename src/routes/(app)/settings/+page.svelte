<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let supported = $state(false);
	let permission = $state<NotificationPermission>('default');
	let currentEndpoint = $state<string | null>(null);
	let checked = $state(false);
	let busy = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	const configured = $derived(data.push.configured);

	onMount(async () => {
		supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
		if (!supported) {
			checked = true;
			return;
		}
		permission = Notification.permission;
		const registration = await navigator.serviceWorker.ready.catch(() => null);
		const subscription = await registration?.pushManager.getSubscription();
		currentEndpoint = subscription?.endpoint ?? null;
		checked = true;
	});

	function urlBase64ToUint8Array(base64: string): Uint8Array {
		const padding = '='.repeat((4 - (base64.length % 4)) % 4);
		const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
		const raw = atob(normalized);
		const output = new Uint8Array(raw.length);
		for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
		return output;
	}

	async function enable() {
		busy = true;
		message = null;
		error = null;
		try {
			if (!configured || !data.push.publicKey) {
				throw new Error('Web Push no está configurado en el servidor.');
			}
			const permissionResult = await Notification.requestPermission();
			permission = permissionResult;
			if (permissionResult !== 'granted') {
				throw new Error('Permiso de notificaciones denegado por el navegador.');
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(data.push.publicKey) as BufferSource
			});
			const json = subscription.toJSON();
			const response = await fetch('/api/push/subscriptions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as { message?: string };
				throw new Error(body.message ?? 'No se pudo registrar la suscripción.');
			}
			currentEndpoint = subscription.endpoint;
			message = 'Notificaciones push activadas en este dispositivo.';
			await invalidateAll();
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}

	async function disable() {
		busy = true;
		message = null;
		error = null;
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (subscription) {
				await fetch('/api/push/subscriptions', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ endpoint: subscription.endpoint })
				});
				await subscription.unsubscribe();
			}
			currentEndpoint = null;
			message = 'Suscripción de este dispositivo eliminada.';
			await invalidateAll();
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Ajustes · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Ajustes" description="Notificaciones y preferencias de tu cuenta." />

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Notificaciones push</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-3 text-sm">
			<p class="text-muted-foreground">
				La bandeja interna funciona siempre, aunque el push esté desactivado. El push solo envía un
				aviso al dispositivo; el contenido se consulta en Lumen con conexión.
			</p>

			{#if message}
				<Alert><AlertDescription>{message}</AlertDescription></Alert>
			{/if}
			{#if error}
				<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<Badge variant={configured ? 'secondary' : 'destructive'}>
					{configured ? 'Push configurado' : 'Push no configurado'}
				</Badge>
				{#if checked}
					<Badge variant="secondary">
						{#if !supported}No soportado{:else}Permiso: {permission}{/if}
					</Badge>
					{#if currentEndpoint}<Badge>Este dispositivo suscrito</Badge>{/if}
				{/if}
			</div>

			{#if !configured}
				<p class="text-muted-foreground">
					Una persona administradora debe definir <code>VAPID_PUBLIC_KEY</code>,
					<code>VAPID_PRIVATE_KEY</code> y <code>VAPID_SUBJECT</code> en el servidor.
				</p>
			{:else if !supported}
				<p class="text-muted-foreground">
					Este navegador no admite notificaciones push. En iPhone/iPad suele requerir añadir Lumen a
					la pantalla de inicio y activarlo desde esa instalación.
				</p>
			{:else}
				{#if currentEndpoint}
					<Button type="button" variant="outline" disabled={busy} onclick={disable}>
						{busy ? 'Procesando…' : 'Quitar suscripción de este dispositivo'}
					</Button>
				{:else}
					<Button type="button" disabled={busy} onclick={enable}>
						{busy ? 'Procesando…' : 'Activar notificaciones push en este dispositivo'}
					</Button>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
