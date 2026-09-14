<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Icon } from '$lib/components/ui/icon/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { assetUrl, resolveAsset } from '$lib/media/cache';
	import type { Media } from '$lib/database/schema';
	import ImageOffIcon from '@lucide/svelte/icons/image-off';

	let { asset, class: className }: { asset: Media; class?: string } = $props();

	/**
	 * Cached files are addressed by a path relative to the cache directory, which
	 * only the Rust side can turn into an absolute one; the asset protocol then
	 * makes that absolute path loadable by the web view.
	 */
	const source = $derived.by(async () => {
		if (asset.cacheState !== 'cached' || !asset.cachedPath) return null;
		const absolute = await resolveAsset(asset.cachedPath);
		return absolute ? assetUrl(absolute) : null;
	});
</script>

<div class={cn('overflow-hidden bg-muted', className)}>
	{#await source}
		<div class="flex size-full items-center justify-center">
			<Spinner size="sm" />
		</div>
	{:then url}
		{#if url && asset.kind === 'video'}
			<video class="size-full object-cover" src={url} muted playsinline loop></video>
		{:else if url}
			<img class="size-full object-cover" src={url} alt={asset.description ?? ''} />
		{:else}
			<div
				class="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-[10px] text-muted-foreground"
			>
				<Icon icon={ImageOffIcon} intent="muted" size="standard" />
				<span>
					{asset.cacheState === 'failed' ? 'Download failed' : 'Not cached yet'}
				</span>
			</div>
		{/if}
	{:catch}
		<div class="flex size-full items-center justify-center text-[10px] text-destructive">
			Unavailable
		</div>
	{/await}
</div>
