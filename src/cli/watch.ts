/**
 * The polling loop behind `activity --watch`, kept separate so it can be tested
 * without a terminal or a signal. `frame` owns its own error handling — one
 * failed tick must not stop the watch.
 */
export function watch(
  intervalMs: number,
  frame: () => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = (): void => {
      if (timer) clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", stop, { once: true });

    const loop = (): void => {
      timer = setTimeout(() => {
        void frame()
          // The caller reports its own failures; one bad tick must not end the
          // watch, and an unhandled rejection would take the process down.
          .catch(() => undefined)
          .finally(() => {
            if (!signal.aborted) loop();
          });
      }, intervalMs);
    };
    loop();
  });
}
