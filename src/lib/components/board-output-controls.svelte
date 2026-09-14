<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { isTauri } from '@tauri-apps/api/core';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		closeBoardWindow,
		describeDisplay,
		isBoardWindowOpen,
		listDisplays,
		moveBoardToDisplay,
		openBoardWindow,
		setBoardFullscreen,
		type Display
	} from '$lib/board/window';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MonitorXIcon from '@lucide/svelte/icons/monitor-x';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';

	let displays = $state<Display[]>([]);
	let selectedDisplayIndex = $state('0');
	let windowOpen = $state(false);

	async function refresh() {
		if (!isTauri()) return;
		windowOpen = await isBoardWindowOpen();
		displays = await listDisplays();
	}

	onMount(refresh);

	async function open() {
		await openBoardWindow();
		await refresh();
		toast.success('Board window opened.');
	}

	async function close() {
		await closeBoardWindow();
		await refresh();
	}

	async function sendToDisplay() {
		const display = displays[Number(selectedDisplayIndex)];
		if (!display) return;
		if (!windowOpen) await openBoardWindow();
		await moveBoardToDisplay(display);
		await refresh();
	}

	const selectedDisplayLabel = $derived(
		displays[Number(selectedDisplayIndex)]
			? describeDisplay(displays[Number(selectedDisplayIndex)])
			: 'No displays detected'
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Board output</Card.Title>
		<Card.Description>
			The board renders in its own window so it can be pushed fullscreen onto the display feeding
			the video wall.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-wrap items-center gap-2">
		{#if windowOpen}
			<Button variant="secondary" onclick={close}>
				<MonitorXIcon />
				Close board window
			</Button>
			<Button variant="secondary" onclick={() => setBoardFullscreen(true)}>
				<MaximizeIcon />
				Fullscreen
			</Button>
		{:else}
			<Button onclick={open}>
				<MonitorIcon />
				Open board window
			</Button>
		{/if}

		{#if displays.length > 0}
			<Select.Root type="single" bind:value={selectedDisplayIndex}>
				<Select.Trigger class="w-72">{selectedDisplayLabel}</Select.Trigger>
				<Select.Content>
					{#each displays as display, index (display.name ?? index)}
						<Select.Item value={String(index)}>{describeDisplay(display)}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Button variant="secondary" onclick={sendToDisplay}>Send to display</Button>
		{/if}
	</Card.Content>
</Card.Root>
