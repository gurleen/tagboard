<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { isSupportedPermalink } from '$lib/ingestion/permalink';
	import { cacheMediaForPost, createManualPost, ingestPermalink } from '$lib/repository/posts';

	let { open = $bindable(false), onadded }: { open?: boolean; onadded?: () => void } = $props();

	/** Two example links on separate lines, showing the one-per-line convention. */
	const PERMALINK_PLACEHOLDER =
		'https://x.com/handle/status/1234567890\nhttps://www.instagram.com/p/ABC123/';

	let submitting = $state(false);

	// Paste tab. A blank line separates nothing; each line is treated as one link
	// so an operator can drop several at once.
	let permalinkText = $state('');
	const permalinks = $derived(
		permalinkText
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
	);
	const invalidPermalinks = $derived(permalinks.filter((link) => !isSupportedPermalink(link)));

	// Compose tab.
	let authorName = $state('');
	let authorHandle = $state('');
	let body = $state('');
	let avatarUrl = $state('');
	let mediaUrlText = $state('');
	let authorVerified = $state(false);

	function resetFields() {
		permalinkText = '';
		authorName = '';
		authorHandle = '';
		body = '';
		avatarUrl = '';
		mediaUrlText = '';
		authorVerified = false;
	}

	async function submitPermalinks() {
		if (permalinks.length === 0 || invalidPermalinks.length > 0) return;
		submitting = true;

		let created = 0;
		let duplicates = 0;

		try {
			for (const link of permalinks) {
				const outcome = await ingestPermalink(link);
				if (outcome.status === 'existing') duplicates += 1;
				else created += 1;
				// Media downloads are slow and independent of the post record, so
				// they run after the row is in place rather than blocking the dialog.
				void cacheMediaForPost(outcome.post.id).then(() => onadded?.());
			}

			if (created > 0)
				toast.success(`${created} post${created === 1 ? '' : 's'} added for review.`);
			if (duplicates > 0)
				toast.info(
					`${duplicates} link${duplicates === 1 ? ' was' : 's were'} already in the library.`
				);

			resetFields();
			open = false;
			onadded?.();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			submitting = false;
		}
	}

	async function submitManual() {
		if (!authorName.trim() || !body.trim()) return;
		submitting = true;

		try {
			const record = await createManualPost({
				authorName,
				authorHandle: authorHandle || null,
				body,
				authorVerified,
				avatarUrl: avatarUrl || null,
				mediaUrls: mediaUrlText.split('\n')
			});
			void cacheMediaForPost(record.id).then(() => onadded?.());

			toast.success('Post added for review.');
			resetFields();
			open = false;
			onadded?.();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add post</Dialog.Title>
			<Dialog.Description>
				Added posts enter the review queue. Nothing reaches a board until it is approved.
			</Dialog.Description>
		</Dialog.Header>

		<Tabs.Root value="paste">
			<Tabs.List class="w-full">
				<Tabs.Trigger value="paste" class="flex-1">Paste link</Tabs.Trigger>
				<Tabs.Trigger value="compose" class="flex-1">Compose</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="paste" class="space-y-3 pt-3">
				<div class="space-y-1.5">
					<Label for="permalinks">X or Instagram links, one per line</Label>
					<Textarea
						id="permalinks"
						rows={5}
						placeholder={PERMALINK_PLACEHOLDER}
						bind:value={permalinkText}
					/>
				</div>

				{#if invalidPermalinks.length > 0}
					<p class="text-xs text-destructive">
						Not recognised: {invalidPermalinks.join(', ')}
					</p>
				{/if}

				<p class="text-xs text-muted-foreground">
					No retrieval provider is configured yet, so a pasted link is saved with its author handle
					and marked as failed to resolve. The post can still be composed by hand on the other tab.
				</p>

				<Dialog.Footer>
					<Button
						onclick={submitPermalinks}
						disabled={submitting || permalinks.length === 0 || invalidPermalinks.length > 0}
					>
						{#if submitting}<Spinner size="sm" />{/if}
						Add {permalinks.length || ''} post{permalinks.length === 1 ? '' : 's'}
					</Button>
				</Dialog.Footer>
			</Tabs.Content>

			<Tabs.Content value="compose" class="space-y-3 pt-3">
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<Label for="author-name">Author name</Label>
						<Input id="author-name" bind:value={authorName} placeholder="Jordan Ellis" />
					</div>
					<div class="space-y-1.5">
						<Label for="author-handle">Handle</Label>
						<Input id="author-handle" bind:value={authorHandle} placeholder="@jordanellis" />
					</div>
				</div>

				<div class="space-y-1.5">
					<Label for="body">Text</Label>
					<Textarea id="body" rows={4} bind:value={body} />
				</div>

				<div class="space-y-1.5">
					<Label for="avatar-url">Avatar image URL</Label>
					<Input id="avatar-url" bind:value={avatarUrl} placeholder="https://…" />
				</div>

				<div class="space-y-1.5">
					<Label for="media-urls">Media URLs, one per line</Label>
					<Textarea id="media-urls" rows={2} bind:value={mediaUrlText} placeholder="https://…" />
				</div>

				<div class="flex items-center gap-2">
					<Switch id="verified" bind:checked={authorVerified} />
					<Label for="verified">Show verified badge</Label>
				</div>

				<Dialog.Footer>
					<Button
						onclick={submitManual}
						disabled={submitting || !authorName.trim() || !body.trim()}
					>
						{#if submitting}<Spinner size="sm" />{/if}
						Add post
					</Button>
				</Dialog.Footer>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
