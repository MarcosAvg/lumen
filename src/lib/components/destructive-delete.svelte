<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';

	/**
	 * Borrado destructivo con resumen de impacto y confirmación explícita.
	 * Consulta `GET endpoint` para el impacto y ejecuta `DELETE endpoint`.
	 */
	type Impact = {
		works: number;
		elements: number;
		targets: number;
		submissions: number;
		photos: number;
		activePhotos: number;
		notifications?: number;
	};

	let {
		label,
		endpoint,
		itemName,
		description,
		onDeleted
	}: {
		label: string;
		endpoint: string;
		itemName: string;
		description?: string;
		onDeleted?: () => void;
	} = $props();

	let phase = $state<'idle' | 'loading' | 'confirm' | 'working'>('idle');
	let impact = $state<Impact | null>(null);
	let error = $state<string | null>(null);

	async function ask() {
		phase = 'loading';
		error = null;
		try {
			const response = await fetch(endpoint, { method: 'GET' });
			const body = (await response.json().catch(() => ({}))) as {
				impact?: Impact;
				message?: string;
			};
			if (!response.ok || !body.impact) {
				throw new Error(body.message ?? 'No se pudo calcular el impacto.');
			}
			impact = body.impact;
			phase = 'confirm';
		} catch (cause) {
			error = (cause as Error).message;
			phase = 'idle';
		}
	}

	async function confirm() {
		phase = 'working';
		error = null;
		try {
			const response = await fetch(endpoint, { method: 'DELETE' });
			const body = (await response.json().catch(() => ({}))) as { message?: string };
			if (!response.ok) throw new Error(body.message ?? 'No se pudo eliminar.');
			if (onDeleted) {
				onDeleted();
			} else {
				await invalidateAll();
			}
		} catch (cause) {
			error = (cause as Error).message;
			phase = 'confirm';
		}
	}

	function cancel() {
		phase = 'idle';
		impact = null;
		error = null;
	}
</script>

{#if phase === 'idle' || phase === 'loading'}
	<Button
		type="button"
		variant="destructive"
		size="sm"
		disabled={phase === 'loading'}
		onclick={ask}
	>
		{phase === 'loading' ? 'Calculando…' : label}
	</Button>
	{#if error}
		<p class="mt-1 text-xs text-destructive">{error}</p>
	{/if}
{:else}
	<div class="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
		<p class="font-medium">¿Eliminar «{itemName}»?</p>
		{#if description}
			<p class="text-muted-foreground">{description}</p>
		{/if}
		{#if impact}
			<p class="mt-1 text-muted-foreground">
				Se perderán de forma permanente:
				{#if impact.works > 0}{impact.works} trabajo(s),
				{/if}
				{#if impact.elements > 0}{impact.elements} elemento(s),
				{/if}
				{impact.targets} objetivo(s), {impact.submissions} entrega(s) y {impact.photos} foto(s) ({impact.activePhotos}
				vigente(s)).{#if impact.notifications}
					Se eliminarán {impact.notifications} notificación(es) vinculada(s).{/if}
			</p>
		{/if}
		<div class="mt-2 flex gap-2">
			<Button
				type="button"
				variant="destructive"
				size="sm"
				disabled={phase === 'working'}
				onclick={confirm}
			>
				{phase === 'working' ? 'Eliminando…' : 'Confirmar eliminación'}
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={phase === 'working'}
				onclick={cancel}
			>
				Cancelar
			</Button>
		</div>
		{#if error}
			<Alert variant="destructive" class="mt-2"><AlertDescription>{error}</AlertDescription></Alert>
		{/if}
	</div>
{/if}
