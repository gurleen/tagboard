<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ControlGroup } from '$lib/components/ui/control-group/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { LIVE_OUTPUT_TARGET, outputUrl } from '$lib/board/output';
	import { copyToClipboard } from '$lib/utils';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	/** The output key, or `null` while it is still being read. */
	let { outputKey }: { outputKey: string | null } = $props();

	const liveUrl = $derived(
		outputKey ? outputUrl(page.url.origin, LIVE_OUTPUT_TARGET, outputKey) : null
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Board output</Card.Title>
		<Card.Description>
			Add a Browser source in OBS, or any other player that renders a web page, and paste this URL
			into it. It always shows the board on air. Set the source to the size of the wall — 1920 ×
			1080 for a full HD output. Each board also has a URL of its own, which shows that board
			whether it is on air or not.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if liveUrl}
			<ControlGroup fill>
				<Input
					class="flex-1 font-mono text-xs"
					readonly
					value={liveUrl}
					aria-label="On-air output URL"
					onfocus={(event: FocusEvent) => (event.currentTarget as HTMLInputElement).select()}
				/>
				<Button variant="secondary" onclick={() => copyToClipboard(liveUrl, 'On-air output URL')}>
					<CopyIcon />
					Copy
				</Button>
				<Button variant="secondary" href={liveUrl} target="_blank" rel="noopener">
					<ExternalLinkIcon />
					Open
				</Button>
			</ControlGroup>
		{:else}
			<Spinner size="sm" />
		{/if}
	</Card.Content>
</Card.Root>
