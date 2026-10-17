<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';

	/**
	 * Renombrar un ítem (catálogo, elemento, requisito) en un modal pequeño, en
	 * lugar de un campo siempre visible por fila.
	 */
	let {
		action,
		hiddenName,
		id,
		currentName,
		fieldName = 'name',
		label = 'Renombrar'
	}: {
		action: string;
		hiddenName: string;
		id: string;
		currentName: string;
		fieldName?: string;
		label?: string;
	} = $props();

	let open = $state(false);
	let value = $state(untrack(() => currentName));
	const inputId = $derived(`rename-${id}`);
</script>

<Button type="button" variant="outline" size="sm" onclick={() => (open = true)}>{label}</Button>

<Dialog.Root bind:open>
	<Dialog.Content size="sm">
		<form method="POST" {action} class="flex min-h-0 flex-1 flex-col">
			<input type="hidden" name={hiddenName} value={id} />
			<Dialog.Header>
				<Dialog.Title>Renombrar</Dialog.Title>
				<Dialog.Description>
					Al cambiar el nombre, si estaba vinculado a un catálogo queda desvinculado y conserva este
					nombre propio.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="space-y-5">
				<div class="space-y-2">
					<Label for={inputId}>Nombre</Label>
					<Input id={inputId} name={fieldName} bind:value required />
				</div>
			</Dialog.Body>
			<Dialog.Footer>
				<Dialog.Close>Cancelar</Dialog.Close>
				<Button type="submit">Guardar</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
