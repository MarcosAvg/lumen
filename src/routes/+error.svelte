<script lang="ts">
	import { page } from '$app/state';
	import ErrorView from '#lib/components/app/error-view.svelte';
</script>

<svelte:head>
	<title>Error · Lumen</title>
</svelte:head>

<div class="flex min-h-svh items-center justify-center">
	<ErrorView status={page.status} message={page.error?.message} />
</div>
