// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageEditTool } from '..';
import { Muya } from '../../../muya';
import { getImageInfo } from '../../../utils/image';

// marktext #5344: the desktop rebuilds the document from markdown when it
// leaves source mode. If that happens while `imageAction` is still copying or
// uploading, the block the tool captured on open is detached, and the
// `loading-<id>` placeholder must still be replaced in the rebuilt document.

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    vi.restoreAllMocks();
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function markdownOf(muya: Muya): string {
    muya.flush();
    return muya.getMarkdown();
}

function openToolOnFirstImage(muya: Muya) {
    const wrapper = muya.domNode.querySelector<HTMLElement>('span.mu-inline-image')!;
    const block = muya.editor.scrollPage!.firstContentInDescendant();
    muya.eventCenter.emit('muya-image-selector', {
        block,
        reference: wrapper,
        imageInfo: getImageInfo(wrapper),
    });
}

describe('imageEditTool — pending imageAction', () => {
    it('replaces the placeholder after the document is rebuilt while the action is pending', async () => {
        const muya = bootMuya('first![](old.png)\n');
        let finishCopy!: (src: string) => void;
        const imageAction = vi.fn(() => new Promise<string>((resolve) => {
            finishCopy = resolve;
        }));
        const tool = new ImageEditTool(muya, { imageAction } as never);
        openToolOnFirstImage(muya);

        const pending = (tool as unknown as {
            _replaceImageAsync: (state: { alt: string; src: string; title: string }) => Promise<void>;
        })._replaceImageAsync({ alt: '', src: '/abs/shot.png', title: '' });

        expect(markdownOf(muya)).toMatch(/!\[loading-[^\]]+\]\(\/abs\/shot\.png\)/);
        muya.setContent(markdownOf(muya));

        finishCopy('assets/hash.png');
        await pending;

        expect(markdownOf(muya).trim()).toBe('first![](assets/hash.png)');
    });
});
