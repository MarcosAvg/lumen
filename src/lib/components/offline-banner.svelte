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
		class="bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground"
	>
		Sin conexión. Lumen necesita red; los cambios no se guardarán hasta que vuelvas a conectarte.
	</div>
{/if}
