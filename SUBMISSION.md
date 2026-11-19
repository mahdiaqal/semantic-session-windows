**Contribution type** Builder → Intelligent Contracts

**Title** SemanticSessionWindows — AI-Interpreted Event-Time Sessions

**Notes / Description**

SemanticSessionWindows maintains sessions from event notices arriving out of order. The leader and validators independently fetch each committed notice and interpret whether it reports a completed event matching a fixed policy. They compare the full evidence and exact occurrence/time result. AI must distinguish event time from planned and publication times. That result controls session admission, merging and late-data handling.

An out-of-order event can bridge two open sessions. A monotone watermark seals a session only when its end plus the configured gap lies strictly below the watermark. Closed windows are archived with their event IDs. Later arrivals below the watermark receive a LATE record and leave the archive unchanged.

Eight successful StudioNet receipts cover deployment, feed creation, out-of-order bridging, the exact closure boundary and late-event handling. A ninth transaction failed while evaluating a planned notice. That failure is retained, and read-only checks confirmed no event record or archive change. Sixteen direct tests passed.

The demonstration uses synthetic notices and a logical clock. Publishers supply document claims, and the creator controls feed curation and watermark progress. An initial proof run stopped on a JavaScript integer comparison. Its receipts are retained, and the corrected workflow reused the same deployment with a fresh feed.

**Evidence**

- [Repository](https://github.com/mahdiaqal/semantic-session-windows)
- [Deployed source](https://github.com/mahdiaqal/semantic-session-windows/blob/043796da1819974ddb4aa33988effcae85b36ebd/contracts/SemanticSessionWindows.py)
- [StudioNet deployment](https://explorer-studio.genlayer.com/address/0x06BE2d04F565A6517F1F3De709996f4aF47F6487)
- [Receipts, verified window proof and evaluation failure](https://github.com/mahdiaqal/semantic-session-windows/blob/main/LIVE_PROOFS.md)
