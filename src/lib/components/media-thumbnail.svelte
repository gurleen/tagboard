<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Icon } from '$lib/components/ui/icon/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { assetUrl, playsAsVideo } from '$lib/media/asset';
	import type { Media } from '$lib/database/schema';
	import ImageOffIcon from '@lucide/svelte/icons/image-off';

	let { asset, class: className }: { asset: Media; class?: string } = $props();

	/** Cached copies are served out of R2 by `/media/[name]`. */
	const source = $derived(assetUrl(asset));
	const isCaching = $derived(asset.cacheState === 'pending' || asset.cacheState === 'downloading');

	/** Set when the stored copy cannot be loaded — removed from the bucket, for instance. */
	let failed = $state(false);
</script>

<div class={cn('overflow-hidden bg-muted', className)}>
	{#if source && !failed && playsAsVideo(asset)}
		<video
			class="size-full object-cover"
			src={source}
			muted
			playsinline
			loop
			onerror={() => (failed = true)}
		></video>
	{:else if source && !failed}
		<img
			class="size-full object-cover"
			src={source}
			alt={asset.description ?? ''}
			onerror={() => (failed = true)}
		/>
	{:else if isCaching}
		<div class="flex size-full items-center justify-center">
			<Spinner size="sm" />
		</div>
	{:else}
		<div
			class="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-[10px] text-muted-foreground"
		>
			<Icon icon={ImageOffIcon} intent="muted" size="standard" />
			<span>{failed ? 'Unavailable' : 'Download failed'}</span>
		</div>
	{/if}
</div>
