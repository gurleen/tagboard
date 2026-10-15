<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Text } from '$lib/components/ui/text/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { NonIdealState } from '$lib/components/ui/non-ideal-state/index.js';
	import { formatHandle } from '$lib/ingestion/permalink';
	import { describeError } from '$lib/utils';
	import type { BoardEntryRecord, BoardRecord } from '$lib/database/records';
	import {
		listEntries,
		removeEntry,
		reorderEntries,
		requireBoard,
		setEntryPinned,
		updateBoard,
		type BoardPatch
	} from '$lib/remote/boards.remote';
	import { BOARD_LAYOUTS, BOARD_TRANSITIONS } from '$lib/database/schema';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import PinIcon from '@lucide/svelte/icons/pin';
	import XIcon from '@lucide/svelte/icons/x';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';

	const boardId = $derived(page.params.boardId!);

	let record = $state<BoardRecord | null>(null);
	let entries = $state<BoardEntryRecord[]>([]);
	let loading = $state(true);

	async function refresh() {
		loading = true;
		try {
			record = await requireBoard(boardId);
			entries = record.entries;
		} catch (error) {
			toast.error(describeError(error));
		} finally {
			loading = false;
		}
	}

	onMount(refresh);

	/** Writes one field through to the board row and reloads the local copy. */
	async function patch<K extends keyof BoardPatch>(key: K, value: BoardPatch[K]) {
		if (!record) return;
		try {
			await updateBoard({ boardId: record.id, patch: { [key]: value } });
		} catch (error) {
			toast.error(describeError(error));
		}
		await refresh();
	}

	/** Runs a change to the running order, then reloads it whether or not the change succeeded. */
	async function changeEntries(action: () => Promise<unknown>) {
		try {
			await action();
		} catch (error) {
			toast.error(describeError(error));
		}
		try {
			entries = await listEntries(boardId);
		} catch (error) {
			toast.error(describeError(error));
		}
	}

	/** Moves an entry one slot in the given direction and persists the new order. */
	function move(entry: BoardEntryRecord, offset: -1 | 1) {
		const index = entries.findIndex((item) => item.id === entry.id);
		const target = index + offset;
		if (index < 0 || target < 0 || target >= entries.length) return;

		const reordered = [...entries];
		[reordered[index], reordered[target]] = [reordered[target], reordered[index]];
		entries = reordered;

		return changeEntries(() => reorderEntries(reordered.map((item) => item.id)));
	}

	function remove(entry: BoardEntryRecord) {
		return changeEntries(() => removeEntry(entry.id));
	}

	function togglePin(entry: BoardEntryRecord) {
		return changeEntries(() => setEntryPinned({ entryId: entry.id, pinned: !entry.pinned }));
	}
</script>

<div class="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
	<Button variant="ghost" size="sm" href="/boards">
		<ArrowLeftIcon />
		All boards
	</Button>

	{#if loading}
		<div class="flex justify-center p-12"><Spinner /></div>
	{:else if !record}
		<NonIdealState icon={LayoutGridIcon} title="That board no longer exists" />
	{:else}
		<div>
			<Text class="text-xl font-semibold sm:text-2xl">{record.name}</Text>
			<Text class="text-sm text-muted-foreground">
				{entries.length} post{entries.length === 1 ? '' : 's'} on this board.
			</Text>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Layout and timing</Card.Title>
			</Card.Header>
			<Card.Content class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="board-name">Name</Label>
					<Input
						id="board-name"
						value={record.name}
						onchange={(event: Event) =>
							patch('name', (event.currentTarget as HTMLInputElement).value)}
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="board-layout">Layout</Label>
					<Select.Root
						type="single"
						value={record.layout}
						onValueChange={(value) => patch('layout', value as BoardPatch['layout'])}
					>
						<Select.Trigger id="board-layout">{record.layout}</Select.Trigger>
						<Select.Content>
							{#each BOARD_LAYOUTS as layout (layout)}
								<Select.Item value={layout}>{layout}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="space-y-1.5">
					<Label for="board-columns">Columns</Label>
					<Input
						id="board-columns"
						type="number"
						min="1"
						max="8"
						value={record.columnCount}
						onchange={(event: Event) =>
							patch('columnCount', Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="board-rows">Rows</Label>
					<Input
						id="board-rows"
						type="number"
						min="1"
						max="8"
						value={record.rowCount}
						onchange={(event: Event) =>
							patch('rowCount', Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="board-interval">Rotation interval (seconds)</Label>
					<Input
						id="board-interval"
						type="number"
						min="1"
						max="120"
						value={Math.round(record.rotationIntervalMs / 1000)}
						onchange={(event: Event) =>
							patch(
								'rotationIntervalMs',
								Number((event.currentTarget as HTMLInputElement).value) * 1000
							)}
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="board-transition">Transition</Label>
					<Select.Root
						type="single"
						value={record.transition}
						onValueChange={(value) => patch('transition', value as BoardPatch['transition'])}
					>
						<Select.Trigger id="board-transition">{record.transition}</Select.Trigger>
						<Select.Content>
							{#each BOARD_TRANSITIONS as transition (transition)}
								<Select.Item value={transition}>{transition}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Shown on each card</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-6">
				<div class="flex items-center gap-2">
					<Switch
						id="show-metrics"
						checked={record.showMetrics}
						onCheckedChange={(checked) => patch('showMetrics', checked)}
					/>
					<Label for="show-metrics">Engagement counts</Label>
				</div>
				<div class="flex items-center gap-2">
					<Switch
						id="show-timestamp"
						checked={record.showTimestamp}
						onCheckedChange={(checked) => patch('showTimestamp', checked)}
					/>
					<Label for="show-timestamp">Timestamp</Label>
				</div>
				<div class="flex items-center gap-2">
					<Switch
						id="show-platform"
						checked={record.showPlatformBadge}
						onCheckedChange={(checked) => patch('showPlatformBadge', checked)}
					/>
					<Label for="show-platform">Platform badge</Label>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Running order</Card.Title>
				<Card.Description>
					Posts rotate in this order. Pinned posts hold their cell instead of rotating out.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if entries.length === 0}
					<NonIdealState
						icon={LayoutGridIcon}
						title="No posts on this board"
						description="Approve a post, then add it from the library."
					/>
				{:else}
					<ol class="divide-y divide-border">
						{#each entries as entry, index (entry.id)}
							<li class="flex items-center gap-3 py-2">
								<span class="w-6 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium">
										{entry.post.authorName}
										<span class="text-muted-foreground"
											>{formatHandle(entry.post.authorHandle)}</span
										>
									</div>
									<div class="truncate text-xs text-muted-foreground">{entry.post.body}</div>
								</div>
								{#if entry.pinned}
									<Badge variant="warning">Pinned</Badge>
								{/if}
								<Button variant="ghost" size="icon-sm" onclick={() => move(entry, -1)}>
									<ArrowUpIcon />
								</Button>
								<Button variant="ghost" size="icon-sm" onclick={() => move(entry, 1)}>
									<ArrowDownIcon />
								</Button>
								<Button variant="ghost" size="icon-sm" onclick={() => togglePin(entry)}>
									<PinIcon />
								</Button>
								<Button variant="ghost" size="icon-sm" onclick={() => remove(entry)}>
									<XIcon />
								</Button>
							</li>
						{/each}
					</ol>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
