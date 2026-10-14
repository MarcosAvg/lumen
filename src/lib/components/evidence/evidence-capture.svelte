<script lang="ts">
	import { untrack } from 'svelte';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import type { TargetStatus } from '#lib/types';

	interface Req {
		id: string;
		name: string;
		isRequired: boolean;
	}
	interface Photo {
		id: string;
		requirementId: string | null;
		sortOrder: number;
		uploadedAt: Date;
		uploadedBy: string | null;
	}
	interface Upload {
		key: string;
		name: string;
		progress: number;
		state: 'uploading' | 'error' | 'done';
		message?: string;
	}

	interface Props {
		targetId: string;
		label: string;
		status: TargetStatus;
		editable: boolean;
		version: number;
		requirements: Req[];
		photos: Photo[];
		isAdmin: boolean;
	}

	let {
		targetId,
		label,
		status,
		editable,
		version: initialVersion,
		requirements: initialRequirements,
		photos: initialPhotos,
		isAdmin
	}: Props = $props();

	let version = $state(untrack(() => initialVersion));
	let requirements = $state(untrack(() => initialRequirements));
	let photos = $state(untrack(() => initialPhotos));
	let conflict = $state(false);
	let uploads = $state<Upload[]>([]);
	let pendingRemove = $state<Photo | null>(null);
	let lightbox = $state<Photo | null>(null);
	let adminError = $state<string | null>(null);
	let newRequirement = $state('');
	let newRequired = $state(true);
	let busy = $state(false);

	const statusLabel: Record<TargetStatus, string> = {
		pending: 'Pendiente',
		in_progress: 'En progreso',
		in_review: 'En revisión',
		rejected: 'Rechazado',
		approved: 'Aprobado'
	};

	function groupPhotos(requirementId: string | null): Photo[] {
		return photos
			.filter((photo) => photo.requirementId === requirementId)
			.sort((a, b) => a.sortOrder - b.sortOrder);
	}

	const additionalPhotos = $derived(groupPhotos(null));

	function markConflict() {
		conflict = true;
	}

	async function handleFiles(requirementId: string | null, fileList: FileList | null) {
		if (!fileList || fileList.length === 0) return;
		for (const file of Array.from(fileList)) {
			await uploadOne(requirementId, file);
		}
	}

	function uploadOne(requirementId: string | null, file: File): Promise<void> {
		const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		uploads = [...uploads, { key, name: file.name, progress: 0, state: 'uploading' }];

		return new Promise((resolve) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', `/api/targets/${targetId}/photos`);
			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable) {
					const percent = Math.round((event.loaded / event.total) * 100);
					uploads = uploads.map((item) =>
						item.key === key ? { ...item, progress: percent } : item
					);
				}
			};
			xhr.onload = () => {
				try {
					const body = JSON.parse(xhr.responseText) as {
						version?: number;
						results?: { ok: boolean; message?: string; photo?: Photo }[];
					};
					const result = body.results?.[0];
					if (xhr.status >= 200 && xhr.status < 300 && result?.ok && result.photo) {
						photos = [...photos, result.photo];
						if (typeof body.version === 'number') version = body.version;
						uploads = uploads.map((item) =>
							item.key === key ? { ...item, state: 'done', progress: 100 } : item
						);
					} else {
						uploads = uploads.map((item) =>
							item.key === key
								? { ...item, state: 'error', message: result?.message ?? 'No se pudo subir' }
								: item
						);
					}
				} catch {
					uploads = uploads.map((item) =>
						item.key === key ? { ...item, state: 'error', message: 'Respuesta inválida' } : item
					);
				}
				resolve();
			};
			xhr.onerror = () => {
				uploads = uploads.map((item) =>
					item.key === key ? { ...item, state: 'error', message: 'Error de red' } : item
				);
				resolve();
			};

			const form = new FormData();
			if (requirementId) form.append('requirementId', requirementId);
			form.append('files', file);
			xhr.send(form);
		});
	}

	async function removePhoto(photo: Photo) {
		const response = await fetch(`/api/targets/${targetId}/photos/${photo.id}`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ version })
		});
		if (response.ok) {
			const body = (await response.json()) as { version: number };
			photos = photos.filter((item) => item.id !== photo.id);
			version = body.version;
			pendingRemove = null;
		} else if (response.status === 409) {
			markConflict();
		}
	}

	async function movePhoto(requirementId: string | null, photoId: string, direction: -1 | 1) {
		const group = groupPhotos(requirementId);
		const index = group.findIndex((photo) => photo.id === photoId);
		const target = index + direction;
		if (index < 0 || target < 0 || target >= group.length) return;

		const reordered = [...group];
		[reordered[index], reordered[target]] = [reordered[target], reordered[index]];

		const response = await fetch(`/api/targets/${targetId}/photo-order`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				requirementId,
				orderedIds: reordered.map((photo) => photo.id),
				version
			})
		});
		if (response.ok) {
			const body = (await response.json()) as { version: number };
			version = body.version;
			photos = photos.map((photo) => {
				const position = reordered.findIndex((item) => item.id === photo.id);
				return position >= 0 ? { ...photo, sortOrder: position } : photo;
			});
		} else if (response.status === 409) {
			markConflict();
		}
	}

	async function createRequirement() {
		adminError = null;
		const name = newRequirement.trim();
		if (!name) return;
		busy = true;
		const response = await fetch(`/api/targets/${targetId}/requirements`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, isRequired: newRequired })
		});
		busy = false;
		if (response.ok) {
			const body = (await response.json()) as { id: string };
			requirements = [...requirements, { id: body.id, name, isRequired: newRequired }];
			newRequirement = '';
		} else {
			adminError =
				((await response.json().catch(() => ({}))) as { message?: string }).message ??
				'No se pudo crear.';
		}
	}

	async function renameRequirement(requirement: Req, name: string) {
		const trimmed = name.trim();
		if (!trimmed || trimmed === requirement.name) return;
		adminError = null;
		const response = await fetch(`/api/targets/${targetId}/requirements/${requirement.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: trimmed, isRequired: requirement.isRequired })
		});
		if (response.ok) {
			requirements = requirements.map((item) =>
				item.id === requirement.id ? { ...item, name: trimmed } : item
			);
		} else {
			adminError = 'No se pudo renombrar.';
		}
	}

	async function toggleRequired(requirement: Req) {
		adminError = null;
		const response = await fetch(`/api/targets/${targetId}/requirements/${requirement.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: requirement.name, isRequired: !requirement.isRequired })
		});
		if (response.ok) {
			requirements = requirements.map((item) =>
				item.id === requirement.id ? { ...item, isRequired: !item.isRequired } : item
			);
		} else {
			adminError = 'No se pudo actualizar el requisito.';
		}
	}

	async function deleteRequirement(requirement: Req) {
		adminError = null;
		const response = await fetch(`/api/targets/${targetId}/requirements/${requirement.id}`, {
			method: 'DELETE'
		});
		if (response.ok) {
			requirements = requirements.filter((item) => item.id !== requirement.id);
			photos = photos.map((photo) =>
				photo.requirementId === requirement.id ? { ...photo, requirementId: null } : photo
			);
		} else {
			adminError = 'No se pudo eliminar el requisito.';
		}
	}
</script>

<div class="space-y-4">
	<header class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<h2 class="text-lg font-semibold">{label}</h2>
			<Badge variant={status === 'approved' ? 'default' : 'secondary'}>{statusLabel[status]}</Badge>
		</div>
		{#if editable}
			<span class="text-sm text-muted-foreground">{photos.length} fotografía(s)</span>
		{:else}
			<span class="text-sm text-muted-foreground">Evidencia en solo lectura</span>
		{/if}
	</header>

	{#if conflict}
		<Alert variant="destructive">
			<AlertDescription>
				<p class="mb-2">Otro usuario modificó esta evidencia. Actualiza para continuar.</p>
				<Button size="sm" variant="outline" onclick={() => location.reload()}>Recargar</Button>
			</AlertDescription>
		</Alert>
	{/if}
	{#if adminError}
		<Alert variant="destructive"><AlertDescription>{adminError}</AlertDescription></Alert>
	{/if}

	{#if uploads.length > 0}
		<Card.Root>
			<Card.Content class="space-y-2 pt-6">
				{#each uploads as upload (upload.key)}
					<div class="text-sm">
						<div class="flex justify-between gap-2">
							<span class="truncate">{upload.name}</span>
							<span>{upload.state === 'error' ? 'Error' : `${upload.progress}%`}</span>
						</div>
						{#if upload.state === 'error' && upload.message}
							<p class="text-xs text-destructive">{upload.message}</p>
						{/if}
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	{#each requirements as requirement (requirement.id)}
		<Card.Root>
			<Card.Header class="flex flex-wrap items-center justify-between gap-2">
				<Card.Title class="flex items-center gap-2 text-base">
					{requirement.name}
					{#if requirement.isRequired}<Badge variant="secondary">Obligatorio</Badge>{/if}
					<span class="text-sm font-normal text-muted-foreground">
						{groupPhotos(requirement.id).length} foto(s)
					</span>
				</Card.Title>
				{#if isAdmin && editable}
					<div class="flex items-center gap-1">
						<Button variant="ghost" size="sm" onclick={() => toggleRequired(requirement)}>
							{requirement.isRequired ? 'Hacer opcional' : 'Hacer obligatorio'}
						</Button>
						<Button variant="destructive" size="sm" onclick={() => deleteRequirement(requirement)}>
							Eliminar
						</Button>
					</div>
				{/if}
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if isAdmin && editable}
					<form
						class="flex flex-wrap items-center gap-2"
						onsubmit={(event) => {
							event.preventDefault();
							const input = event.currentTarget.elements.namedItem('reqName');
							if (input instanceof HTMLInputElement) renameRequirement(requirement, input.value);
						}}
					>
						<Input
							name="reqName"
							value={requirement.name}
							class="h-8 max-w-xs"
							aria-label="Nombre del requisito"
						/>
						<Button type="submit" variant="outline" size="sm">Renombrar</Button>
					</form>
				{/if}

				{@render PhotoGrid({
					editable,
					group: groupPhotos(requirement.id),
					requirementId: requirement.id,
					onremove: (photo) => (pendingRemove = photo),
					onmove: (photoId, direction) => movePhoto(requirement.id, photoId, direction),
					onopen: (photo) => (lightbox = photo)
				})}

				{#if editable}
					<div class="flex flex-wrap gap-2">
						<label class="cursor-pointer">
							<span class="sr-only">Tomar foto</span>
							<input
								type="file"
								accept="image/*"
								capture="environment"
								class="hidden"
								onchange={(event) => {
									handleFiles(requirement.id, event.currentTarget.files);
									event.currentTarget.value = '';
								}}
							/>
							<span
								class="inline-flex h-8 items-center rounded-lg border border-input px-3 text-sm hover:bg-muted"
							>
								Tomar foto
							</span>
						</label>
						<label class="cursor-pointer">
							<span class="sr-only">Elegir archivos</span>
							<input
								type="file"
								accept="image/*"
								multiple
								class="hidden"
								onchange={(event) => {
									handleFiles(requirement.id, event.currentTarget.files);
									event.currentTarget.value = '';
								}}
							/>
							<span
								class="inline-flex h-8 items-center rounded-lg border border-input px-3 text-sm hover:bg-muted"
							>
								Elegir archivos
							</span>
						</label>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/each}

	<Card.Root>
		<Card.Header class="flex items-center justify-between">
			<Card.Title class="text-base">Adicionales</Card.Title>
			<span class="text-sm text-muted-foreground">{additionalPhotos.length} foto(s)</span>
		</Card.Header>
		<Card.Content class="space-y-3">
			{@render PhotoGrid({
				editable,
				group: additionalPhotos,
				requirementId: null,
				onremove: (photo) => (pendingRemove = photo),
				onmove: (photoId, direction) => movePhoto(null, photoId, direction),
				onopen: (photo) => (lightbox = photo)
			})}
			{#if editable}
				<label class="cursor-pointer">
					<span class="sr-only">Agregar fotografía</span>
					<input
						type="file"
						accept="image/*"
						multiple
						class="hidden"
						onchange={(event) => {
							handleFiles(null, event.currentTarget.files);
							event.currentTarget.value = '';
						}}
					/>
					<span
						class="inline-flex h-8 items-center rounded-lg border border-input px-3 text-sm hover:bg-muted"
					>
						Agregar fotografía
					</span>
				</label>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if isAdmin && editable}
		<Card.Root>
			<Card.Header
				><Card.Title class="text-base">Requisitos (solo antes del primer envío)</Card.Title
				></Card.Header
			>
			<Card.Content class="space-y-3">
				<form
					class="flex flex-wrap items-end gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						createRequirement();
					}}
				>
					<Input
						bind:value={newRequirement}
						placeholder="Nuevo requisito (p. ej. Antes)"
						class="max-w-xs"
					/>
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={newRequired} /> Obligatorio
					</label>
					<Button type="submit" size="sm" disabled={busy}>Añadir requisito</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if pendingRemove}
		<Alert variant="destructive">
			<AlertDescription>
				<p class="mb-2">
					¿Retirar esta fotografía? Dejará de estar en la evidencia vigente, pero no se borra: las
					entregas anteriores la conservan.
				</p>
				<div class="flex gap-2">
					<Button
						variant="destructive"
						size="sm"
						onclick={() => removePhoto(pendingRemove as Photo)}
					>
						Retirar
					</Button>
					<Button variant="outline" size="sm" onclick={() => (pendingRemove = null)}
						>Cancelar</Button
					>
				</div>
			</AlertDescription>
		</Alert>
	{/if}

	{#if lightbox}
		<div
			class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onkeydown={(event) => event.key === 'Escape' && (lightbox = null)}
		>
			<img
				src={`/api/photos/${lightbox.id}/content`}
				alt="Fotografía de evidencia"
				class="max-h-[80vh] max-w-full object-contain"
			/>
			<div class="flex gap-2">
				<Button href={`/api/photos/${lightbox.id}/content?download=1`} variant="outline" size="sm">
					Descargar
				</Button>
				<Button variant="outline" size="sm" onclick={() => (lightbox = null)}>Cerrar</Button>
			</div>
		</div>
	{/if}
</div>

{#snippet PhotoGrid(options: {
	editable: boolean;
	group: Photo[];
	requirementId: string | null;
	onremove: (photo: Photo) => void;
	onmove: (photoId: string, direction: -1 | 1) => void;
	onopen: (photo: Photo) => void;
})}
	{#if options.group.length === 0}
		<p class="text-sm text-muted-foreground">Sin fotografías.</p>
	{:else}
		<ul class="flex flex-wrap gap-3">
			{#each options.group as photo, index (photo.id)}
				<li class="w-32 space-y-1">
					<button type="button" class="block w-full" onclick={() => options.onopen(photo)}>
						<img
							src={`/api/photos/${photo.id}/thumbnail`}
							alt={`Foto ${index + 1} de ${options.group.length}`}
							loading="lazy"
							class="h-24 w-32 rounded-md border border-input object-cover"
						/>
					</button>
					{#if options.editable}
						<div class="flex items-center justify-between gap-1">
							<div class="flex gap-1">
								<Button
									variant="ghost"
									size="icon-sm"
									disabled={index === 0}
									aria-label="Mover antes"
									onclick={() => options.onmove(photo.id, -1)}
								>
									↑
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									disabled={index === options.group.length - 1}
									aria-label="Mover después"
									onclick={() => options.onmove(photo.id, 1)}
								>
									↓
								</Button>
							</div>
							<Button
								variant="destructive"
								size="icon-sm"
								aria-label="Retirar fotografía"
								onclick={() => options.onremove(photo)}
							>
								×
							</Button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}
