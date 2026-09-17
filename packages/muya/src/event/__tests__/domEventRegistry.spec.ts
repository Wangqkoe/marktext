// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';
import EventCenter from '../index';

// Rebuilding a large document registers thousands of block DOM listeners.
// Registrations are indexed so attaching and detaching stay cheap, and a
// whole-document rebuild releases the listeners of the tree it drops instead
// of accumulating them across every tab switch.

describe('eventCenter DOM listener registry', () => {
    it('ignores a duplicate registration of the same target, event, listener and capture', () => {
        const ec = new EventCenter();
        const target = document.createElement('div');
        const listener = vi.fn();

        expect(ec.attachDOMEvent(target, 'click', listener)).not.toBe('');
        expect(ec.attachDOMEvent(target, 'click', listener)).toBe('');
        expect(ec.attachDOMEvent(target, 'click', listener, true)).not.toBe('');
        expect(ec.attachDOMEvent(document.createElement('div'), 'click', listener)).not.toBe('');

        target.dispatchEvent(new Event('click'));
        expect(listener).toHaveBeenCalledTimes(2);
        expect(ec.events).toHaveLength(3);
    });

    it('detaches by id and allows the same binding to be registered again', () => {
        const ec = new EventCenter();
        const target = document.createElement('div');
        const listener = vi.fn();
        const id = ec.attachDOMEvent(target, 'click', listener);

        ec.detachDOMEvent(id);
        target.dispatchEvent(new Event('click'));
        expect(listener).not.toHaveBeenCalled();
        expect(ec.events).toHaveLength(0);

        expect(ec.attachDOMEvent(target, 'click', listener)).not.toBe('');
        target.dispatchEvent(new Event('click'));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('detachDOMEventsWithin releases descendants only', () => {
        const ec = new EventCenter();
        const outside = document.createElement('section');
        const root = document.createElement('div');
        const child = document.createElement('p');
        const grandchild = document.createElement('span');
        child.appendChild(grandchild);
        root.appendChild(child);
        const onRoot = vi.fn();
        const onChild = vi.fn();
        const onGrandchild = vi.fn();
        const onOutside = vi.fn();
        ec.attachDOMEvent(root, 'click', onRoot);
        ec.attachDOMEvent(child, 'click', onChild);
        ec.attachDOMEvent(grandchild, 'keydown', onGrandchild);
        ec.attachDOMEvent(outside, 'click', onOutside);

        ec.detachDOMEventsWithin(root);

        expect(ec.events.map(e => e.target)).toEqual([root, outside]);
        child.dispatchEvent(new Event('click'));
        grandchild.dispatchEvent(new Event('keydown'));
        root.dispatchEvent(new Event('click'));
        outside.dispatchEvent(new Event('click'));
        expect(onChild).not.toHaveBeenCalled();
        expect(onGrandchild).not.toHaveBeenCalled();
        expect(onRoot).toHaveBeenCalledTimes(1);
        expect(onOutside).toHaveBeenCalledTimes(1);
    });

    it('detachAllDomEvents clears the registry', () => {
        const ec = new EventCenter();
        const target = document.createElement('div');
        const listener = vi.fn();
        ec.attachDOMEvent(target, 'click', listener);

        ec.detachAllDomEvents();

        target.dispatchEvent(new Event('click'));
        expect(listener).not.toHaveBeenCalled();
        expect(ec.events).toHaveLength(0);
        expect(ec.attachDOMEvent(target, 'click', listener)).not.toBe('');
    });
});

describe('whole-document rebuild releases block listeners', () => {
    let host: HTMLElement | undefined;
    let originalVersion: string | undefined;

    beforeEach(() => {
        originalVersion = window.MUYA_VERSION;
        window.MUYA_VERSION = 'test';
    });

    afterEach(() => {
        host?.remove();
        window.MUYA_VERSION = originalVersion as string;
    });

    it('keeps the registry size stable across repeated setContent', () => {
        const blocks = Array.from({ length: 20 }, (_, i) =>
            `## Heading ${i}\n\n<details>\n<summary>More ${i}</summary>\n\nBody ${i}\n\n</details>\n`).join('\n');
        host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: blocks } as ConstructorParameters<typeof Muya>[1]);
        muya.init();

        muya.setContent(blocks);
        const afterFirst = muya.eventCenter.events.length;
        for (let i = 0; i < 5; i++)
            muya.setContent(blocks);

        expect(muya.eventCenter.events.length).toBe(afterFirst);
        const blockRoot = muya.editor.scrollPage!.domNode!;
        for (const { target } of muya.eventCenter.events) {
            if (target !== blockRoot && blockRoot.contains(target))
                expect(target.isConnected).toBe(true);
        }
    });
});
