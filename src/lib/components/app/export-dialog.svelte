<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
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
		class: className = '',
		allowCompiledPdf = false,
		allowNonActiveServices = false
	}: {
		href: string;
		label?: string;
		class?: string;
		/** Servicio y contrato permiten añadir PDFs recopilados por servicio. */
		allowCompiledPdf?: boolean;
		/** Contrato: permite incluir servicios en espera, inactivos y archivados. */
		allowNonActiveServices?: boolean;
	} = $props();

	type Variant = 'simple' | 'extended';

	const STORAGE_KEY = 'lumen.export.options';

	let open = $state(false);
	let variant = $state<Variant>('extended');
	let includeXlsx = $state(true);
	let includePhotos = $state(true);
	let includePdf = $state(true);
	let includeCompiledPdf = $state(false);
	let includeNonActive = $state(false);
	let exportFrame: HTMLIFrameElement | null = null;
	let toastId: string | number | undefined;
	let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
	let frameCleanupTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw) as Partial<{
				variant: Variant;
				xlsx: boolean;
				photos: boolean;
				pdf: boolean;
				compiledPdf: boolean;
				nonActive: boolean;
			}>;
			if (saved.variant === 'simple' || saved.variant === 'extended') variant = saved.variant;
			if (typeof saved.xlsx === 'boolean') includeXlsx = saved.xlsx;
			if (typeof saved.photos === 'boolean') includePhotos = saved.photos;
			if (typeof saved.pdf === 'boolean') includePdf = saved.pdf;
			if (typeof saved.compiledPdf === 'boolean') includeCompiledPdf = saved.compiledPdf;
			if (allowNonActiveServices && typeof saved.nonActive === 'boolean') {
				includeNonActive = saved.nonActive;
			}
		} catch {
			// Preferencias no críticas: se ignora cualquier fallo.
		}
	});

	const canDownload = $derived(
		includeXlsx || includePhotos || includePdf || (allowCompiledPdf && includeCompiledPdf)
	);

	const variants: { value: Variant; label: string }[] = [
		{ value: 'simple', label: 'Simple' },
		{ value: 'extended', label: 'Extendida' }
	];

	function cleanupExport() {
		if (timeoutTimer) clearTimeout(timeoutTimer);
		if (frameCleanupTimer) clearTimeout(frameCleanupTimer);
		timeoutTimer = undefined;
		frameCleanupTimer = undefined;
		exportFrame?.remove();
		exportFrame = null;
		if (toastId !== undefined) {
			toast.dismiss(toastId);
			toastId = undefined;
		}
	}

	function triggerDownload(url: string) {
		cleanupExport();

		const id = toast.loading('Procesando exportación…', { duration: Infinity });
		toastId = id;
		let settled = false;

		const iframe = document.createElement('iframe');
		iframe.name = `lumen-export-${Date.now()}`;
		iframe.title = 'Descarga de exportación';
		iframe.setAttribute('aria-hidden', 'true');
		iframe.style.display = 'none';
		iframe.addEventListener(
			'load',
			() => {
				if (settled) {
					iframe.remove();
					return;
				}
				settled = true;
				if (timeoutTimer) clearTimeout(timeoutTimer);
				toast.success('Descarga iniciada.', { id });
				toastId = undefined;
				frameCleanupTimer = setTimeout(() => {
					iframe.remove();
					if (exportFrame === iframe) exportFrame = null;
				}, 10_000);
			},
			{ once: true }
		);
		timeoutTimer = setTimeout(() => {
			if (settled) return;
			settled = true;
			toast.dismiss(id);
			if (toastId === id) toastId = undefined;
			// No se elimina el iframe: la descarga puede seguir en curso.
		}, 30_000);
		iframe.src = url;
		document.body.append(iframe);
		exportFrame = iframe;
	}

	function download() {
		const url = new URL(href, window.location.origin);
		url.searchParams.set('variant', variant);
		url.searchParams.set('xlsx', includeXlsx ? '1' : '0');
		url.searchParams.set('photos', includePhotos ? '1' : '0');
		url.searchParams.set('pdf', includePdf ? '1' : '0');
		url.searchParams.set('compiledPdf', allowCompiledPdf && includeCompiledPdf ? '1' : '0');
		if (allowNonActiveServices) {
			url.searchParams.set('includeNonActive', includeNonActive ? '1' : '0');
		}
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					variant,
					xlsx: includeXlsx,
					photos: includePhotos,
					pdf: includePdf,
					compiledPdf: allowCompiledPdf && includeCompiledPdf,
					...(allowNonActiveServices ? { nonActive: includeNonActive } : {})
				})
			);
		} catch {
			// Ignorado: la exportación no depende de guardar la preferencia.
		}
		open = false;
		triggerDownload(url.toString());
	}

	onDestroy(cleanupExport);
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

		<Dialog.Body class="space-y-5">
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

			<div class="space-y-2">
				<LabeledCheckbox bind:checked={includeXlsx} label="Incluir registro XLSX" />
				<LabeledCheckbox bind:checked={includePhotos} label="Incluir fotografías" />
				<LabeledCheckbox bind:checked={includePdf} label="Incluir PDF de evidencia por trabajo" />
				{#if allowCompiledPdf}
					<LabeledCheckbox
						bind:checked={includeCompiledPdf}
						label="Incluir PDF recopilado por servicio"
					/>
					<p class="text-xs text-muted-foreground">
						El recopilado incluye solo trabajos con evidencia aprobada. Es un archivo adicional y no
						modifica el registro XLSX.
					</p>
				{/if}
				{#if allowNonActiveServices}
					<LabeledCheckbox
						bind:checked={includeNonActive}
						label="Incluir servicios en espera, inactivos o archivados"
					/>
					<p class="text-xs text-muted-foreground">
						Por defecto solo se exportan servicios activos.
					</p>
				{/if}
				<p class="text-xs text-muted-foreground">
					Sin fotografías, los PDF caen directamente en la carpeta del servicio.
				</p>
				{#if !canDownload}
					<p class="text-sm text-destructive">
						Selecciona al menos el registro, las fotografías o el PDF.
					</p>
				{/if}
			</div>
		</Dialog.Body>

		<Dialog.Footer>
			<Dialog.Close>Cancelar</Dialog.Close>
			<Button disabled={!canDownload} onclick={download}>Descargar</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
