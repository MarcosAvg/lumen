<script lang="ts">
	import './layout.css';
	import { ModeWatcher, mode } from 'mode-watcher';
	import OfflineBanner from '#lib/components/offline-banner.svelte';
	import { Toaster } from '#lib/components/ui/sonner';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// La barra del sistema (notificaciones/estado) usa el azul de marca, no el
	// fondo de la página, para que la PWA instalada se reconozca como Lumen.
	const themeColors = { light: '#1e4b8d', dark: '#0f172a' };

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
<OfflineBanner />
{@render children()}
<Toaster />
