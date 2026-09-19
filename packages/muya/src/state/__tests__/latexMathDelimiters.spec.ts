import type { IMathBlockState, TState } from '../types';
import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../markdownToState';
import StateToMarkdown from '../stateToMarkdown';

function parse(markdown: string, latexMathDelimiters = true): TState[] {
    return new MarkdownToState({
        footnote: false,
        texMathDollars: true,
        latexMathDelimiters,
        isGitlabCompatibilityEnabled: false,
        trimUnnecessaryCodeBlockEmptyLines: false,
        frontMatter: false,
    }).generate(markdown);
}

function roundTrip(markdown: string, latexMathDelimiters = true): string {
    return new StateToMarkdown({ listIndentation: 1 }).generate(
        parse(markdown, latexMathDelimiters),
    );
}

describe('LaTeX math delimiters', () => {
    it('keeps the feature opt-in', () => {
        const markdown = String.raw`\[
x^2
\]
`;
        const [block] = parse(markdown, false);

        expect(block.name).not.toBe('math-block');
        expect(roundTrip(markdown, false)).toBe(markdown);
    });

    it('parses and preserves multiline display math', () => {
        const markdown = String.raw`\[
x^2 + y^2
\]
`;
        const [block] = parse(markdown);

        expect(block.name).toBe('math-block');
        if (block.name !== 'math-block')
            throw new Error('Expected a math block');
        expect(block.meta.mathStyle).toBe('latex');
        expect(block.text).toBe('x^2 + y^2');
        expect(roundTrip(markdown)).toBe(markdown);
    });

    it('parses and preserves same-line display math', () => {
        const markdown = String.raw`\[x^2 + y^2\]
`;
        const [block] = parse(markdown);

        expect(block.name).toBe('math-block');
        if (block.name !== 'math-block')
            throw new Error('Expected a math block');
        expect(block.meta.mathStyle).toBe('latex-inline');
        expect(block.text).toBe('x^2 + y^2');
        expect(roundTrip(markdown)).toBe(markdown);
    });

    it('preserves inline delimiters in paragraph markdown', () => {
        const markdown = String.raw`Energy is \(E=mc^2\).
`;
        expect(roundTrip(markdown)).toBe(markdown);
    });

    it('does not change traditional dollar-delimited math', () => {
        const markdown = '$$\nx^2\n$$\n';
        const [block] = parse(markdown);

        expect(block.name).toBe('math-block');
        if (block.name !== 'math-block')
            throw new Error('Expected a math block');
        expect(block.meta.mathStyle).toBe('');
        expect(roundTrip(markdown)).toBe(markdown);
    });

    it('uses multiline delimiters if a same-line block is edited onto multiple lines', () => {
        const [block] = parse(String.raw`\[x\]
`);

        expect(block.name).toBe('math-block');
        const mathBlock = block as IMathBlockState;
        mathBlock.text = 'x\ny';

        expect(
            new StateToMarkdown({ listIndentation: 1 }).generate([mathBlock]),
        ).toBe(String.raw`\[
x
y
\]
`);
    });
});
