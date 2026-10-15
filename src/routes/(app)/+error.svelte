<script lang="ts">
	import { page } from '$app/state';
	import ErrorView from '#lib/components/app/error-view.svelte';
</script>

<svelte:head>
	<title>Error · Lumen</title>
</svelte:head>

<ErrorView status={page.status} message={page.error?.message} />
