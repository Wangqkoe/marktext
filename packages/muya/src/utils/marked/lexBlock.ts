import type { Token } from 'marked';
import type { IFrontmatterToken, ILexOption, TLexedToken } from './types';
import { Marked } from 'marked';
import compatibleTaskList from './compatibleTaskList';
import footnoteExtension from './extensions/footnote';
import mathExtension from './extensions/math';
import fm from './frontMatter';
import { DEFAULT_OPTIONS } from './options';
import walkTokens from './walkTokens';

function detailsTagBalance(raw: string): number {
    let balance = 0;
    for (const tag of raw.matchAll(/<\/?details\b[^>]*>/gi))
        balance += tag[0].startsWith('</') ? -1 : 1;
    return balance;
}

function coalesceDetailsBlocks(tokens: Token[]): Token[] {
    const result: Token[] = [];

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.type !== 'html' || !/^<details\b[^>]*>/i.test(token.raw)) {
            result.push(token);
            continue;
        }

        let balance = detailsTagBalance(token.raw);
        let end = index;
        while (balance > 0 && ++end < tokens.length) {
            const next = tokens[end];
            if (next.type === 'html')
                balance += detailsTagBalance(next.raw);
        }

        if (balance !== 0) {
            result.push(token);
            continue;
        }

        const raw = tokens.slice(index, end + 1).map(next => next.raw).join('');
        result.push({ ...token, raw, text: raw });
        index = end;
    }

    return result;
}

export function lexBlock(
    src: string,
    options: ILexOption = DEFAULT_OPTIONS,
): TLexedToken[] {
    options = Object.assign({}, DEFAULT_OPTIONS, options);
    const { math, latexMathDelimiters, frontMatter, footnote } = options;
    let tokens: (Token | IFrontmatterToken)[] = [];

    // Use a per-call Marked instance so extensions don't bleed across calls.
    // marked.use() on the global singleton would make math / footnote sticky:
    // any consumer that once passed `math: true` would get math parsing forever.
    const m = new Marked();

    if (math) {
        m.use(
            mathExtension({
                throwOnError: false,
                useKatexRender: false,
                latexMathDelimiters,
            }),
        );
    }

    if (footnote) {
        m.use(footnoteExtension());
    }

    if (frontMatter) {
        const { token, src: newSrc } = fm(src);
        if (token) {
            tokens.push(token);
            src = newSrc;
        }
    }

    // Pass `m.defaults` to the Lexer so the extensions registered via m.use()
    // are picked up; the no-arg constructor would fall back to global defaults.
    tokens.push(...coalesceDetailsBlocks(new m.Lexer(m.defaults).blockTokens(src)));
    tokens = compatibleTaskList(tokens as Token[]);
    m.walkTokens(tokens as Token[], walkTokens(options));

    // After walkTokens / compatibleTaskList run, marked's Heading/List/ListItem
    // tokens have been augmented with muya-specific fields (headingStyle,
    // marker, listType, listItemType, bulletMarkerOrDelimiter). The wider
    // TLexedToken union captures that runtime shape.
    return tokens as TLexedToken[];
}
