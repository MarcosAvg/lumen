<script lang="ts">
	import { Badge } from '#lib/components/ui/badge';
	import { cn } from '#lib/utils.js';

	export type StatusTone = 'pending' | 'in_progress' | 'in_review' | 'rejected' | 'approved';

	const labels: Record<StatusTone, string> = {
		pending: 'Pendiente',
		in_progress: 'En progreso',
		in_review: 'En revisión',
		rejected: 'Rechazado',
		approved: 'Aprobado'
	};

	// Un color por estado (tokens `--state-*`), consistente en toda la app.
	const tones: Record<StatusTone, string> = {
		pending: 'border-transparent bg-secondary text-secondary-foreground',
		in_progress: 'border-state-attention/30 bg-state-attention/15 text-state-attention',
		in_review: 'border-state-pending/30 bg-state-pending/15 text-state-pending',
		rejected: 'border-state-rejected/30 bg-state-rejected/15 text-state-rejected',
		approved: 'border-state-approved/30 bg-state-approved/15 text-state-approved'
	};

	let { status, label }: { status: StatusTone; label?: string } = $props();
</script>

<Badge variant="outline" class={cn('font-medium', tones[status])}>{label ?? labels[status]}</Badge>
