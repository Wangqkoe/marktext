import { expect, test } from '../fixtures/muya';
import { getMarkdown } from '../helpers/api';
import { slowType } from '../helpers/keyboard';
import { editor } from '../helpers/selectors';

test('typing continues after a hard line break without moving the caret', async ({ page }) => {
    await page.evaluate(() => window.muya!.setContent(''));
    await page.locator(editor.paragraph).first().click();

    await slowType(page, 'a  ');
    await page.keyboard.press('Shift+Enter');
    await slowType(page, 'bc');

    await expect(page.locator('.mu-hard-line-break')).toHaveCount(1);
    await expect.poll(() => getMarkdown(page)).toBe('a  \nbc\n');
});
