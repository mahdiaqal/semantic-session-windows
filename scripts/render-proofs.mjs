import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sha} from './check.mjs';

const repo = 'https://github.com/mahdiaqal/semantic-session-windows';
const explorer = 'https://explorer-studio.genlayer.com';
const proof = JSON.parse(fs.readFileSync('PROOFS.json', 'utf8'));
assert.equal(proof.verified, true);
assert.equal(proof.source.source_match, true);
assert.match(proof.address, /^0x[a-f0-9]{40}$/i);
assert.match(proof.source_commit, /^[a-f0-9]{40}$/);
assert.equal(proof.transactions.length, 9);
const source = fs.readFileSync('contracts/SemanticSessionWindows.py', 'utf8');
assert.equal(proof.source.sha256, sha(source.replace(/\r\n/g, '\n').trimEnd() + '\n'));
const snapshot = step => {
  const value = proof.snapshots.find(item => item.step === step)?.state;
  assert(value, `Missing snapshot ${step}`);
  return value;
};
assert.deepEqual(snapshot('last').sessions, [
  {start: 10, end: 10, events: ['first']}, {start: 30, end: 30, events: ['last']},
]);
const merged = {start: 10, end: 30, events: ['first', 'bridge', 'last']};
assert.deepEqual(snapshot('bridge').sessions, [merged]);
assert.deepEqual(snapshot('watermark-40').sessions, [merged]);
assert.equal(snapshot('watermark-40').closed_count, 0);
assert.deepEqual(proof.closed, {...merged, watermark: 41});
assert.equal(proof.final.closed_count, 1);
assert.deepEqual(proof.final.points, []);
assert.deepEqual(proof.final.sessions, []);
assert.equal(proof.final.watermark, 41);
for (const step of ['watermark-41', 'late']) {
  assert.deepEqual(snapshot(step), proof.final);
}
const expected = [
  ['first', 10, 'APPENDED'], ['last', 30, 'APPENDED'], ['bridge', 20, 'APPENDED'],
  ['late', 25, 'LATE'],
];
for (const [name, time, status] of expected) {
  const event = proof.events[name];
  assert.equal(event.status, status);
  assert.equal(event.evidence.decision.time, time);
  assert.equal(event.evidence.decision.status, 'MATCH');
  assert.equal(event.evidence.sha256, sha(fs.readFileSync(`fixtures/${name}.txt`)));
  assert.equal(event.evidence.notice, fs.readFileSync(`fixtures/${name}.txt`, 'utf8'));
}
let errors = 0;
const rows = proof.transactions.map(tx => {
  const {receipt} = tx;
  assert.match(tx.hash, /^0x[a-f0-9]{64}$/i);
  assert.equal(receipt.status, 'FINALIZED');
  assert.equal(receipt.execution, tx.error ? 'ERROR' : 'SUCCESS');
  assert.equal(receipt.committed, !tx.error);
  assert.equal(receipt.consensus, tx.consensus ?? 'MAJORITY_AGREE');
  assert.equal(receipt.leader_only, false);
  if (tx.consensus === 'MAJORITY_DISAGREE') {
    assert(receipt.disagree_votes >= 2);
  } else {
    assert(receipt.agree_votes >= 2);
  }
  if (tx.error) {
    errors++;
    assert.equal(receipt.expected_error_matched, true);
  }
  return `| [${tx.step}](${explorer}/tx/${tx.hash}) | ${receipt.execution} | ${receipt.agree_votes}/${receipt.disagree_votes} |`;
});
assert.equal(errors, 1);
assert.equal(proof.planned_outcome, 'EVALUATION_REJECTED');
assert.equal(proof.planned_no_record, true);
assert.equal(proof.transactions.at(-1).step, 'planned');
const deployment = `[StudioNet deployment](${explorer}/address/${proof.address})`;
const pinnedSource = `[Deployed source](${repo}/blob/${proof.source_commit}/contracts/SemanticSessionWindows.py)`;
const fixtures = `[Pinned synthetic notices](${repo}/tree/${proof.source_commit}/fixtures)`;
fs.writeFileSync('LIVE_PROOFS.md', [
  '# StudioNet proofs', '',
  `${deployment} · ${pinnedSource} · ${fixtures} · [Receipt and state data](PROOFS.json)`, '',
  'Nine receipts finalized. Eight operations executed successfully with majority agreement. The planned-notice evaluation returned an acquisition/interpretation error and majority disagreement. Its original expected outcome was OUTSIDE. The journal retains the actual outcome as EVALUATION_REJECTED.',
  `The deployed source matches the pinned commit. Normalized source SHA-256 is \`${proof.source.sha256}\`.`, '',
  'Four fixture notices describe completed inspections at times 10, 30, 20 and 25, alongside differing planned and publication times. The fifth notice describes a plan. Its evaluation failed and created no event record.', '',
  '| Stage | Verified result |', '| --- | --- |',
  '| Admit 10, then 30 | Two sessions |',
  '| Admit 20 out of order | One session spanning 10–30 with all three event IDs |',
  '| Advance watermark to 40 | The session remains open at the exact gap boundary |',
  '| Advance watermark to 41 | One archived session, empty open buffer |',
  '| Admit completed event at 25 | LATE record, archived session unchanged |',
  '| Evaluate planned inspection | Evaluation rejected. No event record or archive change. |', '',
  'Temporary StudioNet accounts were generated in memory by a GitHub-hosted runner. The creator supplied the policy and watermark. The synthetic notices and logical clock demonstrate document interpretation and window bookkeeping.', '',
  'An initial run stopped after six successful transactions on a JavaScript BigInt/Number assertion. Its [complete journal](INCOMPLETE_RUN.json) is retained. The corrected runner reused the deployed contract and opened a fresh feed. The session closure and late-data checks completed before the planned-notice failure. Read-only verification confirmed the final archive and all recorded events.', '',
  'Deduplication, authorization and watermark rewind are covered by direct tests. The hosted run stopped before those additional live checks.', '',
  '| Transaction | Execution | Agree/Disagree votes |', '| --- | --- | ---: |', ...rows, '',
].join('\n'));

fs.writeFileSync('SUBMISSION.md', [
  '**Contribution type** Builder → Intelligent Contracts', '',
  '**Title** SemanticSessionWindows — AI-Interpreted Event-Time Sessions', '',
  '**Notes / Description**', '',
  'SemanticSessionWindows maintains sessions from event notices arriving out of order. The leader and validators independently fetch each committed notice and interpret whether it reports a completed event matching a fixed policy. They compare the full evidence and exact occurrence/time result. AI must distinguish event time from planned and publication times. That result controls session admission, merging and late-data handling.',
  '',
  'An out-of-order event can bridge two open sessions. A monotone watermark seals a session only when its end plus the configured gap lies strictly below the watermark. Closed windows are archived with their event IDs. Later arrivals below the watermark receive a LATE record and leave the archive unchanged.',
  '',
  'Eight successful StudioNet receipts cover deployment, feed creation, out-of-order bridging, the exact closure boundary and late-event handling. A ninth transaction failed while evaluating a planned notice. That failure is retained, and read-only checks confirmed no event record or archive change. Sixteen direct tests passed.',
  '',
  'The demonstration uses synthetic notices and a logical clock. Publishers supply document claims, and the creator controls feed curation and watermark progress. An initial proof run stopped on a JavaScript integer comparison. Its receipts are retained, and the corrected workflow reused the same deployment with a fresh feed.', '',
  '**Evidence**', '',
  `- [Repository](${repo})`, `- ${pinnedSource}`, `- ${deployment}`,
  `- [Receipts, verified window proof and evaluation failure](${repo}/blob/main/LIVE_PROOFS.md)`, '',
].join('\n'));
