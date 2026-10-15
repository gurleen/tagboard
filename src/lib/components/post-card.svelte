<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Icon } from '$lib/components/ui/icon/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import MediaThumbnail from '$lib/components/media-thumbnail.svelte';
	import { formatHandle } from '$lib/ingestion/permalink';
	import { attachmentsOf, avatarOf, type PostRecord } from '$lib/database/records';
	import type { Platform, ReviewState } from '$lib/database/schema';
	import BadgeCheckIcon from '@lucide/svelte/icons/badge-check';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import RepeatIcon from '@lucide/svelte/icons/repeat';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import StarIcon from '@lucide/svelte/icons/star';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let {
		record,
		actions,
		selected = false,
		onselect
	}: {
		record: PostRecord;
		/** Buttons rendered in the card footer; the queue and library differ here. */
		actions?: Snippet<[PostRecord]>;
		selected?: boolean;
		onselect?: (record: PostRecord) => void;
	} = $props();

	const PLATFORM_LABELS: Record<Platform, string> = {
		x: 'X',
		instagram: 'Instagram',
		manual: 'Manual'
	};

	const REVIEW_VARIANTS: Record<ReviewState, 'warning' | 'success' | 'destructive' | 'secondary'> =
		{
			pending: 'warning',
			approved: 'success',
			rejected: 'destructive',
			archived: 'secondary'
		};

	const avatar = $derived(avatarOf(record));
	const attachments = $derived(attachmentsOf(record));
	const isResolving = $derived(record.resolutionState === 'resolving');
	const hasFailed = $derived(record.resolutionState === 'failed');

	function formatTimestamp(value: Date | null): string {
		if (!value) return '';
		return value.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatCount(value: number | null): string {
		if (value === null) return '—';
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
		if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
		return String(value);
	}
</script>

<Card.Root
	class={selected ? 'border-primary ring-1 ring-primary' : undefined}
	onclick={onselect ? () => onselect(record) : undefined}
>
	<Card.Header class="gap-3">
		<div class="flex items-start gap-3">
			{#if avatar?.cachedPath}
				<MediaThumbnail asset={avatar} class="size-10 shrink-0 rounded-full" />
			{:else}
				<div
					class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
				>
					{record.authorName.slice(0, 1).toUpperCase()}
				</div>
			{/if}

			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-1.5">
					<span class="truncate text-sm font-semibold">{record.authorName}</span>
					{#if record.authorVerified}
						<Icon icon={BadgeCheckIcon} intent="primary" size="standard" />
					{/if}
					{#if record.starred}
						<Icon icon={StarIcon} intent="warning" size="standard" />
					{/if}
				</div>
				<div class="flex items-center gap-2 text-xs text-muted-foreground">
					{#if record.authorHandle}
						<span class="truncate">{formatHandle(record.authorHandle)}</span>
					{/if}
					{#if record.postedAt}
						<span>{formatTimestamp(record.postedAt)}</span>
					{/if}
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-1.5">
				<Badge variant="outline">{PLATFORM_LABELS[record.platform]}</Badge>
				<Badge variant={REVIEW_VARIANTS[record.reviewState]}>{record.reviewState}</Badge>
			</div>
		</div>
	</Card.Header>

	<Card.Content class="space-y-3">
		{#if isResolving}
			<div class="flex items-center gap-2 text-xs text-muted-foreground">
				<Spinner size="sm" />
				<span>Retrieving post…</span>
			</div>
		{:else if hasFailed}
			<div class="flex items-start gap-2 rounded-sm bg-destructive/10 p-2 text-xs text-destructive">
				<Icon icon={TriangleAlertIcon} intent="danger" size="standard" class="mt-0.5 shrink-0" />
				<span>{record.resolutionError ?? 'The post could not be retrieved.'}</span>
			</div>
		{/if}

		{#if record.body}
			<p class="text-sm leading-relaxed whitespace-pre-wrap">{record.body}</p>
		{:else if !isResolving && !hasFailed}
			<p class="text-sm text-muted-foreground italic">No text.</p>
		{/if}

		{#if attachments.length > 0}
			<div class="grid grid-cols-2 gap-2">
				{#each attachments as asset (asset.id)}
					<MediaThumbnail {asset} class="aspect-video w-full rounded-sm" />
				{/each}
			</div>
		{/if}

		<div class="flex items-center gap-4 text-xs text-muted-foreground">
			<span class="flex items-center gap-1">
				<Icon icon={HeartIcon} intent="muted" size="standard" />
				{formatCount(record.likeCount)}
			</span>
			<span class="flex items-center gap-1">
				<Icon icon={RepeatIcon} intent="muted" size="standard" />
				{formatCount(record.repostCount)}
			</span>
			<span class="flex items-center gap-1">
				<Icon icon={MessageCircleIcon} intent="muted" size="standard" />
				{formatCount(record.replyCount)}
			</span>
			{#if record.permalink}
				<!-- The permalink leaves the application, so it is not a route to resolve. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					class="ml-auto truncate text-primary hover:underline"
					href={record.permalink}
					target="_blank"
					rel="noreferrer noopener">Open original</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	</Card.Content>

	{#if actions}
		<Card.Footer class="gap-2">
			{@render actions(record)}
		</Card.Footer>
	{/if}
</Card.Root>
