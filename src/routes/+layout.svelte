<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import OfflineBanner from '#lib/components/offline-banner.svelte';
	import WcoTitlebar from '#lib/components/app/wco-titlebar.svelte';
	import { Toaster } from '#lib/components/ui/sonner';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Los resultados de acciones de formulario se muestran como toast una sola
	// vez. Los errores de validación siguen inline, junto a su formulario.
	let lastForm: unknown;
	$effect(() => {
		const form = page.form as Record<string, unknown> | null;
		if (form === lastForm) return;
		lastForm = form;
		const success = form?.success;
		if (typeof success === 'string' && success.trim()) toast.success(success);
	});

	// La barra del sistema usa el mismo color que el canvas para integrarse con
	// la app. Los valores hex son el equivalente sRGB de `--background`.
	const themeColors = { light: '#edf2f6', dark: '#252930' };

	$effect(() => {
		const themeColor = document.querySelector('meta[name="theme-color"]');
		if (themeColor) {
			themeColor.setAttribute(
				'content',
				mode.current === 'dark' ? themeColors.dark : themeColors.light
			);
		}
	});
</script>

<ModeWatcher disableHeadScriptInjection />
<WcoTitlebar />
<OfflineBanner />
{@render children()}
<Toaster
	position="bottom-right"
	mobileOffset={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
	closeButton
/>
