<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { isTauri } from '@tauri-apps/api/core';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Text } from '$lib/components/ui/text/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { NonIdealState } from '$lib/components/ui/non-ideal-state/index.js';
	import BoardOutputControls from '$lib/components/board-output-controls.svelte';
	import { registeredFetchers } from '$lib/ingestion/fetcher';
	import { cacheByteLength, formatByteLength } from '$lib/media/cache';
	import { cacheMediaForPost, listPosts, pendingMediaCount } from '$lib/repository/posts';
	import MonitorOffIcon from '@lucide/svelte/icons/monitor-off';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	let byteLength = $state(0);
	let pendingCount = $state(0);
	let recaching = $state(false);
	const insideTauri = isTauri();
	const fetchers = registeredFetchers();

	async function refresh() {
		if (!insideTauri) return;
		byteLength = await cacheByteLength();
		pendingCount = await pendingMediaCount();
	}

	onMount(refresh);

	/** Retries every asset that is not yet in the cache, one post at a time. */
	async function recacheAll() {
		recaching = true;
		try {
			const records = await listPosts({});
			for (const record of records) await cacheMediaForPost(record.id);
			toast.success('Media cache rebuilt.');
			await refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			recaching = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
	<div>
		<Text class="text-xl font-semibold sm:text-2xl">Settings</Text>
		<Text class="text-sm text-muted-foreground">
			Retrieval providers, the local media cache, and the display the board window goes to.
		</Text>
	</div>

	{#if !insideTauri}
		<NonIdealState
			icon={MonitorOffIcon}
			title="Running outside the desktop application"
			description="The database and media cache live in the Tauri runtime. Start the control panel with `bun run tauri:dev`."
		/>
	{:else}
		<BoardOutputControls />

		<Card.Root>
			<Card.Header>
				<Card.Title>Retrieval providers</Card.Title>
				<Card.Description>
					A configured provider fills in author, text and media from a pasted link. Until one is
					chosen, pasted links are recorded and can be completed by hand.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-2">
				{#each fetchers as fetcher (fetcher.platform)}
					<div
						class="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0"
					>
						<div>
							<div class="text-sm font-medium">{fetcher.providerName}</div>
							<div class="text-xs text-muted-foreground">{fetcher.platform}</div>
						</div>
						<Badge variant={fetcher.isConfigured() ? 'success' : 'secondary'}>
							{fetcher.isConfigured() ? 'Configured' : 'Not configured'}
						</Badge>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Media cache</Card.Title>
				<Card.Description>
					Avatars and attachments are downloaded to the application data directory so the board
					keeps rendering without a network connection.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-4">
				<div>
					<div class="text-2xl font-semibold">{formatByteLength(byteLength)}</div>
					<div class="text-xs text-muted-foreground">on disk</div>
				</div>
				<div>
					<div class="text-2xl font-semibold">{pendingCount}</div>
					<div class="text-xs text-muted-foreground">assets not yet cached</div>
				</div>
				<div class="ml-auto flex gap-2">
					<Button variant="secondary" onclick={refresh}>
						<RefreshCwIcon />
						Recalculate
					</Button>
					<Button onclick={recacheAll} disabled={recaching}>
						{recaching ? 'Downloading…' : 'Download missing media'}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
