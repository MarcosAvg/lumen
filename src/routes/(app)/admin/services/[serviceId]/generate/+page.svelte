<script lang="ts">
	import { resolve } from '$app/paths';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import type { PageProps } from './$types';

	type PlanElement = { catalogItemId: string | null; name: string; include: boolean };
	type PlanWork = {
		catalogItemId: string | null;
		name: string;
		include: boolean;
		elements: PlanElement[];
	};
	type Plan = { works: PlanWork[]; totalWorks: number; totalElements: number; warnings: string[] };
	type ActionData = { success?: string; message?: string; plan?: Plan };

	let { data, form }: PageProps = $props();
	const action = $derived((form ?? null) as ActionData | null);
</script>

<svelte:head>
	<title>Generar estructura · {data.service.name} · Lumen</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Generar estructura en lote</h1>
			<p class="text-sm text-muted-foreground">
				Servicio: {data.service.name}. Selecciona catálogos, previsualiza y ajusta antes de aplicar.
			</p>
		</div>
		<Button
			href={resolve('/(app)/services/[serviceId]', { serviceId: data.service.id })}
			variant="outline"
			size="sm">Volver al servicio</Button
		>
	</div>

	{#if action?.message}
		<Alert variant="destructive"><AlertDescription>{action.message}</AlertDescription></Alert>
	{/if}
	{#if action?.success}
		<Alert><AlertDescription>{action.success}</AlertDescription></Alert>
	{/if}

	{#if data.catalogs.length === 0}
		<Alert>
			<AlertDescription>
				No hay catálogos con ítems. Crea uno en
				<a class="underline" href={resolve('/(app)/admin/catalogs')}>Catálogos</a>.
			</AlertDescription>
		</Alert>
	{/if}

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Selección</Card.Title></Card.Header>
		<Card.Content>
			<form method="POST" action="?/preview" class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-2">
					<Label for="workItemIds">Trabajos (ítems de catálogo)</Label>
					<select
						id="workItemIds"
						name="workItemIds"
						multiple
						size="8"
						class="w-full rounded-lg border border-input bg-background p-2 text-sm"
					>
						{#each data.catalogs as catalog (catalog.id)}
							{#if catalog.items.length > 0}
								<optgroup label={catalog.name}>
									{#each catalog.items as item (item.id)}
										<option value={item.id}>{item.name}</option>
									{/each}
								</optgroup>
							{/if}
						{/each}
					</select>
				</div>
				<div class="space-y-2">
					<Label for="elementItemIds">Elementos por trabajo (opcional)</Label>
					<select
						id="elementItemIds"
						name="elementItemIds"
						multiple
						size="8"
						class="w-full rounded-lg border border-input bg-background p-2 text-sm"
					>
						{#each data.catalogs as catalog (catalog.id)}
							{#if catalog.items.length > 0}
								<optgroup label={catalog.name}>
									{#each catalog.items as item (item.id)}
										<option value={item.id}>{item.name}</option>
									{/each}
								</optgroup>
							{/if}
						{/each}
					</select>
				</div>
				<div class="sm:col-span-2">
					<Button type="submit">Previsualizar</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	{#if action?.plan}
		<div class="space-y-3">
			<h2 class="text-lg font-semibold">
				Vista previa · {action.plan.totalWorks} trabajo(s), {action.plan.totalElements} elemento(s)
			</h2>

			{#if action.plan.warnings.length > 0}
				<Alert variant="destructive">
					<AlertDescription>
						<ul class="list-inside list-disc">
							{#each action.plan.warnings as warning, wi (wi)}
								<li>{warning}</li>
							{/each}
						</ul>
					</AlertDescription>
				</Alert>
			{/if}

			<form method="POST" action="?/apply" class="space-y-3">
				{#each action.plan.works as work, i (i)}
					<Card.Root>
						<Card.Content class="space-y-3 pt-6">
							<input type="hidden" name="workItemId_{i}" value={work.catalogItemId ?? ''} />
							<div class="flex flex-wrap items-center gap-3">
								<label class="flex items-center gap-2 text-sm">
									<input type="checkbox" name="workInc_{i}" value="true" checked={work.include} />
									Incluir trabajo
								</label>
								<Input
									name="workName_{i}"
									value={work.name}
									class="max-w-xs"
									aria-label="Nombre del trabajo"
								/>
							</div>

							{#if work.elements.length > 0}
								<ul class="ml-4 space-y-2 border-l pl-4">
									{#each work.elements as element, j (j)}
										<li class="flex flex-wrap items-center gap-3">
											<input
												type="hidden"
												name="elItemId_{i}_{j}"
												value={element.catalogItemId ?? ''}
											/>
											<label class="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													name="elInc_{i}_{j}"
													value="true"
													checked={element.include}
												/>
												Incluir
											</label>
											<Input
												name="elName_{i}_{j}"
												value={element.name}
												class="max-w-xs"
												aria-label="Nombre del elemento"
											/>
										</li>
									{/each}
								</ul>
							{/if}
						</Card.Content>
					</Card.Root>
				{/each}

				<Button type="submit">Aplicar generación</Button>
			</form>
		</div>
	{/if}
</div>
