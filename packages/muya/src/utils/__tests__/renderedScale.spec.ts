// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getRenderedScale } from '../dom';

describe('getRenderedScale', () => {
    it('converts CSS-zoomed client geometry back to layout units', () => {
        const element = document.createElement('div');
        Object.defineProperties(element, {
            offsetWidth: { value: 200 },
            offsetHeight: { value: 80 },
        });
        element.getBoundingClientRect = () => ({
            width: 300,
            height: 120,
        }) as DOMRect;

        expect(getRenderedScale(element, 'x')).toBe(1.5);
        expect(getRenderedScale(element, 'y')).toBe(1.5);
    });

    it('falls back to one for geometry without a usable layout size', () => {
        const element = document.createElement('div');
        element.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;

        expect(getRenderedScale(element, 'x')).toBe(1);
        expect(getRenderedScale(element, 'y')).toBe(1);
    });
});
