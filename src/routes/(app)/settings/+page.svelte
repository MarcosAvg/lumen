<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { mode, resetMode, setMode, userPrefersMode } from 'mode-watcher';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import PageIntro from '#lib/components/app/page-intro.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const roleLabel = {
		admin: 'Administrador',
		supervisor: 'Supervisor',
		technician: 'Técnico'
	} as const;

	let supported = $state(false);
	let permission = $state<NotificationPermission>('default');
	let currentEndpoint = $state<string | null>(null);
	let checked = $state(false);
	let busy = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	const configured = $derived(data.push.configured);
	const testMessage = $derived(form && 'testMessage' in form ? form.testMessage : null);
	const testError = $derived(form && 'testError' in form ? form.testError : null);

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
	<title>Perfil · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<PageIntro description="Tu cuenta, notificaciones y preferencias." />

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Cuenta</Card.Title></Card.Header>
		<Card.Content class="space-y-3">
			<div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
				<span class="flex items-baseline gap-1.5">
					<span class="text-muted-foreground">Nombre</span>
					<span class="font-medium text-foreground">{data.user.displayName}</span>
				</span>
				<span class="flex items-baseline gap-1.5">
					<span class="text-muted-foreground">Usuario</span>
					<span class="font-medium text-foreground">{data.user.username}</span>
				</span>
				<Badge variant="secondary">{roleLabel[data.user.role]}</Badge>
			</div>
			<form method="POST" action="/logout">
				<Button type="submit" variant="outline">Cerrar sesión</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Apariencia</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-3">
			<p class="text-sm text-muted-foreground">
				Elige cómo se muestra Lumen en este dispositivo. «Sistema» sigue la preferencia del
				dispositivo.
			</p>
			<div class="flex flex-wrap gap-2" role="group" aria-label="Tema de la interfaz">
				<Button
					variant={userPrefersMode.current === 'light' ? 'default' : 'outline'}
					aria-pressed={userPrefersMode.current === 'light'}
					onclick={() => setMode('light')}
				>
					<Sun aria-hidden="true" />
					Claro
				</Button>
				<Button
					variant={userPrefersMode.current === 'dark' ? 'default' : 'outline'}
					aria-pressed={userPrefersMode.current === 'dark'}
					onclick={() => setMode('dark')}
				>
					<Moon aria-hidden="true" />
					Oscuro
				</Button>
				<Button
					variant={userPrefersMode.current === 'system' ? 'default' : 'outline'}
					aria-pressed={userPrefersMode.current === 'system'}
					onclick={resetMode}
				>
					<Monitor aria-hidden="true" />
					Sistema
				</Button>
			</div>
			<p class="text-xs text-muted-foreground">
				Modo actual: {mode.current === 'dark' ? 'oscuro' : 'claro'}.
			</p>
		</Card.Content>
	</Card.Root>

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
			{#if testMessage}
				<Alert role="status"><AlertDescription>{testMessage}</AlertDescription></Alert>
			{/if}
			{#if testError}
				<Alert variant="destructive"><AlertDescription>{testError}</AlertDescription></Alert>
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
				<div class="flex flex-wrap gap-2">
					{#if currentEndpoint}
						<Button type="button" variant="outline" disabled={busy} onclick={disable}>
							{busy ? 'Procesando…' : 'Quitar suscripción de este dispositivo'}
						</Button>
					{:else}
						<Button type="button" disabled={busy} onclick={enable}>
							{busy ? 'Procesando…' : 'Activar notificaciones push en este dispositivo'}
						</Button>
					{/if}
					<form method="POST" action="?/test">
						<Button type="submit" variant="outline" disabled={busy}>
							Enviar notificación de prueba
						</Button>
					</form>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
