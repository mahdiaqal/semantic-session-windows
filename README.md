# SemanticSessionWindows

SemanticSessionWindows maintains event-time sessions from public prose notices.
The leader and validators independently fetch each commit-pinned notice,
verify the complete response SHA-256 and interpret its event against an immutable
feed policy. They compare the full notice and exact status/time result.
The model must distinguish a completed occurrence from a plan and extract when
the event occurred, including when publication or planned times differ.

Matching events at or after the feed watermark enter a buffer. Consecutive
events whose times differ by at most the configured gap form one session.
An out-of-order event can bridge two sessions. Queries expose the resulting
event membership and endpoints.

The creator advances a monotone watermark W, declaring that subsequent matching
events with times below W should be rejected as late. A session closes only
when its end plus the gap is strictly less than W. Equality leaves it open
because a point exactly at W can still extend it. Closed windows move into an
immutable, numbered archive. Accepted future events cannot reconnect them.

The contract owns the buffer, session merging, watermark enforcement and closed
archive. Publishers own the contents of notices. The feed creator chooses the
policy, sources and progress watermark. The contract checks the document's
claims and clock, and does not establish that physical events occurred.
The repository fixtures use a synthetic logical clock.

## API

- `create_feed(nonce, policy, gap)` creates a creator-bound feed with watermark 0.
- `ingest(feed, event_id, coordinate, sha256)` fetches and interprets one notice.
- `advance_watermark(feed, W)` closes eligible sessions and returns their count.
- `get_feed(feed)` returns the watermark, buffered points and current sessions.
- `get_event(feed, event_id)` returns the full acquired notice, decision and admission outcome.
- `get_closed(feed, index)` returns a closed window with its event membership.

Only the creator may ingest or advance the watermark. The policy and gap
remain fixed. Event IDs and content digests are unique per feed, including
OUTSIDE, UNKNOWN and LATE outcomes. Those outcomes change no buffered points.
Acquisition, hash or model-format failures revert and consume no event ID.
Malformed AI output or validator disagreement cannot install a window update.

Notices are commit-pinned GitHub .txt files containing at most 2048 UTF-8 bytes.
Each matching notice needs exactly one event and an explicit unsigned 32-bit
logical event time. Ambiguity yields UNKNOWN. The gap is 1–1000 time units.
The watermark is an unsigned 64-bit value, allowing the final 32-bit event
time to close after its gap. The buffer holds at most 16 events. Closing
windows frees capacity.

```sh
python -m pip install -r requirements-dev.txt
genvm-lint check contracts/SemanticSessionWindows.py
python -m pytest tests -q
```

[GenLayer equivalence principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle) ·
[Session windows and late data](https://nightlies.apache.org/flink/flink-docs-release-1.16/docs/dev/datastream/operators/windows/)

The first hosted proof run stopped after watermark 40 because the JavaScript
runner compared an SDK BigInt with a Number. Its six successful receipts and
initial feed are preserved in [INCOMPLETE_RUN.json](INCOMPLETE_RUN.json).
The corrected runner reuses that deployment and opens a fresh demonstration
feed with a temporary account.
