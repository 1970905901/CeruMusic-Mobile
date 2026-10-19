/**
 * Small runtime shims for iOS 14 WKWebView. Vite transpiles application code,
 * but plugin bundles and the host SDK may use newer built-ins directly.
 */
export function installLegacyPolyfills(): void {
  if (typeof (Object as any).hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value: (object: object, property: PropertyKey) =>
        Object.prototype.hasOwnProperty.call(object, property),
      writable: true,
      configurable: true
    })
  }

  if (typeof (Array.prototype as any).at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      value: function at(index: number) {
        const length = this.length
        let key = Math.trunc(index) || 0
        if (key < 0) key += length
        return key < 0 || key >= length ? undefined : this[key]
      },
      writable: true,
      configurable: true
    })
  }

  if (typeof (String.prototype as any).at !== 'function') {
    Object.defineProperty(String.prototype, 'at', {
      value: function at(index: number) {
        const text = String(this)
        const length = text.length
        let key = Math.trunc(index) || 0
        if (key < 0) key += length
        return key < 0 || key >= length ? undefined : text[key]
      },
      writable: true,
      configurable: true
    })
  }

  if (typeof (Array.prototype as any).findLast !== 'function') {
    Object.defineProperty(Array.prototype, 'findLast', {
      value: function findLast(predicate: (value: unknown, index: number, array: unknown[]) => boolean) {
        for (let index = this.length - 1; index >= 0; index--) {
          if (predicate(this[index], index, this)) return this[index]
        }
        return undefined
      },
      writable: true,
      configurable: true
    })
  }

  if (typeof (Array.prototype as any).findLastIndex !== 'function') {
    Object.defineProperty(Array.prototype, 'findLastIndex', {
      value: function findLastIndex(predicate: (value: unknown, index: number, array: unknown[]) => boolean) {
        for (let index = this.length - 1; index >= 0; index--) {
          if (predicate(this[index], index, this)) return index
        }
        return -1
      },
      writable: true,
      configurable: true
    })
  }

  if (typeof (globalThis as any).structuredClone !== 'function') {
    ;(globalThis as any).structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value))
  }

  if (typeof (AbortSignal.prototype as any).throwIfAborted !== 'function') {
    Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
      value: function throwIfAborted() {
        if (this.aborted) throw this.reason ?? new Error('Operation aborted')
      },
      writable: true,
      configurable: true
    })
  }
}
