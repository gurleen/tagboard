<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Text } from '$lib/components/ui/text/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ControlGroup } from '$lib/components/ui/control-group/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { page } from '$app/state';
	import { submissionUrl as composeSubmissionUrl } from '$lib/submission/endpoints';
	import { copyToClipboard } from '$lib/utils';
	import BoardOutputCard from '$lib/components/board-output-card.svelte';
	import { formatByteLength } from '$lib/media/asset';
	import { describeError } from '$lib/utils';
	import { cacheMediaForPost, listPosts, pendingMediaCount } from '$lib/remote/posts.remote';
	import {
		describeProviders,
		outputKey as readOutputKey,
		regenerateOutputKey,
		regenerateSubmissionKey,
		setSubmissionsOpen,
		storedByteLength,
		submissionKey as readSubmissionKey,
		submissionsOpen as readSubmissionsOpen,
		type ProviderDescription
	} from '$lib/remote/settings.remote';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	let byteLength = $state(0);
	let pendingCount = $state(0);
	let recaching = $state(false);
	let providers = $state<ProviderDescription[]>([]);
	let outputKey = $state<string | null>(null);
	let submissionKey = $state<string | null>(null);
	let submissionsOpen = $state(true);

	const submissionUrl = $derived(
		submissionKey ? composeSubmissionUrl(page.url.origin, submissionKey) : null
	);

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
		readSubmissionKey().then(
			(key) => (submissionKey = key),
			(error) => toast.error(describeError(error))
		);
		readSubmissionsOpen().then(
			(open) => (submissionsOpen = open),
			(error) => toast.error(describeError(error))
		);
	});

	async function changeSubmissionsOpen(open: boolean) {
		try {
			await setSubmissionsOpen(open);
			submissionsOpen = open;
			toast.success(open ? 'Submissions opened.' : 'Submissions closed.');
		} catch (error) {
			toast.error(describeError(error));
			submissionsOpen = await readSubmissionsOpen().catch(() => submissionsOpen);
		}
	}

	async function regenerateSubmission() {
		try {
			submissionKey = await regenerateSubmissionKey();
			toast.success('Submission link replaced. Outputs pick up the new code within seconds.');
		} catch (error) {
			toast.error(describeError(error));
		}
	}

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
			Board output, public submissions, retrieval providers, and media storage.
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
			<Card.Title>Public submissions</Card.Title>
			<Card.Description>
				Anyone with this link can send a photo and a caption into the review queue. A board shows it
				as a QR code when its submission code is placed in a corner. Replacing the link stops the
				old one, and every code already scanned, from working.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex items-center gap-2">
				<Switch
					id="submissions-open"
					checked={submissionsOpen}
					onCheckedChange={changeSubmissionsOpen}
				/>
				<Label for="submissions-open">Accept submissions</Label>
			</div>
			{#if submissionUrl}
				<ControlGroup fill>
					<Input
						class="flex-1 font-mono text-xs"
						readonly
						value={submissionUrl}
						aria-label="Submission URL"
						onfocus={(event: FocusEvent) => (event.currentTarget as HTMLInputElement).select()}
					/>
					<Button
						variant="secondary"
						onclick={() => copyToClipboard(submissionUrl, 'Submission URL')}
					>
						<CopyIcon />
						Copy
					</Button>
					<Button variant="secondary" href={submissionUrl} target="_blank" rel="noopener">
						<ExternalLinkIcon />
						Open
					</Button>
				</ControlGroup>
			{/if}
		</Card.Content>
		<Card.Footer>
			<AlertDialog.Root>
				<AlertDialog.Trigger>
					{#snippet child({ props })}
						<Button variant="warning" disabled={!submissionKey} {...props}>
							<KeyRoundIcon />
							Replace submission link
						</Button>
					{/snippet}
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Replace the submission link?</AlertDialog.Title>
						<AlertDialog.Description>
							The current link and QR code stop accepting photos. Outputs show the new code on their
							next poll.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>
							{#snippet child({ props })}
								<Button variant="outline" {...props}>Cancel</Button>
							{/snippet}
						</AlertDialog.Cancel>
						<AlertDialog.Action onclick={regenerateSubmission}>
							{#snippet child({ props })}
								<Button variant="warning" {...props}>Replace</Button>
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
