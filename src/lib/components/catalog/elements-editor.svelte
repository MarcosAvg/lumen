<script lang="ts">
	import DraftComposer from './draft-composer.svelte';
	import type { CatalogGroup, ElementDraft } from './types';

	let {
		catalogs,
		value = $bindable<ElementDraft[]>([]),
		disabled = false
	}: {
		catalogs: CatalogGroup[];
		value?: ElementDraft[];
		disabled?: boolean;
	} = $props();
</script>

<DraftComposer
	{catalogs}
	bind:value
	itemLabel="elemento"
	itemPlural="elementos"
	catalogPlaceholder="Elegir elementos…"
	namePlaceholder="Nombre del elemento"
	{disabled}
/>
