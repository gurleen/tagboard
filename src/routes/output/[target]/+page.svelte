<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import type { TransitionConfig } from 'svelte/transition';
	import BoardPostTile from '$lib/components/board-post-tile.svelte';
	import { LIVE_OUTPUT_TARGET, readOutputState, recordOutputAired } from '$lib/board/output';
	import { pageSize, type BoardRecord } from '$lib/database/records';
	import { DEFAULT_BOARD_THEME, type BoardTheme } from '$lib/database/schema';

	/**
	 * How often the output re-reads its board.
	 *
	 * The control panel and the output are separate pages — usually on separate
	 * machines, the output inside an OBS browser source — over one database, so the
	 * output polls rather than being pushed to: an operator's edit shows up within
	 * this interval without any channel between the two.
	 */
	const REVISION_POLL_INTERVAL_MS = 3000;

	/** `live`, or a board identifier; see `$lib/board/output`. */
	const target = page.params.target!;
	const key = page.url.searchParams.get('key') ?? '';

	let record = $state<BoardRecord | null>(null);
	/**
	 * False until the first poll answers, so a source coming up in OBS shows the
	 * bare background rather than flashing a standby message.
	 */
	let loaded = $state(false);
	/** Set when the server refuses the key, so the wall says why it went blank. */
	let refused = $state(false);
	let pageIndex = $state(0);
	let signature = '';

	const theme = $derived<BoardTheme>({ ...DEFAULT_BOARD_THEME, ...(record?.theme ?? {}) });

	const pinnedEntries = $derived(record?.entries.filter((entry) => entry.pinned) ?? []);
	const rotatingEntries = $derived(record?.entries.filter((entry) => !entry.pinned) ?? []);

	/** Cells left for rotating posts once the pinned ones have taken theirs. */
	const rotatingSlotCount = $derived(
		record ? Math.max(0, pageSize(record) - pinnedEntries.length) : 0
	);

	const pageCount = $derived(
		rotatingSlotCount > 0 && rotatingEntries.length > 0
			? Math.ceil(rotatingEntries.length / rotatingSlotCount)
			: 1
	);

	const visibleEntries = $derived.by(() => {
		if (!record) return [];
		if (rotatingSlotCount === 0) return pinnedEntries.slice(0, pageSize(record));
		const start = (pageIndex % pageCount) * rotatingSlotCount;
		return [...pinnedEntries, ...rotatingEntries.slice(start, start + rotatingSlotCount)];
	});

	const columnCount = $derived(
		record ? (record.layout === 'single' ? 1 : Math.max(1, record.columnCount)) : 1
	);
	const rowCount = $derived(
		record ? (record.layout === 'grid' ? Math.max(1, record.rowCount) : 1) : 1
	);

	/**
	 * Reloads the board, replacing the local copy only when something the output
	 * actually renders has changed. Holding the same object keeps tiles from being
	 * torn down and their media reloaded on every poll.
	 *
	 * A poll that cannot reach the server changes nothing: a network blip must not
	 * blank the wall.
	 */
	async function poll() {
		const state = await readOutputState(target, key);
		if (state.status === 'unavailable') return;

		loaded = true;
		refused = state.status === 'refused';
		const next = state.status === 'ready' ? state.record : null;
		const nextSignature = describe(next);
		if (nextSignature === signature) return;

		signature = nextSignature;
		record = next;
		pageIndex = 0;
		markAired();
	}

	/** A compact description of everything on screen, used to detect real changes. */
	function describe(candidate: BoardRecord | null): string {
		if (!candidate) return '';
		return JSON.stringify({
			id: candidate.id,
			updatedAt: candidate.updatedAt,
			entries: candidate.entries.map((entry) => [
				entry.id,
				entry.position,
				entry.pinned,
				entry.post.updatedAt,
				// Media finishes caching after a post is written, without touching the
				// post row; an asset arriving is a change worth re-rendering for.
				entry.post.media.map((asset) => asset.cacheState)
			])
		});
	}

	/** Counts the posts now on screen as aired. Failures here must never stop the rotation. */
	function markAired() {
		const entryIds = visibleEntries.map((entry) => entry.id);
		if (entryIds.length === 0) return;
		recordOutputAired(target, key, entryIds).catch(() => {});
	}

	function advance() {
		if (pageCount <= 1) return;
		pageIndex = (pageIndex + 1) % pageCount;
		markAired();
	}

	onMount(() => {
		poll();
		const timer = setInterval(poll, REVISION_POLL_INTERVAL_MS);
		return () => clearInterval(timer);
	});

	$effect(() => {
		const interval = record?.rotationIntervalMs ?? 0;
		if (interval <= 0 || pageCount <= 1) return;
		const timer = setInterval(advance, interval);
		return () => clearInterval(timer);
	});

	/** Applies whichever transition the board is configured for. */
	function pageTransition(node: Element, { duration }: { duration: number }): TransitionConfig {
		if (record?.transition === 'fade') return fade(node, { duration });
		if (record?.transition === 'slide') return fly(node, { duration, y: 32 });
		return { duration: 0 };
	}
</script>

<svelte:head>
	<title>Tagboard Output</title>
</svelte:head>

<main
	class="board"
	style:--board-background={theme.backgroundColor}
	style:--board-surface={theme.surfaceColor}
	style:--board-text={theme.textColor}
	style:--board-accent={theme.accentColor}
	style:--board-radius="{theme.cornerRadiusPx}px"
	style:font-family="{theme.fontFamily}, system-ui, sans-serif"
	style:font-size="{0.9 * theme.textScale}vw"
>
	{#if !loaded}
		<!-- Nothing until the first poll answers. -->
	{:else if refused}
		<div class="standby">
			<div class="standby-mark">Tagboard</div>
			<div class="standby-note">
				This output URL is not valid. Copy a fresh one from the control panel.
			</div>
		</div>
	{:else if !record}
		<div class="standby">
			<div class="standby-mark">Tagboard</div>
			<div class="standby-note">
				{target === LIVE_OUTPUT_TARGET ? 'No board is on air.' : 'This board no longer exists.'}
			</div>
		</div>
	{:else if visibleEntries.length === 0}
		<div class="standby">
			<div class="standby-mark">{record.name}</div>
			<div class="standby-note">This board has no posts yet.</div>
		</div>
	{:else}
		<div class="stage">
			{#key pageIndex}
				<div
					class="grid"
					style:grid-template-columns="repeat({columnCount}, minmax(0, 1fr))"
					style:grid-template-rows="repeat({rowCount}, minmax(0, 1fr))"
					transition:pageTransition={{ duration: record.transitionDurationMs }}
				>
					{#each visibleEntries as entry (entry.id)}
						<BoardPostTile record={entry.post} board={record} />
					{/each}
				</div>
			{/key}
		</div>
	{/if}
</main>

<style>
	:global(html),
	:global(body) {
		overflow: hidden;
		height: 100%;
	}

	.board {
		width: 100vw;
		height: 100vh;
		box-sizing: border-box;
		padding: 1.2em;
		background: var(--board-background);
		color: var(--board-text);
	}

	.stage {
		position: relative;
		height: 100%;
	}

	/*
	 * The page is laid out against the stage rather than inside its flow. A grid
	 * whose own height is a percentage of a content-sized parent has no definite
	 * height to divide, so its `1fr` rows fall back to sizing themselves to the
	 * tallest post in each one and the last row is pushed off the screen. Taken
	 * out of flow against a stage of known height, the rows divide the screen as
	 * configured, and two pages can still occupy the same space while one
	 * transitions into the other.
	 */
	.grid {
		position: absolute;
		display: grid;
		/* Each post is drawn at the top of its cell at its own height rather than
		   stretched to fill the row. */
		align-items: start;
		gap: 1em;
		inset: 0;
	}

	.standby {
		display: flex;
		height: 100%;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5em;
	}

	.standby-mark {
		font-size: 3em;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.standby-note {
		font-size: 1.1em;
		opacity: 0.55;
	}
</style>
