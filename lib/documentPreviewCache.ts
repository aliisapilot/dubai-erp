/** Short-lived, memory-only cache for previews. Cloud editor reads remain fresh. */
export function createDocumentPreviewCache<T>(ttlMs = 30_000, now = () => Date.now()) {
  const values = new Map<string, { value: T; expires: number }>();
  const pending = new Map<string, Promise<T>>();
  let generation = 0;
  return {
    peek(key: string): T | undefined {
      const entry = values.get(key);
      if (!entry || entry.expires <= now()) { values.delete(key); return undefined; }
      return structuredClone(entry.value);
    },
    clear() {
      generation++;
      values.clear();
      pending.clear();
    },
    async load(key: string, read: () => Promise<T>, fresh = false): Promise<T> {
      if (fresh) this.clear();
      const cached = this.peek(key);
      if (cached !== undefined) return cached;
      let request = pending.get(key);
      if (!request) {
        const started = generation;
        request = read().then(value => {
          if (started === generation) values.set(key, {value: structuredClone(value), expires: now() + ttlMs});
          return value;
        });
        pending.set(key, request);
        const current = request;
        void request.finally(() => { if (pending.get(key) === current) pending.delete(key); }).catch(() => {});
      }
      return structuredClone(await request);
    },
  };
}
