<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import Camera from '@lucide/svelte/icons/camera';
	import ImageIcon from '@lucide/svelte/icons/image';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { Input } from '#lib/components/ui/input';
	import { Alert, AlertDescription } from '#lib/components/ui/alert';
	import * as Tabs from '#lib/components/ui/tabs';
	import * as AlertDialog from '#lib/components/ui/alert-dialog';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Sheet from '#lib/components/ui/sheet';
	import { Label } from '#lib/components/ui/label';
	import { LabeledCheckbox } from '#lib/components/ui/labeled-checkbox';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import Chip from '#lib/components/app/chip.svelte';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import CatalogItemMultiPicker from '#lib/components/catalog/catalog-item-multi-picker.svelte';
	import type { CatalogGroup } from '#lib/components/catalog/types';
	import type { TargetStatus } from '#lib/types';
	import { ADDITIONAL_GROUP_LABEL, NO_REQUIREMENT_GROUP_LABEL } from '#lib/types';
	import { submitReadiness } from '#lib/evidence/submit-readiness';

	interface Req {
		id: string;
		name: string;
		isRequired: boolean;
		catalogItemId: string | null;
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
	interface HistoryEntry {
		id: string;
		sequenceNo: number;
		submittedAt: Date;
		submittedByName: string | null;
		photoCount: number;
		decision: 'approved' | 'rejected' | null;
		reviewedAt: Date | null;
		reviewerName: string | null;
		reason: string | null;
	}
	interface Rejection {
		reason: string;
		reviewedAt: Date;
		reviewerName: string | null;
	}

	interface Props {
		targetId: string;
		label: string;
		status: TargetStatus;
		editable: boolean;
		version: number;
		requirements: Req[];
		photos: Photo[];
		history: HistoryEntry[];
		rejection: Rejection | null;
		isAdmin: boolean;
		requirementCatalogs?: CatalogGroup[];
	}

	let {
		targetId,
		label,
		status,
		editable,
		version: initialVersion,
		requirements: initialRequirements,
		photos: initialPhotos,
		history,
		rejection,
		isAdmin,
		requirementCatalogs = []
	}: Props = $props();

	let version = $state(untrack(() => initialVersion));
	let requirements = $state(untrack(() => initialRequirements));
	let photos = $state(untrack(() => initialPhotos));
	let conflict = $state(false);
	let uploads = $state<Upload[]>([]);
	let pendingRemove = $state<Photo | null>(null);
	let pendingRequirement = $state<Req | null>(null);
	let renameTarget = $state<Req | null>(null);
	let renameValue = $state('');
	let requirementOpen = $state(false);
	let requirementTab = $state<'custom' | 'catalog'>('custom');
	let lightbox = $state<Photo | null>(null);
	let adminError = $state<string | null>(null);
	let newRequirement = $state('');
	let newRequired = $state(true);
	let catalogRequirementIds = $state<string[]>([]);
	let catalogRequired = $state(true);
	let busy = $state(false);
	let tab = $state('current');
	let showSubmit = $state(false);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	// Secciones plegables: por defecto expandidas (`true` = contraída).
	let collapsedGroups = $state<Record<string, boolean>>({});

	// Hoja inferior de acciones de foto (móvil).
	let addSheetOpen = $state(false);
	let addSheetRequirement = $state<string | null>(null);

	// Reordenar en móvil: pulsación larga + arrastre horizontal (fallback ↑/↓).
	let draggingId = $state<string | null>(null);
	let dragLastX = 0;
	let dragMoved = false;
	let pressTimer: ReturnType<typeof setTimeout> | null = null;

	function beginPress(photo: Photo, event: PointerEvent) {
		if (!editable || event.pointerType !== 'touch') return;
		dragMoved = false;
		dragLastX = event.clientX;
		if (pressTimer) clearTimeout(pressTimer);
		pressTimer = setTimeout(() => {
			draggingId = photo.id;
			dragLastX = event.clientX;
		}, 350);
	}

	function pressMove(
		photo: Photo,
		event: PointerEvent,
		onmove: (id: string, direction: -1 | 1) => void
	) {
		if (event.pointerType !== 'touch') return;
		if (draggingId !== photo.id) {
			// Movimiento temprano = scroll: cancela la pulsación larga.
			if (pressTimer && Math.abs(event.clientX - dragLastX) > 12) {
				clearTimeout(pressTimer);
				pressTimer = null;
			}
			return;
		}
		const delta = event.clientX - dragLastX;
		if (Math.abs(delta) < 64) return;
		onmove(photo.id, delta > 0 ? 1 : -1);
		dragLastX = event.clientX;
		dragMoved = true;
	}

	function endPress(photo: Photo) {
		if (pressTimer) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
		if (draggingId === photo.id) {
			draggingId = null;
			dragMoved = true; // evita que el toque final abra el visor
		}
	}

	// Lumen es online-only: sin red se deshabilitan las mutaciones.
	let online = $state(true);
	onMount(() => {
		const update = () => {
			online = navigator.onLine;
		};
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});

	function toggleGroup(key: string) {
		collapsedGroups = { ...collapsedGroups, [key]: !collapsedGroups[key] };
	}

	function formatDate(value: Date): string {
		return new Date(value).toLocaleString();
	}

	function groupPhotos(requirementId: string | null): Photo[] {
		return photos
			.filter((photo) => photo.requirementId === requirementId)
			.sort((a, b) => a.sortOrder - b.sortOrder);
	}

	const additionalPhotos = $derived(groupPhotos(null));

	// Checklist de envío: avisa de lo que falta antes de enviar (el servidor manda).
	const readiness = $derived(submitReadiness(requirements, photos));

	function markConflict() {
		conflict = true;
	}

	async function submitEvidence() {
		submitting = true;
		submitError = null;
		const response = await fetch(`/api/targets/${targetId}/submit`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ version })
		});
		submitting = false;
		if (response.ok) {
			location.reload();
			return;
		}
		if (response.status === 409) {
			markConflict();
			showSubmit = false;
			return;
		}
		submitError =
			((await response.json().catch(() => ({}))) as { message?: string }).message ??
			'No se pudo enviar la evidencia.';
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

		return new Promise((resolveUpload) => {
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
				resolveUpload();
			};
			xhr.onerror = () => {
				uploads = uploads.map((item) =>
					item.key === key ? { ...item, state: 'error', message: 'Error de red' } : item
				);
				resolveUpload();
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
			requirements = [
				...requirements,
				{ id: body.id, name, isRequired: newRequired, catalogItemId: null }
			];
			newRequirement = '';
			requirementOpen = false;
		} else {
			adminError =
				((await response.json().catch(() => ({}))) as { message?: string }).message ??
				'No se pudo crear el requisito.';
		}
	}

	async function addCatalogRequirements() {
		adminError = null;
		if (catalogRequirementIds.length === 0) return;
		busy = true;
		const response = await fetch(`/api/targets/${targetId}/requirements/batch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				catalogItemIds: catalogRequirementIds,
				isRequired: catalogRequired
			})
		});
		busy = false;
		if (response.ok) {
			const body = (await response.json()) as {
				created: number;
				skipped: number;
				requirements: Req[];
			};
			requirements = [...requirements, ...body.requirements];
			catalogRequirementIds = [];
			requirementOpen = false;
			if (body.skipped > 0) {
				adminError = `Se añadieron ${body.created} y se omitieron ${body.skipped} por duplicado.`;
			}
		} else {
			adminError =
				((await response.json().catch(() => ({}))) as { message?: string }).message ??
				'No se pudieron añadir los requisitos.';
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
				item.id === requirement.id ? { ...item, name: trimmed, catalogItemId: null } : item
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
		<div class="flex min-w-0 items-center gap-2">
			<h2 class="min-w-0 truncate text-lg font-semibold">{label}</h2>
			<span class="shrink-0"><StatusBadge {status} /></span>
		</div>
		{#if status === 'in_review'}
			<span class="text-sm text-muted-foreground">
				En revisión. La edición está bloqueada hasta que se decida.
			</span>
		{:else if status === 'approved'}
			<span class="text-sm text-muted-foreground"
				>Evidencia aprobada: las fotografías están bloqueadas.</span
			>
		{:else if editable}
			<span class="text-sm text-muted-foreground">{photos.length} fotografía(s)</span>
		{/if}
	</header>

	<Tabs.Root bind:value={tab}>
		<Tabs.List>
			<Tabs.Trigger value="current">Evidencia actual</Tabs.Trigger>
			<Tabs.Trigger value="history">Historial ({history.length})</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

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

	{#if tab === 'current'}
		{#if rejection && status === 'rejected'}
			<Alert variant="destructive">
				<AlertDescription>
					<p class="font-medium">Entrega rechazada: revisa el motivo y envía una corrección.</p>
					<p class="mt-1">{rejection.reason}</p>
					<p class="text-xs">
						{rejection.reviewerName ?? 'Revisor'} · {formatDate(rejection.reviewedAt)}
					</p>
				</AlertDescription>
			</Alert>
		{/if}

		{#if uploads.length > 0}
			<Card.Root>
				<Card.Content class="space-y-2">
					{#each uploads as upload (upload.key)}
						<div class="text-sm">
							<div class="flex justify-between gap-2">
								<span class="truncate">{upload.name}</span>
								<span>{upload.state === 'error' ? 'Error' : `${upload.progress}%`}</span>
							</div>
							{#if upload.state === 'error' && upload.message}
								<p role="alert" class="text-xs text-destructive">{upload.message}</p>
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
						{#if editable && requirement.isRequired && groupPhotos(requirement.id).length === 0}
							<Chip tone="attention">Falta evidencia</Chip>
						{/if}
						<span class="text-sm font-normal text-muted-foreground">
							{groupPhotos(requirement.id).length} foto(s)
						</span>
					</Card.Title>
					<div class="flex items-center gap-1">
						<Button
							variant="ghost"
							size="sm"
							aria-expanded={!collapsedGroups[requirement.id]}
							onclick={() => toggleGroup(requirement.id)}
						>
							{collapsedGroups[requirement.id] ? 'Mostrar' : 'Ocultar'}
						</Button>
						{#if isAdmin && editable}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => {
									renameTarget = requirement;
									renameValue = requirement.name;
								}}
							>
								Renombrar
							</Button>
							<Button variant="ghost" size="sm" onclick={() => toggleRequired(requirement)}>
								{requirement.isRequired ? 'Hacer opcional' : 'Hacer obligatorio'}
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onclick={() => (pendingRequirement = requirement)}
							>
								Eliminar
							</Button>
						{/if}
					</div>
				</Card.Header>
				{#if !collapsedGroups[requirement.id]}
					<Card.Content class="space-y-3">
						{@render PhotoGrid({
							editable,
							group: groupPhotos(requirement.id),
							onremove: (photo) => (pendingRemove = photo),
							onmove: (photoId, direction) => movePhoto(requirement.id, photoId, direction),
							onopen: (photo) => (lightbox = photo)
						})}

						{#if editable}
							{@render PhotoInputs({ requirementId: requirement.id })}
						{/if}
					</Card.Content>
				{/if}
			</Card.Root>
		{/each}

		<Card.Root>
			<Card.Header class="flex flex-wrap items-center justify-between gap-2">
				<Card.Title class="text-base">
					{requirements.length === 0 ? NO_REQUIREMENT_GROUP_LABEL : ADDITIONAL_GROUP_LABEL}
				</Card.Title>
				<div class="flex items-center gap-2">
					<span class="text-sm text-muted-foreground">{additionalPhotos.length} foto(s)</span>
					<Button
						variant="ghost"
						size="sm"
						aria-expanded={!collapsedGroups.additional}
						onclick={() => toggleGroup('additional')}
					>
						{collapsedGroups.additional ? 'Mostrar' : 'Ocultar'}
					</Button>
				</div>
			</Card.Header>
			{#if !collapsedGroups.additional}
				<Card.Content class="space-y-3">
					{@render PhotoGrid({
						editable,
						group: additionalPhotos,
						onremove: (photo) => (pendingRemove = photo),
						onmove: (photoId, direction) => movePhoto(null, photoId, direction),
						onopen: (photo) => (lightbox = photo)
					})}
					{#if editable}
						{@render PhotoInputs({ requirementId: null })}
					{/if}
				</Card.Content>
			{/if}
		</Card.Root>

		{#if isAdmin && editable}
			<Card.Root>
				<Card.Header class="flex flex-wrap items-center justify-between gap-2">
					<Card.Title class="text-base">Requisitos (solo antes del primer envío)</Card.Title>
					<Button size="sm" onclick={() => (requirementOpen = true)}>Nuevo requisito</Button>
				</Card.Header>
				<Card.Content class="space-y-3">
					{#if requirements.length === 0}
						<p class="text-sm text-muted-foreground">
							Sin requisitos. Añádelos para exigir evidencia concreta en cada sección.
						</p>
					{:else}
						<p class="text-sm text-muted-foreground">
							{requirements.length} requisito(s). Añade o renombra desde su cabecera.
						</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Dialog.Root bind:open={requirementOpen}>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Añadir requisitos</Dialog.Title>
						<Dialog.Description>
							Los requisitos se congelan tras el primer envío.
						</Dialog.Description>
					</Dialog.Header>
					<Tabs.Root bind:value={requirementTab}>
						<Tabs.List class="grid w-full grid-cols-2">
							<Tabs.Trigger value="custom">Nuevo</Tabs.Trigger>
							<Tabs.Trigger value="catalog" disabled={requirementCatalogs.length === 0}>
								Desde catálogo
							</Tabs.Trigger>
						</Tabs.List>
					</Tabs.Root>

					{#if requirementTab === 'custom'}
						<form
							class="space-y-4"
							onsubmit={(event) => {
								event.preventDefault();
								createRequirement();
							}}
						>
							<div class="space-y-2">
								<Label for="new-requirement">Nombre</Label>
								<Input
									id="new-requirement"
									bind:value={newRequirement}
									placeholder="p. ej. Antes"
									required
								/>
							</div>
							<LabeledCheckbox bind:checked={newRequired} label="Obligatorio" />
							<Dialog.Footer>
								<Dialog.Close>Cancelar</Dialog.Close>
								<Button type="submit" disabled={busy}>Añadir requisito</Button>
							</Dialog.Footer>
						</form>
					{:else}
						<div class="space-y-4">
							<CatalogItemMultiPicker
								catalogs={requirementCatalogs}
								bind:value={catalogRequirementIds}
								itemPlaceholder="Elegir requisitos…"
								disabled={busy}
							/>
							<LabeledCheckbox bind:checked={catalogRequired} label="Obligatorio" />
							<Dialog.Footer>
								<Dialog.Close>Cancelar</Dialog.Close>
								<Button
									type="button"
									disabled={busy || catalogRequirementIds.length === 0}
									onclick={addCatalogRequirements}
								>
									Añadir seleccionados
								</Button>
							</Dialog.Footer>
						</div>
					{/if}
				</Dialog.Content>
			</Dialog.Root>
		{/if}

		{#if editable}
			<div
				class="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t bg-background/95 px-4 pt-2 pb-2 backdrop-blur md:static md:bottom-auto md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					{#if submitError}
						<p role="alert" class="text-sm text-destructive">{submitError}</p>
					{:else if !online}
						<p class="text-sm text-destructive">
							Sin conexión: no puedes enviar evidencia hasta reconectar.
						</p>
					{:else if !readiness.ready}
						<p class="text-sm text-muted-foreground">
							{readiness.needsAnyPhoto
								? 'Añade al menos una fotografía para poder enviar.'
								: `Falta evidencia obligatoria en: ${readiness.missingNames.join(', ')}.`}
						</p>
					{/if}
					<Button class="max-md:w-full" disabled={!online} onclick={() => (showSubmit = true)}
						>Enviar evidencia</Button
					>
				</div>
			</div>
		{/if}
	{:else}
		{#if history.length === 0}
			<EmptyState title="Sin entregas todavía" description="Aquí verás el historial de entregas." />
		{:else}
			<ul class="space-y-3">
				{#each history as entry (entry.id)}
					<li>
						<Card.Root>
							<Card.Content class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p class="flex items-center gap-2 font-medium">
										Entrega #{entry.sequenceNo}
										{#if entry.decision === 'approved'}
											<StatusBadge status="approved" />
										{:else if entry.decision === 'rejected'}
											<StatusBadge status="rejected" />
										{:else}
											<StatusBadge status="in_review" label="Pendiente" />
										{/if}
									</p>
									<p class="text-sm text-muted-foreground">
										{formatDate(entry.submittedAt)} · {entry.submittedByName ?? 'Autor desconocido'} ·
										{entry.photoCount} foto(s)
									</p>
									{#if entry.decision === 'rejected' && entry.reason}
										<p class="text-sm">Motivo: {entry.reason}</p>
									{/if}
								</div>
								<Button
									href={resolve('/(app)/submissions/[submissionId]', { submissionId: entry.id })}
									variant="outline"
									size="sm">Ver entrega</Button
								>
							</Card.Content>
						</Card.Root>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<AlertDialog.Root bind:open={showSubmit}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>¿Enviar esta evidencia a revisión?</AlertDialog.Title>
				<AlertDialog.Description>
					Se enviarán {photos.length} fotografía(s). La edición quedará bloqueada para todos los técnicos
					hasta que sea revisada.
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if !readiness.ready}
				<p class="text-sm text-destructive">
					{readiness.needsAnyPhoto
						? 'Añade al menos una fotografía antes de enviar.'
						: `Falta evidencia obligatoria en: ${readiness.missingNames.join(', ')}.`}
				</p>
			{/if}
			{#if submitError}
				<p role="alert" class="text-sm text-destructive">{submitError}</p>
			{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={submitting}>Cancelar</AlertDialog.Cancel>
				<Button disabled={submitting || !readiness.ready} onclick={submitEvidence}>
					{submitting ? 'Enviando…' : 'Confirmar envío'}
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<AlertDialog.Root
		open={pendingRemove !== null}
		onOpenChange={(open) => {
			if (!open) pendingRemove = null;
		}}
	>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>¿Retirar esta fotografía?</AlertDialog.Title>
				<AlertDialog.Description>
					Dejará de estar en la evidencia vigente, pero no se borra: las entregas anteriores la
					conservan.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
				<Button
					variant="destructive"
					onclick={() => {
						const photo = pendingRemove;
						pendingRemove = null;
						if (photo) removePhoto(photo);
					}}
				>
					Retirar
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<AlertDialog.Root
		open={pendingRequirement !== null}
		onOpenChange={(open) => {
			if (!open) pendingRequirement = null;
		}}
	>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>¿Eliminar este requisito?</AlertDialog.Title>
				<AlertDialog.Description>
					«{pendingRequirement?.name ?? ''}» se elimina de la evidencia; sus fotografías pasan al
					grupo Adicionales.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
				<Button
					variant="destructive"
					onclick={() => {
						const requirement = pendingRequirement;
						pendingRequirement = null;
						if (requirement) deleteRequirement(requirement);
					}}
				>
					Eliminar requisito
				</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<Dialog.Root
		open={renameTarget !== null}
		onOpenChange={(open) => {
			if (!open) renameTarget = null;
		}}
	>
		<Dialog.Content>
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					const requirement = renameTarget;
					if (!requirement) return;
					renameTarget = null;
					renameRequirement(requirement, renameValue);
				}}
			>
				<Dialog.Header>
					<Dialog.Title>Renombrar requisito</Dialog.Title>
					<Dialog.Description>
						Al renombrarlo queda desvinculado del catálogo y conserva este nombre propio.
					</Dialog.Description>
				</Dialog.Header>
				<div class="space-y-2">
					<Label for="req-rename">Nombre</Label>
					<Input id="req-rename" bind:value={renameValue} required />
				</div>
				<Dialog.Footer>
					<Dialog.Close>Cancelar</Dialog.Close>
					<Button type="submit">Guardar</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<Dialog.Root
		open={lightbox !== null}
		onOpenChange={(open) => {
			if (!open) lightbox = null;
		}}
	>
		<Dialog.Content class="sm:max-w-2xl">
			<Dialog.Header>
				<Dialog.Title class="sr-only">Fotografía de evidencia</Dialog.Title>
				<Dialog.Description class="sr-only">Vista ampliada de la fotografía.</Dialog.Description>
			</Dialog.Header>
			{#if lightbox}
				<img
					src={`/api/photos/${lightbox.id}/content`}
					alt="Fotografía de evidencia"
					class="mx-auto max-h-[70vh] w-full rounded-lg object-contain"
				/>
			{/if}
			<Dialog.Footer>
				{#if lightbox}
					<Button
						href={`/api/photos/${lightbox.id}/content?download=1`}
						variant="outline"
						size="sm"
					>
						Descargar
					</Button>
				{/if}
				<Dialog.Close>Cerrar</Dialog.Close>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Hoja inferior (móvil) con las acciones de foto. -->
	<Sheet.Root bind:open={addSheetOpen}>
		<Sheet.Content side="bottom">
			<Sheet.Header>
				<Sheet.Title>Añadir fotos</Sheet.Title>
				<Sheet.Description>
					{addSheetRequirement
						? 'Se añadirán a esta sección.'
						: 'Se añadirán al grupo de adicionales.'}
				</Sheet.Description>
			</Sheet.Header>
			<div class="grid gap-2">
				<label
					class="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 text-base hover:bg-muted"
				>
					<input
						type="file"
						accept="image/*"
						capture="environment"
						disabled={!online}
						class="hidden"
						onchange={(event) => {
							handleFiles(addSheetRequirement, event.currentTarget.files);
							event.currentTarget.value = '';
							addSheetOpen = false;
						}}
					/>
					<Camera class="size-5" aria-hidden="true" />
					Tomar foto
				</label>
				<label
					class="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 text-base hover:bg-muted"
				>
					<input
						type="file"
						accept="image/*"
						multiple
						disabled={!online}
						class="hidden"
						onchange={(event) => {
							handleFiles(addSheetRequirement, event.currentTarget.files);
							event.currentTarget.value = '';
							addSheetOpen = false;
						}}
					/>
					<ImageIcon class="size-5" aria-hidden="true" />
					Elegir fotos
				</label>
			</div>
			<p class="text-xs text-muted-foreground">
				Consejo: mantén pulsada una foto y arrastra para reordenarla; también puedes usar ↑/↓.
			</p>
		</Sheet.Content>
	</Sheet.Root>
</div>

{#snippet PhotoInputs(options: { requirementId: string | null })}
	<!-- Escritorio: botones directos. -->
	<div class="hidden flex-wrap gap-2 md:flex">
		<label class="cursor-pointer">
			<input
				type="file"
				accept="image/*"
				capture="environment"
				disabled={!online}
				class="hidden"
				onchange={(event) => {
					handleFiles(options.requirementId, event.currentTarget.files);
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
			<input
				type="file"
				accept="image/*"
				multiple
				disabled={!online}
				class="hidden"
				onchange={(event) => {
					handleFiles(options.requirementId, event.currentTarget.files);
					event.currentTarget.value = '';
				}}
			/>
			<span
				class="inline-flex h-8 items-center rounded-lg border border-input px-3 text-sm hover:bg-muted"
			>
				Elegir fotos
			</span>
		</label>
	</div>
	<!-- Móvil: un botón primario que abre la hoja de acciones. -->
	<Button
		type="button"
		variant="outline"
		class="w-full md:hidden"
		disabled={!online}
		onclick={() => {
			addSheetRequirement = options.requirementId;
			addSheetOpen = true;
		}}
	>
		Añadir fotos
	</Button>
{/snippet}

{#snippet PhotoGrid(options: {
	editable: boolean;
	group: Photo[];
	onremove: (photo: Photo) => void;
	onmove: (photoId: string, direction: -1 | 1) => void;
	onopen: (photo: Photo) => void;
})}
	{#if options.group.length === 0}
		<p class="text-sm text-muted-foreground">Sin fotografías.</p>
	{:else}
		<ul class="flex flex-wrap gap-3">
			{#each options.group as photo, index (photo.id)}
				<li
					class="w-32 space-y-1 {draggingId === photo.id
						? 'opacity-70 outline-2 outline-primary/60 outline-dashed'
						: ''}"
					style={draggingId === photo.id ? 'touch-action: none' : ''}
					onpointerdown={(event) => beginPress(photo, event)}
					onpointermove={(event) => pressMove(photo, event, options.onmove)}
					onpointerup={() => endPress(photo)}
					onpointercancel={() => endPress(photo)}
				>
					<button
						type="button"
						class="block w-full"
						onclick={() => {
							if (dragMoved) {
								dragMoved = false;
								return;
							}
							options.onopen(photo);
						}}
					>
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
									class="max-md:size-11"
									disabled={index === 0}
									aria-label="Mover antes"
									onclick={() => options.onmove(photo.id, -1)}
								>
									↑
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									class="max-md:size-11"
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
								class="max-md:size-11"
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
