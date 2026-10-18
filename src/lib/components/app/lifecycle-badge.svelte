<script lang="ts" module>
	import type { ChipTone } from '#lib/components/app/chip.svelte';
	import type { ContractLifecycle, ServiceLifecycle } from '#lib/types';

	export type LifecycleKind = 'contract' | 'service';
	export type Lifecycle = ContractLifecycle | ServiceLifecycle | 'planned';

	const labels: Record<Lifecycle, string> = {
		planned: 'En espera',
		active: 'Activo',
		inactive: 'Inactivo',
		archived: 'Archivado'
	};

	const tones: Record<Lifecycle, ChipTone> = {
		planned: 'pending',
		active: 'approved',
		inactive: 'neutral',
		archived: 'neutral'
	};
</script>

<script lang="ts">
	import Chip from '#lib/components/app/chip.svelte';

	let { lifecycle, kind = 'service' }: { lifecycle: Lifecycle; kind?: LifecycleKind } = $props();

	const label = $derived(
		lifecycle === 'archived'
			? kind === 'contract'
				? 'Contrato archivado'
				: 'Servicio archivado'
			: labels[lifecycle]
	);
</script>

<Chip tone={tones[lifecycle]}>
	<span class="size-1.5 rounded-full bg-current opacity-75" aria-hidden="true"></span>
	{label}
</Chip>
