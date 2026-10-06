<script lang="ts">
	import { onMount } from 'svelte';
	import type { TransitionConfig } from 'svelte/transition';
	import { isTauri } from '@tauri-apps/api/core';
	import BoardPostTile from '$lib/components/board-post-tile.svelte';
	import { liveBoard, pageSize, recordEntryAired, type BoardRecord } from '$lib/repository/boards';
	import { DEFAULT_BOARD_THEME, type BoardTheme } from '$lib/database/schema';
	import { EXIT_DURATION_RATIO, STAGGER_MS, easeIn, easeOut, frameUnit } from '$lib/board/motion';

	/**
	 * How often the board window re-reads the live board.
	 *
	 * The control panel and the board are separate windows over one database, so
	 * the board polls rather than being pushed to: an operator's edit shows up
	 * within this interval without any cross-window messaging.
	 */
	const REVISION_POLL_INTERVAL_MS = 3000;

	let record = $state<BoardRecord | null>(null);
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
	 * Reloads the live board, replacing the local copy only when something the
	 * board actually renders has changed. Holding the same object keeps tiles from
	 * being torn down and their media re-resolved on every poll.
	 */
	async function poll() {
		const next = await liveBoard();
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
				entry.post.updatedAt
			])
		});
	}

	/** Counts the posts now on screen as aired. Failures here must never stop the rotation. */
	function markAired() {
		for (const entry of visibleEntries) {
			recordEntryAired(entry.id).catch(() => {});
		}
	}

	function advance() {
		if (pageCount <= 1) return;
		pageIndex = (pageIndex + 1) % pageCount;
		markAired();
	}

	onMount(() => {
		if (!isTauri()) return;
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

	/**
	 * Opens one post the way the broadcast graphics open their glass: a leading
	 * edge wipes the panel open from the left, with a strong ease-out. `slide`
	 * also drifts the post in behind the edge. Neighbouring posts follow one
	 * another, so a page builds across the wall rather than appearing at once.
	 */
	function openPost(node: Element, { index }: { index: number }): TransitionConfig {
		const transition = record?.transition;
		if (!transition || transition === 'none') return { duration: 0 };
		const drift = transition === 'slide' ? 22 * frameUnit() : 0;
		// The mask stands off the post on three sides so its shadow is not cut.
		const bleed = 48 * frameUnit();
		return {
			delay: index * STAGGER_MS,
			duration: record?.transitionDurationMs ?? 0,
			easing: easeOut,
			css: (_t, u) =>
				`clip-path: inset(-${bleed}px ${u * 100}% -${bleed}px -${bleed}px);` +
				`transform: translateX(${-drift * u}px);`
		};
	}

	/** Takes the outgoing page away quickly, with an ease-in, under the next one opening. */
	function closePage(node: Element): TransitionConfig {
		const transition = record?.transition;
		if (!transition || transition === 'none') return { duration: 0 };
		const opacity = Number(getComputedStyle(node).opacity);
		return {
			duration: (record?.transitionDurationMs ?? 0) * EXIT_DURATION_RATIO,
			easing: easeIn,
			css: (t) => `opacity: ${t * opacity};`
		};
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
	style:--board-radius="calc({theme.cornerRadiusPx} * var(--unit))"
	style:font-family="{theme.fontFamily}, Zuume, system-ui, sans-serif"
	style:font-size="{1.25 * theme.textScale}vw"
>
	{#if !record}
		{@render standby('Tagboard', 'No board is on air')}
	{:else if visibleEntries.length === 0}
		{@render standby(record.name, 'This board has no posts yet')}
	{:else}
		<div class="stage">
			{#key pageIndex}
				<div
					class="grid"
					style:grid-template-columns="repeat({columnCount}, minmax(0, 1fr))"
					style:grid-template-rows="repeat({rowCount}, minmax(0, 1fr))"
					out:closePage
				>
					{#each visibleEntries as entry, index (entry.id)}
						<div class="cell" in:openPost|global={{ index }}>
							<BoardPostTile record={entry.post} board={record} />
						</div>
					{/each}
				</div>
			{/key}
		</div>
	{/if}
</main>

{#snippet standby(title: string, note: string)}
	<div class="standby">
		<div class="standby-block">
			<div class="standby-panel">{title}</div>
			<div class="standby-strip">{note}</div>
		</div>
	</div>
{/snippet}

<style>
	/*
	 * The look is the broadcast package's basketball v2 language: tinted dark
	 * glass, Zuume, a marker along the leading edge, 4-unit seams. Geometry is
	 * measured in units of the 1920 × 1080 broadcast frame (`--unit`), so values
	 * match the graphics' at any output resolution.
	 */
	@font-face {
		font-family: 'Zuume';
		font-weight: 400;
		src: url('/fonts/Zuume-Regular.ttf') format('truetype');
	}

	@font-face {
		font-family: 'Zuume';
		font-weight: 700;
		src: url('/fonts/Zuume-Bold.ttf') format('truetype');
	}

	:global(html),
	:global(body) {
		overflow: hidden;
		height: 100%;
	}

	.board {
		--unit: calc(100vw / 1920);
		width: 100vw;
		height: 100vh;
		box-sizing: border-box;
		/* The broadcast frame's action-safe margin, less a little: a wall has no
		   overscan to protect against. */
		padding: calc(64 * var(--unit));
		background: var(--board-background);
		color: var(--board-text);
		font-weight: 400;
		-webkit-font-smoothing: antialiased;
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
		gap: calc(24 * var(--unit));
		inset: 0;
	}

	/* Each post is drawn at the top of its cell at its own height rather than
	   stretched to fill the row; the cell is only a ceiling. */
	.cell {
		display: flex;
		min-height: 0;
		flex-direction: column;
	}

	.standby {
		display: flex;
		height: 100%;
		align-items: center;
		justify-content: center;
	}

	.standby-block {
		display: flex;
		min-width: calc(640 * var(--unit));
		flex-direction: column;
		gap: calc(4 * var(--unit));
		filter: drop-shadow(0 calc(4 * var(--unit)) calc(18 * var(--unit)) rgb(0 0 0 / 0.36));
	}

	.standby-panel,
	.standby-strip {
		position: relative;
		overflow: hidden;
		background:
			linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.3)),
			color-mix(in srgb, var(--board-surface) 82%, transparent);
		text-transform: uppercase;
	}

	.standby-panel {
		padding: calc(28 * var(--unit)) calc(48 * var(--unit)) calc(20 * var(--unit))
			calc(56 * var(--unit));
		border-radius: var(--board-radius) var(--board-radius) calc(3 * var(--unit))
			calc(3 * var(--unit));
		font-size: 5em;
		font-weight: 700;
		letter-spacing: 0.01em;
		line-height: 1;
	}

	.standby-panel::after {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: calc(8 * var(--unit));
		background: var(--board-accent);
		content: '';
	}

	.standby-strip {
		padding: calc(10 * var(--unit)) calc(48 * var(--unit)) calc(10 * var(--unit))
			calc(56 * var(--unit));
		border-radius: calc(3 * var(--unit)) calc(3 * var(--unit)) var(--board-radius)
			var(--board-radius);
		background:
			linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.3)),
			color-mix(in srgb, var(--board-surface) 88%, transparent);
		color: color-mix(in srgb, var(--board-text) 65%, transparent);
		font-size: 1.2em;
		letter-spacing: 0.09em;
	}
</style>
