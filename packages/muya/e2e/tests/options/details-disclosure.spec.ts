import type { TState } from '@muyajs/core';
import { expect, test } from '../fixtures/muya';
import { getMarkdown } from '../helpers/api';
import { editor } from '../helpers/selectors';

const source = '<details>\n<summary>摘要原文</summary>\n\nDETAILS_BODY_SENTINEL_4BDE701A\n\n</details>';

const bodyHeight = async(page: import('@playwright/test').Page) =>
    await page.evaluate(() => {
        const details = document.querySelector('.mu-html-preview details');
        const walker = document.createTreeWalker(details!, NodeFilter.SHOW_TEXT);
        let text = walker.nextNode();
        while (text && !text.textContent!.includes('DETAILS_BODY_SENTINEL_4BDE701A'))
            text = walker.nextNode();
        if (!text)
            throw new Error('details body sentinel text node is missing');
        const range = document.createRange();
        range.selectNode(text);
        return range.getBoundingClientRect().height;
    });

test.describe('options / raw HTML details disclosure', () => {
    test('keeps native summary mouse and keyboard disclosure temporary', async ({ page }) => {
        await page.evaluate((text) => {
            window.muya!.setContent([{ name: 'html-block', text }] as TState[]);
        }, source);

        const preview = page.locator(editor.htmlPreview);
        const details = preview.locator('details');
        const summary = details.locator('summary');
        await expect(details).not.toHaveAttribute('open', '');
        expect(await bodyHeight(page)).toBe(0);
        await expect(preview.locator('.mu-details-source-action')).toHaveCount(0);
        const previewBox = await preview.boundingBox();
        const summaryBox = await summary.boundingBox();
        expect(previewBox!.height).toBeLessThanOrEqual(summaryBox!.height + 8);

        await summary.click();
        await expect(details).toHaveAttribute('open', '');
        expect(await bodyHeight(page)).toBeGreaterThan(0);
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

        await wrapper.hover();
        await page.locator('.mu-preview-tools li.item.edit').click();
        await expect(wrapper).toHaveClass(/mu-active/);
        await expect(preview).toBeHidden();

        await page.keyboard.press('Escape');
        await expect(preview).toBeVisible();
        await expect(preview.locator('details')).toHaveAttribute('open', '');
    });

    test('Preview rebuilds edited source and drops transient disclosure state', async ({ page }) => {
        await page.evaluate((text) => {
            window.muya!.setContent([{ name: 'html-block', text }] as TState[]);
        }, source);

        const wrapper = page.locator(editor.htmlBlock);
        const preview = wrapper.locator(editor.htmlPreview);
        await wrapper.hover();
        await page.locator('.mu-preview-tools li.item.edit').click();
        const sourceContent = wrapper.locator('.mu-html-container .mu-codeblock-content');
        await sourceContent.fill('<details><summary>Updated</summary>Changed body</details>');

        const previewAction = wrapper.locator('.mu-html-preview-action');
        await expect(previewAction).toBeVisible();
        await previewAction.focus();
        await previewAction.press('Enter');

        await expect(preview).toBeVisible();
        await expect(preview.locator('summary')).toHaveText('Updated');
        await expect(preview.locator('details')).not.toHaveAttribute('open', '');
        expect(await getMarkdown(page)).toContain('Changed body');
    });

    test('restores source editing after Preview rebuilds the same block', async ({ page }) => {
        await page.evaluate((text) => {
            window.muya!.setContent([{ name: 'html-block', text }] as TState[]);
        }, source);

        const wrapper = page.locator(editor.htmlBlock);
        const preview = wrapper.locator(editor.htmlPreview);
        const sourceContent = wrapper.locator('.mu-html-container .mu-codeblock-content');

        await wrapper.hover();
        await page.locator('.mu-preview-tools li.item.edit').click();
        await expect(sourceContent).toBeVisible();
        await wrapper.locator('.mu-html-preview-action').click();
        await expect(preview).toBeVisible();

        await wrapper.hover();
        await page.locator('.mu-preview-tools li.item.edit').click();
        await expect(wrapper).toHaveClass(/mu-active/);
        await expect(sourceContent).toBeVisible();
        await sourceContent.fill('<details><summary>Re-entered</summary>Edited again</details>');
        await wrapper.locator('.mu-html-preview-action').click();

        await expect(preview).toBeVisible();
        await expect(preview.locator('summary')).toHaveText('Re-entered');
        expect(await getMarkdown(page)).toContain('Edited again');
    });

    test('Escape rebuilds edited source and drops transient disclosure state', async ({ page }) => {
        await page.evaluate((text) => {
            window.muya!.setContent([{ name: 'html-block', text }] as TState[]);
        }, source);

        const wrapper = page.locator(editor.htmlBlock);
        const preview = wrapper.locator(editor.htmlPreview);
        await wrapper.hover();
        await page.locator('.mu-preview-tools li.item.edit').click();
        const sourceContent = wrapper.locator('.mu-html-container .mu-codeblock-content');
        await sourceContent.fill('<details><summary>Escaped</summary>New body</details>');

        await page.keyboard.press('Escape');
        await expect(preview).toBeVisible();
        await expect(preview.locator('summary')).toHaveText('Escaped');
        await expect(preview.locator('details')).not.toHaveAttribute('open', '');
        expect(await getMarkdown(page)).toContain('New body');
    });

    test('restores source editing after Escape rebuilds the same block', async ({ page }) => {
        await page.evaluate((text) => {
            window.muya!.setContent([{ name: 'html-block', text }] as TState[]);
        }, source);

        const wrapper = page.locator(editor.htmlBlock);
        const preview = wrapper.locator(editor.htmlPreview);
        const sourceContent = wrapper.locator('.mu-html-container .mu-codeblock-content');

        await wrapper.hover();
        await page.locator('.mu-preview-tools li.item.edit').click();
        await page.keyboard.press('Escape');
        await expect(preview).toBeVisible();

        await preview.hover();
        await wrapper.hover();
        await page.locator('.mu-preview-tools li.item.edit').click();
        await expect(wrapper).toHaveClass(/mu-active/);
        await expect(sourceContent).toBeVisible();
        await expect(wrapper.locator('.mu-html-preview-action')).toBeVisible();
        await sourceContent.fill('<details><summary>Escaped twice</summary>Editable</details>');
        await wrapper.locator('.mu-html-preview-action').click();

        await expect(preview.locator('summary')).toHaveText('Escaped twice');
        expect(await getMarkdown(page)).toContain('Editable');
    });

    test('does not let a former source session intercept Escape from another content block', async ({ page }) => {
        await page.evaluate((text) => {
            window.muya!.setContent([
                { name: 'html-block', text },
                { name: 'paragraph', text: 'Outside content' },
            ] as TState[]);
        }, source);

        const wrapper = page.locator(editor.htmlBlock);
        const preview = wrapper.locator(editor.htmlPreview);
        await wrapper.hover();
        await page.locator('.mu-preview-tools li.item.edit').click();
        await expect(wrapper.locator('.mu-html-container .mu-codeblock-content')).toBeVisible();

        const outside = page.locator(editor.paragraph).filter({ hasText: 'Outside content' });
        await outside.click();
        await expect.poll(() => page.evaluate(() => {
            return window.muya!.editor.activeContentBlock?.text;
        })).toBe('Outside content');

        const escape = await outside.evaluate((element) => {
            let reachedDocument = false;
            const observer = () => {
                reachedDocument = true;
            };
            document.addEventListener('keydown', observer);
            const event = new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            });
            element.dispatchEvent(event);
            document.removeEventListener('keydown', observer);

            return {
                defaultPrevented: event.defaultPrevented,
                reachedDocument,
            };
        });

        expect(escape).toEqual({ defaultPrevented: false, reachedDocument: true });
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
