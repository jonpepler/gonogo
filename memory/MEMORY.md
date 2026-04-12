# Memory Index

- [Testing philosophy](feedback_testing.md) — Prefer MSW integration tests over module mocks; mock at the network boundary only
- [Always fix act() warnings](feedback_act_warnings.md) — act() warnings are always our bug; trace and fix the async flow, never dismiss
- [Use nvm without version](feedback_nvm_nvmrc.md) — Project has .nvmrc; always `nvm use` not `nvm use 24`
