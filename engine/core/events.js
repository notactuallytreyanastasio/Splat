export class Events {
  constructor() { this.handlers = new Map(); }
  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, []);
    this.handlers.get(name).push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const list = this.handlers.get(name);
    if (list) list.splice(list.indexOf(fn) >>> 0, 1);
  }
  emit(name, payload) {
    const list = this.handlers.get(name);
    if (list) for (const fn of list.slice()) fn(payload);
    const any = this.handlers.get('*');
    if (any) for (const fn of any) fn(name, payload);
  }
}
