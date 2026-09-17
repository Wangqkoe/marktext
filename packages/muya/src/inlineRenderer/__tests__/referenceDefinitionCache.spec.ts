// @vitest-environment happy-dom
import type Format from '../../block/base/format';
import type { Muya } from '../../muya';
import { describe, expect, it, vi } from 'vitest';
import { MUYA_DEFAULT_OPTIONS } from '../../config';
import JSONState from '../../state';
import InlineRenderer from '../index';

// Rebuilding a document patches every content block. Each patch used to clone
// and rescan the whole document to find reference definitions, which made
// opening or switching to a large document quadratic in its block count.
// Definitions are now collected once per document revision.

function setup(markdown: string) {
    const muya = {
        options: { ...MUYA_DEFAULT_OPTIONS },
        eventCenter: { emit: () => {} },
        i18n: { t: (s: string) => s },
        editor: {},
    } as unknown as Muya;
    const jsonState = new JSONState(muya, markdown);
    const inlineRenderer = new InlineRenderer(muya);
    Object.assign(muya.editor, { jsonState, inlineRenderer });
    return { jsonState, inlineRenderer };
}

function block(text: string) {
    return {
        text,
        blockName: 'paragraph.content',
        domNode: document.createElement('span'),
        isParent: () => false,
    } as unknown as Format;
}

describe('inlineRenderer reference definition collection', () => {
    it('scans the document once for many patches of an unchanged revision', () => {
        const { jsonState, inlineRenderer } = setup('[ref]: https://example.com/a\n\n[one][ref]\n\n[two][ref]\n');
        const peek = vi.spyOn(jsonState, 'peekState');
        const getState = vi.spyOn(jsonState, 'getState');

        for (let i = 0; i < 50; i++)
            inlineRenderer.patch(block(`[link ${i}][ref]`));

        expect(peek).toHaveBeenCalledTimes(1);
        expect(getState).not.toHaveBeenCalled();
        expect(inlineRenderer.labels.get('ref')?.href).toBe('https://example.com/a');
    });

    it('renders reference links against the current definitions', () => {
        const { inlineRenderer } = setup('[ref]: https://example.com/a "Title"\n');
        const target = block('[text][ref]');

        inlineRenderer.patch(target);

        const anchor = target.domNode!.querySelector('a');
        expect(anchor?.getAttribute('href')).toBe('https://example.com/a');
    });

    it('recollects after setContent replaces the document', () => {
        const { jsonState, inlineRenderer } = setup('[ref]: https://example.com/a\n');
        inlineRenderer.patch(block('[text][ref]'));

        jsonState.setContent('[other]: https://example.com/b\n');
        const target = block('[text][ref]');
        inlineRenderer.patch(target);

        expect(inlineRenderer.labels.has('ref')).toBe(false);
        expect(inlineRenderer.labels.get('other')?.href).toBe('https://example.com/b');
        expect(target.domNode!.querySelector('a')).toBeNull();
    });

    it('recollects after an edit is applied to the document', () => {
        const { jsonState, inlineRenderer } = setup('placeholder\n');
        inlineRenderer.patch(block('[text][ref]'));
        expect(inlineRenderer.labels.size).toBe(0);

        jsonState.dispatch(
            JSONState.compose(
                [0, 'text', { es: [{ d: 'placeholder'.length }] }] as never,
                [0, 'text', { es: ['[ref]: https://example.com/c'] }] as never,
            ),
        );
        inlineRenderer.patch(block('[text][ref]'));

        expect(inlineRenderer.labels.get('ref')?.href).toBe('https://example.com/c');
    });

    it('finds definitions nested in container blocks', () => {
        const { inlineRenderer } = setup('> [quoted]: https://example.com/q\n\n- [listed]: https://example.com/l\n');

        inlineRenderer.patch(block('[a][quoted] [b][listed]'));

        expect(inlineRenderer.labels.get('quoted')?.href).toBe('https://example.com/q');
        expect(inlineRenderer.labels.get('listed')?.href).toBe('https://example.com/l');
    });
});
