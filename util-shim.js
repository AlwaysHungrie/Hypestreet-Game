/**
 * Minimal Node.js "util" shim for browser bundles.
 * Dependencies (e.g. parse5, stream libs) expect util.inherits.
 */
export function inherits(ctor, superCtor) {
  if (superCtor == null) return;
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });
  if (typeof Object.defineProperty === "function") {
    Object.defineProperty(ctor, "super", {
      get() {
        return superCtor;
      },
    });
  }
}

export default { inherits };
