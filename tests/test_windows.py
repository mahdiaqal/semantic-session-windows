import hashlib
import itertools
import json
import re
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
BASE = "mahdiaqal/semantic-session-windows/" + "a" * 40 + "/fixtures/"
POLICY = "Completed equipment inspections. Exclude plans and cancelled inspections."


@pytest.fixture
def windows(direct_deploy):
    contract = direct_deploy(str(ROOT / "contracts/SemanticSessionWindows.py"))
    return contract, sys.modules[type(contract._instance).__module__]


def mock(vm, name, status="MATCH", time=None, http=200):
    body = (ROOT / "fixtures" / (name + ".txt")).read_bytes()
    coordinate = BASE + name + ".txt"
    vm.clear_mocks()
    vm.mock_web(re.escape("https://raw.githubusercontent.com/" + coordinate) + "$", {
        "method": "GET", "response": {"status": http, "headers": {}, "body": body},
    })
    vm.mock_llm(r".*SESSION WINDOW EVENT EXTRACTION.*", json.dumps({"status": status, "time": time}))
    return coordinate, hashlib.sha256(body).hexdigest()


def ingest(contract, vm, feed, name, time, status="MATCH"):
    coordinate, sha = mock(vm, name, status=status, time=time)
    return contract.ingest(feed, name, coordinate, sha)


def test_bridge_watermark_boundary_and_late_side_record(windows, direct_vm):
    contract, mod = windows
    feed = contract.create_feed("inspections", POLICY, 10)
    assert ingest(contract, direct_vm, feed, "first", 10) == "APPENDED"
    assert direct_vm.run_validator()
    assert ingest(contract, direct_vm, feed, "last", 30) == "APPENDED"
    assert [s["events"] for s in contract.get_feed(feed)["sessions"]] == [["first"], ["last"]]
    assert ingest(contract, direct_vm, feed, "bridge", 20) == "APPENDED"
    assert direct_vm.run_validator()
    record = contract.get_event(feed, "bridge")
    forged = {**record["evidence"], "decision": {"status": "MATCH", "time": 19}}
    assert not direct_vm.run_validator(leader_result=mod.canonical(forged))
    assert contract.get_feed(feed)["sessions"] == [{"start": 10, "end": 30, "events": ["first", "bridge", "last"]}]
    assert contract.advance_watermark(feed, 40) == 0
    assert contract.advance_watermark(feed, 41) == 1
    closed = contract.get_closed(feed, 0)
    assert closed == {"start": 10, "end": 30, "events": ["first", "bridge", "last"], "watermark": 41}
    assert ingest(contract, direct_vm, feed, "late", 25) == "LATE"
    assert ingest(contract, direct_vm, feed, "planned", None, status="OUTSIDE") == "OUTSIDE"
    assert contract.get_feed(feed)["points"] == []
    assert contract.get_closed(feed, 0) == closed


def test_point_at_watermark_can_extend_equal_boundary(windows, direct_vm):
    contract, _ = windows
    feed = contract.create_feed("boundary", POLICY, 10)
    ingest(contract, direct_vm, feed, "last", 30)
    contract.advance_watermark(feed, 40)
    ingest(contract, direct_vm, feed, "bridge", 40)
    assert contract.get_feed(feed)["sessions"] == [{"start": 30, "end": 40, "events": ["last", "bridge"]}]
    assert contract.advance_watermark(feed, 50) == 0
    assert contract.advance_watermark(feed, 51) == 1


def test_unknown_and_content_dedup(windows, direct_vm):
    contract, _ = windows
    feed = contract.create_feed("unknown", POLICY, 10)
    assert ingest(contract, direct_vm, feed, "planned", None, status="UNKNOWN") == "UNKNOWN"
    coordinate, sha = mock(direct_vm, "planned", status="UNKNOWN", time=None)
    with direct_vm.expect_revert("already processed"):
        contract.ingest(feed, "alias", coordinate, sha)
    assert contract.get_feed(feed)["points"] == []


def test_only_creator_and_increasing_watermarks(windows, direct_vm, direct_alice, direct_bob):
    contract, _ = windows
    direct_vm.sender = direct_alice
    feed = contract.create_feed("owner", POLICY, 10)
    coordinate, sha = mock(direct_vm, "first", time=10)
    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only the feed creator"):
            contract.ingest(feed, "first", coordinate, sha)
        with direct_vm.expect_revert("Only the feed creator"):
            contract.advance_watermark(feed, 40)
    assert contract.advance_watermark(feed, 40) == 0
    with direct_vm.expect_revert("must increase"):
        contract.advance_watermark(feed, 40)
    with direct_vm.expect_revert("must increase"):
        contract.advance_watermark(feed, 39)


def test_all_arrival_orders_and_insertion_partitions(windows):
    _, mod = windows
    # Independent definition through connected components on all point pairs.
    for times in itertools.combinations_with_replacement(range(5), 4):
        points = [{"id": str(i), "time": t} for i, t in enumerate(times)]
        for gap in (1, 2):
            groups = [{i} for i in range(4)]
            for i, j in itertools.combinations(range(4), 2):
                if abs(times[i] - times[j]) <= gap:
                    left = next(group for group in groups if i in group)
                    right = next(group for group in groups if j in group)
                    if left != right:
                        groups.remove(left)
                        groups.remove(right)
                        groups.append(left | right)
            expected = {frozenset(str(i) for i in group) for group in groups}
            for order in itertools.permutations(points):
                result = mod.sessions(list(order), gap)
                assert {frozenset(s["events"]) for s in result} == expected


def test_buffer_capacity_is_released_and_failed_insert_can_retry(windows, direct_vm):
    contract, _ = windows
    feed = contract.create_feed("capacity", POLICY, 1)
    for i in range(17):
        time = i if i < 16 else 18
        body = f"A completed equipment inspection occurred at logical time {time}.".encode()
        coordinate = BASE + f"e{i}.txt"
        direct_vm.clear_mocks()
        direct_vm.mock_web(re.escape("https://raw.githubusercontent.com/" + coordinate) + "$", {
            "method": "GET", "response": {"status": 200, "headers": {}, "body": body},
        })
        direct_vm.mock_llm(r".*SESSION WINDOW EVENT EXTRACTION.*", json.dumps({"status": "MATCH", "time": time}))
        sha = hashlib.sha256(body).hexdigest()
        if i < 16:
            contract.ingest(feed, f"e{i}", coordinate, sha)
        else:
            with direct_vm.expect_revert("buffer full"):
                contract.ingest(feed, f"e{i}", coordinate, sha)
            assert contract.advance_watermark(feed, 18) == 1
            assert contract.ingest(feed, f"e{i}", coordinate, sha) == "APPENDED"
    assert len(contract.get_feed(feed)["points"]) == 1
    assert len(contract.get_closed(feed, 0)["events"]) == 16
    assert contract.advance_watermark(feed, 20) == 1
    assert contract.get_closed(feed, 1)["events"] == ["e16"]
    assert len(contract.get_closed(feed, 0)["events"]) == 16


def test_maximum_event_time_can_be_closed(windows, direct_vm):
    contract, _ = windows
    feed = contract.create_feed("end-of-clock", POLICY, 1000)
    ingest(contract, direct_vm, feed, "last", 4294967295)
    assert contract.advance_watermark(feed, 4294968295) == 0
    assert contract.advance_watermark(feed, 4294968296) == 1


@pytest.mark.parametrize("case", [
    {"status": "MATCH", "time": True},
    {"status": "MATCH", "time": -1},
    {"status": "MATCH", "time": 4294967296},
    {"status": "OUTSIDE", "time": 10},
    {"status": "UNKNOWN", "time": 10},
    {"status": "YES", "time": None},
])
def test_invalid_ai_schema(windows, case):
    _, mod = windows
    with pytest.raises(ValueError):
        mod.parse_observation(case)


@pytest.mark.parametrize("failure", ["http", "hash", "model"])
def test_failed_acquisition_or_model_leaves_no_record(windows, direct_vm, failure):
    contract, _ = windows
    feed = contract.create_feed("failure", POLICY, 10)
    coordinate, sha = mock(direct_vm, "first", time=True if failure == "model" else 10,
                           http=404 if failure == "http" else 200)
    with direct_vm.expect_revert("acquisition or interpretation failed"):
        contract.ingest(feed, "event", coordinate, "0" * 64 if failure == "hash" else sha)
    assert contract.get_feed(feed)["points"] == []
    with direct_vm.expect_revert("Unknown event"):
        contract.get_event(feed, "event")
