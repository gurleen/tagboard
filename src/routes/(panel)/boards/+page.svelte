<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { isTauri } from '@tauri-apps/api/core';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Text } from '$lib/components/ui/text/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { NonIdealState } from '$lib/components/ui/non-ideal-state/index.js';
	import BoardOutputControls from '$lib/components/board-output-controls.svelte';
	import {
		createBoard,
		deleteBoard,
		listBoards,
		pageSize,
		setLiveBoard
	} from '$lib/repository/boards';
	import type { Board } from '$lib/database/schema';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import RadioIcon from '@lucide/svelte/icons/radio';
	import MonitorOffIcon from '@lucide/svelte/icons/monitor-off';

	let boards = $state<Board[]>([]);
	let loading = $state(true);
	let newBoardName = $state('');
	const insideTauri = isTauri();

	async function refresh() {
		if (!insideTauri) {
			loading = false;
			return;
		}
		loading = true;
		try {
			boards = await listBoards();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			loading = false;
		}
	}

	onMount(refresh);

	async function create() {
		if (!newBoardName.trim()) return;
		const board = await createBoard(newBoardName);
		newBoardName = '';
		toast.success(`Created “${board.name}”.`);
		await refresh();
	}

	async function goLive(board: Board) {
		await setLiveBoard(board.isLive ? null : board.id);
		toast.success(board.isLive ? 'Board taken off air.' : `“${board.name}” is on air.`);
		await refresh();
	}

	async function remove(board: Board) {
		await deleteBoard(board.id);
		toast.info('Board deleted. Its posts stay in the library.');
		await refresh();
	}
</script>

<div class="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
	<div>
		<Text class="text-xl font-semibold sm:text-2xl">Boards</Text>
		<Text class="text-sm text-muted-foreground">
			Each board is one video wall output: a grid shape, a rotation speed and a look. One board is
			on air at a time.
		</Text>
	</div>

	<BoardOutputControls />

	<div class="flex items-center gap-2">
		<Input class="w-64" placeholder="New board name" bind:value={newBoardName} />
		<Button onclick={create} disabled={!insideTauri || !newBoardName.trim()}>
			<PlusIcon />
			Create board
		</Button>
	</div>

	{#if !insideTauri}
		<NonIdealState
			icon={MonitorOffIcon}
			title="Running outside the desktop application"
			description="The database and media cache live in the Tauri runtime. Start the control panel with `bun run tauri:dev`."
		/>
	{:else if loading}
		<div class="flex justify-center p-12"><Spinner /></div>
	{:else if boards.length === 0}
		<NonIdealState
			icon={LayoutGridIcon}
			title="No boards yet"
			description="Create a board, then add approved posts to it from the library."
		/>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each boards as board (board.id)}
				<Card.Root>
					<Card.Header>
						<div class="flex items-start justify-between gap-2">
							<Card.Title>{board.name}</Card.Title>
							{#if board.isLive}
								<Badge variant="destructive">
									<RadioIcon />
									On air
								</Badge>
							{/if}
						</div>
						<Card.Description>
							{board.layout === 'grid'
								? `${board.columnCount} × ${board.rowCount} grid`
								: board.layout} · {pageSize(board)} per page · {Math.round(
								board.rotationIntervalMs / 1000
							)}s rotation
						</Card.Description>
					</Card.Header>
					<Card.Footer class="gap-2">
						<Button variant="secondary" size="sm" href="/boards/{board.id}">Edit</Button>
						<Button
							variant={board.isLive ? 'warning' : 'default'}
							size="sm"
							onclick={() => goLive(board)}
						>
							<RadioIcon />
							{board.isLive ? 'Take off air' : 'Put on air'}
						</Button>
						<Button variant="ghost" size="sm" class="ml-auto" onclick={() => remove(board)}>
							<Trash2Icon />
						</Button>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
