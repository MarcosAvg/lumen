<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Aviso de sin conexión. Lumen es **online-only**: no encola cambios ni
	 * simula envíos pendientes; solo informa de que las acciones fallarán.
	 */
	let offline = $state(false);

	onMount(() => {
		const update = () => {
			offline = !navigator.onLine;
		};
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});
</script>

{#if offline}
	<div
		role="status"
		class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground"
	>
		<span>Sin conexión. Los cambios no se guardarán hasta que vuelvas a conectarte.</span>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="font-medium underline underline-offset-2" href="/offline.html">
			Ver datos sin conexión
		</a>
	</div>
{/if}
