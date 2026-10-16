<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import { LabeledCheckbox } from '#lib/components/ui/labeled-checkbox';

	/**
	 * Configuración de exportación: variante del registro (simple/extendida) y
	 * qué incluir en el ZIP (registro y/o fotografías). Recuerda la última
	 * elección en el dispositivo.
	 */
	let {
		href,
		label = 'Exportar ZIP',
		class: className = ''
	}: { href: string; label?: string; class?: string } = $props();

	type Variant = 'simple' | 'extended';

	const STORAGE_KEY = 'lumen.export.options';

	let open = $state(false);
	let variant = $state<Variant>('extended');
	let includeXlsx = $state(true);
	let includePhotos = $state(true);
	let includePdf = $state(true);

	onMount(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw) as Partial<{
				variant: Variant;
				xlsx: boolean;
				photos: boolean;
				pdf: boolean;
			}>;
			if (saved.variant === 'simple' || saved.variant === 'extended') variant = saved.variant;
			if (typeof saved.xlsx === 'boolean') includeXlsx = saved.xlsx;
			if (typeof saved.photos === 'boolean') includePhotos = saved.photos;
			if (typeof saved.pdf === 'boolean') includePdf = saved.pdf;
		} catch {
			// Preferencias no críticas: se ignora cualquier fallo.
		}
	});

	const canDownload = $derived(includeXlsx || includePhotos || includePdf);

	const variants: { value: Variant; label: string }[] = [
		{ value: 'simple', label: 'Simple' },
		{ value: 'extended', label: 'Extendida' }
	];

	function download() {
		const url = new URL(href, window.location.origin);
		url.searchParams.set('variant', variant);
		url.searchParams.set('xlsx', includeXlsx ? '1' : '0');
		url.searchParams.set('photos', includePhotos ? '1' : '0');
		url.searchParams.set('pdf', includePdf ? '1' : '0');
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ variant, xlsx: includeXlsx, photos: includePhotos, pdf: includePdf })
			);
		} catch {
			// Ignorado: la exportación no depende de guardar la preferencia.
		}
		open = false;
		window.location.assign(url.toString());
	}
</script>

<Button variant="outline" size="sm" class={className} onclick={() => (open = true)}>{label}</Button>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Exportar evidencias</Dialog.Title>
			<Dialog.Description>
				Se incluye la última entrega aprobada de cada objetivo. Elige qué añadir.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="space-y-2">
				<p class="text-sm font-medium">Registro (XLSX)</p>
				<div class="grid grid-cols-2 gap-2">
					{#each variants as option (option.value)}
						<button
							type="button"
							aria-pressed={variant === option.value}
							class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {variant ===
							option.value
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-input text-muted-foreground hover:bg-muted'}"
							onclick={() => (variant = option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground">
					Simple: Edificio · Trabajo · Estado · Evidencia · Notas. Extendida: añade resumen, tipo,
					elementos, requisitos, fotografías y revisión.
				</p>
			</div>

			<div class="space-y-2 border-t pt-3">
				<LabeledCheckbox bind:checked={includeXlsx} label="Incluir registro XLSX" />
				<LabeledCheckbox bind:checked={includePhotos} label="Incluir fotografías" />
				<LabeledCheckbox bind:checked={includePdf} label="Incluir PDF de evidencia por trabajo" />
				<p class="text-xs text-muted-foreground">
					Sin fotografías, los PDF caen directamente en la carpeta del servicio.
				</p>
				{#if !canDownload}
					<p class="text-sm text-destructive">
						Selecciona al menos el registro, las fotografías o el PDF.
					</p>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Dialog.Close>Cancelar</Dialog.Close>
			<Button disabled={!canDownload} onclick={download}>Descargar</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
