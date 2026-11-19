# StudioNet proofs

[StudioNet deployment](https://explorer-studio.genlayer.com/address/0x06BE2d04F565A6517F1F3De709996f4aF47F6487) · [Deployed source](https://github.com/mahdiaqal/semantic-session-windows/blob/043796da1819974ddb4aa33988effcae85b36ebd/contracts/SemanticSessionWindows.py) · [Pinned synthetic notices](https://github.com/mahdiaqal/semantic-session-windows/tree/043796da1819974ddb4aa33988effcae85b36ebd/fixtures) · [Receipt and state data](PROOFS.json)

Nine receipts finalized. Eight operations executed successfully with majority agreement. The planned-notice evaluation returned an acquisition/interpretation error and majority disagreement. Its original expected outcome was OUTSIDE. The journal retains the actual outcome as EVALUATION_REJECTED.
The deployed source matches the pinned commit. Normalized source SHA-256 is `4d6b391677288d67cd6e4852875398b5350d88db48b883c4e8a4614bf3abcf88`.

Four fixture notices describe completed inspections at times 10, 30, 20 and 25, alongside differing planned and publication times. The fifth notice describes a plan. Its evaluation failed and created no event record.

| Stage | Verified result |
| --- | --- |
| Admit 10, then 30 | Two sessions |
| Admit 20 out of order | One session spanning 10–30 with all three event IDs |
| Advance watermark to 40 | The session remains open at the exact gap boundary |
| Advance watermark to 41 | One archived session, empty open buffer |
| Admit completed event at 25 | LATE record, archived session unchanged |
| Evaluate planned inspection | Evaluation rejected. No event record or archive change. |

Temporary StudioNet accounts were generated in memory by a GitHub-hosted runner. The creator supplied the policy and watermark. The synthetic notices and logical clock demonstrate document interpretation and window bookkeeping.

An initial run stopped after six successful transactions on a JavaScript BigInt/Number assertion. Its [complete journal](INCOMPLETE_RUN.json) is retained. The corrected runner reused the deployed contract and opened a fresh feed. The session closure and late-data checks completed before the planned-notice failure. Read-only verification confirmed the final archive and all recorded events.

Deduplication, authorization and watermark rewind are covered by direct tests. The hosted run stopped before those additional live checks.

| Transaction | Execution | Agree/Disagree votes |
| --- | --- | ---: |
| [deploy](https://explorer-studio.genlayer.com/tx/0x3063a33acb85d964454625f08e57f8884af8a362b7bd37af01dd751f2578fc84) | SUCCESS | 5/0 |
| [create-feed](https://explorer-studio.genlayer.com/tx/0xe35d1cb9bf5328ee1f1cb4b67037ebaef0630d4069ee2e9d7f13a86fb99bb30f) | SUCCESS | 3/0 |
| [first](https://explorer-studio.genlayer.com/tx/0xee337838ce8dba338cdeadb336e9f5f966b398d59b21c41052988c518e6083a0) | SUCCESS | 3/0 |
| [last](https://explorer-studio.genlayer.com/tx/0xfe7d1e49ba04e63c587ed6b2b57722da25a9c69d8a5fafb24baf9c416b8c147c) | SUCCESS | 3/0 |
| [bridge](https://explorer-studio.genlayer.com/tx/0x3655942c999f88d2f57774c84fd55e5f76c1233d8e6a604bcb25ed44031719be) | SUCCESS | 3/0 |
| [watermark-40](https://explorer-studio.genlayer.com/tx/0x05480e4a1d2d0440d4cc67b7de64579e0de4fe168731f9895baf35d948f99731) | SUCCESS | 3/0 |
| [watermark-41](https://explorer-studio.genlayer.com/tx/0xe6ccb450ad6dd2d93db811bf838d736c7c26456561f657299f796b0fd98828e5) | SUCCESS | 3/0 |
| [late](https://explorer-studio.genlayer.com/tx/0xa6f784017426c8807cd7dcfc60393f7edc671b303cc13b151b14abc736cc5c34) | SUCCESS | 3/0 |
| [planned](https://explorer-studio.genlayer.com/tx/0x0fba3beba53fd9a7ab223ef8dd2f95feee7cec3ad093aca4ea6fef97f507854e) | ERROR | 0/3 |
