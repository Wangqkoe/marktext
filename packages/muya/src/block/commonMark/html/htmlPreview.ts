import type HTMLBlock from '.';
import type { Muya } from '../../../muya';
import type { IHtmlBlockState, TState } from '../../../state/types';
import { CLASS_NAMES, PREVIEW_DOMPURIFY_CONFIG } from '../../../config';
import { sanitize } from '../../../utils';
import { getImageSrc } from '../../../utils/image';
import logger from '../../../utils/logger';
import Parent from '../../base/parent';

const debug = logger('htmlPreview:');

// Elements whose rendered content comes from attributes (e.g. `src`) rather
// than child nodes, so an empty tag body must not be treated as an empty block.
const SELF_CONTAINED_MEDIA = new Set(['video', 'audio']);
const DETAILS_SOURCE_ACTION = 'mu-details-source-action';
const DETAILS_PREVIEW_BODY = 'mu-details-preview-body';

// A single element with an empty body (`<div></div>`), except self-contained
// media elements whose content lives in attributes (`<video src=...></video>`).
export function isEmptyHtmlBlock(html: string): boolean {
    // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation
    const match = html.trim().match(/^<([a-z][a-z\d]*)[^>]*>\s*<\/\1>$/);
    return !!match && !SELF_CONTAINED_MEDIA.has(match[1]);
}

class HTMLPreview extends Parent {
    private _html: string;

    static override blockName = 'html-preview';

    static create(muya: Muya, state: IHtmlBlockState) {
        const htmlBlock = new HTMLPreview(muya, state);

        return htmlBlock;
    }

    override get path() {
        debug.warn('You can never call `get path` in htmlPreview');
        return [];
    }

    constructor(muya: Muya, { text }: IHtmlBlockState) {
        super(muya);
        this.tagName = 'div';
        this._html = text;
        this.classList = [CLASS_NAMES.MU_HTML_PREVIEW];
        this.attributes = {
            spellcheck: 'false',
            contenteditable: 'false',
        };
        this.createDomNode();
        this._attachDOMEvents();
        this.update();
    }

    private _attachDOMEvents() {
        this.muya.eventCenter.attachDOMEvent(this.domNode!, 'click', (event) => {
            const target = event.target;
            if (!(target instanceof Element) || !target.closest(`.${DETAILS_SOURCE_ACTION}`))
                return;

            event.preventDefault();
            event.stopPropagation();
            (this.parent as HTMLBlock | null)?.enterSourceEditing();
        });

        // Keep native summary keyboard activation out of Muya's source-editor
        // key routing. Do not prevent default: Chromium still owns the actual
        // Enter/Space disclosure toggle and focus semantics.
        this.muya.eventCenter.attachDOMEvent(this.domNode!, 'keydown', (event) => {
            const target = event.target;
            if (
                event instanceof KeyboardEvent
                && (event.key === 'Enter' || event.key === ' ')
                && target instanceof Element
                && target.closest('summary')
            ) {
                event.stopPropagation();
            }
        });
    }

    update(html = this._html) {
        if (this._html !== html)
            this._html = html;

        const { disableHtml } = this.muya.options;
        const htmlContent = sanitize(html, PREVIEW_DOMPURIFY_CONFIG, disableHtml) as string;

        // handle empty html bock
        if (isEmptyHtmlBlock(htmlContent)) {
            this.domNode!.innerHTML
                = `<div class="${CLASS_NAMES.MU_EMPTY}">&lt;Empty HTML Block&gt;</div>`;
        }
        else {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            const imgs = doc.documentElement.querySelectorAll('img');

            // Keep source HTML untouched and give only visible direct text a
            // preview-only element boundary for closed disclosure styling.
            for (const details of doc.documentElement.querySelectorAll('details')) {
                for (const child of Array.from(details.childNodes)) {
                    if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim())
                        continue;

                    const bodyText = doc.createElement('span');
                    bodyText.className = DETAILS_PREVIEW_BODY;
                    details.replaceChild(bodyText, child);
                    bodyText.appendChild(child);
                }
            }

            for (const img of imgs) {
                const src = img.getAttribute('src')!;
                const imageSrc = getImageSrc(src);
                img.setAttribute('src', imageSrc.src);
            }

            this.domNode!.innerHTML
                = doc.documentElement!.querySelector('body')!.innerHTML;

            if (!disableHtml && this.domNode!.querySelector('details')) {
                const disclosureStyle = document.createElement('style');
                disclosureStyle.textContent
                    = `details:not([open]) > .${DETAILS_PREVIEW_BODY} { display: none; }`;
                this.domNode!.appendChild(disclosureStyle);
            }

            // This editor-only control is deliberately appended after the
            // sanitized document fragment, never inside a native summary. It
            // therefore cannot affect source serialization or exported HTML.
            if (!disableHtml && this.domNode!.querySelector('details')) {
                const sourceAction = document.createElement('button');
                sourceAction.type = 'button';
                sourceAction.className = DETAILS_SOURCE_ACTION;
                sourceAction.textContent = '</>';
                sourceAction.setAttribute('aria-label', 'Edit raw HTML');
                this.domNode!.appendChild(sourceAction);
            }
        }
    }

    override getState(): TState {
        debug.warn('You can never call `getState` in htmlPreview');
        return {} as TState;
    }
}

export default HTMLPreview;
