// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../markdownToState';
import { renderToStaticHTML } from '../renderToStaticHTML';
import ExportMarkdown from '../stateToMarkdown';

const source = '<details open>\n<summary>More</summary>\nBody\n</details>\n';
const rawTextSource = '<details>\n<summary>摘要原文</summary>\n\nDETAILS_BODY_SENTINEL_4BDE701A\n\n</details>\n';
const quotedClosingTagSource = '<details>\n<div title="</details>" data-close=\'</details>\'>body</div>\n\nBody\n\n</details>\n\nAfter\n';
const scriptClosingTagSource = '<details>\n<script>const closing = \'</details>\';</script>\n<style>.marker::after { content: \'</details>\'; }</style>\n\nBody\n\n</details>\n\nAfter\n';
const textareaClosingTagSource = '<details>\n<textarea>literal </details></textarea>\n\nBody\n\n</details>\n\nAfter\n';
const malformedDetailsSource = `${'<details>\n\n'.repeat(64)}After\n`;

describe('raw HTML details round-trip', () => {
    it('preserves original details source and open through Markdown state', () => {
        const states = new MarkdownToState({
            footnote: false,
            texMathDollars: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate(source);

        expect(states[0]).toMatchObject({ name: 'html-block', text: source.trim() });
        expect(new ExportMarkdown().generate(states)).toBe(source);
    });

    it('keeps raw details text with blank lines in one previewable HTML block', () => {
        const states = new MarkdownToState({
            footnote: false,
            texMathDollars: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate(rawTextSource);

        expect(states).toEqual([{ name: 'html-block', text: rawTextSource.trim() }]);
        expect(new ExportMarkdown().generate(states)).toBe(rawTextSource);
    });

    it('keeps a quoted closing-tag string inside matching raw details', () => {
        const states = new MarkdownToState({
            footnote: false,
            texMathDollars: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate(quotedClosingTagSource);

        expect(states).toEqual([
            {
                name: 'html-block',
                text: '<details>\n<div title="</details>" data-close=\'</details>\'>body</div>\n\nBody\n\n</details>',
            },
            { name: 'paragraph', text: 'After' },
        ]);
        expect(new ExportMarkdown().generate(states)).toBe(quotedClosingTagSource);
    });

    it('ignores closing-tag strings in raw script and style content', () => {
        const states = new MarkdownToState({
            footnote: false,
            texMathDollars: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate(scriptClosingTagSource);

        expect(states).toEqual([
            {
                name: 'html-block',
                text: '<details>\n<script>const closing = \'</details>\';</script>\n<style>.marker::after { content: \'</details>\'; }</style>\n\nBody\n\n</details>',
            },
            { name: 'paragraph', text: 'After' },
        ]);
        expect(new ExportMarkdown().generate(states)).toBe(scriptClosingTagSource);
    });

    it('ignores closing-tag strings in raw textarea content', () => {
        const states = new MarkdownToState({
            footnote: false,
            texMathDollars: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate(textareaClosingTagSource);

        expect(states).toEqual([
            {
                name: 'html-block',
                text: '<details>\n<textarea>literal </details></textarea>\n\nBody\n\n</details>',
            },
            { name: 'paragraph', text: 'After' },
        ]);
        expect(new ExportMarkdown().generate(states)).toBe(textareaClosingTagSource);
    });

    it('replays malformed details openers without swallowing later content', () => {
        const states = new MarkdownToState({
            footnote: false,
            texMathDollars: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate(malformedDetailsSource);

        expect(states.filter(state => state.name === 'html-block')).toHaveLength(64);
        expect(states.at(-1)).toEqual({ name: 'paragraph', text: 'After' });
        expect(new ExportMarkdown().generate(states)).toBe(malformedDetailsSource);
    });

    it('exports standard details markup without editor controls or styles', () => {
        const html = renderToStaticHTML(source);

        expect(html).toContain('<details open="">');
        expect(html).toContain('<summary>More</summary>');
        expect(html).not.toContain('mu-details-source-action');
        expect(html).not.toContain('mu-html-preview');
    });

    it('keeps generic sanitized raw HTML standard in static export', () => {
        const html = renderToStaticHTML(
            '<section class="note" onclick="alert(1)"><a href="javascript:alert(2)">Body</a></section>',
        );

        expect(html).toContain('<section class="note">');
        expect(html).toContain('Body');
        expect(html).not.toMatch(/onclick|javascript:/i);
        expect(html).not.toContain('mu-details-source-action');
        expect(html).not.toContain('mu-html-preview');
    });
});
