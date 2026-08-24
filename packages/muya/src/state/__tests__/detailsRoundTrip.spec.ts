// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../markdownToState';
import { renderToStaticHTML } from '../renderToStaticHTML';
import ExportMarkdown from '../stateToMarkdown';

const source = '<details open>\n<summary>More</summary>\n\nBody\n</details>\n';

describe('raw HTML details round-trip', () => {
    it('preserves original details source and open through Markdown state', () => {
        const states = new MarkdownToState({
            footnote: false,
            math: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate(source);

        expect(states[0]).toMatchObject({ name: 'html-block', text: source.trim() });
        expect(new ExportMarkdown().generate(states)).toBe(source);
    });

    it('exports standard details markup without editor controls or styles', () => {
        const html = renderToStaticHTML(source);

        expect(html).toContain('<details open="">');
        expect(html).toContain('<summary>More</summary>');
        expect(html).not.toContain('mu-details-source-action');
        expect(html).not.toContain('mu-html-preview');
    });
});
