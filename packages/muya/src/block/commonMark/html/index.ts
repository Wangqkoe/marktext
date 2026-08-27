import type { Muya } from '../../../muya';
import type { IHtmlBlockState } from '../../../state/types';
import type { TBlockPath } from '../../types';
import type HTMLPreview from './htmlPreview';
import { CLASS_NAMES, EVENT_KEYS } from '../../../config';
import Parent from '../../base/parent';
import { ScrollPage } from '../../scrollPage';

class HTMLBlock extends Parent {
    private _escapeListenerId = '';

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
        htmlBlock._appendPreviewAction();

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
            const target = event.target;
            if (
                !(event instanceof KeyboardEvent)
                || event.key !== EVENT_KEYS.Escape
                || !(target instanceof Element)
                || !target.closest('.mu-html-container')
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            this._exitSourceEditing();
        });
    }

    private _appendPreviewAction() {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'mu-html-preview-action';
        action.textContent = 'Preview';
        action.setAttribute('aria-label', 'Preview raw HTML');
        this.domNode!.appendChild(action);

        this.muya.eventCenter.attachDOMEvent(action, 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._exitSourceEditing();
        });
        this.muya.eventCenter.attachDOMEvent(action, 'keydown', (event) => {
            if (!(event instanceof KeyboardEvent) || (event.key !== EVENT_KEYS.Enter && event.key !== ' '))
                return;

            event.preventDefault();
            event.stopPropagation();
            this._exitSourceEditing();
        });
    }

    enterSourceEditing() {
        this.domNode!.classList.remove('mu-html-preview-mode');
        const content = this.firstContentInDescendant();

        // Preview/Escape leaves the source content as the editor's cached
        // active block. Reset that ownership before restoring its cursor so
        // the focus route runs again and reapplies active state to this block.
        if (this.muya.editor.activeContentBlock === content)
            this.muya.editor.activeContentBlock = null;

        content?.setCursor(0, 0);

        if (this._escapeListenerId)
            this.muya.eventCenter.detachDOMEvent(this._escapeListenerId);

        this._escapeListenerId = this.muya.eventCenter.attachDOMEvent(
            this.muya.domNode,
            'keydown',
            (event) => {
                if (!(event instanceof KeyboardEvent) || event.key !== EVENT_KEYS.Escape || !this.active)
                    return;

                event.preventDefault();
                event.stopPropagation();
                this._exitSourceEditing();
            },
        );
    }

    private _exitSourceEditing() {
        // The source content may still own the browser focus. Move it back to
        // the editor root before clearing the block state. Clear its native
        // selection too: a forced rebuild (such as a theme change) restores
        // that range into the new tree and would otherwise reopen raw source.
        this.firstContentInDescendant()?.domNode?.blur();
        this.muya.editor.selection.clear();
        this.muya.domNode.focus();
        if (this._escapeListenerId) {
            this.muya.eventCenter.detachDOMEvent(this._escapeListenerId);
            this._escapeListenerId = '';
        }
        this.active = false;
        this.domNode!.classList.add('mu-html-preview-mode');
        // The source content is authoritative. Rebuilding drops native
        // disclosure click state while retaining an authored `open` attribute.
        const source = this.firstContentInDescendant()?.text ?? '';
        (this.attachments.head as HTMLPreview | null)?.update(source);
        // Content blur/focus routing is frame-deferred. Its pending source
        // focus notification must not re-enter raw editing after Preview/Escape.
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
