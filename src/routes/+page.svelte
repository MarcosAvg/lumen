<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const label = {
		database: { up: 'Operativa', down: 'Sin conexión' },
		migrations: { applied: 'Aplicadas', pending: 'Pendientes', unknown: 'Desconocido' }
	} as const;
</script>

<svelte:head>
	<title>Lumen</title>
</svelte:head>

<main class="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">Lumen</h1>
		<p class="text-sm text-neutral-600">
			Gestiona la evidencia fotográfica de tus servicios y su revisión. Esta es la base de la Etapa
			0: infraestructura, base de datos y salud del sistema.
		</p>
	</header>

	<section aria-labelledby="estado-title" class="rounded-lg border border-neutral-200 p-4">
		<h2 id="estado-title" class="mb-3 text-sm font-medium">Estado del sistema</h2>
		<dl class="grid grid-cols-2 gap-y-2 text-sm">
			<dt class="text-neutral-500">Base de datos</dt>
			<dd class="font-medium">{label.database[data.health.database]}</dd>

			<dt class="text-neutral-500">Migraciones</dt>
			<dd class="font-medium">{label.migrations[data.health.migrations]}</dd>

			<dt class="text-neutral-500">Configuración inicial</dt>
			<dd class="font-medium">
				{data.health.setupRequired ? 'Pendiente' : 'Completada'}
			</dd>
		</dl>
	</section>

	{#if data.health.status !== 'ok'}
		<p class="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="status">
			El sistema no está listo. Revisa la conexión a la base de datos y aplica las migraciones
			pendientes.
		</p>
	{/if}
</main>
