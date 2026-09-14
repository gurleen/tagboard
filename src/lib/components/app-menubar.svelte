<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { isTauri } from '@tauri-apps/api/core';
	import * as Menubar from '$lib/components/ui/menubar/index.js';
	import { closeBoardWindow, openBoardWindow, setBoardFullscreen } from '$lib/board/window';
	import { setLiveBoard } from '$lib/repository/boards';

	/** Guards the board commands, which only exist inside the desktop runtime. */
	async function inRuntime(action: () => Promise<unknown>) {
		if (!isTauri()) {
			toast.error('Board output is only available in the desktop application.');
			return;
		}
		try {
			await action();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
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
			<Menubar.Item onSelect={() => inRuntime(openBoardWindow)}>Open board window</Menubar.Item>
			<Menubar.Item onSelect={() => inRuntime(closeBoardWindow)}>Close board window</Menubar.Item>
			<Menubar.Separator />
			<Menubar.Item onSelect={() => inRuntime(() => setBoardFullscreen(true))}>
				Enter fullscreen
			</Menubar.Item>
			<Menubar.Item onSelect={() => inRuntime(() => setBoardFullscreen(false))}>
				Leave fullscreen
			</Menubar.Item>
			<Menubar.Separator />
			<Menubar.Item onSelect={() => inRuntime(() => setLiveBoard(null))}>
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
