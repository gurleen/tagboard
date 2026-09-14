import { invoke } from '@tauri-apps/api/core';

/** A display the board window can be sent to. */
export type Display = {
	name: string | null;
	width: number;
	height: number;
	positionX: number;
	positionY: number;
	scaleFactor: number;
	isPrimary: boolean;
};

/** Opens the board window, or focuses it if it is already open. */
export function openBoardWindow(): Promise<void> {
	return invoke('board_window_open');
}

/** Closes the board window. Closing one that is not open is not an error. */
export function closeBoardWindow(): Promise<void> {
	return invoke('board_window_close');
}

/** Whether the board window currently exists. */
export function isBoardWindowOpen(): Promise<boolean> {
	return invoke<boolean>('board_window_is_open');
}

/** Enters or leaves fullscreen on the board window. */
export function setBoardFullscreen(fullscreen: boolean): Promise<void> {
	return invoke('board_window_set_fullscreen', { fullscreen });
}

/** Lists the displays attached to this machine. */
export function listDisplays(): Promise<Display[]> {
	return invoke<Display[]>('board_displays');
}

/** Moves the board window onto a display and fills it. */
export function moveBoardToDisplay(display: Display): Promise<void> {
	return invoke('board_window_move_to_display', {
		positionX: display.positionX,
		positionY: display.positionY
	});
}

/** Describes a display the way an operator picks one out of a list. */
export function describeDisplay(display: Display): string {
	const label = display.name ?? 'Display';
	const suffix = display.isPrimary ? ' (primary)' : '';
	return `${label} — ${display.width}×${display.height}${suffix}`;
}
