import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/muya';
import { getMarkdown } from '../helpers/api';
import { loadMarkdown } from '../helpers/keyboard';
import { editor } from '../helpers/selectors';
import { collectPageErrors, detachedBlocks, expectTreeMatchesJson, nextFrames } from '../helpers/tree';

const DOC = 'alpha beta\n\ngamma delta epsilon\n';

// Selects "alpha beta" plus the first letter of the next paragraph.
async function selectIntoSecondParagraph(page: Page): Promise<void> {
    await loadMarkdown(page, DOC);
    await nextFrames(page);
    await page.locator(editor.paragraph).first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowRight');
    await nextFrames(page);
}

async function expectClean(page: Page, errors: string[], markdown: string): Promise<void> {
    await expect.poll(() => getMarkdown(page)).toBe(markdown);
    expect(errors).toEqual([]);
    expect(await detachedBlocks(page)).toEqual([]);
    await expectTreeMatchesJson(page);
}

const NON_EDITING_KEYS = ['End', 'Shift+End', 'Shift+Home', 'Shift+PageUp', 'Tab', 'F2', 'Insert', 'ContextMenu'];

for (const key of NON_EDITING_KEYS) {
    test(`${key} over a selection spanning two paragraphs keeps both`, async ({ page }) => {
        const errors = collectPageErrors(page);
        await selectIntoSecondParagraph(page);

        await page.keyboard.press(key);
        await nextFrames(page);

        await expectClean(page, errors, DOC);
    });
}

test('typing over a selection spanning two paragraphs still replaces it', async ({ page }) => {
    const errors = collectPageErrors(page);
    await selectIntoSecondParagraph(page);

    await page.keyboard.type('x');
    await nextFrames(page);

    await expectClean(page, errors, 'xamma delta epsilon\n');
});

test('Backspace over a selection spanning two paragraphs still deletes it', async ({ page }) => {
    const errors = collectPageErrors(page);
    await selectIntoSecondParagraph(page);

    await page.keyboard.press('Backspace');
    await nextFrames(page);

    await expectClean(page, errors, 'amma delta epsilon\n');
});
