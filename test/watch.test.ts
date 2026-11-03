import { expect, test } from "bun:test";
import { watch } from "../src/cli/watch";

test("watch ticks until the signal aborts", async () => {
  const controller = new AbortController();
  let ticks = 0;
  await watch(
    5,
    async () => {
      ticks += 1;
      if (ticks === 3) controller.abort();
    },
    controller.signal,
  );
  expect(ticks).toBe(3);
});

test("an already-aborted signal never ticks", async () => {
  const controller = new AbortController();
  controller.abort();
  let ticks = 0;
  await watch(5, async () => void (ticks += 1), controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(ticks).toBe(0);
});

test("a failing tick does not stop the watch", async () => {
  const controller = new AbortController();
  let ticks = 0;
  await watch(
    5,
    async () => {
      ticks += 1;
      if (ticks === 4) controller.abort();
      throw new Error("boom");
    },
    controller.signal,
  );
  expect(ticks).toBe(4);
});
