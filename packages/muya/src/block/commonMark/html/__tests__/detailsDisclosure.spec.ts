// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { PREVIEW_DOMPURIFY_CONFIG } from '../../../../config';
import { sanitize } from '../../../../utils';

describe('raw HTML details disclosure sanitization', () => {
    it('keeps semantic details, summary and source open markup', () => {
        const html = sanitize(
            '<details open><summary>More</summary><p>Body</p></details>',
            PREVIEW_DOMPURIFY_CONFIG,
            false,
        ) as string;

        expect(html).toContain('<details open="">');
        expect(html).toContain('<summary>More</summary>');
    });

    it('strips unsafe disclosure handlers without changing its open state', () => {
        const html = sanitize(
            '<details open ontoggle="alert(1)" onbeforetoggle="alert(2)"><summary onclick="alert(3)">More</summary></details>',
            PREVIEW_DOMPURIFY_CONFIG,
            false,
        ) as string;

        expect(html).toContain('<details open="">');
        expect(html).toContain('<summary>More</summary>');
        expect(html).not.toMatch(/on(?:toggle|beforetoggle|click)/i);
    });
});
