/**
 * A very small DOM, enough to run charts.js under `node --test`.
 *
 * charts.js touches a deliberately narrow slice of the platform -- measured
 * before this was written: createElement, createElementNS, appendChild,
 * setAttribute, textContent, className/classList, style, addEventListener,
 * hidden, remove, getBoundingClientRect, one class selector, plus
 * ResizeObserver and requestAnimationFrame. All of it is implemented here and
 * nothing else is, so a test that needs more will fail loudly rather than pass
 * against a stub that quietly invents behaviour.
 *
 * This exists so the rendering layer can be tested with no browser, no server
 * and no dependency to install. It is not a browser: layout, CSS and hit
 * testing do not happen here, which is why the assertions in charts.test.js
 * are about structure and numbers rather than about pixels.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

class ClassList {
    constructor(node) {
        this.node = node;
    }

    get set() {
        return new Set(String(this.node.className || '').split(/\s+/).filter(Boolean));
    }

    write(set) {
        this.node.className = [...set].join(' ');
    }

    add(name) {
        const set = this.set;
        set.add(name);
        this.write(set);
    }

    remove(name) {
        const set = this.set;
        set.delete(name);
        this.write(set);
    }

    contains(name) {
        return this.set.has(name);
    }

    toggle(name, force) {
        const on = force === undefined ? !this.contains(name) : Boolean(force);
        if (on) this.add(name);
        else this.remove(name);
        return on;
    }
}

/** Just enough of CSSStyleDeclaration: charts.js sets custom properties on it. */
function makeStyle() {
    const values = new Map();
    const style = {
        setProperty(name, value) {
            values.set(name, String(value));
        },
        getPropertyValue(name) {
            return values.has(name) ? values.get(name) : '';
        },
        removeProperty(name) {
            const previous = style.getPropertyValue(name);
            values.delete(name);
            return previous;
        },
    };
    return style;
}

class FakeNode {
    constructor(tagName, namespace = null) {
        this.tagName = String(tagName).toLowerCase();
        this.namespaceURI = namespace;
        this.children = [];
        this.attributes = new Map();
        this.listeners = new Map();
        this.parentNode = null;
        this.className = '';
        this.style = makeStyle();
        this.hidden = false;
        this._text = '';
        this.classList = new ClassList(this);
        // Charts read a measured width; tests set this where it matters.
        this.rect = { width: 640, height: 240, top: 0, left: 0, right: 640, bottom: 240 };
    }

    get childElementCount() {
        return this.children.length;
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentNode = null;
        return child;
    }

    remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
    }

    setAttribute(name, value) {
        if (name === 'class') this.className = String(value);
        else this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        if (name === 'class') return this.className || null;
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    hasAttribute(name) {
        return name === 'class' ? Boolean(this.className) : this.attributes.has(name);
    }

    addEventListener(type, handler) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(handler);
    }

    /** Test-only: run the handlers registered for an event. */
    fire(type, event = {}) {
        for (const handler of this.listeners.get(type) || []) handler(event);
    }

    getBoundingClientRect() {
        return this.rect;
    }

    set textContent(value) {
        this._text = value === undefined || value === null ? '' : String(value);
        for (const child of this.children) child.parentNode = null;
        this.children = [];
    }

    get textContent() {
        if (!this.children.length) return this._text;
        return this._text + this.children.map((child) => child.textContent).join('');
    }

    /** One simple selector: ".class" or "tag". */
    matchesSimple(selector) {
        const trimmed = selector.trim();
        if (trimmed.startsWith('.')) return this.classList.contains(trimmed.slice(1));
        return this.tagName === trimmed.toLowerCase();
    }

    /** A comma-separated list of simple selectors, as charts.js uses. */
    matches(selector) {
        return String(selector).split(',').some((part) => this.matchesSimple(part));
    }

    /**
     * Descendant selectors only: "a b c" means c inside b inside a, and a
     * comma separates alternatives. No combinators, no pseudo-classes -- if a
     * test needs those it should fail rather than be quietly mis-answered.
     */
    querySelectorAll(selector) {
        const found = [];
        for (const alternative of String(selector).split(',')) {
            const steps = alternative.trim().split(/\s+/).filter(Boolean);
            if (!steps.length) continue;
            let level = [this];
            for (const step of steps) {
                const next = [];
                for (const node of level) {
                    const walk = (parent) => {
                        for (const child of parent.children) {
                            if (child.matchesSimple(step)) next.push(child);
                            walk(child);
                        }
                    };
                    walk(node);
                }
                level = next;
            }
            for (const node of level) if (!found.includes(node)) found.push(node);
        }
        return found;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
}

/**
 * Install the fake DOM on globalThis.
 *
 * @param {{reducedMotion?: boolean, width?: number}} options
 * @returns {{mount: FakeNode, flushFrames: () => void, restore: () => void}}
 */
export function installFakeDom({ reducedMotion = false, width = 640 } = {}) {
    const previous = {
        document: globalThis.document,
        window: globalThis.window,
        ResizeObserver: globalThis.ResizeObserver,
        requestAnimationFrame: globalThis.requestAnimationFrame,
    };

    const frames = [];

    globalThis.document = {
        createElement: (tag) => new FakeNode(tag),
        createElementNS: (ns, tag) => new FakeNode(tag, ns),
    };
    globalThis.window = {
        matchMedia: (query) => ({
            matches: reducedMotion && String(query).includes('prefers-reduced-motion'),
        }),
    };
    // Charts observe their mount for resizes. Nothing resizes in a test, so the
    // observer records that it was asked and never fires.
    globalThis.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.observed = [];
        }

        observe(node) {
            this.observed.push(node);
        }

        disconnect() {
            this.observed = [];
        }
    };
    // Queued rather than immediate, so a test can assert both before and after.
    globalThis.requestAnimationFrame = (callback) => {
        frames.push(callback);
        return frames.length;
    };

    const mount = new FakeNode('div');
    mount.rect = { ...mount.rect, width };

    return {
        mount,
        flushFrames() {
            const queued = frames.splice(0, frames.length);
            for (const callback of queued) callback(0);
        },
        restore() {
            globalThis.document = previous.document;
            globalThis.window = previous.window;
            globalThis.ResizeObserver = previous.ResizeObserver;
            globalThis.requestAnimationFrame = previous.requestAnimationFrame;
        },
    };
}

export { FakeNode, SVG_NS };
