<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Menubar from '$lib/components/ui/menubar/index.js';
	import { LIVE_OUTPUT_TARGET, outputUrl } from '$lib/board/output';
	import { copyToClipboard, describeError } from '$lib/utils';
	import { setLiveBoard } from '$lib/remote/boards.remote';
	import { outputKey } from '$lib/remote/settings.remote';

	/** Runs an output command, reporting a failure to the operator. */
	async function attempt(action: () => Promise<unknown>) {
		try {
			await action();
		} catch (error) {
			toast.error(describeError(error));
		}
	}

	async function liveOutputUrl(): Promise<string> {
		return outputUrl(page.url.origin, LIVE_OUTPUT_TARGET, await outputKey());
	}

	function copyLiveOutputUrl() {
		return attempt(async () => copyToClipboard(await liveOutputUrl(), 'On-air output URL'));
	}

	/**
	 * Opens the on-air output in a new tab to preview it. The tab is opened before
	 * the key is read, because a browser only allows a pop-up during the click.
	 */
	function openLiveOutput() {
		const preview = window.open('', '_blank');
		return attempt(async () => {
			try {
				const url = await liveOutputUrl();
				if (preview) preview.location.href = url;
			} catch (error) {
				preview?.close();
				throw error;
			}
		});
	}
</script>

<Menubar.Root class="relative z-20 hidden w-full rounded-none border-x-0 border-t-0 sm:flex">
	<Menubar.Menu>
		<Menubar.Trigger>Panel</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item onSelect={() => goto(resolve('/'))}>Review queue</Menubar.Item>
			<Menubar.Item onSelect={() => goto(resolve('/library'))}>Library</Menubar.Item>
			<Menubar.Item onSelect={() => goto(resolve('/boards'))}>Boards</Menubar.Item>
			<Menubar.Separator />
			<Menubar.Item onSelect={() => goto(resolve('/settings'))}>Settings</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
	<Menubar.Menu>
		<Menubar.Trigger>Output</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item onSelect={copyLiveOutputUrl}>Copy on-air output URL</Menubar.Item>
			<Menubar.Item onSelect={openLiveOutput}>Preview on-air output</Menubar.Item>
			<Menubar.Separator />
			<Menubar.Item
				onSelect={() =>
					attempt(async () => {
						await setLiveBoard(null);
						toast.info('All boards taken off air.');
					})}
			>
				Take all boards off air
			</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
	<Menubar.Menu>
		<Menubar.Trigger>Help</Menubar.Trigger>
		<Menubar.Content>
			<Menubar.Item onSelect={() => goto(resolve('/showcase'))}>Component showcase</Menubar.Item>
		</Menubar.Content>
	</Menubar.Menu>
</Menubar.Root>
