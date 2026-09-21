import type { Token } from 'marked';
import type { IFrontmatterToken, ILexOption, TLexedToken } from './types';
import { Marked } from 'marked';
import compatibleTaskList from './compatibleTaskList';
import footnoteExtension from './extensions/footnote';
import mathExtension, { doubleBackslashMathExtension, gfmMathExtension, singleBackslashMathExtension } from './extensions/math';
import fm from './frontMatter';
import { DEFAULT_OPTIONS } from './options';
import walkTokens from './walkTokens';

function detailsTagBalance(raw: string): number {
    let balance = 0;
    for (let index = 0; index < raw.length; index++) {
        if (raw[index] !== '<')
            continue;

        let quote = '';
        let end = index + 1;
        for (; end < raw.length; end++) {
            const character = raw[end];
            if (quote) {
                if (character === quote)
                    quote = '';
            }
            else if (character === '"' || character === '\'') {
                quote = character;
            }
            else if (character === '>') {
                break;
            }
        }

        if (end === raw.length)
            break;
        const tag = raw.slice(index, end + 1);
        if (/^<details(?:\s|\/?>)/i.test(tag))
            balance++;
        else if (/^<\/details(?:\s|>)/i.test(tag))
            balance--;

        const rawTextElement = /^<(script|style|textarea)(?:\s|>)/i.exec(tag);
        if (rawTextElement) {
            const closingTag = new RegExp(`</${rawTextElement[1]}\\s*>`, 'gi');
            closingTag.lastIndex = end + 1;
            const closingMatch = closingTag.exec(raw);
            if (closingMatch)
                end = closingMatch.index + closingMatch[0].length - 1;
        }
        index = end;
    }
    return balance;
}

function coalesceDetailsBlocks(tokens: Token[]): Token[] {
    const result: Token[] = [];
    let candidate: Token[] | undefined;
    let balance = 0;

    for (const token of tokens) {
        if (candidate) {
            candidate.push(token);
            if (token.type === 'html')
                balance += detailsTagBalance(token.raw);

            if (balance === 0) {
                const raw = candidate.map(next => next.raw).join('');
                result.push({ ...candidate[0], raw, text: raw });
                candidate = undefined;
            }
        }
        else if (token.type === 'html' && /^<details(?:\s|\/?>)/i.test(token.raw)) {
            candidate = [token];
            balance = detailsTagBalance(token.raw);
            if (balance === 0) {
                result.push({ ...token, text: token.raw });
                candidate = undefined;
            }
        }
        else {
            result.push(token);
        }
    }

    if (candidate)
        result.push(...candidate);
    return result;
}

export function lexBlock(
    src: string,
    options: ILexOption = DEFAULT_OPTIONS,
): TLexedToken[] {
    options = Object.assign({}, DEFAULT_OPTIONS, options);
    const { texMathDollars, texMathGfm, texMathSingleBackslash, texMathDoubleBackslash, frontMatter, footnote } = options;
    let tokens: (Token | IFrontmatterToken)[] = [];

    // Use a per-call Marked instance so extensions don't bleed across calls.
    // marked.use() on the global singleton would make math / footnote sticky:
    // any consumer that once passed `texMathDollars: true` would get math parsing forever.
    const m = new Marked();

    if (texMathDollars) {
        m.use(
            mathExtension({
                throwOnError: false,
                useKatexRender: false,
            }),
        );
    }

    if (texMathGfm) {
        m.use(
            gfmMathExtension({
                throwOnError: false,
                useKatexRender: false,
            }),
        );
    }

    if (texMathSingleBackslash) {
        m.use(
            singleBackslashMathExtension({
                throwOnError: false,
                useKatexRender: false,
            }),
        );
    }

    if (texMathDoubleBackslash) {
        m.use(
            doubleBackslashMathExtension({
                throwOnError: false,
                useKatexRender: false,
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
