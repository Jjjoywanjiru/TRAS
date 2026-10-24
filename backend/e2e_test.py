"""TRAS end-to-end test.

Runs the whole workflow against your RUNNING backend and real Supabase, as the
three real roles, and prints PASS / FAIL for every step with how long it took.
It covers every doctor and room button: confirm, override, auto-assigned
Critical room, confirm room, reject, modify, move a confirmed patient, each
outcome, the waiting-for-room list, and the role-security rules.

How to run (Flask must be running in another terminal, .venv active):

    cd backend
    python e2e_test.py

Needs these extra lines in the project's .env (the test accounts you created):

    TEST_NURSE_EMAIL=...        TEST_NURSE_PASSWORD=...
    TEST_DOCTOR_EMAIL=...       TEST_DOCTOR_PASSWORD=...
    TEST_INCHARGE_EMAIL=...     TEST_INCHARGE_PASSWORD=...

WARNING: it sets every room to free first, and creates test patients whose
codes start with E2E-. Use --no-reset to leave the rooms alone (some checks
then depend on how many rooms are free).
"""
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API = os.environ.get("API_URL", "http://127.0.0.1:5000")
SLOW_MS = 1000

ACCOUNTS = {
    "nurse": ("TEST_NURSE_EMAIL", "TEST_NURSE_PASSWORD"),
    "doctor": ("TEST_DOCTOR_EMAIL", "TEST_DOCTOR_PASSWORD"),
    "charge": ("TEST_INCHARGE_EMAIL", "TEST_INCHARGE_PASSWORD"),
}

tokens = {}
results = []      # (name, ok, ms, detail)
timings = []      # (ms, label)


def login(role):
    email_var, pw_var = ACCOUNTS[role]
    email, password = os.environ.get(email_var), os.environ.get(pw_var)
    if not email or not password:
        raise SystemExit(f"Add {email_var} and {pw_var} to your .env file.")
    r = httpx.post(
        f"{os.environ['SUPABASE_URL']}/auth/v1/token?grant_type=password",
        headers={"apikey": os.environ["SUPABASE_KEY"]},
        json={"email": email, "password": password},
        timeout=30,
    )
    if r.status_code != 200:
        raise SystemExit(f"Could not sign in as {role} ({email}): {r.text[:200]}")
    return r.json()["access_token"]


def call(role, method, path, **kw):
    """Calls the backend as a role (or with no token when role is None)."""
    headers = {"Authorization": f"Bearer {tokens[role]}"} if role else {}
    t0 = time.perf_counter()
    r = httpx.request(method, API + path, headers=headers, timeout=60, **kw)
    ms = (time.perf_counter() - t0) * 1000
    try:
        body = r.json()
    except ValueError:
        body = None
    timings.append((ms, f"{method} {path}"))
    return r.status_code, body, ms


def check(name, ok, ms=None, detail=""):
    results.append((name, bool(ok), ms, "" if ok else detail))
    flag = "PASS" if ok else "FAIL"
    t = f"{ms:6.0f} ms" if ms is not None else "         "
    print(f"  [{flag}] {name:<62} {t}" + (f"   <- {detail}" if not ok and detail else ""))


def vitals(**kw):
    base = dict(sex=1, age=40, arrival_mode=1, injury=1, mental=1, pain=0, nrs_pain=0,
                sbp=120, dbp=80, hr=75, rr=16, bt=36.7, saturation=98)
    base.update(kw)
    return base


PATIENTS = {
    "T1": (vitals(sex=2, age=72, arrival_mode=2, mental=2, pain=1, nrs_pain=8, sbp=80, dbp=50,
                  hr=130, rr=28, bt=38.5, saturation=85,
                  chief_complaint="chest pain and shortness of breath"), "critical"),
    "T2": (vitals(age=30, chief_complaint="cough"), "urgent"),
    "T3": (vitals(age=25, pain=1, nrs_pain=2, chief_complaint="mild headache"), "stable"),
    "T4": (vitals(sex=2, age=65, arrival_mode=2, mental=2, pain=1, nrs_pain=9, sbp=75, dbp=45,
                  hr=140, rr=30, bt=39.0, saturation=82, chief_complaint="difficulty breathing"), "critical"),
}


def section(title):
    print(f"\n{title}")


def room_map():
    status, rooms, ms = call("charge", "GET", "/rooms")
    return {r["id"]: r for r in rooms}, ms


def main(argv):
    from db import supabase   # direct database access, used only to reset and fill rooms

    if "--yes" not in argv and "--no-reset" not in argv:
        if input("This sets EVERY room to free first. Continue? (y/n) ").strip().lower() != "y":
            return 1

    run = f"E2E-{int(time.time()) % 100000}"
    rec = {}      # T1.. -> triage record id
    alloc = {}    # T1.. -> allocation id
    print(f"Testing {API}  (test patients are named {run}-T1 ...)")

    section("Sign in")
    for role in ACCOUNTS:
        t0 = time.perf_counter()
        tokens[role] = login(role)
        check(f"Signed in as {role}", True, (time.perf_counter() - t0) * 1000)

    if "--no-reset" not in argv:
        supabase.table("room").update({"status": "free"}).neq("status", "free").execute()

    try:
        section("Security rules")
        status, _, ms = call(None, "GET", "/queue")
        check("No token is refused (401)", status == 401, ms, f"got {status}")
        status, _, ms = call("doctor", "POST", "/triage", json={**PATIENTS["T1"][0], "patient_code": "x", "token_number": 1})
        check("Doctor cannot submit triage (403)", status == 403, ms, f"got {status}")
        status, me, ms = call("charge", "GET", "/me")
        check("/me returns the signed-in role", status == 200 and me.get("role") == "nurse_in_charge", ms, str(me))

        section("Triage nurse")
        for i, (key, (data, expected)) in enumerate(PATIENTS.items(), start=1):
            status, body, ms = call("nurse", "POST", "/triage",
                                    json={**data, "patient_code": f"{run}-{key}", "token_number": 9000 + i})
            ok = status == 201 and body["record"]["predicted_severity"] == expected
            got = body["record"]["predicted_severity"] if status == 201 else body
            check(f"{key} saved, predicted {expected}", ok, ms, f"status {status}, predicted {got}")
            if status == 201:
                rec[key] = body["record"]["id"]
        status, _, ms = call("nurse", "POST", "/triage",
                             json={**PATIENTS["T2"][0], "chief_complaint": "", "patient_code": f"{run}-X", "token_number": 9099})
        check("Blank chief complaint is refused (400)", status == 400, ms, f"got {status}")
        if len(rec) < 4:
            print("\nStopping: the triage step failed, so later steps cannot run.")
            return finish()

        section("Board")
        status, board, ms = call("nurse", "GET", "/board")
        ours = [q["patient"]["patient_code"].split("-")[-1] for q in board["queue"]
                if q["patient"]["patient_code"].startswith(run)] if status == 200 else []
        check("/board returns rooms, queue, awaiting and allocations",
              status == 200 and all(k in board for k in ("rooms", "queue", "awaiting", "allocations")), ms)
        check("Queue order is T1, T4 (Critical), T2 (Urgent), T3 (Stable)", ours == ["T1", "T4", "T2", "T3"], ms, str(ours))

        section("Doctor review")
        status, _, ms = call("nurse", "PATCH", f"/triage/{rec['T1']}/review", json={"final_severity": "critical"})
        check("Nurse cannot review (403)", status == 403, ms, f"got {status}")

        for key in ("T1", "T4"):
            status, body, ms = call("doctor", "PATCH", f"/triage/{rec[key]}/review", json={"final_severity": "critical"})
            a = (body or {}).get("allocation") or {}
            ok = (status == 200 and body.get("auto_assigned") is True and a.get("decision") == "confirmed"
                  and a.get("room", {}).get("room_type") == "resus")
            check(f"{key} Critical confirmed: resus room assigned immediately", ok, ms, f"status {status}, {body}")
            alloc[key] = a.get("id")

        status, _, ms = call("doctor", "PATCH", f"/triage/{rec['T2']}/review", json={"final_severity": "stable"})
        check("Override without a reason is refused (400)", status == 400, ms, f"got {status}")
        status, body, ms = call("doctor", "PATCH", f"/triage/{rec['T2']}/review",
                                json={"final_severity": "stable", "override_reason": "mild, no distress"})
        a = (body or {}).get("allocation") or {}
        check("T2 overridden to stable: room recommended, waits for approval",
              status == 200 and a.get("decision") == "pending" and body.get("auto_assigned") is False, ms, f"status {status}")
        alloc["T2"] = a.get("id")
        status, body, ms = call("doctor", "PATCH", f"/triage/{rec['T3']}/review", json={"final_severity": "stable"})
        a = (body or {}).get("allocation") or {}
        check("T3 stable confirmed: room recommended, waits for approval",
              status == 200 and a.get("decision") == "pending", ms, f"status {status}")
        alloc["T3"] = a.get("id")
        status, _, ms = call("doctor", "PATCH", f"/triage/{rec['T3']}/review", json={"final_severity": "stable"})
        check("Reviewing the same patient twice is refused (409)", status == 409, ms, f"got {status}")

        section("Nurse in Charge")
        status, allocs, ms = call("charge", "GET", "/allocations")
        mine = {a["triage_record"]["patient"]["patient_code"].split("-")[-1]: a for a in allocs
                if a["triage_record"]["patient"]["patient_code"].startswith(run)} if status == 200 else {}
        check("All four allocations are listed", set(mine) == {"T1", "T2", "T3", "T4"}, ms, str(sorted(mine)))
        check("T1 and T4 are marked auto-assigned", all(mine.get(k, {}).get("auto_assigned") for k in ("T1", "T4")), ms)
        check("T2 and T3 are pending", all(mine.get(k, {}).get("decision") == "pending" for k in ("T2", "T3")), ms)

        status, _, ms = call("doctor", "PATCH", f"/allocation/{alloc['T3']}/decide", json={"decision": "confirmed"})
        check("Doctor cannot decide rooms (403)", status == 403, ms, f"got {status}")

        status, body, ms = call("charge", "PATCH", f"/allocation/{alloc['T3']}/decide", json={"decision": "confirmed"})
        check("Confirm Room (T3)", status == 200 and body["allocation"]["decision"] == "confirmed", ms, f"status {status}")
        status, _, ms = call("charge", "PATCH", f"/allocation/{alloc['T3']}/decide", json={"decision": "confirmed"})
        check("Deciding the same allocation again is refused (409)", status == 409, ms, f"got {status}")

        rooms, ms = room_map()
        rejected_room = mine["T2"]["room_id"]
        status, body, ms = call("charge", "PATCH", f"/allocation/{alloc['T2']}/decide", json={"decision": "rejected"})
        nxt = (body or {}).get("next_allocation") or {}
        check("Reject (T2): the next room is recommended",
              status == 200 and nxt and nxt["room_id"] != rejected_room, ms, f"status {status}, {body}")
        new_alloc = nxt.get("id")

        rooms, ms = room_map()
        free_ids = [r["id"] for r in rooms.values() if r["status"] == "free"]
        if new_alloc and free_ids:
            target = free_ids[0]
            status, body, ms = call("charge", "PATCH", f"/allocation/{new_alloc}/decide",
                                    json={"decision": "modified", "new_room_id": target})
            check("Modify (T2): choose a different free room",
                  status == 200 and body["allocation"]["room_id"] == target, ms, f"status {status}, {body}")
        else:
            check("Modify (T2): choose a different free room", False, None, "no pending allocation or no free room")

        status, _, ms = call("charge", "PATCH", f"/allocation/{new_alloc}/decide",
                             json={"decision": "modified", "new_room_id": mine["T1"]["room_id"]})
        check("Modifying to a room that is not free is refused (409)", status == 409, ms, f"got {status}")

        rooms, ms = room_map()
        free_ids = [r["id"] for r in rooms.values() if r["status"] == "free"]
        old_room = mine["T3"]["room_id"]
        if free_ids:
            status, body, ms = call("charge", "PATCH", f"/allocation/{alloc['T3']}/decide",
                                    json={"decision": "modified", "new_room_id": free_ids[0]})
            rooms, _ = room_map()
            check("Move a confirmed patient (T3) to another room",
                  status == 200 and rooms[old_room]["status"] == "free", ms, f"status {status}, {body}")
        else:
            check("Move a confirmed patient (T3) to another room", False, None, "no free room")

        status, _, ms = call("charge", "PATCH", f"/triage/{rec['T1']}/outcome", json={"outcome": "unknown"})
        check("Invalid outcome is refused (400)", status == 400, ms, f"got {status}")
        for key, outcome in (("T1", "admitted"), ("T2", "discharged"), ("T3", "transferred"), ("T4", "admitted")):
            status, _, ms = call("charge", "PATCH", f"/triage/{rec[key]}/outcome", json={"outcome": outcome})
            check(f"Outcome {outcome} ({key})", status == 200, ms, f"got {status}")

        status, allocs, ms = call("charge", "GET", "/allocations")
        left = [a for a in allocs if a["triage_record"]["patient"]["patient_code"].startswith(run)]
        check("Finished patients disappear from the Rooms screen", status == 200 and not left, ms, f"{len(left)} left")
        rooms, ms = room_map()
        check("All rooms are free again", all(r["status"] == "free" for r in rooms.values()), ms,
              str([r["name"] for r in rooms.values() if r["status"] != "free"]))

        section("Department full: waiting list")
        taken = supabase.table("room").update({"status": "occupied"}).eq("status", "free").execute().data
        taken_ids = [r["id"] for r in taken]
        data, expected = (vitals(age=22, injury=2, pain=1, nrs_pain=3, chief_complaint="ankle sprain"), None)
        status, body, ms = call("nurse", "POST", "/triage", json={**data, "patient_code": f"{run}-T5", "token_number": 9005})
        rec["T5"] = body["record"]["id"] if status == 201 else None
        check("T5 triaged", status == 201, ms, f"status {status}")
        if rec["T5"]:
            final = body["record"]["predicted_severity"]
            status, body, ms = call("doctor", "PATCH", f"/triage/{rec['T5']}/review", json={"final_severity": final})
            check("Confirmed with every room taken: no room, no crash", status == 200 and body["allocation"] is None, ms, f"status {status}")
            status, waiting, ms = call("charge", "GET", "/awaiting-room")
            check("T5 appears on the waiting-for-room list",
                  status == 200 and any(w["id"] == rec["T5"] for w in waiting), ms)
            if taken_ids:
                supabase.table("room").update({"status": "free"}).eq("id", taken_ids[0]).execute()
            status, body, ms = call("charge", "POST", f"/triage/{rec['T5']}/recommend-room")
            check("Find a room works once a room is free", status == 200 and body.get("allocation"), ms, f"status {status}, {body}")
            status, _, ms = call("charge", "PATCH", f"/triage/{rec['T5']}/outcome", json={"outcome": "discharged"})
            check("Outcome discharged (T5)", status == 200, ms, f"got {status}")
    finally:
        # Leave the department tidy, whatever happened above
        if "--no-reset" not in argv:
            supabase.table("room").update({"status": "free"}).neq("status", "free").execute()

    return finish()


def finish():
    passed = sum(1 for _, ok, _, _ in results if ok)
    failed = len(results) - passed
    print("\n" + "=" * 78)
    print(f"{passed} passed, {failed} failed, {len(results)} checks")
    if timings:
        times = sorted(timings, reverse=True)
        avg = sum(t for t, _ in timings) / len(timings)
        print(f"Average call: {avg:.0f} ms. Slowest calls:")
        for ms, label in times[:5]:
            print(f"   {ms:6.0f} ms  {label}" + ("   <- slow" if ms > SLOW_MS else ""))
    if failed:
        print("\nFailed checks:")
        for name, ok, _, detail in results:
            if not ok:
                print(f"   - {name}: {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
