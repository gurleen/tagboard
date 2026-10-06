<script lang="ts">
	import { assetUrl, resolveAsset } from '$lib/media/cache';
	import PlatformGlyph from '$lib/components/platform-glyph.svelte';
	import { attachmentsOf, avatarOf, type PostRecord } from '$lib/repository/posts';
	import { formatHandle } from '$lib/ingestion/permalink';
	import type { Board, Media } from '$lib/database/schema';

	let { record, board }: { record: PostRecord; board: Board } = $props();

	const avatar = $derived(avatarOf(record));
	const attachments = $derived(attachmentsOf(record));
	const attachment = $derived(attachments[0]);

	/**
	 * The board window renders cached files only. An asset that never downloaded
	 * is left out rather than fetched at air time, so the wall never waits on the
	 * network.
	 */
	async function cachedUrl(asset: Media | undefined): Promise<string | null> {
		if (!asset || asset.cacheState !== 'cached' || !asset.cachedPath) return null;
		const absolute = await resolveAsset(asset.cachedPath);
		return absolute ? assetUrl(absolute) : null;
	}

	const avatarUrl = $derived(cachedUrl(avatar));
	const attachmentUrl = $derived(cachedUrl(attachment));

	const timestamp = $derived(
		record.postedAt
			? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
					record.postedAt
				)
			: null
	);

	function formatCount(value: number | null): string {
		if (value === null) return '0';
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
		if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
		return String(value);
	}
</script>

<article class="tile">
	<header class="panel identity">
		{#await avatarUrl then url}
			{#if url}
				<img class="avatar" src={url} alt="" />
			{:else}
				<div class="avatar initial">{record.authorName.charAt(0).toUpperCase()}</div>
			{/if}
		{/await}
		<div class="names">
			<div class="name">{record.authorName}</div>
			{#if record.authorHandle}
				<div class="handle">{formatHandle(record.authorHandle)}</div>
			{/if}
		</div>
		{#if board.showPlatformBadge}
			<div class="platform"><PlatformGlyph platform={record.platform} /></div>
		{/if}
	</header>

	{#if record.body || attachment}
		<div class="panel content">
			{#if record.body}
				<p class="body">{record.body}</p>
			{/if}

			{#await attachmentUrl then url}
				{#if url && attachment?.kind === 'video'}
					<video class="attachment" src={url} autoplay muted loop playsinline></video>
				{:else if url}
					<img class="attachment" src={url} alt={attachment?.description ?? ''} />
				{/if}
			{/await}
		</div>
	{/if}

	{#if board.showMetrics || (board.showTimestamp && timestamp)}
		<footer class="panel strip">
			{#if board.showMetrics}
				<span><strong>{formatCount(record.likeCount)}</strong> likes</span>
				<span><strong>{formatCount(record.repostCount)}</strong> reposts</span>
			{/if}
			{#if board.showTimestamp && timestamp}
				<span class="timestamp">{timestamp}</span>
			{/if}
		</footer>
	{/if}
</article>

<style>
	/*
	 * A post is built like a broadcast lower third: a panel naming the author,
	 * a panel holding the post, and a strip of detail beneath, separated by
	 * 4-unit seams. Outer corners take the board's radius, seams take 3.
	 */
	.tile {
		--seam: calc(3 * var(--unit));
		display: flex;
		/* A post is as tall as it is and no taller; the cell it sits in is only a
		   ceiling, which a long caption over a tall photograph can still reach. */
		min-height: 0;
		flex: 0 1 auto;
		flex-direction: column;
		gap: calc(4 * var(--unit));
		filter: drop-shadow(0 calc(4 * var(--unit)) calc(18 * var(--unit)) rgb(0 0 0 / 0.36));
		color: var(--board-text);
	}

	/* Dark glass: the surface at 82%, glazed from clear at the top to 30% black
	   at the foot. */
	.panel {
		position: relative;
		border-radius: var(--seam);
		background:
			linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.3)),
			color-mix(in srgb, var(--board-surface) 82%, transparent);
	}

	.panel:first-child {
		border-top-left-radius: var(--board-radius);
		border-top-right-radius: var(--board-radius);
	}

	.panel:last-child {
		border-bottom-right-radius: var(--board-radius);
		border-bottom-left-radius: var(--board-radius);
	}

	/* The hairline edge, lit from above and fading to a trace by 60% down. */
	.panel::before {
		position: absolute;
		padding: 1px;
		border-radius: inherit;
		background: linear-gradient(
			to bottom,
			rgb(255 255 255 / 0.45),
			rgb(255 255 255 / 0.06) 60%,
			rgb(255 255 255 / 0.06)
		);
		content: '';
		inset: 0;
		-webkit-mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		mask-composite: exclude;
		pointer-events: none;
	}

	.identity {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: calc(18 * var(--unit));
		overflow: hidden;
		padding: calc(14 * var(--unit)) calc(22 * var(--unit)) calc(14 * var(--unit))
			calc(26 * var(--unit));
	}

	/* The marker: the accent colour down the leading edge of the first panel. */
	.identity::after {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: calc(8 * var(--unit));
		background: var(--board-accent);
		content: '';
	}

	.avatar {
		width: calc(64 * var(--unit));
		height: calc(64 * var(--unit));
		flex-shrink: 0;
		border-radius: var(--seam);
		object-fit: cover;
	}

	.initial {
		display: flex;
		align-items: center;
		justify-content: center;
		background:
			linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.3)),
			color-mix(in srgb, var(--board-accent) 78%, rgb(0 0 0 / 0.35));
		font-size: 1.6em;
		font-weight: 700;
	}

	.names {
		min-width: 0;
		flex: 1;
		text-transform: uppercase;
	}

	.name {
		overflow: hidden;
		font-size: 1.75em;
		font-weight: 700;
		letter-spacing: 0.01em;
		line-height: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.handle {
		overflow: hidden;
		margin-top: 0.15em;
		color: color-mix(in srgb, var(--board-text) 70%, transparent);
		font-size: 0.95em;
		letter-spacing: 0.09em;
		line-height: 1.1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.platform {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		color: color-mix(in srgb, var(--board-text) 70%, transparent);
		font-size: 1.3em;
	}

	.content {
		display: flex;
		min-height: 0;
		flex: 0 1 auto;
		flex-direction: column;
		gap: calc(16 * var(--unit));
		overflow: hidden;
		padding: calc(20 * var(--unit)) calc(26 * var(--unit));
	}

	.body {
		overflow: hidden;
		flex-shrink: 0;
		margin: 0;
		font-size: 1.4em;
		line-height: 1.12;
		letter-spacing: 0.01em;
	}

	.attachment {
		min-height: 0;
		/* Shown whole at its own proportions, and allowed to shrink when the cell
		   cannot hold it; `cover` would crop a portrait photograph to a band. */
		flex: 0 1 auto;
		width: 100%;
		border-radius: var(--seam);
		object-fit: contain;
		object-position: top left;
	}

	/* The strip: denser glass, Regular labels after Bold values. */
	.strip {
		display: flex;
		flex-shrink: 0;
		align-items: baseline;
		gap: calc(24 * var(--unit));
		padding: calc(8 * var(--unit)) calc(26 * var(--unit));
		background:
			linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.3)),
			color-mix(in srgb, var(--board-surface) 88%, transparent);
		color: color-mix(in srgb, var(--board-text) 65%, transparent);
		font-size: 0.95em;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.strip strong {
		color: var(--board-text);
		font-size: 1.15em;
		font-weight: 700;
		letter-spacing: 0.03em;
	}

	.timestamp {
		margin-left: auto;
	}
</style>
