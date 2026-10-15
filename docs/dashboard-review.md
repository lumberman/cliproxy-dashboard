# Implementation review

## Coverage

An independent Claude NZ Team-seat review checked the OpenAI-authored request console and deployment scripts.
An independent GPT-6.1 Sol review checked the Claude-authored quota ledger.
The reviews checked actual v8 backend contracts and provider quota types.
The host applied and verified the fixes.

## Resolved findings

- The launcher now writes the usage flag under `observability.usage`.
- The request console allows 65 seconds for the backend's 60-second request limit.
- The launcher starts the server from its runtime directory, away from a repository `.env`.
- Notifications, reset confirmations, and provider errors honor the email privacy control.
- Antigravity limit labels retain their model group names.
- Codex additional limits use a semantic identity across accounts, independent of upstream list positions.
- Management login rejects an HTML fallback response.

## Remaining limits

Usage queue access removes server records. A network failure after removal can prevent the browser from receiving them.
The confirmation explains removal and page lifetime. Download retrieved records before you leave the page.
The UI does not call CLI-only device login, SIWC binding, or Home/storage administration flags.
Those options require new backend API contracts. Core v8 management functions remain available.
