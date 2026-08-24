import type { Muya } from '../../../muya';
import type { IHtmlBlockState } from '../../../state/types';
import type { TBlockPath } from '../../types';
import type HTMLPreview from './htmlPreview';
import { CLASS_NAMES, EVENT_KEYS } from '../../../config';
import Parent from '../../base/parent';
import { ScrollPage } from '../../scrollPage';

class HTMLBlock extends Parent {
    static override blockName = 'html-block';

    static create(muya: Muya, state: IHtmlBlockState) {
        const htmlBlock = new HTMLBlock(muya);

        const htmlPreview = ScrollPage.loadBlock('html-preview').create(
            muya,
            state,
        );
        const htmlContainer = ScrollPage.loadBlock('html-container').create(
            muya,
            state,
        );

        htmlBlock.appendAttachment(htmlPreview);
        htmlBlock.append(htmlContainer);

        return htmlBlock;
    }

    override get path() {
        const { path: pPath } = this.parent!;
        const offset = this.parent!.offset(this);

        return [...pPath, offset];
    }

    constructor(muya: Muya) {
        super(muya);
        this.tagName = 'figure';
        this.classList = [CLASS_NAMES.MU_HTML_BLOCK];
        const { disableHtml } = muya.options;
        if (disableHtml)
            this.classList.push(CLASS_NAMES.MU_DISABLE_HTML_RENDER);

        this.createDomNode();
        this._attachDOMEvents();
    }

    private _attachDOMEvents() {
        // Bind to this block (rather than document) so a discarded/rebuilt
        // HTML block cannot retain a live Escape handler. Escape only exits
        // temporary source editing and rebuilds the preview from raw source.
        this.muya.eventCenter.attachDOMEvent(this.domNode!, 'keydown', (event) => {
            if (!(event instanceof KeyboardEvent) || event.key !== EVENT_KEYS.Escape || !this.active)
                return;

            event.preventDefault();
            event.stopPropagation();
            this.active = false;
            (this.attachments.head as HTMLPreview | null)?.update();
        });
    }

    queryBlock(path: TBlockPath) {
        return path.length && path[0] === 'text'
            ? this.firstContentInDescendant()
            : this;
    }

    override getState(): IHtmlBlockState {
        const state: IHtmlBlockState = {
            name: 'html-block',
            text: this.firstContentInDescendant()?.text ?? '',
        };

        return state;
    }
}

export default HTMLBlock;
