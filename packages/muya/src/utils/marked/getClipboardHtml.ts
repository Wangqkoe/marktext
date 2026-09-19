import type { ILexOption } from './types';
import { Marked } from 'marked';
import { EXPORT_DOMPURIFY_CONFIG } from '../../config';
import { sanitize } from '../index';
import cjkEmStrongExtension from './extensions/cjkEmStrong';
import footnoteExtension from './extensions/footnote';
import mathExtension from './extensions/math';
import superSubScriptExtension from './extensions/superSubscript';
import fm, { frontMatterRender } from './frontMatter';
import { DEFAULT_OPTIONS } from './options';
import walkTokens from './walkTokens';

const FOOTNOTE_REF_MARKER_RE = /<span class="footnote-ref" data-identifier="([^"]*)"><\/span>/g;

function restoreFootnoteReferences(html: string): string {
    // Clipboard HTML keeps definition blocks in their existing inline shape;
    // only undo the export-only reference marker so copy-as-rich / HTML does
    // not silently drop the visible `[^id]` text. The captured identifier is
    // already attribute-escaped, so re-emitting it as text stays safe.
    return html.replace(FOOTNOTE_REF_MARKER_RE, (_, identifier: string) => `[^${identifier}]`);
}

export function getClipBoardHtml(src: string, options: ILexOption = {}) {
    options = Object.assign({}, DEFAULT_OPTIONS, options);
    const {
        footnote,
        frontMatter,
        texMathDollars,
        latexMathDelimiters,
        isGitlabCompatibilityEnabled,
        superSubScript,
    }
        = options;
    let html = '';

    // Use a fresh Marked instance per call to avoid polluting the global
    // `marked` singleton — `.use({ walkTokens })` chains rather than replaces,
    // and the global is shared with anything else in the bundle that imports
    // `marked`.
    const marked = new Marked();

    marked.use({
        walkTokens: walkTokens({ texMathDollars, isGitlabCompatibilityEnabled }),
    });

    // CJK-as-punctuation emphasis flanking (marktext/marktext#4307); keeps the
    // clipboard HTML consistent with the static / export render path.
    marked.use(cjkEmStrongExtension());

    if (texMathDollars) {
        marked.use(
            mathExtension({
                throwOnError: false,
                useKatexRender: false,
                latexMathDelimiters,
            }),
        );
    }

    if (superSubScript)
        marked.use(superSubScriptExtension());

    if (footnote)
        marked.use(footnoteExtension());

    if (frontMatter) {
        const { token, src: newSrc } = fm(src);
        if (token) {
            html = frontMatterRender(token);
            src = newSrc;
        }
    }

    const rendered = marked.parse(src, { async: false });
    html += footnote ? restoreFootnoteReferences(rendered) : rendered;

    return html;
}

export function getSanitizeClipboardHtml(src: string, options: ILexOption = {}) {
    const html = getClipBoardHtml(src, options);

    return sanitize(html, EXPORT_DOMPURIFY_CONFIG, false) as string;
}
