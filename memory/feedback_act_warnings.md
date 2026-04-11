---
name: Always fix act() warnings
description: act() warnings in tests are always our bug — never dismiss them as false positives
type: feedback
---

Always chase up `act()` warnings in tests. Never leave them or dismiss them as noise.

**Why:** They indicate a real bug — a React state update happening outside of an act() boundary, meaning the test isn't accurately reflecting how the UI behaves. In this project, the root cause is usually an async event (WebSocket open/close, status change) firing after an await returns. The fix is typically to make the async function resolve *after* the state update, not before.

**How to apply:** When an act() warning appears, identify which test triggers it, trace which state update is escaping the act boundary, and fix the underlying async flow rather than wrapping things in extra act() calls as a bandage.

**Known pattern — afterEach cleanup order:** If the warning fires on a test that modifies external state (e.g. a data source that notifies subscribers), the culprit is often the `afterEach` running cleanup (e.g. `disconnect()`) while the component is still mounted. `@testing-library/react`'s `cleanup()` (which unmounts) runs in its own `afterEach`, which may run *after* ours. Fix: explicitly call `cleanup()` from `@testing-library/react` at the *start* of your afterEach, before any side-effectful teardown.
