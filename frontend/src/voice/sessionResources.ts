/**
 * Owns every disposable resource of ONE voice session (timers + cleanup callbacks).
 * dispose() is idempotent, runs every cleanup even if one throws, and makes later
 * setTimeout() calls inert so stale callbacks can never re-arm anything.
 */
export class SessionResources {
  private disposed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private cleanups: Array<() => void> = [];

  get isDisposed(): boolean {
    return this.disposed;
  }

  get activeTimerCount(): number {
    return this.timers.size;
  }

  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> | null {
    if (this.disposed) return null;
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  clearTimer(id: ReturnType<typeof setTimeout> | null): void {
    if (id === null) return;
    clearTimeout(id);
    this.timers.delete(id);
  }

  /** Register a cleanup; if already disposed it runs immediately. */
  add(cleanup: () => void): void {
    if (this.disposed) {
      try {
        cleanup();
      } catch {
        /* ignore */
      }
      return;
    }
    this.cleanups.push(cleanup);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    const pending = this.cleanups.reverse();
    this.cleanups = [];
    for (const fn of pending) {
      try {
        fn();
      } catch {
        /* keep releasing the rest */
      }
    }
  }
}
