import assert from 'node:assert/strict';

const queue = [];
export const results = {
  passed: 0,
  failed: 0,
  async flush() {
    for (const t of queue) {
      try {
        await t.fn();
        results.passed++;
        console.log(`  ok   ${t.name}`);
      } catch (err) {
        results.failed++;
        console.log(`  FAIL ${t.name}\n       ${err.message.split('\n').join('\n       ')}`);
      }
    }
    queue.length = 0;
  },
};

export function test(name, fn) {
  queue.push({ name, fn });
}

export { assert };
export const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
