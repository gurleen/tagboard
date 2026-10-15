import { isHttpError } from '@sveltejs/kit';
import { clsx, type ClassValue } from 'clsx';
import { toast } from 'svelte-sonner';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

/**
 * The message to show the operator for a failed operation.
 *
 * A remote command that fails rejects with SvelteKit's `HttpError`, which is not
 * an `Error` and carries its message on `body`; everything else is an `Error` or
 * a value to print.
 */
export function describeError(error: unknown): string {
	if (isHttpError(error)) return error.body.message;
	return error instanceof Error ? error.message : String(error);
}

/** Copies text to the clipboard and tells the operator what was copied, or why it was not. */
export async function copyToClipboard(text: string, description: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(`${description} copied.`);
	} catch (error) {
		toast.error(`Could not copy: ${describeError(error)}`);
	}
}
