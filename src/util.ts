export class CachedProperty<T> {
  constructor(public getter: () => T) {}
  cached: { has: false } | { has: true, data: T } = { has: false };
  public get() {
    if(!this.cached.has) {
      this.cached = { has: true, data: this.getter() };
    }
    return this.cached.data;
  }
}
