<script lang="ts">
	import './layout.css';
	import { ModeWatcher, mode } from 'mode-watcher';
	import OfflineBanner from '#lib/components/offline-banner.svelte';
	import { Toaster } from '#lib/components/ui/sonner';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// La barra del sistema usa el mismo color que el canvas para integrarse con
	// la app. Los valores hex son el equivalente sRGB de `--background`.
	const themeColors = { light: '#edf2f6', dark: '#070a10' };

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
