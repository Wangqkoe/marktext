import type { TState } from '@muyajs/core';
import { expect, test } from '../fixtures/muya';
import { getMarkdown } from '../helpers/api';
import { editor } from '../helpers/selectors';

const source = '<details>\n<summary>More</summary>\n\nBody\n</details>';

test.describe('options / raw HTML details disclosure', () => {
    test('keeps native summary mouse and keyboard disclosure temporary', async ({ page }) => {
        await page.evaluate((text) => {
            window.muya!.setContent([{ name: 'html-block', text }] as TState[]);
        }, source);

        const preview = page.locator(editor.htmlPreview);
        const details = preview.locator('details');
        const summary = details.locator('summary');
        await expect(details).not.toHaveAttribute('open', '');

        await summary.click();
        await expect(details).toHaveAttribute('open', '');
        expect(await getMarkdown(page)).toBe(`${source}\n`);

        await summary.focus();
        await summary.press('Enter');
        await expect(details).not.toHaveAttribute('open', '');
        expect(await getMarkdown(page)).toBe(`${source}\n`);

        await summary.press('Space');
        await expect(details).toHaveAttribute('open', '');
        expect(await getMarkdown(page)).toBe(`${source}\n`);
    });

    test('uses source open only when a preview is rebuilt', async ({ page }) => {
        await page.evaluate(() => {
            window.muya!.setContent([{
                name: 'html-block',
                text: '<details open><summary>More</summary>Body</details>',
            }] as TState[]);
        });

        const wrapper = page.locator(editor.htmlBlock);
        const preview = wrapper.locator(editor.htmlPreview);
        const details = preview.locator('details');
        await expect(details).toHaveAttribute('open', '');

        const action = preview.locator('.mu-details-source-action');
        await expect(action).toHaveText('</>');
        await action.click();
        await expect(wrapper).toHaveClass(/mu-active/);
        await expect(preview).toBeHidden();

        await page.keyboard.press('Escape');
        await expect(wrapper).not.toHaveClass(/mu-active/);
        await expect(preview).toBeVisible();
        await expect(preview.locator('details')).toHaveAttribute('open', '');
    });

    test('disableHtml renders escaped source and no native disclosure or source action', async ({ page }) => {
        await page.evaluate(() => {
            window.__e2e!.rebuildMuya({ disableHtml: true });
            window.muya!.setContent([{
                name: 'html-block',
                text: '<details><summary>More</summary>Body</details>',
            }] as TState[]);
        });

        const preview = page.locator(editor.htmlPreview);
        await expect(preview.locator('details')).toHaveCount(0);
        await expect(preview.locator('.mu-details-source-action')).toHaveCount(0);
        await expect(preview).toContainText('details');
    });
});
