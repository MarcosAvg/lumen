<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import { Button } from '#lib/components/ui/button';

	/**
	 * Borrado destructivo con diálogo: consulta el impacto y exige confirmación
	 * explícita. `GET endpoint` devuelve el impacto y `DELETE endpoint` ejecuta.
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

	let open = $state(false);
	let loading = $state(false);
	let working = $state(false);
	let impact = $state<Impact | null>(null);
	let error = $state<string | null>(null);

	async function ask() {
		loading = true;
		error = null;
		impact = null;
		open = true;
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
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			loading = false;
		}
	}

	async function confirm() {
		working = true;
		error = null;
		try {
			const response = await fetch(endpoint, { method: 'DELETE' });
			const body = (await response.json().catch(() => ({}))) as { message?: string };
			if (!response.ok) throw new Error(body.message ?? 'No se pudo eliminar.');
			open = false;
			toast.success(`«${itemName}» eliminado.`);
			if (onDeleted) {
				onDeleted();
			} else {
				await invalidateAll();
			}
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			working = false;
		}
	}
</script>

<Button type="button" variant="destructive" size="sm" onclick={ask}>{label}</Button>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>¿Eliminar «{itemName}»?</AlertDialog.Title>
			<AlertDialog.Description>
				Esta acción es permanente y borrará la evidencia, entregas y fotos del ámbito.
				{#if description}
					{description}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>

		{#if loading}
			<p class="text-sm text-muted-foreground">Calculando impacto…</p>
		{:else if impact}
			<p class="text-sm text-muted-foreground">
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

		{#if error}
			<p class="text-sm text-destructive">{error}</p>
		{/if}

		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={working}>Cancelar</AlertDialog.Cancel>
			<Button variant="destructive" disabled={working || loading || !impact} onclick={confirm}>
				{working ? 'Eliminando…' : 'Confirmar eliminación'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
