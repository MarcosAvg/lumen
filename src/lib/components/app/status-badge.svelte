<script lang="ts">
	import Chip, { type ChipTone } from '#lib/components/app/chip.svelte';

	export type StatusTone = 'pending' | 'in_progress' | 'in_review' | 'rejected' | 'approved';

	const labels: Record<StatusTone, string> = {
		pending: 'Pendiente',
		in_progress: 'En progreso',
		in_review: 'En revisión',
		rejected: 'Rechazado',
		approved: 'Aprobado'
	};

	// Un color por estado (tokens `--state-*`), consistente en toda la app.
	const tones: Record<StatusTone, ChipTone> = {
		pending: 'neutral',
		in_progress: 'attention',
		in_review: 'pending',
		rejected: 'rejected',
		approved: 'approved'
	};

	let { status, label }: { status: StatusTone; label?: string } = $props();
</script>

<Chip tone={tones[status]}>
	<span class="size-1.5 rounded-full bg-current opacity-75" aria-hidden="true"></span>
	{label ?? labels[status]}
</Chip>
