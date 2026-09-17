import type { IEvent, IListeners, Listener } from './types';

// TODO: @Jocs use the same name function in utils.
function* uniqueIdGenerator() {
    let id = 0;

    while (true)
        yield id++;
}
const PREFIX = 'event-';
const idIterator = uniqueIdGenerator();

class EventCenter {
    public listeners: IListeners = {};

    // Registrations by id (insertion-ordered) and by target. A rebuilt
    // document registers thousands of block listeners, so both the duplicate
    // check and detaching must not scan every registration.
    private _events = new Map<string, IEvent>();
    private _eventsByTarget = new WeakMap<EventTarget, IEvent[]>();

    get events(): IEvent[] {
        return [...this._events.values()];
    }

    private get _eventId() {
        return `${PREFIX}${idIterator.next().value}`;
    }

    /**
     * [attachDOMEvent] bind event listener to target, and return a unique ID,
     * this ID
     */
    attachDOMEvent(
        target: HTMLElement | Document,
        event: string,
        listener: EventListener,
        capture?: boolean | AddEventListenerOptions,
    ): string {
        if (this._checkHasBind(target, event, listener, capture))
            return '';

        const eventId = this._eventId;
        target.addEventListener(event, listener, capture);
        const registration = { eventId, target, event, listener, capture };
        this._events.set(eventId, registration);
        const sameTarget = this._eventsByTarget.get(target);
        if (sameTarget)
            sameTarget.push(registration);
        else
            this._eventsByTarget.set(target, [registration]);

        return eventId;
    }

    /**
     * [detachDOMEvent removeEventListener]
     * @param  {[type]} eventId [unique eventId]
     */
    detachDOMEvent(eventId: string) {
        if (!eventId)
            return false;

        const removeEvent = this._events.get(eventId);
        if (removeEvent)
            this._detach(removeEvent);
    }

    /**
     * Detach every listener bound to a strict descendant of `root`. Whole
     * document rebuilds drop block trees without calling `remove()` on nested
     * blocks, so their registrations are released here instead of leaking.
     */
    detachDOMEventsWithin(root: Node) {
        for (const registration of this._events.values()) {
            const { target } = registration;
            if (target !== root && root.contains(target))
                this._detach(registration);
        }
    }

    /**
     * [detachAllDomEvents remove all the DOM events handler]
     */
    detachAllDomEvents() {
        for (const removedEvent of this._events.values()) {
            const { target, event, listener, capture } = removedEvent;
            target.removeEventListener(event, listener, capture);
        }

        this._events.clear();
        this._eventsByTarget = new WeakMap();
    }

    private _detach(registration: IEvent) {
        const { eventId, target, event, listener, capture } = registration;
        target.removeEventListener(event, listener, capture);
        this._events.delete(eventId);
        const sameTarget = this._eventsByTarget.get(target);
        if (sameTarget) {
            const index = sameTarget.indexOf(registration);
            if (index !== -1)
                sameTarget.splice(index, 1);
            if (sameTarget.length === 0)
                this._eventsByTarget.delete(target);
        }
    }

    /**
     * inner method for on and once
     */
    subscribe(event: string, listener: Listener, once = false) {
        const listeners = this.listeners[event];
        const handler = { listener, once };
        if (listeners && Array.isArray(listeners))
            listeners.push(handler);
        else
            this.listeners[event] = [handler];
    }

    /**
     * [on] on custom event
     */
    on(event: string, listener: Listener) {
        this.subscribe(event, listener);
    }

    /**
     * [off] off custom event
     */
    off(event: string, listener: Listener) {
        const listeners = this.listeners[event];
        if (
            Array.isArray(listeners)
            && listeners.some(l => l.listener === listener)
        ) {
            const index = listeners.findIndex(l => l.listener === listener);
            listeners.splice(index, 1);
        }
    }

    /**
     * [once] subscribe event and listen once
     */
    once(event: string, listener: Listener) {
        this.subscribe(event, listener, true);
    }

    /**
     * emit custom event
     */
    emit(event: string, ...data: unknown[]) {
        const eventListener = this.listeners[event];

        if (eventListener && Array.isArray(eventListener)) {
            // Snapshot before iterating: a once-listener removes itself via
            // off() during emit, which mutates the same array and causes
            // forEach to skip the adjacent element. Iterate a copy instead.
            eventListener.slice().forEach(({ listener, once }) => {
                listener(...data);
                if (once)
                    this.off(event, listener);
            });
        }
    }

    /**
     * Remove all pub/sub subscriptions. Called from muya.destroy() to
     * release listener closures so the host page can GC the Muya instance.
     */
    unsubscribeAll() {
        this.listeners = {};
    }

    // Determine whether the event has been bind
    private _checkHasBind(
        cTarget: HTMLElement | Document,
        cEvent: string,
        cListener: EventListenerOrEventListenerObject,
        cCapture?: boolean | AddEventListenerOptions,
    ) {
        for (const { event, listener, capture } of this._eventsByTarget.get(cTarget) ?? []) {
            if (
                event === cEvent
                && listener === cListener
                && capture === cCapture
            ) {
                return true;
            }
        }

        return false;
    }
}

export default EventCenter;
