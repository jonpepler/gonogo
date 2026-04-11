---
name: Testing philosophy
description: Prefer large integration tests with MSW over isolated unit tests with module mocks
type: feedback
---

Prefer tests that mock as little of the system as possible. Use Mock Service Worker (MSW) to intercept at the network boundary rather than mocking modules (e.g. avoid vi.mock('@gonogo/core') in component tests).

**Why:** Tests that mock modules lose coverage of the real integration between layers. A test that renders a real component with a real hook and real data source — only intercepting the HTTP/WebSocket at the network level — gives much higher confidence.

**How to apply:** For any test involving data source status or network calls, use MSW handlers instead of mocking the data source or hook. Simple registry/rendering tests (e.g. empty state) can use the real registry with disconnected fixture data sources — no MSW needed since no network calls are made.
