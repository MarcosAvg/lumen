<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '#lib/components/ui/button';

	/** Vista de error amable, en español, con salida y reintento. */
	let { status, message }: { status: number; message?: string } = $props();

	const info = $derived.by(() => {
		if (status === 404)
			return {
				title: 'No encontrado',
				description: message ?? 'El recurso no existe o está fuera de tu ámbito.'
			};
		if (status === 403)
			return {
				title: 'Sin permisos',
				description: message ?? 'No tienes acceso a esta sección con tu cuenta actual.'
			};
		if (status >= 500)
			return {
				title: 'Algo salió mal',
				description: message ?? 'Vuelve a intentarlo; si persiste, avisa a administración.'
			};
		return { title: 'Ha ocurrido un error', description: message ?? '' };
	});
</script>

<div class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
	<p class="tnum text-sm font-medium text-muted-foreground">{status}</p>
	<h1 class="text-2xl font-semibold tracking-tight">{info.title}</h1>
	{#if info.description}
		<p class="max-w-prose text-sm text-muted-foreground">{info.description}</p>
	{/if}
	<div class="mt-1 flex flex-wrap items-center justify-center gap-2">
		<Button href={resolve('/(app)/dashboard')}>Ir al inicio</Button>
		<Button variant="outline" onclick={() => invalidateAll()}>Reintentar</Button>
	</div>
</div>
