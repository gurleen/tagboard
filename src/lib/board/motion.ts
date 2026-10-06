/**
 * Motion for the board window, taken from the broadcast package's basketball v2
 * design system so the wall moves like the graphics it sits beside: decisive,
 * short, no overshoot.
 */

/** An easing function in Svelte's convention: progress in, eased progress out. */
export type Easing = (t: number) => number;

/**
 * Builds the easing for a CSS-style cubic Bézier with its ends fixed at (0, 0)
 * and (1, 1). Solves for the curve parameter at a given time by Newton's method,
 * falling back to bisection where the slope is too flat to step on.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
	const ax = 3 * x1 - 3 * x2 + 1;
	const bx = 3 * x2 - 6 * x1;
	const cx = 3 * x1;
	const ay = 3 * y1 - 3 * y2 + 1;
	const by = 3 * y2 - 6 * y1;
	const cy = 3 * y1;

	const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
	const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
	const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

	function solve(t: number): number {
		let s = t;
		for (let iteration = 0; iteration < 8; iteration++) {
			const error = sampleX(s) - t;
			if (Math.abs(error) < 1e-6) return s;
			const slope = slopeX(s);
			if (Math.abs(slope) < 1e-6) break;
			s -= error / slope;
		}
		let low = 0;
		let high = 1;
		s = t;
		while (high - low > 1e-6) {
			if (sampleX(s) < t) low = s;
			else high = s;
			s = (low + high) / 2;
		}
		return s;
	}

	return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solve(t)));
}

/** Almost everything that arrives. */
export const easeOut = cubicBezier(0.16, 1, 0.3, 1);

/** Almost everything that leaves. */
export const easeIn = cubicBezier(0.7, 0, 0.84, 0);

/** An exit runs a third as long as the entrance (0.4 s against 1.2 s). */
export const EXIT_DURATION_RATIO = 1 / 3;

/** Delay between neighbouring posts opening, so a page builds across the wall. */
export const STAGGER_MS = 70;

/** One unit of the 1920 × 1080 broadcast frame, in pixels at the current width. */
export function frameUnit(): number {
	return window.innerWidth / 1920;
}
