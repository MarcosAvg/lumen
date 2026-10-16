<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Button } from '#lib/components/ui/button';
	import XIcon from '@lucide/svelte/icons/x';
	import DownloadIcon from '@lucide/svelte/icons/download';

	/**
	 * Visor de fotos a pantalla completa pensado para móvil: navega con gestos
	 * (deslizar horizontal), zoom con doble toque y pinza, y descarga. En
	 * escritorio funciona también (teclado: ←/→ y Esc).
	 */
	let {
		photos,
		startIndex = 0,
		open = $bindable(false)
	}: { photos: { id: string }[]; startIndex?: number; open?: boolean } = $props();

	let current = $state(untrack(() => startIndex));
	let container = $state<HTMLDivElement | null>(null);

	let scale = $state(1);
	let tx = $state(0);
	let ty = $state(0);

	const pointers = new SvelteMap<number, { x: number; y: number }>();
	let startX = 0;
	let startY = 0;
	let pinchStart = 0;
	let pinchScale = 1;
	let lastTapAt = 0;

	const photo = $derived(photos[current] ?? null);

	$effect(() => {
		if (open) {
			current = startIndex;
			scale = 1;
			tx = 0;
			ty = 0;
			pointers.clear();
			container?.focus();
		}
	});

	function go(delta: number) {
		if (photos.length === 0) return;
		current = (current + delta + photos.length) % photos.length;
		scale = 1;
		tx = 0;
		ty = 0;
	}

	function close() {
		open = false;
	}

	function handleKey(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
		else if (event.key === 'ArrowLeft') go(-1);
		else if (event.key === 'ArrowRight') go(1);
	}

	function onPointerDown(event: PointerEvent) {
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 1) {
			startX = event.clientX;
			startY = event.clientY;
		} else if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
			pinchScale = scale;
		}
	}

	function onPointerMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		const previous = pointers.get(event.pointerId)!;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const distance = Math.hypot(a.x - b.x, a.y - b.y);
			if (pinchStart > 0) scale = Math.min(4, Math.max(1, (pinchScale * distance) / pinchStart));
			return;
		}

		if (scale > 1) {
			tx += event.clientX - previous.x;
			ty += event.clientY - previous.y;
		}
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);

		if (pointers.size === 0 && scale === 1) {
			const dx = event.clientX - startX;
			const dy = event.clientY - startY;
			if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
				go(dx < 0 ? 1 : -1);
				return;
			}
			// Doble toque: alterna el zoom.
			const now = Date.now();
			if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && now - lastTapAt < 300) {
				scale = 2;
				tx = 0;
				ty = 0;
				lastTapAt = 0;
				return;
			}
			lastTapAt = now;
		}
		if (scale <= 1) {
			scale = 1;
			tx = 0;
			ty = 0;
		}
	}
</script>

{#if open && photo}
	<div
		bind:this={container}
		role="dialog"
		aria-modal="true"
		aria-label="Fotografía de evidencia"
		tabindex="-1"
		class="fixed inset-0 z-50 flex flex-col bg-black/95 text-white outline-none"
		onkeydown={handleKey}
	>
		<div
			class="flex items-center justify-between gap-2 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2"
		>
			<span class="tnum text-sm" aria-live="polite">{current + 1} / {photos.length}</span>
			<Button variant="ghost" size="icon" class="text-white" onclick={close}>
				<XIcon />
				<span class="sr-only">Cerrar</span>
			</Button>
		</div>

		<div
			role="group"
			aria-label="Área de la fotografía"
			class="relative flex-1 touch-none overflow-hidden select-none"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			ondblclick={() => (scale = scale > 1 ? 1 : 2)}
		>
			<img
				src={`/api/photos/${photo.id}/content`}
				alt={`Fotografía ${current + 1} de ${photos.length}`}
				draggable="false"
				class="absolute inset-0 m-auto max-h-full max-w-full object-contain transition-transform duration-100"
				style={`transform: translate(${tx}px, ${ty}px) scale(${scale})`}
			/>
		</div>

		<div
			class="flex items-center justify-center gap-2 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
		>
			{#if photos.length > 1}
				<Button variant="outline" onclick={() => go(-1)}>Anterior</Button>
				<Button variant="outline" onclick={() => go(1)}>Siguiente</Button>
			{/if}
			<Button href={`/api/photos/${photo.id}/content?download=1`} variant="outline">
				<DownloadIcon />
				Descargar
			</Button>
		</div>
	</div>
{/if}
