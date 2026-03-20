import * as d3 from 'd3';
import type { GanttEditorXAxisOptions } from './types';

// Extend HTMLCanvasElement to store axis-specific event handlers for cleanup
type AxisCanvas = HTMLCanvasElement & {
    _axisClickHandler?: (e: MouseEvent) => void;
    _axisMoveHandler?: (e: MouseEvent) => void;
    _axisKeyHandler?: (e: KeyboardEvent) => void;
    _clipboardButtonHovered?: boolean;
};

// Position and size of the "Clear Clipboard" button — mirrors the SVG version:
// xAxisGroup is at translate(margin.left=200, margin.top=40), button at translate(-190,-30)
// → absolute x = 200-190 = 10, y = 40-30 = 10
const BTN = { x: 10, y: 10, w: 100, h: 30 };

export function drawAxisOnCanvas(
    canvas: HTMLCanvasElement,
    xScale: d3.ScaleTime<number, number, never>,
    margin: { left: number },
    clearClipboard: () => void,
    xAxisOptions?: GanttEditorXAxisOptions,
): void {
    const c = canvas as AxisCanvas;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    // Resize physical pixel buffer when CSS size has changed (keeps text sharp on HiDPI)
    const cssW = canvas.offsetWidth;
    const cssH = canvas.offsetHeight;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
    }

    const hasClipboard = JSON.parse(localStorage.getItem('pointerClipboard') || '[]').length > 0;

    // ── Formatters (same defaults as axis.ts) ────────────────────────────────
    const timeFormatter = (d: Date | d3.NumberValue): string =>
        d instanceof Date ? d3.timeFormat('%H:%M')(d) : '';
    const dateFormatter = (d: Date | d3.NumberValue): string =>
        d instanceof Date ? d3.timeFormat('%d.%m.')(d) : '';

    const upperFmt = xAxisOptions?.upper?.tickFormat ?? dateFormatter;
    const lowerFmt = xAxisOptions?.lower?.tickFormat ?? timeFormatter;

    // ── Tick sets (same logic as axis.ts) ────────────────────────────────────
    const upperTicks: Date[] = xAxisOptions?.upper?.ticks
        ? xScale.ticks(xAxisOptions.upper.ticks as d3.TimeInterval)
        : xScale.ticks(d3.timeDay.every(1)!);

    const lowerTicks: Date[] = xAxisOptions?.lower?.ticks
        ? xScale.ticks(xAxisOptions.lower.ticks as d3.TimeInterval)
        : xScale.ticks();

    // ── Render function (called on initial draw and on button hover changes) ─
    const render = (buttonHovered: boolean): void => {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cssW, cssH);

        const leftOffset = margin.left;

        // SVG layout reference (50px tall container, axisGroup at y=40, axisTop draws upward):
        //   upper date labels  → absolute y ≈ 17  (axisGroup y=20, axisTop label y=-9, text shift +6)
        //   lower time labels  → absolute y ≈ 31  (axisGroup y=40, axisTop label y=-9)
        //   lower tick lines   → from y=34 to y=40 (axisGroup y=40, tick from 0 to -6)

        // Upper row: date labels only (tick lines hidden in SVG version)
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        for (const tick of upperTicks) {
            const x = leftOffset + xScale(tick);
            ctx.fillText(String(upperFmt(tick)), x, 17);
        }

        // Lower row: time labels + tick marks
        for (const tick of lowerTicks) {
            const x = leftOffset + xScale(tick);
            // tick line (mirrors axisTop default: 6px upward)
            ctx.beginPath();
            ctx.moveTo(x, 40);
            ctx.lineTo(x, 34);
            ctx.strokeStyle = '#bbb';
            ctx.lineWidth = 1;
            ctx.stroke();
            // label
            ctx.fillText(String(lowerFmt(tick)), x, 31);
        }

        // Baseline separator (the domain line that axisTop draws)
        ctx.beginPath();
        ctx.moveTo(leftOffset, 40);
        ctx.lineTo(cssW, 40);
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 1;
        ctx.stroke();

        // ── Clear Clipboard button ────────────────────────────────────────────
        if (hasClipboard) {
            ctx.fillStyle = buttonHovered ? '#e0e0e0' : '#f0f0f0';
            ctx.beginPath();
            ctx.rect(BTN.x, BTN.y, BTN.w, BTN.h);
            ctx.fill();

            ctx.fillStyle = '#000';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Clear Clipboard', BTN.x + BTN.w / 2, BTN.y + BTN.h / 2);
        }

        ctx.restore();
    };

    render(c._clipboardButtonHovered ?? false);

    // ── Event listeners ───────────────────────────────────────────────────────
    // Always remove stale listeners first to avoid stacking across re-renders
    if (c._axisClickHandler) c.removeEventListener('click', c._axisClickHandler);
    if (c._axisMoveHandler)  c.removeEventListener('mousemove', c._axisMoveHandler);
    if (c._axisKeyHandler)   document.removeEventListener('keydown', c._axisKeyHandler);

    if (hasClipboard) {
        const hitTest = (e: MouseEvent): boolean => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            return mx >= BTN.x && mx <= BTN.x + BTN.w && my >= BTN.y && my <= BTN.y + BTN.h;
        };

        c._axisClickHandler = (e: MouseEvent) => {
            if (hitTest(e)) clearClipboard();
        };

        c._axisMoveHandler = (e: MouseEvent) => {
            const hovered = hitTest(e);
            if (hovered !== c._clipboardButtonHovered) {
                c._clipboardButtonHovered = hovered;
                canvas.style.cursor = hovered ? 'pointer' : '';
                render(hovered);
            }
        };

        // ESC key clears clipboard (mirrors d3.select(document).on('keydown.clearClipboard', ...))
        c._axisKeyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.keyCode === 27) clearClipboard();
        };

        c.addEventListener('click', c._axisClickHandler);
        c.addEventListener('mousemove', c._axisMoveHandler);
        document.addEventListener('keydown', c._axisKeyHandler);
    } else {
        // Clipboard emptied: reset hover state and cursor
        c._clipboardButtonHovered = false;
        canvas.style.cursor = '';
    }
}