import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/muya';
import { getMarkdown } from '../helpers/api';

const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';

async function setCaret(page: Page, markdown: string, offset: number) {
    await page.evaluate(({ markdown, offset }) => {
        window.muya!.setContent(markdown);
        const block = window.muya!.editor.scrollPage!.firstContentInDescendant()!;
        block.setCursor(offset, offset, true);
        window.muya!.focus();
        window.muya!.domNode.focus();
    }, { markdown, offset });
}

test.describe('Unicode editing and search', () => {
    test('an edit after a ZWJ sequence stays aligned through undo and redo', async ({ page }) => {
        const initial = `${FAMILY}y`;
        await setCaret(page, initial, initial.length);

        await page.keyboard.press('Backspace');
        await expect.poll(() => getMarkdown(page)).toBe(`${FAMILY}\n`);

        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe(`${initial}\n`);

        await page.evaluate(() => window.muya!.redo());
        await expect.poll(() => getMarkdown(page)).toBe(`${FAMILY}\n`);
    });

    test('Backspace and Delete remove a ZWJ sequence as one character', async ({ page }) => {
        await setCaret(page, `a${FAMILY}b`, 1 + FAMILY.length);
        await page.keyboard.press('Backspace');
        await expect.poll(() => getMarkdown(page)).toBe('ab\n');

        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe(`a${FAMILY}b\n`);

        await setCaret(page, `a${FAMILY}b`, 1);
        await page.keyboard.press('Delete');
        await expect.poll(() => getMarkdown(page)).toBe('ab\n');
    });

    test('zero-width regexp search terminates and can replace once', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.muya!.setContent('ab');
            const search = window.muya!.search('(?=b)', { isRegexp: true });
            const matches = search.matches.map(match => ({ start: match.start, end: match.end }));
            window.muya!.replace('X', { isSingle: true, isRegexp: true });
            return matches;
        });

        expect(result).toEqual([{ start: 1, end: 1 }]);
        await expect.poll(() => getMarkdown(page)).toBe('aXb\n');
    });

    test('regexp replace keeps graphemes whole and expands groups per match', async ({ page }) => {
        await page.evaluate((family) => {
            window.muya!.setContent(`A${family}B`);
            window.muya!.search('.', { isRegexp: true });
            window.muya!.replace('X', { isSingle: false, isRegexp: true });
        }, FAMILY);
        await expect.poll(() => getMarkdown(page)).toBe('XXX\n');

        await page.evaluate(() => {
            window.muya!.setContent('a1 b2\n\nc3');
            window.muya!.search('([a-z])(\\d)', { isRegexp: true });
            window.muya!.replace('$2$1', { isSingle: false, isRegexp: true });
        });
        await expect.poll(() => getMarkdown(page)).toBe('1a 2b\n\n3c\n');
    });

    test('fallback capture repair preserves its own boundary and replacement text', async ({ page }) => {
        const fallback = await page.evaluate(() => {
            window.muya!.setContent('-🙂');
            const search = window.muya!.search('\\-(.)', { isRegexp: true });
            const subMatches = search.matches[0]?.subMatches;
            window.muya!.replace('$1', { isSingle: true, isRegexp: true });
            return subMatches;
        });
        expect(fallback).toEqual(['🙂']);
        await expect.poll(() => getMarkdown(page)).toBe('🙂\n');

        const captures = await page.evaluate((family) => {
            window.muya!.setContent(family);
            const search = window.muya!.search('(.)', { isRegexp: true });
            return {
                match: search.matches[0]?.match,
                subMatches: search.matches[0]?.subMatches,
            };
        }, FAMILY);
        expect(captures).toEqual({ match: FAMILY, subMatches: ['👨'] });

        await page.evaluate(() => {
            window.muya!.setContent('$$🙂');
            window.muya!.search('(\\$\\$)|(.)|(\\-)', { isRegexp: true });
            window.muya!.replace('[$1$2$3]', { isSingle: false, isRegexp: true });
        });
        await expect.poll(() => getMarkdown(page)).toBe('[$$][🙂]\n');
    });
});
