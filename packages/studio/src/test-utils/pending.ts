export function pendingPromise<T>(): Promise<T> {
  return new Promise<T>(() => {});
}
