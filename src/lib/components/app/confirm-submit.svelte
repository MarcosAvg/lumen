<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import { Button } from '#lib/components/ui/button';

	/**
	 * Acción con confirmación en `AlertDialog`. El disparador abre el diálogo y
	 * la confirmación envía el formulario nativo (POST) con los campos ocultos.
	 */
	let {
		action,
		fields,
		label,
		title,
		description,
		confirmLabel = 'Confirmar',
		variant = 'outline',
		size = 'sm'
	}: {
		action: string;
		fields: Record<string, string>;
		label: string;
		title: string;
		description: string;
		confirmLabel?: string;
		variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
		size?: 'sm' | 'default';
	} = $props();

	let open = $state(false);
</script>

<Button type="button" {variant} {size} onclick={() => (open = true)}>{label}</Button>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
			<form method="POST" {action}>
				{#each Object.entries(fields) as [name, value] (name)}
					<input type="hidden" {name} {value} />
				{/each}
				<Button type="submit" variant={variant === 'outline' ? 'default' : variant}>
					{confirmLabel}
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
