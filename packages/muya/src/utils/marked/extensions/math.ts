import type { Token } from 'marked';
import katex from 'katex';
import 'katex/dist/contrib/mhchem.mjs';

export interface IMathToken {
    type: 'inlineMath' | 'multiplemath';
    raw: string;
    text: string;
    displayMode: boolean;
    marker?: string;
    mathStyle?: '' | 'gitlab' | 'latex' | 'latex-inline';
    delimiterStyle?: 'dollar' | 'latex';
}

interface IOptions {
    throwOnError?: boolean;
    useKatexRender?: boolean;
    latexMathDelimiters?: boolean;
}

// Kept in lockstep with the editor's `inline_math` rule
// (inlineRenderer/rules.ts) so that a document reads the same while editing and
// on export (#5446). Same shape, minus bare newlines: math never spans a line
// on this path. A `$` may open a span mid-word, as pandoc and the editor both
// allow, so the start hint carries no flanking requirement of its own.
const inlineStartRule = /\${1,2}(?!\$)/g;
const inlineRule
    = /^(?!\$(?!\$)(?:[^$\\\n]|\\.)*(?:\s\$|\$\d))(\$\$(?!\$)|\$(?=\S))((?:(?!\1)[^\\\n]|\\.)+)\1(?!\1)/;
const latexInlineRule = /^(\\\()((?:\\(?!\))|[^\\\n])+?)(\\\))/;
const blockRule = /^(\${1,2})\n((?:\\[\s\S]|[^\\])+?)\n\1[ \t]*(?:\n|$)/;
// Display math can be written either on one line (`\[x\]`) or with the
// delimiters on separate lines. Keep the two forms distinct in `mathStyle` so
// opening and saving an untouched document preserves the delimiter layout.
const latexBlockRule
    = /^\\\[(?:[ \t]*\n([\s\S]+?)\n[ \t]*|([^\n]+?))\\\][ \t]*(?:\n|$)/;

const DEFAULT_OPTIONS = {
    throwOnError: false,
    useKatexRender: false,
};

export default function (options: IOptions = {}) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options);

    return {
        extensions: [
            inlineKatex(createRenderer(opts, false), opts.latexMathDelimiters),
            blockKatex(createRenderer(opts, true), opts.latexMathDelimiters),
        ],
        walkTokens: markDisplayMath,
    };
}

function isDollarDollarMath(token: Token): token is Token & IMathToken {
    return token.type === 'inlineMath' && (token as Partial<IMathToken>).marker === '$$';
}

// Same rule as the editor: `$$...$$` is display math only in a paragraph that
// holds nothing but such formulas. A tight list item's paragraph comes as a
// block-level `text` token; inline `text` tokens carry no `tokens`.
function markDisplayMath(token: Token) {
    const children = token.type === 'paragraph' || token.type === 'text' ? token.tokens : undefined;
    if (!children)
        return;

    const onlyMath = children.some(isDollarDollarMath)
        && children.every(child =>
            isDollarDollarMath(child)
            || child.type === 'br'
            || (child.type === 'text' && child.raw.trim() === ''),
        );

    if (!onlyMath)
        return;

    for (const child of children) {
        if (isDollarDollarMath(child))
            child.displayMode = true;
    }
}

function createRenderer(options: IOptions, newlineAfter: boolean) {
    return (token: IMathToken) => {
        const { useKatexRender, throwOnError } = options;
        const { type, text, displayMode, marker = '$', mathStyle, delimiterStyle } = token;
        if (useKatexRender) {
            return (
                katex.renderToString(text, {
                    throwOnError,
                    displayMode,
                }) + (newlineAfter ? '\n' : '')
            );
        }
        else {
            if (type === 'inlineMath')
                return delimiterStyle === 'latex' ? `\\(${text}\\)` : `${marker}${text}${marker}`;

            return `<pre class="multiple-math" data-math-style="${mathStyle}">${text}</pre>\n`;
        }
    };
}

function inlineKatex(renderer: (token: IMathToken) => string, latexMathDelimiters = false) {
    return {
        name: 'inlineMath',
        level: 'inline' as const,
        // Every `$` is a candidate, not just the first one: marked stops the
        // surrounding text token here, so returning early on a `$` that turns
        // out not to open a formula would hide every later formula on the line
        // — "from $13B to $24B and $x+y$" must still find `$x+y$` (#5446).
        start(src: string) {
            let dollarIndex = -1;
            inlineStartRule.lastIndex = 0;
            for (
                let match = inlineStartRule.exec(src);
                match;
                match = inlineStartRule.exec(src)
            ) {
                if (inlineRule.test(src.substring(match.index))) {
                    dollarIndex = match.index;
                    break;
                }
            }

            let latexIndex = -1;
            if (latexMathDelimiters) {
                let searchFrom = 0;
                while ((latexIndex = src.indexOf('\\(', searchFrom)) >= 0) {
                    if (latexInlineRule.test(src.substring(latexIndex)))
                        break;
                    searchFrom = latexIndex + 2;
                }
            }

            const candidates = [dollarIndex, latexIndex].filter(index => index >= 0);
            return candidates.length ? Math.min(...candidates) : undefined;
        },
        tokenizer(src: string) {
            const match = src.match(inlineRule);
            if (match) {
                return {
                    type: 'inlineMath',
                    raw: match[0],
                    text: match[2].trim(),
                    marker: match[1],
                    displayMode: false,
                    delimiterStyle: 'dollar',
                };
            }

            if (latexMathDelimiters) {
                const latexMatch = src.match(latexInlineRule);
                if (latexMatch) {
                    return {
                        type: 'inlineMath',
                        raw: latexMatch[0],
                        text: latexMatch[2].trim(),
                        displayMode: false,
                        delimiterStyle: 'latex',
                    };
                }
            }
        },
        renderer,
    };
}

function blockKatex(renderer: (token: IMathToken) => string, latexMathDelimiters = false) {
    return {
        name: 'multiplemath',
        level: 'block' as const,
        start(src: string) {
            const indexes = [src.indexOf('\n$')];
            if (latexMathDelimiters)
                indexes.push(src.indexOf('\n\\['));

            const candidates = indexes.filter(index => index >= 0);
            return candidates.length ? Math.min(...candidates) : undefined;
        },
        tokenizer(src: string) {
            const match = src.match(blockRule);
            if (match) {
                return {
                    type: 'multiplemath',
                    raw: match[0],
                    text: match[2].trim(),
                    displayMode: match[1].length === 2,
                    mathStyle: '',
                };
            }

            if (latexMathDelimiters) {
                const latexMatch = src.match(latexBlockRule);
                if (latexMatch) {
                    const isMultiline = latexMatch[1] !== undefined;
                    return {
                        type: 'multiplemath',
                        raw: latexMatch[0],
                        text: (latexMatch[1] ?? latexMatch[2]).trim(),
                        displayMode: true,
                        mathStyle: isMultiline ? 'latex' : 'latex-inline',
                    };
                }
            }
        },
        renderer,
    };
}
