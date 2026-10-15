<script lang="ts">
	import { assetUrl, playsAsVideo } from '$lib/media/asset';
	import PlatformGlyph from '$lib/components/platform-glyph.svelte';
	import { attachmentsOf, avatarOf, type PostRecord } from '$lib/database/records';
	import { formatHandle } from '$lib/ingestion/permalink';
	import type { Board } from '$lib/database/schema';

	let { record, board }: { record: PostRecord; board: Board } = $props();

	const avatar = $derived(avatarOf(record));
	const attachments = $derived(attachmentsOf(record));
	const attachment = $derived(attachments[0]);

	/**
	 * The output renders cached copies only. An asset that never downloaded is left
	 * out rather than fetched from the platform's CDN at air time.
	 */
	const avatarUrl = $derived(assetUrl(avatar));
	const attachmentUrl = $derived(assetUrl(attachment));

	/** Set when a cached copy fails to load, so the tile falls back rather than showing a broken image. */
	let avatarFailed = $state(false);
	let attachmentFailed = $state(false);

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
	<header class="identity">
		{#if avatarUrl && !avatarFailed}
			<img class="avatar" src={avatarUrl} alt="" onerror={() => (avatarFailed = true)} />
		{:else}
			<div class="avatar initial">{record.authorName.charAt(0).toUpperCase()}</div>
		{/if}
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

	{#if record.body}
		<p class="body">{record.body}</p>
	{/if}

	{#if attachmentUrl && !attachmentFailed}
		{#if attachment && playsAsVideo(attachment)}
			<video
				class="attachment"
				src={attachmentUrl}
				autoplay
				muted
				loop
				playsinline
				onerror={() => (attachmentFailed = true)}
			></video>
		{:else}
			<img
				class="attachment"
				src={attachmentUrl}
				alt={attachment?.description ?? ''}
				onerror={() => (attachmentFailed = true)}
			/>
		{/if}
	{/if}

	{#if board.showMetrics || (board.showTimestamp && timestamp)}
		<footer class="meta">
			{#if board.showMetrics}
				<span>{formatCount(record.likeCount)} likes</span>
				<span>{formatCount(record.repostCount)} reposts</span>
			{/if}
			{#if board.showTimestamp && timestamp}
				<span class="timestamp">{timestamp}</span>
			{/if}
		</footer>
	{/if}
</article>

<style>
	.tile {
		display: flex;
		/* A post is as tall as it is and no taller; the cell it sits in is only a
		   ceiling, which a long caption over a tall photograph can still reach. */
		max-height: 100%;
		flex-direction: column;
		gap: 0.75em;
		overflow: hidden;
		padding: 1.25em;
		background: var(--board-surface);
		border-radius: var(--board-radius);
		color: var(--board-text);
	}

	.identity {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 0.6em;
	}

	.avatar {
		width: 2.6em;
		height: 2.6em;
		flex-shrink: 0;
		border-radius: 50%;
		object-fit: cover;
	}

	.initial {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--board-accent);
		font-weight: 600;
	}

	.names {
		min-width: 0;
		flex: 1;
	}

	.name {
		overflow: hidden;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.handle {
		overflow: hidden;
		font-size: 0.82em;
		opacity: 0.65;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.platform {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		font-size: 1.3em;
		opacity: 0.75;
	}

	.body {
		overflow: hidden;
		margin: 0;
		font-size: 1.05em;
		line-height: 1.35;
	}

	.attachment {
		min-height: 0;
		/* Shown whole at its own proportions, and allowed to shrink when the cell
		   cannot hold it; `cover` would crop a portrait photograph to a band. */
		flex: 0 1 auto;
		width: 100%;
		border-radius: calc(var(--board-radius) * 0.6);
		object-fit: contain;
		object-position: top center;
	}

	.meta {
		display: flex;
		flex-shrink: 0;
		gap: 1em;
		font-size: 0.78em;
		opacity: 0.6;
	}

	.timestamp {
		margin-left: auto;
	}
</style>
