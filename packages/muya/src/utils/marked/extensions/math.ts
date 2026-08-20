import katex from 'katex';
import 'katex/dist/contrib/mhchem.mjs';

export interface IMathToken {
    type: 'inlineMath' | 'multiplemath';
    raw: string;
    text: string;
    displayMode: boolean;
    mathStyle?: '' | 'gitlab' | 'latex' | 'latex-inline';
    delimiterStyle?: 'dollar' | 'latex';
}

interface IOptions {
    throwOnError?: boolean;
    useKatexRender?: boolean;
    latexMathDelimiters?: boolean;
}

const inlineStartRule = /(\s|^)\${1,2}(?!\$)/;
const inlineRule
    = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1(?=[\s?!.,:]|$)/;
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
    };
}

function createRenderer(options: IOptions, newlineAfter: boolean) {
    return (token: IMathToken) => {
        const { useKatexRender, throwOnError } = options;
        const { type, text, displayMode, mathStyle, delimiterStyle } = token;
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
                return delimiterStyle === 'latex' ? `\\(${text}\\)` : `$${text}$`;

            return `<pre class="multiple-math" data-math-style="${mathStyle}">${text}</pre>\n`;
        }
    };
}

function inlineKatex(renderer: (token: IMathToken) => string, latexMathDelimiters = false) {
    return {
        name: 'inlineMath',
        level: 'inline' as const,
        start(src: string) {
            const match = src.match(inlineStartRule);
            let dollarIndex = -1;
            if (match) {
                const index = (match.index || 0) + match[1].length;
                if (inlineRule.test(src.substring(index)))
                    dollarIndex = index;
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
                    displayMode: match[1].length === 2,
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
