// @vitest-environment jsdom

import type HTMLBlock from '..';
import { afterEach, describe, expect, it } from 'vitest';
import { BLOCK_DOM_PROPERTY, PREVIEW_DOMPURIFY_CONFIG } from '../../../../config';
import { Muya } from '../../../../muya';
import { sanitize } from '../../../../utils';

const bootedHosts: HTMLElement[] = [];

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
});

function bootDetails(source: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown: source });
    muya.init();
    bootedHosts.push(muya.domNode);

    const figure = muya.domNode.querySelector<HTMLElement>('figure.mu-html-block')!;
    const block = figure[BLOCK_DOM_PROPERTY] as HTMLBlock;
    const content = block.firstContentInDescendant()!;

    return { block, content, figure };
}

function nextFrame() {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

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

    it('keeps DOMPurify default URL handling for generic raw HTML', () => {
        const html = sanitize(
            '<section><a href="javascript:alert(1)">Script</a><a href="file:///C:/secret.txt">File</a><a href="sms:+15551212">SMS</a></section>',
            PREVIEW_DOMPURIFY_CONFIG,
            false,
        ) as string;

        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('file:///');
        expect(html).toContain('href="sms:+15551212"');
    });

    it('rebuilds current source through both Preview and Escape', () => {
        const { block, content, figure } = bootDetails(
            '<details><summary>Initial</summary>Body</details>\n',
        );
        const preview = figure.querySelector<HTMLElement>('.mu-html-preview')!;

        content.text = '<details><summary>Preview result</summary>Updated</details>';
        block.active = true;
        figure.querySelector<HTMLButtonElement>('.mu-html-preview-action')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(preview.querySelector('summary')?.textContent).toBe('Preview result');
        expect(preview.querySelector('details')?.open).toBe(false);

        content.text = '<details><summary>Escape result</summary>Updated again</details>';
        block.active = true;
        content.domNode!.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));
        expect(preview.querySelector('summary')?.textContent).toBe('Escape result');
        expect(preview.querySelector('details')?.open).toBe(false);
    });

    it('reestablishes source focus after leaving preview mode', async () => {
        const { block, figure } = bootDetails(
            '<details><summary>More</summary>Body</details>\n',
        );
        const previewAction = figure.querySelector<HTMLButtonElement>('.mu-html-preview-action')!;

        block.enterSourceEditing();
        await nextFrame();
        previewAction.click();
        await nextFrame();
        expect(block.active).toBe(false);

        block.enterSourceEditing();
        await nextFrame();
        expect(block.active).toBe(true);
        expect(figure.classList.contains('mu-active')).toBe(true);
    });
});
