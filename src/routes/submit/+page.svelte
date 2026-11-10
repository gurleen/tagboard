<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import {
		ACCEPTED_IMAGE_CONTENT_TYPES,
		MAXIMUM_AUTHOR_NAME_LENGTH,
		MAXIMUM_CAPTION_LENGTH,
		prepareImage,
		readSubmissionStatus,
		sendSubmission,
		type SubmissionStatus
	} from '$lib/submission/endpoints';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';

	/**
	 * The public submission page, opened from the QR code on the wall. Anything
	 * sent here waits in the review queue until an operator approves it.
	 */

	const key = page.url.searchParams.get('key') ?? '';

	let status = $state<SubmissionStatus | null>(null);
	let file = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let authorName = $state('');
	let caption = $state('');
	let sending = $state(false);
	let sent = $state(false);
	let failure = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	onMount(() => {
		readSubmissionStatus(key).then((result) => (status = result));
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	});

	function choose(event: Event) {
		const chosen = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		file = chosen;
		previewUrl = chosen ? URL.createObjectURL(chosen) : null;
		failure = null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!file || sending) return;

		sending = true;
		failure = null;
		const outcome = await sendSubmission(key, {
			authorName,
			caption,
			image: await prepareImage(file)
		});
		sending = false;

		if (outcome.status === 'accepted') sent = true;
		else failure = outcome.message;
	}

	function startOver() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		file = null;
		previewUrl = null;
		caption = '';
		sent = false;
		if (fileInput) fileInput.value = '';
	}
</script>

<svelte:head>
	<title>Share a photo</title>
</svelte:head>

<main class="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-8">
	<div>
		<h1 class="text-2xl font-semibold">Share a photo</h1>
		<p class="text-sm text-muted-foreground">
			Send a photo and a caption. Once it has been reviewed, it may appear on the screen.
		</p>
	</div>

	{#if !status}
		<div class="flex justify-center p-12"><Spinner /></div>
	{:else if status.status === 'refused'}
		<p class="text-sm">This link is no longer valid. Scan the code on the screen again.</p>
	{:else if status.status === 'closed'}
		<p class="text-sm">Photos are not being accepted right now.</p>
	{:else if status.status === 'unavailable'}
		<p class="text-sm">The page could not reach the server. Check your connection and reload.</p>
	{:else if sent}
		<div class="flex flex-col items-center gap-3 py-8 text-center">
			<CircleCheckIcon class="size-10 text-success" />
			<p class="text-base font-medium">Thanks — your photo has been sent for review.</p>
			<Button variant="secondary" size="lg" onclick={startOver}>Send another</Button>
		</div>
	{:else}
		<form class="flex flex-col gap-4" onsubmit={submit}>
			<label
				class="flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden border border-dashed border-input bg-muted/40"
			>
				{#if previewUrl}
					<img src={previewUrl} alt="Your selection" class="size-full object-contain" />
				{:else}
					<span class="flex flex-col items-center gap-2 text-sm text-muted-foreground">
						<CameraIcon class="size-8" />
						Take or choose a photo
					</span>
				{/if}
				<input
					bind:this={fileInput}
					class="sr-only"
					type="file"
					accept={['image/*', ...ACCEPTED_IMAGE_CONTENT_TYPES].join(',')}
					onchange={choose}
				/>
			</label>

			<div class="space-y-1.5">
				<Label for="submission-caption">Caption</Label>
				<Textarea
					id="submission-caption"
					class="text-base md:text-base"
					maxlength={MAXIMUM_CAPTION_LENGTH}
					bind:value={caption}
				/>
				<div class="text-right text-xs text-muted-foreground">
					{caption.length} / {MAXIMUM_CAPTION_LENGTH}
				</div>
			</div>

			<div class="space-y-1.5">
				<Label for="submission-author">Your name (optional)</Label>
				<Input
					id="submission-author"
					class="text-base md:text-base"
					autocomplete="name"
					maxlength={MAXIMUM_AUTHOR_NAME_LENGTH}
					bind:value={authorName}
				/>
			</div>

			{#if failure}
				<p class="text-sm text-destructive" role="alert">{failure}</p>
			{/if}

			<Button type="submit" size="lg" disabled={!file || sending}>
				{#if sending}<Spinner size="sm" />{/if}
				{sending ? 'Sending…' : 'Send photo'}
			</Button>
		</form>
	{/if}
</main>
