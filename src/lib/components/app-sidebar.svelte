<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { config } from '$lib/config.svelte.js';
	import { queue } from '$lib/state/queue.svelte.js';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ComponentIcon from '@lucide/svelte/icons/component';

	const operationItems = [
		{ title: 'Review queue', href: resolve('/'), icon: InboxIcon },
		{ title: 'Library', href: resolve('/library'), icon: LibraryIcon },
		{ title: 'Boards', href: resolve('/boards'), icon: LayoutGridIcon }
	];

	const systemItems = [
		{ title: 'Settings', href: resolve('/settings'), icon: SettingsIcon },
		{ title: 'Component reference', href: resolve('/showcase'), icon: ComponentIcon }
	];

	function isCurrent(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Operation</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each operationItems as item (item.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isCurrent(item.href)}>
								{#snippet child({ props })}
									<a href={item.href} {...props}>
										<item.icon />
										<span>{item.title}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
							{#if item.href === '/' && queue.pendingCount > 0}
								<Sidebar.MenuBadge>
									<Badge variant="warning">{queue.pendingCount}</Badge>
								</Sidebar.MenuBadge>
							{/if}
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

		<Sidebar.Group>
			<Sidebar.GroupLabel>System</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each systemItems as item (item.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isCurrent(item.href)}>
								{#snippet child({ props })}
									<a href={item.href} {...props}>
										<item.icon />
										<span>{item.title}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.MenuButton onclick={() => config.toggleColorScheme()}>
			{#if config.colorScheme === 'dark'}
				<MoonIcon />
				<span>Dark mode</span>
			{:else}
				<SunIcon />
				<span>Light mode</span>
			{/if}
		</Sidebar.MenuButton>
	</Sidebar.Footer>
</Sidebar.Root>
