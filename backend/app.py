#TRAS backend: receives triage data, predicts severity, manages queue, and saves to database.
import sys
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request
from flask_cors import CORS

# Make ml/triage_model.py importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ml"))
from triage_model import predict_patient  

# Import Supabase client
from db import supabase
from auth import (login_required, roles_required,
                  ROLE_TRIAGE_NURSE, ROLE_DOCTOR, ROLE_NURSE_IN_CHARGE)

app = Flask(__name__)
CORS(app)  

# API field name to name used by the model
FIELD_MAP = {
    "sex": "Sex",
    "age": "Age",
    "arrival_mode": "Arrival mode",
    "injury": "Injury",
    "mental": "Mental",
    "pain": "Pain",
    "nrs_pain": "NRS_pain",
    "sbp": "SBP",
    "dbp": "DBP",
    "hr": "HR",
    "rr": "RR",
    "bt": "BT",
    "saturation": "Saturation",
    "chief_complaint": "Chief_complain",
}

# Required fields for ML prediction
REQUIRED = ["sex", "age", "arrival_mode", "injury", "mental", "pain", "chief_complaint"]


def recommend_room(triage_record_id: int, severity: str, exclude_room_ids=()):
    """
    Rule-based algorithm to match severity to the best available room type.
    Holds the room by marking it 'reserved' and creates a pending allocation
    for the Nurse in Charge to confirm, modify or reject.
    """
    if severity == "critical":
        preferred_types = ["resus", "observation", "general"]
    elif severity == "urgent":
        preferred_types = ["observation", "general", "resus"]
    else:  # stable
        preferred_types = ["general", "observation", "resus"]

    res = supabase.table("room").select("*").eq("status", "free").order("id").execute()
    free_rooms = [r for r in res.data if r["id"] not in set(exclude_room_ids)]

    # Candidates in rule order: preferred type first, then the next types
    candidates = []
    for r_type in preferred_types:
        candidates += [r for r in free_rooms if r["room_type"] == r_type]

    for room in candidates:
        # Reserve only if the room is STILL free. If another request took it
        # a moment ago, this update changes nothing and we try the next room.
        claimed = (
            supabase.table("room")
            .update({"status": "reserved"})
            .eq("id", room["id"])
            .eq("status", "free")
            .execute()
        )
        if claimed.data:
            alloc_res = supabase.table("allocation").insert({
                "triage_record_id": triage_record_id,
                "room_id": room["id"],
                "decision": "pending",
            }).execute()
            return alloc_res.data[0]

    return None  # no free room: the ED is at physical capacity


@app.get("/health")
def health():
    """Simple health check endpoint."""
    return jsonify(status="ok")


@app.get("/me")
@login_required
def me():
    """Who is signed in? The React app uses this to pick the right screens."""
    return jsonify(g.user), 200


@app.get("/rooms")
@login_required
def get_rooms():
    """Fetch all rooms for the Nurse in Charge dashboard."""
    try:
        result = supabase.table("room").select("*").order("id").execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.post("/triage")
@roles_required(ROLE_TRIAGE_NURSE)
def create_triage():
    """Predicts severity, creates/fetches the patient, and stores the triage record."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Send a JSON body."), 400

    if not data.get("patient_code") or data.get("token_number") in (None, ""):
        return jsonify(error="Missing required identifiers: 'patient_code' and 'token_number'."), 400

    missing = [f for f in REQUIRED if data.get(f) in (None, "")]
    if missing:
        return jsonify(error="Missing required clinical fields.", fields=missing), 400

    # Predict Severity
    try:
        patient_features = {model_name: data.get(api_name) for api_name, model_name in FIELD_MAP.items()}
        if patient_features["Chief_complain"] is not None:
            patient_features["Chief_complain"] = str(patient_features["Chief_complain"])
        
        result = predict_patient(patient_features)
    except (TypeError, ValueError):
        return jsonify(error="Numeric fields must be numbers."), 400

    severity_val = result["tier"].lower()  # the model returns 'Critical' / 'Urgent' / 'Stable' 

    try:
        # Insert or fetch the Patient
        # Using upsert based on patient_code to avoid duplicates if the patient returns
        patient_data = {
            "patient_code": data.get("patient_code"),
            "age": data.get("age"),
            "sex": str(data.get("sex"))
        }
        patient_res = supabase.table("patient").upsert(patient_data, on_conflict="patient_code").execute()
        patient_id = patient_res.data[0]["id"]

        #Insert the Triage Record mapping to the SQL schema
        triage_payload = {
            "patient_id": patient_id,
            "recorded_by": g.user["id"],  # the signed-in nurse, taken from the token
            "token_number": data.get("token_number"),
            "systolic_bp": data.get("sbp"),
            "diastolic_bp": data.get("dbp"),
            "heart_rate": data.get("hr"),
            "resp_rate": data.get("rr"),
            "spo2": data.get("saturation"),
            "temperature": data.get("bt"),
            "pain_scale": data.get("nrs_pain"),
            "consciousness": str(data.get("mental")),
            "chief_complaint": str(data.get("chief_complaint")),
            "predicted_severity": severity_val,
            "top_features": {  # explanation shown to the Doctor (FR-03)
                "confidence": result["confidence"],
                "probabilities": result["probabilities"],
                "complaint_group": result["complaint_group"],
                "reasons": result["reasons"],
            },
        }
        
        triage_res = supabase.table("triage_record").insert(triage_payload).execute()
        
        return jsonify({
            "prediction": result,
            "record": triage_res.data[0]
        }), 201

    except Exception as e:
        return jsonify(error=f"Database error: {str(e)}"), 500


@app.get("/queue")
@login_required
def get_doctor_queue():
    """Fetches patients waiting for doctor review, prioritised by severity then wait time."""
    try:
        # Postgres Enums sort in the order they are defined: 'critical', 'urgent', 'stable'.
        # Therefore, order("predicted_severity", desc=False) puts critical first.
        result = supabase.table("triage_record") \
            .select("*, patient(*)") \
            .is_("final_severity", "null") \
            .order("predicted_severity", desc=False) \
            .order("created_at", desc=False) \
            .execute()
        
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.patch("/triage/<int:record_id>/review")
@roles_required(ROLE_DOCTOR)
def review_triage(record_id):
    """Allows the Doctor to accept or override the predicted severity and triggers allocation."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Send a JSON body."), 400

    final_severity = data.get("final_severity")
    override_reason = data.get("override_reason")
    doctor_id = g.user["id"]  # the signed-in doctor, taken from the token

    if not final_severity:
        return jsonify(error="'final_severity' is required."), 400

    if final_severity.lower() not in ("critical", "urgent", "stable"):
        return jsonify(error="'final_severity' must be critical, urgent or stable."), 400

    try:
        existing = supabase.table("triage_record").select("id, final_severity, predicted_severity").eq("id", record_id).execute()
        if not existing.data:
            return jsonify(error="Triage record not found."), 404
        if existing.data[0]["final_severity"] is not None:
            return jsonify(error="This patient has already been reviewed."), 409
        if final_severity.lower() != existing.data[0]["predicted_severity"] and not override_reason:
            return jsonify(error="An override reason is required when changing the severity."), 400

        # Update the triage record with the doctor's decision
        update_payload = {
            "final_severity": final_severity.lower(),
            "override_reason": override_reason,
            "reviewed_by": doctor_id,
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        }

        result = supabase.table("triage_record").update(update_payload).eq("id", record_id).execute()
        
        if not result.data:
            return jsonify(error="Triage record not found."), 404

        # Trigger Room Recommendation
        allocation = recommend_room(record_id, final_severity.lower())
        
        response_data = {
            "triage_record": result.data[0],
            "allocation": allocation,
            "message": "Severity confirmed. Room recommended." if allocation else "Severity confirmed. No rooms currently available."
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.patch("/allocation/<int:alloc_id>/decide")
@roles_required(ROLE_NURSE_IN_CHARGE)
def decide_allocation(alloc_id):
    """
    Nurse in Charge confirms, modifies, or rejects the recommended room.
    Updates both the allocation record and the room statuses.
    A rejected room is released and the next best free room is recommended.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Send a JSON body."), 400

    decision = (data.get("decision") or "").lower()
    nurse_id = g.user["id"]  # the signed-in Nurse in Charge, taken from the token

    if not decision:
        return jsonify(error="'decision' is required."), 400
    if decision not in ["confirmed", "modified", "rejected"]:
        return jsonify(error="Invalid decision type."), 400

    try:
        alloc_res = supabase.table("allocation").select("*").eq("id", alloc_id).execute()
        if not alloc_res.data:
            return jsonify(error="Allocation not found."), 404

        current_alloc = alloc_res.data[0]
        if current_alloc["decision"] != "pending":
            return jsonify(error="This allocation has already been decided."), 409
        current_room_id = current_alloc["room_id"]

        update_payload = {
            "decision": decision,
            "decided_by": nurse_id,
            "decided_at": datetime.now(timezone.utc).isoformat()
        }
        next_allocation = None

        if decision == "confirmed":
            supabase.table("room").update({"status": "occupied"}).eq("id", current_room_id).execute()

        elif decision == "modified":
            new_room_id = data.get("new_room_id")
            if not new_room_id:
                return jsonify(error="'new_room_id' is required when modifying an allocation."), 400
            # The replacement room must be free right now
            claimed = (
                supabase.table("room").update({"status": "occupied"})
                .eq("id", new_room_id).eq("status", "free").execute()
            )
            if not claimed.data:
                return jsonify(error="That room is not free."), 409
            supabase.table("room").update({"status": "free"}).eq("id", current_room_id).execute()
            update_payload["room_id"] = new_room_id

        elif decision == "rejected":
            supabase.table("room").update({"status": "free"}).eq("id", current_room_id).execute()
            # Recommend the next best room, skipping any this patient was already refused
            refused = supabase.table("allocation").select("room_id") \
                .eq("triage_record_id", current_alloc["triage_record_id"]) \
                .eq("decision", "rejected").execute()
            exclude = {a["room_id"] for a in refused.data} | {current_room_id}
            record = supabase.table("triage_record").select("final_severity") \
                .eq("id", current_alloc["triage_record_id"]).execute()
            severity = record.data[0]["final_severity"] or "stable"
            # Save this rejection first, so the new recommendation sees it
            supabase.table("allocation").update(update_payload).eq("id", alloc_id).execute()
            next_allocation = recommend_room(current_alloc["triage_record_id"], severity, exclude)
            return jsonify({
                "allocation": {**current_alloc, **update_payload},
                "next_allocation": next_allocation,
                "message": "Room rejected. Next room recommended." if next_allocation
                           else "Room rejected. No other room is available; the patient is waiting for a room.",
            }), 200

        result = supabase.table("allocation").update(update_payload).eq("id", alloc_id).execute()
        return jsonify({"allocation": result.data[0], "next_allocation": None}), 200

    except Exception as e:
        return jsonify(error=str(e)), 500


@app.patch("/triage/<int:record_id>/outcome")
@roles_required(ROLE_NURSE_IN_CHARGE)
def log_outcome(record_id):
    """Logs the final outcome and frees the room. Allocation history is kept."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Send a JSON body."), 400

    outcome = (data.get("outcome") or "").lower()  # 'admitted', 'discharged' or 'transferred'
    if outcome not in ("admitted", "discharged", "transferred"):
        return jsonify(error="'outcome' must be admitted, discharged or transferred."), 400

    try:
        updated = supabase.table("triage_record").update({
            "outcome": outcome,
            "outcome_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", record_id).execute()
        if not updated.data:
            return jsonify(error="Triage record not found."), 404

        # Free any room this patient still holds (rejected rooms were freed earlier)
        alloc_res = supabase.table("allocation").select("*") \
            .eq("triage_record_id", record_id) \
            .in_("decision", ["pending", "confirmed", "modified"]).execute()
        for alloc in alloc_res.data:
            supabase.table("room").update({"status": "free"}).eq("id", alloc["room_id"]).execute()

        return jsonify({"message": f"Patient {outcome}. Room is now available."}), 200

    except Exception as e:
        return jsonify(error=str(e)), 500


@app.get("/allocations")
@login_required
def get_allocations():
    """Active allocations for the Nurse in Charge (patients with an outcome are hidden)."""
    try:
        result = supabase.table("allocation") \
            .select("*, triage_record(*, patient(*)), room(*)") \
            .in_("decision", ["pending", "confirmed", "modified"]) \
            .order("created_at", desc=False) \
            .execute()
        active = [a for a in result.data if a["triage_record"]["outcome"] is None]
        return jsonify(active), 200
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.get("/awaiting-room")
@login_required
def get_awaiting_room():
    """Reviewed patients with no outcome and no active room (e.g. the ED was full)."""
    try:
        records = supabase.table("triage_record").select("*, patient(*)") \
            .not_.is_("final_severity", "null").is_("outcome", "null") \
            .order("final_severity", desc=False).order("created_at", desc=False).execute()
        allocs = supabase.table("allocation").select("triage_record_id") \
            .in_("decision", ["pending", "confirmed", "modified"]).execute()
        has_room = {a["triage_record_id"] for a in allocs.data}
        return jsonify([r for r in records.data if r["id"] not in has_room]), 200
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.post("/triage/<int:record_id>/recommend-room")
@roles_required(ROLE_NURSE_IN_CHARGE)
def recommend_for_waiting(record_id):
    """Try again to find a room for a reviewed patient who is still waiting for one."""
    try:
        rec = supabase.table("triage_record").select("*").eq("id", record_id).execute()
        if not rec.data:
            return jsonify(error="Triage record not found."), 404
        rec = rec.data[0]
        if rec["final_severity"] is None or rec["outcome"] is not None:
            return jsonify(error="Patient must be reviewed and not yet discharged."), 409
        active = supabase.table("allocation").select("id").eq("triage_record_id", record_id) \
            .in_("decision", ["pending", "confirmed", "modified"]).execute()
        if active.data:
            return jsonify(error="This patient already has a room."), 409
        allocation = recommend_room(record_id, rec["final_severity"])
        if not allocation:
            return jsonify(allocation=None, message="Still no free room."), 200
        return jsonify(allocation=allocation, message="Room recommended."), 200
    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)