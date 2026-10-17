<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Label } from '#lib/components/ui/label';
	import { NativeSelect } from '#lib/components/ui/native-select';

	type Candidate = { id: string; displayName: string };
	type Assignment = {
		id: string;
		displayName: string;
		assignmentRole: 'technician' | 'supervisor';
	};

	let {
		assignAction,
		scopeField,
		scopeId,
		technicians,
		supervisors,
		assignments,
		onRevoke,
		enhanceAssign
	}: {
		assignAction: string;
		scopeField: 'contractId' | 'serviceId';
		scopeId: string;
		technicians: Candidate[];
		supervisors: Candidate[];
		assignments: Assignment[];
		onRevoke: (assignment: Assignment) => void;
		enhanceAssign?: NonNullable<Parameters<typeof enhance>[1]>;
	} = $props();

	let role = $state<'' | 'technician' | 'supervisor'>('');
	let userId = $state('');

	const noEnhance: NonNullable<Parameters<typeof enhance>[1]> = () => undefined;

	const candidates = $derived(
		role === 'technician' ? technicians : role === 'supervisor' ? supervisors : []
	);
	const currentTechnicians = $derived(
		assignments.filter((assignment) => assignment.assignmentRole === 'technician')
	);
	const currentSupervisors = $derived(
		assignments.filter((assignment) => assignment.assignmentRole === 'supervisor')
	);
	const canAssign = $derived(role !== '' && userId !== '' && candidates.length > 0);

	function chooseRole(next: 'technician' | 'supervisor') {
		role = next;
		userId = '';
	}
</script>

<Dialog.Section
	eyebrow="Paso 1"
	title="Añadir participante"
	description="Elige primero el rol y después la persona."
>
	<div class="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
		<div class="space-y-1.5">
			<span class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
				Rol
			</span>
			<div class="flex gap-2" role="group" aria-label="Rol del participante">
				<Button
					type="button"
					variant={role === 'technician' ? 'default' : 'outline'}
					aria-pressed={role === 'technician'}
					onclick={() => chooseRole('technician')}>Técnico</Button
				>
				<Button
					type="button"
					variant={role === 'supervisor' ? 'default' : 'outline'}
					aria-pressed={role === 'supervisor'}
					onclick={() => chooseRole('supervisor')}>Supervisor</Button
				>
			</div>
		</div>
		<div class="space-y-1.5">
			<Label for="participant-user">Persona</Label>
			<NativeSelect
				id="participant-user"
				bind:value={userId}
				disabled={!role || candidates.length === 0}
				required
			>
				<option value="" disabled>
					{!role
						? 'Selecciona un rol primero'
						: candidates.length === 0
							? 'Sin personas disponibles'
							: 'Selecciona una persona'}
				</option>
				{#each candidates as candidate (candidate.id)}
					<option value={candidate.id}>{candidate.displayName}</option>
				{/each}
			</NativeSelect>
		</div>
		<form
			method="POST"
			action={assignAction}
			use:enhance={enhanceAssign ?? noEnhance}
			class="sm:pb-0"
		>
			<input type="hidden" name={scopeField} value={scopeId} />
			<input type="hidden" name="role" value={role} />
			<input type="hidden" name="userId" value={userId} />
			<Button type="submit" disabled={!canAssign} class="w-full sm:w-auto">Añadir</Button>
		</form>
	</div>
</Dialog.Section>

<Dialog.Section title={`Participantes actuales (${assignments.length})`}>
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="space-y-2">
			<p class="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
				Técnicos ({currentTechnicians.length})
			</p>
			{#if currentTechnicians.length === 0}
				<p
					class="rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
				>
					Sin técnicos asignados.
				</p>
			{:else}
				<ul class="divide-y overflow-hidden rounded-xl border border-border">
					{#each currentTechnicians as assignment (assignment.id)}
						<li class="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
							<span class="min-w-0 truncate">{assignment.displayName}</span>
							<Button variant="destructive" size="sm" onclick={() => onRevoke(assignment)}
								>Revocar</Button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="space-y-2">
			<p class="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
				Supervisores ({currentSupervisors.length})
			</p>
			{#if currentSupervisors.length === 0}
				<p
					class="rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
				>
					Sin supervisores asignados.
				</p>
			{:else}
				<ul class="divide-y overflow-hidden rounded-xl border border-border">
					{#each currentSupervisors as assignment (assignment.id)}
						<li class="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
							<span class="min-w-0 truncate">{assignment.displayName}</span>
							<Button variant="destructive" size="sm" onclick={() => onRevoke(assignment)}
								>Revocar</Button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</Dialog.Section>
