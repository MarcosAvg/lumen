<script lang="ts">
	import { onMount } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '#lib/components/ui/button';

	/**
	 * Aviso de instalación de la PWA (solo móvil). En Android/Chrome usa
	 * `beforeinstallprompt`; en iOS muestra los pasos (no hay evento). Se puede
	 * descartar y no vuelve a aparecer.
	 */
	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	const STORAGE_KEY = 'lumen-install-dismissed';

	let deferred = $state<BeforeInstallPromptEvent | null>(null);
	let iosHint = $state(false);
	let visible = $state(false);

	onMount(() => {
		if (window.matchMedia('(display-mode: standalone)').matches) return;
		if (localStorage.getItem(STORAGE_KEY) === '1') return;

		const onPrompt = (event: Event) => {
			event.preventDefault();
			deferred = event as BeforeInstallPromptEvent;
			visible = true;
		};
		window.addEventListener('beforeinstallprompt', onPrompt);

		const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
		if (isIos) {
			iosHint = true;
			visible = true;
		}

		return () => window.removeEventListener('beforeinstallprompt', onPrompt);
	});

	function dismiss() {
		localStorage.setItem(STORAGE_KEY, '1');
		visible = false;
	}

	async function install() {
		if (!deferred) return;
		await deferred.prompt();
		await deferred.userChoice;
		deferred = null;
		visible = false;
	}
</script>

{#if visible}
	<div
		class="mb-4 flex items-start gap-3 rounded-xl border border-border bg-card p-3 md:hidden"
		role="status"
	>
		<div class="min-w-0 flex-1 space-y-1">
			<p class="text-sm font-medium">Instala Lumen en tu teléfono</p>
			<p class="text-xs text-muted-foreground">
				{iosHint
					? 'Toca Compartir y luego «Añadir a pantalla de inicio».'
					: 'Accede más rápido y recibe avisos como una app.'}
			</p>
			{#if deferred}
				<Button size="sm" onclick={install}>Instalar</Button>
			{/if}
		</div>
		<Button variant="ghost" size="icon-sm" aria-label="Descartar aviso" onclick={dismiss}>
			<X />
		</Button>
	</div>
{/if}
