<script lang="ts">
	import './layout.css';
	import { ModeWatcher, mode } from 'mode-watcher';
	import OfflineBanner from '#lib/components/offline-banner.svelte';
	import { Toaster } from '#lib/components/ui/sonner';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const themeColors = { light: '#f6f7f9', dark: '#15181d' };

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
