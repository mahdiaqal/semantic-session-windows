import assert from 'node:assert/strict';
import fs from 'node:fs';
import {abi, createAccount, createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {digest, sha, jsonSafe, rpc, receipt, source, read} from './check.mjs';

const journal = 'PROOFS.json';
const code = 'contracts/SemanticSessionWindows.py';
const verifyOnly = process.argv.includes('--verify-only');
const proof = fs.existsSync(journal)
  ? JSON.parse(fs.readFileSync(journal, 'utf8'))
  : {network: 'StudioNet', source_commit: process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? null,
    transactions: [], snapshots: [], events: {}};
const save = () => fs.writeFileSync(journal, JSON.stringify(proof, null, 2) + '\n');
assert.match(proof.source_commit ?? '', /^[a-f0-9]{40}$/);
assert.equal(await rpc('eth_chainId', []), '0xf22f');
assert.equal(studionet.id, 61999);

// Persist acknowledged sends before an SDK error or process interruption.
const originalFetch = globalThis.fetch;
const sent = new Map();
let currentEntry;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  const request = JSON.parse(options?.body ?? '{}');
  if (url !== 'https://studio.genlayer.com/api' || request.method !== 'eth_sendRawTransaction') {
    return originalFetch(input, options);
  }
  assert(currentEntry && !currentEntry.hash, 'Inspect the journal before another send');
  const payload = request.params[0];
  assert.match(payload, /^0x[a-f0-9]+$/i);
  if (!sent.has(payload)) {
    sent.set(payload, (async () => {
      const response = await originalFetch(input, options);
      const body = await response.text();
      const data = JSON.parse(body);
      if (data.result) {
        assert.match(data.result, /^0x[a-f0-9]{64}$/i);
        currentEntry.hash = data.result;
        save();
        console.log(currentEntry.step, data.result);
      }
      return {body, status: response.status};
    })());
  }
  const response = await sent.get(payload);
  return new Response(response.body, {status: response.status, headers: {'content-type': 'application/json'}});
};

async function transaction(step, account, functionName, args, error) {
  let entry = proof.transactions.find(tx => tx.step === step);
  if (!entry) {
    assert(!verifyOnly && account, 'Missing broadcast journal');
    const nonce = await rpc('eth_getTransactionCount', [account.address, 'latest']);
    assert.equal(await rpc('eth_getTransactionCount', [account.address, 'pending']), nonce);
    entry = {step, signer: account.address, nonce, functionName, args, ...(error ? {error} : {})};
    proof.transactions.push(entry);
    save();
    currentEntry = entry;
    const client = createClient({chain: studionet, account});
    const hash = functionName === 'deploy'
      ? await client.deployContract({code: fs.readFileSync(code), args: [], leaderOnly: false})
      : await client.writeContract({
        address: proof.address, functionName, args, value: 0n, leaderOnly: false,
      });
    assert.equal(hash, entry.hash);
    currentEntry = undefined;
  }
  assert.deepEqual(entry.args, args);
  assert.equal(entry.functionName, functionName);
  assert.equal(entry.error, error);
  assert(entry.hash, 'Broadcast status unknown. Inspect the recorded nonce before resuming.');
  entry.receipt = await receipt(entry.hash, error ? 'ERROR' : 'SUCCESS', error);
  save();
  assert.equal(entry.receipt.committed, !error);
  const native = await rpc('eth_getTransactionByHash', [entry.hash]);
  assert.equal(native.from_address.toLowerCase(), entry.signer.toLowerCase());
  assert.equal(BigInt(native.nonce), BigInt(entry.nonce));
  assert.equal(BigInt(native.value), 0n);
  console.log(step, entry.receipt.status, entry.receipt.execution);
  if (error) return;
  if (functionName === 'deploy') return {address: entry.receipt.address};
  const leader = native.consensus_data.leader_receipt.find(item => item.mode === 'leader');
  const bytes = Buffer.from(leader.result, 'base64');
  assert.equal(bytes[0], 0);
  return {address: entry.receipt.address, result: jsonSafe(abi.calldata.decode(bytes.subarray(1)))};
}

const policy = 'Completed equipment inspections. Exclude plans and cancelled inspections.';
const gap = 10;
const closed = {start: 10, end: 30, events: ['first', 'bridge', 'last'], watermark: 41};
async function snapshot(step) {
  const state = await read(proof.address, 'get_feed', [proof.feed]);
  assert.equal(state.creator, proof.creator);
  assert.equal(state.policy, policy);
  assert.equal(state.gap, gap);
  proof.snapshots.push({step, state});
  save();
  return state;
}

function eventArguments(name) {
  const coordinate = `mahdiaqal/semantic-session-windows/${proof.source_commit}/fixtures/${name}.txt`;
  return [proof.feed, name, coordinate, sha(fs.readFileSync(`fixtures/${name}.txt`))];
}

async function ingest(account, name, time, status, watermark) {
  const args = eventArguments(name);
  const {result} = await transaction(name, account, 'ingest', args);
  const record = await read(proof.address, 'get_event', [proof.feed, name]);
  proof.events[name] = record;
  save();
  assert.equal(result, status);
  assert.deepEqual(record, {
    url: 'https://raw.githubusercontent.com/' + args[2], policy, watermark, status,
    evidence: {notice: fs.readFileSync(`fixtures/${name}.txt`, 'utf8'), sha256: args[3],
      decision: {status: status === 'OUTSIDE' ? 'OUTSIDE' : 'MATCH', time}},
  });
  return snapshot(name);
}

if (verifyOnly) {
  assert(proof.verified && proof.address && proof.feed);
  for (const tx of proof.transactions) {
    await transaction(tx.step, null, tx.functionName, tx.args, tx.error);
  }
  assert.deepEqual(await source(proof.address), proof.source);
  assert.deepEqual(await read(proof.address, 'get_feed', [proof.feed]), proof.final);
  assert.deepEqual(await read(proof.address, 'get_closed', [proof.feed, 0]), proof.closed);
  for (const [name, event] of Object.entries(proof.events)) {
    assert.deepEqual(await read(proof.address, 'get_event', [proof.feed, name]), event);
  }
  console.log('Verified all receipts, event records and closed window');
} else {
  assert(!proof.transactions.length, 'Use --verify-only for an existing journal. Never rerun for new AI answers.');
  const creator = createAccount();
  const peer = createAccount();
  proof.creator = creator.address;
  proof.peer = peer.address;
  save();
  const deployment = await transaction('deploy', creator, 'deploy', []);
  proof.address = deployment.address;
  proof.source = await source(proof.address);
  save();
  const opened = await transaction('create-feed', creator, 'create_feed', ['inspections', policy, gap]);
  proof.feed = opened.result;
  assert.equal(proof.feed, digest({contract: proof.address, creator: proof.creator, nonce: 'inspections'}));
  save();
  await ingest(creator, 'first', 10, 'APPENDED', 0);
  const separate = await ingest(creator, 'last', 30, 'APPENDED', 0);
  assert.deepEqual(separate.sessions, [
    {start: 10, end: 10, events: ['first']}, {start: 30, end: 30, events: ['last']},
  ]);
  const bridged = await ingest(creator, 'bridge', 20, 'APPENDED', 0);
  const {watermark: _, ...window} = closed;
  assert.deepEqual(bridged.sessions, [window]);
  assert.equal((await transaction('watermark-40', creator, 'advance_watermark', [proof.feed, 40])).result, 0);
  const equal = await snapshot('watermark-40');
  assert.deepEqual(equal.sessions, [window]);
  assert.equal(equal.closed_count, 0);
  assert.equal((await transaction('watermark-41', creator, 'advance_watermark', [proof.feed, 41])).result, 1);
  const sealed = await snapshot('watermark-41');
  assert.deepEqual(sealed.points, []);
  assert.equal(sealed.closed_count, 1);
  proof.closed = await read(proof.address, 'get_closed', [proof.feed, 0]);
  assert.deepEqual(proof.closed, closed);
  save();
  assert.deepEqual(await ingest(creator, 'late', 25, 'LATE', 41), sealed);
  assert.deepEqual(await ingest(creator, 'planned', null, 'OUTSIDE', 41), sealed);
  await transaction('duplicate-content-denied', creator, 'ingest',
    [proof.feed, 'alias', ...eventArguments('first').slice(2)], 'Event ID or content already processed');
  await transaction('watermark-rewind-denied', creator, 'advance_watermark',
    [proof.feed, 40], 'Watermark must increase');
  await transaction('peer-watermark-denied', peer, 'advance_watermark',
    [proof.feed, 42], 'Only the feed creator may advance the watermark');
  proof.final = await snapshot('final');
  assert.deepEqual(proof.final, sealed);
  assert.deepEqual(await read(proof.address, 'get_closed', [proof.feed, 0]), proof.closed);
  proof.verified = true;
  save();
}
