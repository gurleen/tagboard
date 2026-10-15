<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Text } from '$lib/components/ui/text/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import BoardOutputCard from '$lib/components/board-output-card.svelte';
	import { formatByteLength } from '$lib/media/asset';
	import { describeError } from '$lib/utils';
	import { cacheMediaForPost, listPosts, pendingMediaCount } from '$lib/remote/posts.remote';
	import {
		describeProviders,
		outputKey as readOutputKey,
		regenerateOutputKey,
		storedByteLength,
		type ProviderDescription
	} from '$lib/remote/settings.remote';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';

	let byteLength = $state(0);
	let pendingCount = $state(0);
	let recaching = $state(false);
	let providers = $state<ProviderDescription[]>([]);
	let outputKey = $state<string | null>(null);

	async function refresh() {
		try {
			byteLength = await storedByteLength();
			pendingCount = await pendingMediaCount();
		} catch (error) {
			toast.error(describeError(error));
		}
	}

	onMount(() => {
		refresh();
		describeProviders().then(
			(described) => (providers = described),
			(error) => toast.error(describeError(error))
		);
		readOutputKey().then(
			(key) => (outputKey = key),
			(error) => toast.error(describeError(error))
		);
	});

	/** Retries every asset that is not yet in storage, one post at a time. */
	async function recacheAll() {
		recaching = true;
		try {
			const records = await listPosts({});
			for (const record of records) await cacheMediaForPost(record.id);
			toast.success('Media storage rebuilt.');
			await refresh();
		} catch (error) {
			toast.error(describeError(error));
		} finally {
			recaching = false;
		}
	}

	async function regenerate() {
		try {
			outputKey = await regenerateOutputKey();
			toast.success('Output key regenerated. Paste the new URLs into OBS.');
		} catch (error) {
			toast.error(describeError(error));
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
	<div>
		<Text class="text-xl font-semibold sm:text-2xl">Settings</Text>
		<Text class="text-sm text-muted-foreground">
			Board output, retrieval providers, and media storage.
		</Text>
	</div>

	<BoardOutputCard {outputKey} />

	<Card.Root>
		<Card.Header>
			<Card.Title>Output key</Card.Title>
			<Card.Description>
				Every output URL carries this key, because OBS cannot sign in. Anyone holding an output URL
				can watch that output, and nothing more. Regenerating the key stops every output URL copied
				before it, including the ones already in OBS.
			</Card.Description>
		</Card.Header>
		<Card.Footer>
			<AlertDialog.Root>
				<AlertDialog.Trigger>
					{#snippet child({ props })}
						<Button variant="warning" disabled={!outputKey} {...props}>
							<KeyRoundIcon />
							Regenerate output key
						</Button>
					{/snippet}
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Regenerate the output key?</AlertDialog.Title>
						<AlertDialog.Description>
							Every output URL in use stops showing the board until it is replaced with a new one.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>
							{#snippet child({ props })}
								<Button variant="outline" {...props}>Cancel</Button>
							{/snippet}
						</AlertDialog.Cancel>
						<AlertDialog.Action onclick={regenerate}>
							{#snippet child({ props })}
								<Button variant="warning" {...props}>Regenerate</Button>
							{/snippet}
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Retrieval providers</Card.Title>
			<Card.Description>
				A configured provider fills in author, text and media from a pasted link. A link it cannot
				retrieve is still recorded and can be retried or completed by hand.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-2">
			{#each providers as provider (provider.platform)}
				<div
					class="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0"
				>
					<div>
						<div class="text-sm font-medium">{provider.providerName}</div>
						<div class="text-xs text-muted-foreground">{provider.platform}</div>
					</div>
					<Badge variant={provider.configured ? 'success' : 'secondary'}>
						{provider.configured ? 'Configured' : 'Not configured'}
					</Badge>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Media storage</Card.Title>
			<Card.Description>
				Avatars and attachments are copied into R2 when a post is added, so the output never waits
				on a platform's CDN or loses an image when its link expires.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-wrap items-center gap-4">
			<div>
				<div class="text-2xl font-semibold">{formatByteLength(byteLength)}</div>
				<div class="text-xs text-muted-foreground">stored</div>
			</div>
			<div>
				<div class="text-2xl font-semibold">{pendingCount}</div>
				<div class="text-xs text-muted-foreground">assets not yet stored</div>
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
</div>
