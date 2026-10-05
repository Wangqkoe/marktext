// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
    getClipBoardHtml,
    getSanitizeClipboardHtml,
} from '../../utils/marked/getClipboardHtml';

// Copy-as-HTML / copy-as-rich must render footnote definitions in the clipboard
// HTML the same way the static / export render path does. muyajs passed the
// `footnote` option into marked; muya's `getClipBoardHtml` dropped it.
const MD = 'See the note[^1].\n\n[^1]: The footnote body.';

describe('getClipBoardHtml — footnote rendering', () => {
    it('renders footnote definitions when footnote is enabled', () => {
        const html = getClipBoardHtml(MD, { footnote: true });
        expect(html).toContain('footnote-block');
    });

    it('leaves footnote definitions unrendered when footnote is disabled', () => {
        const html = getClipBoardHtml(MD, { footnote: false });
        expect(html).not.toContain('footnote-block');
    });

    it.each([
        ['raw rich-copy HTML', getClipBoardHtml],
        ['sanitized copy-as-HTML', getSanitizeClipboardHtml],
    ])('preserves visible reference text in %s without changing definition blocks', (_, render) => {
        const html = render([
            'Orphan[^missing]. Real[^1]. Escaped \\[^1]. Code `[^1]`.',
            '',
            '[^1]: The footnote body.',
        ].join('\n'), { footnote: true });
        const container = document.createElement('div');
        container.innerHTML = html;

        expect(container.textContent).toContain('Orphan[^missing].');
        expect(container.textContent).toContain('Real[^1].');
        expect(container.textContent).toContain('Escaped [^1].');
        expect(container.querySelector('code')?.textContent).toBe('[^1]');
        expect(container.querySelector('div.footnote-block')?.textContent)
            .toContain('The footnote body.');
        expect(html).not.toMatch(/<span class="footnote-ref"[^>]*data-identifier=/);
    });

    it.each([
        ['raw rich-copy HTML', getClipBoardHtml],
        ['sanitized copy-as-HTML', getSanitizeClipboardHtml],
    ])('restores a special orphan identifier safely in %s', (_, render) => {
        const html = render('Special[^<img>].', { footnote: true });

        expect(html).toContain('[^&lt;img&gt;]');
        expect(html).not.toContain('<img>');
        expect(html).not.toMatch(/<span class="footnote-ref"/);
    });
});
