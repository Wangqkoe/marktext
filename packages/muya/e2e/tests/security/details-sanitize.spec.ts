import type { TState } from '@muyajs/core';
import { expect, test } from '../fixtures/muya';
import { editor } from '../helpers/selectors';

test.describe('security / details sanitization', () => {
    test('keeps standard disclosure semantics but removes unsafe attributes', async ({ page }) => {
        await page.evaluate(() => {
            window.muya!.setContent([{
                name: 'html-block',
                text: '<details open ontoggle="window.__detailsPwned = true" onbeforetoggle="window.__detailsPwned = true"><summary onclick="window.__detailsPwned = true">More</summary><a href="javascript:window.__detailsPwned = true">Body</a></details>',
            }] as TState[]);
        });

        const preview = page.locator(editor.htmlPreview);
        const details = preview.locator('details');
        await expect(details).toHaveAttribute('open', '');
        await expect(details.locator('summary')).toHaveText('More');

        const unsafeAttributes = await details.evaluate((element) => {
            return [...element.querySelectorAll('*'), element]
                .flatMap(node => [...node.attributes])
                .map(attribute => attribute.name)
                .filter(name => name.startsWith('on'));
        });
        expect(unsafeAttributes).toEqual([]);

        const href = await details.locator('a').getAttribute('href');
        expect(href?.toLowerCase() ?? '').not.toContain('javascript:');
    });

    test('sanitizes generic raw HTML without adding disclosure editor controls', async ({ page }) => {
        await page.evaluate(() => {
            window.muya!.setContent([{
                name: 'html-block',
                text: '<section class="note" onclick="window.__pwned = true"><a href="javascript:window.__pwned = true">Body</a></section>',
            }] as TState[]);
        });

        const preview = page.locator(editor.htmlPreview);
        await expect(preview.locator('section.note')).toHaveText('Body');
        await expect(preview.locator('.mu-details-source-action')).toHaveCount(0);
        const section = preview.locator('section.note');
        await expect(section).not.toHaveAttribute('onclick');
        const href = await section.locator('a').getAttribute('href');
        expect(href?.toLowerCase() ?? '').not.toContain('javascript:');
    });
});
