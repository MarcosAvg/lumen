<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { LabeledCheckbox } from '#lib/components/ui/labeled-checkbox';
	import { NativeSelect } from '#lib/components/ui/native-select';

	/**
	 * Asistente `direct ↔ divided`. Solo se ofrece antes de cualquier entrega y
	 * exige reasignar explícitamente todos los requisitos y fotos adicionales.
	 */
	type Requirement = { id: string; name: string };
	type Photo = { id: string };
	type ConversionElement = {
		id: string;
		name: string;
		requirements: Requirement[];
		additionalPhotos: Photo[];
	};

	let {
		workId,
		mode,
		hasSubmissions,
		direct,
		elements
	}: {
		workId: string;
		mode: 'direct' | 'divided';
		hasSubmissions: boolean;
		direct: { requirements: Requirement[]; additionalPhotos: Photo[] } | null;
		elements: ConversionElement[];
	} = $props();

	let elementNames = $state<string[]>(['']);
	let requirementTarget = $state<Record<string, number>>({});
	let photoTarget = $state<Record<string, number>>({});
	let confirmed = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	const allRequirements = $derived(
		mode === 'divided' ? elements.flatMap((element) => element.requirements) : []
	);
	const allPhotos = $derived(
		mode === 'divided' ? elements.flatMap((element) => element.additionalPhotos) : []
	);
	const elementIndexes = $derived(elementNames.map((_, index) => index));

	function addElement() {
		elementNames = [...elementNames, ''];
	}
	function removeElement(index: number) {
		elementNames = elementNames.filter((_, i) => i !== index);
	}
	function setName(index: number, value: string) {
		elementNames = elementNames.map((name, i) => (i === index ? value : name));
	}

	async function submit() {
		busy = true;
		error = null;
		success = null;
		try {
			let body:
				| {
						targetMode: 'divided';
						elements: { name: string }[];
						requirements: { requirementId: string; elementIndex: number }[];
						additionalPhotos: { photoId: string; elementIndex: number }[];
				  }
				| {
						targetMode: 'direct';
						requirements: string[];
						additionalPhotos: string[];
				  };

			if (mode === 'direct') {
				const payload = elementNames
					.map((name) => ({ name: name.trim() }))
					.filter((element) => element.name.length > 0);
				if (payload.length === 0) throw new Error('Añade al menos un elemento con nombre.');
				body = {
					targetMode: 'divided',
					elements: payload,
					requirements: (direct?.requirements ?? []).map((requirement) => ({
						requirementId: requirement.id,
						elementIndex: requirementTarget[requirement.id] ?? 0
					})),
					additionalPhotos: (direct?.additionalPhotos ?? []).map((photo) => ({
						photoId: photo.id,
						elementIndex: photoTarget[photo.id] ?? 0
					}))
				};
			} else {
				if (!confirmed) throw new Error('Confirma la reasignación para continuar.');
				body = {
					targetMode: 'direct',
					requirements: allRequirements.map((requirement) => requirement.id),
					additionalPhotos: allPhotos.map((photo) => photo.id)
				};
			}

			const response = await fetch(`/api/works/${workId}/convert`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = (await response.json().catch(() => ({}))) as { message?: string };
			if (!response.ok) throw new Error(data.message ?? 'No se pudo convertir el trabajo.');
			success = 'Trabajo convertido.';
			await invalidateAll();
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-base">Conversión de modo</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if hasSubmissions}
			<p class="text-sm text-muted-foreground">
				Este trabajo ya tiene entregas. La conversión entre <em>directo</em> y
				<em>dividido</em> solo es posible antes de la primera entrega.
			</p>
		{:else}
			<p class="text-sm text-muted-foreground">
				{mode === 'direct'
					? 'Convertir a dividido: cada requisito y cada foto adicional debe asignarse a un elemento.'
					: 'Convertir a directo: los requisitos y fotos de todos los elementos pasan al objetivo único.'}
			</p>

			{#if mode === 'direct'}
				<div class="space-y-2">
					<Label>Elementos destino</Label>
					{#each elementNames as name, index (index)}
						<div class="flex gap-2">
							<Input
								value={name}
								placeholder="Nombre del elemento"
								oninput={(event) => setName(index, event.currentTarget.value)}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={elementNames.length === 1}
								onclick={() => removeElement(index)}>Quitar</Button
							>
						</div>
					{/each}
					<Button type="button" variant="outline" size="sm" onclick={addElement}>
						Añadir elemento
					</Button>
				</div>

				{#if direct && direct.requirements.length > 0}
					<div class="space-y-2">
						<Label>Reasignar requisitos</Label>
						{#each direct.requirements as requirement (requirement.id)}
							<div class="flex items-center gap-2 text-sm">
								<span class="flex-1 truncate">{requirement.name}</span>
								<NativeSelect
									class="h-8 w-auto"
									aria-label={`Reasignar ${requirement.name}`}
									value={String(requirementTarget[requirement.id] ?? 0)}
									onchange={(event) =>
										(requirementTarget = {
											...requirementTarget,
											[requirement.id]: Number(event.currentTarget.value)
										})}
								>
									{#each elementIndexes as index (index)}
										<option value={String(index)}>Elemento {index + 1}</option>
									{/each}
								</NativeSelect>
							</div>
						{/each}
					</div>
				{/if}

				{#if direct && direct.additionalPhotos.length > 0}
					<div class="space-y-2">
						<Label>Reasignar fotos adicionales</Label>
						{#each direct.additionalPhotos as photo, index (photo.id)}
							<div class="flex items-center gap-2 text-sm">
								<span class="flex-1 truncate">Foto adicional {index + 1}</span>
								<NativeSelect
									class="h-8 w-auto"
									aria-label={`Reasignar foto adicional ${index + 1}`}
									value={String(photoTarget[photo.id] ?? 0)}
									onchange={(event) =>
										(photoTarget = {
											...photoTarget,
											[photo.id]: Number(event.currentTarget.value)
										})}
								>
									{#each elementIndexes as elementIndex (elementIndex)}
										<option value={String(elementIndex)}>Elemento {elementIndex + 1}</option>
									{/each}
								</NativeSelect>
							</div>
						{/each}
					</div>
				{/if}
			{:else}
				<div class="space-y-1 text-sm text-muted-foreground">
					<p>Se reasignarán al objetivo directo:</p>
					<ul class="list-disc pl-5">
						<li>{allRequirements.length} requisito(s)</li>
						<li>{allPhotos.length} foto(s) adicional(es)</li>
						<li>{elements.length} elemento(s) que se eliminarán</li>
					</ul>
				</div>
				<LabeledCheckbox
					bind:checked={confirmed}
					label="Confirmo reasignar todos los requisitos y fotos y eliminar los elementos."
				/>
			{/if}

			{#if error}
				<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
			{/if}
			{#if success}
				<Alert><AlertDescription>{success}</AlertDescription></Alert>
			{/if}

			<Button type="button" disabled={busy} onclick={submit}>
				{busy
					? 'Convirtiendo…'
					: mode === 'direct'
						? 'Convertir a dividido'
						: 'Convertir a directo'}
			</Button>
		{/if}
	</Card.Content>
</Card.Root>
