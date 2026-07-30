// Vitest setup file to resolve Node v25 global property collisions and JSDOM custom elements environment quirks

class MemoryStorage {
  constructor() {
    this._store = new Map();
  }

  get length() {
    return this._store.size;
  }

  getItem(key) {
    const val = this._store.get(String(key));
    return val === undefined ? null : val;
  }

  setItem(key, value) {
    this._store.set(String(key), String(value));
  }

  removeItem(key) {
    this._store.delete(String(key));
  }

  clear() {
    this._store.clear();
  }

  key(index) {
    const keys = Array.from(this._store.keys());
    return keys[index] !== undefined ? keys[index] : null;
  }
}

class CustomElementRegistryShim {
  constructor() {
    this._registry = new Map();
  }
  define(name, constructor, options) {
    this._registry.set(name, constructor);
  }
  get(name) {
    return this._registry.get(name);
  }
  whenDefined(name) {
    return Promise.resolve(this.get(name));
  }
  upgrade(element) {}
}

if (typeof window !== 'undefined') {
  // 1. Fix Node v25 experimental empty globalThis.localStorage property
  try {
    delete globalThis.localStorage;
  } catch (e) {
    void e;
  }

  let localStorageImpl = window.localStorage;
  if (!localStorageImpl || typeof localStorageImpl.getItem !== 'function') {
    localStorageImpl = new MemoryStorage();
  }

  try {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageImpl,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    window.localStorage = localStorageImpl;
  }

  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageImpl,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    globalThis.localStorage = localStorageImpl;
  }

  // 2. Replace Node v25 native customElements with CustomElementRegistryShim to avoid C++ NotSupportedError
  const customElementShim = new CustomElementRegistryShim();
  try {
    delete globalThis.customElements;
  } catch (e) {
    void e;
  }

  try {
    Object.defineProperty(window, 'customElements', {
      value: customElementShim,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    window.customElements = customElementShim;
  }

  try {
    Object.defineProperty(globalThis, 'customElements', {
      value: customElementShim,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    globalThis.customElements = customElementShim;
  }

  // 3. Patch HTML Element Constructors for JSDOM custom element instantiation
  const patchElementConstructor = (className, tagName) => {
    const Original = window[className];
    if (!Original) return;

    function CustomElementConstructor(...args) {
      if (new.target && new.target !== CustomElementConstructor && new.target !== Original) {
        const el = document.createElement(tagName);
        Object.setPrototypeOf(el, new.target.prototype);
        return el;
      }
      return Reflect.construct(Original, args, new.target || Original);
    }

    CustomElementConstructor.prototype = Original.prototype;
    Object.defineProperty(Original.prototype, 'constructor', {
      value: CustomElementConstructor,
      writable: true,
      configurable: true,
    });

    try {
      window[className] = CustomElementConstructor;
      globalThis[className] = CustomElementConstructor;
    } catch (e) {
      void e;
    }
  };

  patchElementConstructor('HTMLElement', 'div');
  patchElementConstructor('HTMLTableElement', 'table');
  patchElementConstructor('HTMLTableCellElement', 'td');

  // 4. Safe document.createElement wrapper that upgrades custom element prototypes ({ is: '...' })
  if (typeof document !== 'undefined' && document.createElement) {
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function (tagName, options) {
      const el = originalCreateElement(tagName);
      const isName = typeof options === 'string' ? options : (options && options.is);
      const targetName = isName || tagName;
      const Ctor = customElementShim.get(targetName);
      if (Ctor && !(el instanceof Ctor)) {
        Object.setPrototypeOf(el, Ctor.prototype);
      }
      return el;
    };
  }

  // 5. Ensure document.body has id="body" if present and innerText getter is available on HTMLElement
  if (typeof document !== 'undefined' && document.body && !document.body.id) {
    document.body.id = 'body';
  }

  if (typeof HTMLElement !== 'undefined' && !('innerText' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      get() {
        return this.textContent;
      },
      set(val) {
        this.textContent = val;
      },
      configurable: true,
    });
  }
}
