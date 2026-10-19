<script lang="ts">
	import DraftComposer from './draft-composer.svelte';
	import type { CatalogGroup, RequirementDraft } from './types';

	let {
		catalogs,
		value = $bindable<RequirementDraft[]>([]),
		required = $bindable(true),
		disabled = false
	}: {
		catalogs: CatalogGroup[];
		value?: RequirementDraft[];
		required?: boolean;
		disabled?: boolean;
	} = $props();
</script>

<DraftComposer
	{catalogs}
	bind:value
	bind:required
	itemLabel="requisito"
	itemPlural="requisitos"
	catalogPlaceholder="Elegir requisitos…"
	namePlaceholder="Nombre del requisito"
	showRequired
	{disabled}
/>
