<script lang="ts">
	import * as Breadcrumb from '#lib/components/ui/breadcrumb';

	let { items }: { items: { label: string; href?: string }[] } = $props();
</script>

<Breadcrumb.Root class="hidden md:block">
	<Breadcrumb.List>
		{#each items as item, index (index)}
			<Breadcrumb.Item>
				{#if item.href}
					<Breadcrumb.Link href={item.href}>{item.label}</Breadcrumb.Link>
				{:else}
					<Breadcrumb.Page>{item.label}</Breadcrumb.Page>
				{/if}
			</Breadcrumb.Item>
			{#if index < items.length - 1}
				<Breadcrumb.Separator />
			{/if}
		{/each}
	</Breadcrumb.List>
</Breadcrumb.Root>
