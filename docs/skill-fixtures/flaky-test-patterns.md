---
name: flaky-test-patterns
description: Flag tests that are flaky by construction — real timers, sleep-based waits, order-dependent state, or a live network dependency — so they get fixed before they start failing intermittently in CI.
type: custom
---

## Real timers

A test that waits on a real `setTimeout`/`setInterval`/`Date.now()` instead of
a fake/mocked clock is flaky under CI load: the wall-clock margin that passes
locally can miss under contention. Flag any test that does not use the test
runner's fake timers (e.g. vitest's `vi.useFakeTimers()`) when it depends on
elapsed time.

## `sleep`-based waits

A test that inserts a fixed `await sleep(N)` / `setTimeout` to "wait for" an
async operation to settle is a race, not a synchronization point — it passes
by luck once the operation happens to finish inside N ms. Flag it and require
waiting on the actual signal (the promise, an event, a polling helper with a
real timeout and assertion) instead of a fixed delay.

## Test-order dependence

A test that only passes when run after another specific test — because it
reads mutated module-level state, a shared fixture, or global mock state the
other test set up — is order-dependent. Flag any test whose assertions rely on
state left behind by a prior test rather than its own `beforeEach`/setup.

## Network dependency

A test that makes a real HTTP/DNS call to an external host (not localhost, not
an explicitly mocked transport) is flaky by construction — it fails on
network blips, rate limits, or when the external service changes response
shape. Flag it and require the network boundary to be mocked/stubbed instead.
