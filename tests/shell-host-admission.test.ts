import { describe, expect, it } from 'vitest';
// @ts-ignore Native Host ships dependency-free ESM.
import { createAdmissionGate } from '../packages/shell-host/native/batch-provider.mjs';

describe('Custom native execution admission controller', () => {
  it('caps active commands globally and dispatches waiting work in FIFO order', async () => {
    const gate = createAdmissionGate(1, 2);
    const order: number[] = [];
    let finishFirst!: () => void;
    const first = gate.run(async () => {
      order.push(1);
      await new Promise<void>(resolve => { finishFirst = resolve; });
    });
    const second = gate.run(async () => { order.push(2); });
    const third = gate.run(async () => { order.push(3); });
    expect(gate.stats()).toMatchObject({ active: 1, waiting: 2 });
    await expect(gate.run(async () => { order.push(4); })).rejects.toThrow('queue capacity');
    finishFirst();
    await Promise.all([first, second, third]);
    expect(order).toEqual([1, 2, 3]);
    expect(gate.stats()).toMatchObject({ active: 0, waiting: 0 });
  });

  it('removes cancelled queued commands without executing them', async () => {
    const gate = createAdmissionGate(1, 1);
    let done!: () => void;
    const first = gate.run(() => new Promise<void>(resolve => { done = resolve; }));
    const controller = new AbortController();
    let executed = false;
    const waiting = gate.run(async () => { executed = true; }, controller.signal);
    expect(gate.stats().waiting).toBe(1);
    controller.abort();
    await expect(waiting).rejects.toThrow('cancelled');
    expect(executed).toBe(false);
    done();
    await first;
    expect(gate.stats()).toMatchObject({ active: 0, waiting: 0 });
  });

  it('releases permits even when a command throws', async () => {
    const gate = createAdmissionGate(1, 0);
    await expect(gate.run(async () => { throw Error('native failure'); })).rejects.toThrow('native failure');
    expect(await gate.run(async () => 'recovered')).toBe('recovered');
    expect(gate.stats().active).toBe(0);
  });
});
