"""TRAS backend: receives triage data, predicts severity, manages queue, and saves to database."""
import sys
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

# Make ml/triage_model.py importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ml"))
from triage_model import predict_patient  # noqa: E402

# Import Supabase client
from db import supabase

app = Flask(__name__)
CORS(app)  # lets the React dev server call this API

# API field name -> name used by the model
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


def recommend_room(triage_record_id: int, severity: str):
    """
    Rule-based algorithm to match severity to the best available room type.
    Holds the room by marking it 'reserved'.
    """
    # 1. Define room type priority based on severity
    if severity == "critical":
        preferred_types = ["resus", "observation", "general"]
    elif severity == "urgent":
        preferred_types = ["observation", "general", "resus"]
    else:  # stable
        preferred_types = ["general", "observation", "resus"]

    # 2. Fetch all currently 'free' rooms
    res = supabase.table("room").select("*").eq("status", "free").execute()
    free_rooms = res.data

    if not free_rooms:
        return None  # The ED is at absolute physical capacity

    # 3. Find the best available room matching the rules
    recommended_room = None
    for r_type in preferred_types:
        matches = [r for r in free_rooms if r["room_type"] == r_type]
        if matches:
            recommended_room = matches[0]  # Just take the first available of this type
            break

    # 4. If a room is found, create the allocation and reserve the room
    if recommended_room:
        # Reserve the room so it isn't recommended to someone else in the next second
        supabase.table("room").update({"status": "reserved"}).eq("id", recommended_room["id"]).execute()

        # Create the pending allocation record for the Nurse in Charge to review
        allocation_payload = {
            "triage_record_id": triage_record_id,
            "room_id": recommended_room["id"],
            "decision": "pending"
        }
        alloc_res = supabase.table("allocation").insert(allocation_payload).execute()
        
        return alloc_res.data[0]
    
    return None


@app.get("/health")
def health():
    """Simple health check endpoint."""
    return jsonify(status="ok")


@app.get("/rooms")
def get_rooms():
    """Fetch all rooms for the Nurse in Charge dashboard."""
    try:
        result = supabase.table("room").select("*").order("id").execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.post("/triage")
def create_triage():
    """Predicts severity, creates/fetches the patient, and stores the triage record."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Send a JSON body."), 400

    # Ensure recorded_by (Triage Nurse UUID) and patient_code are provided
    if not data.get("recorded_by") or not data.get("patient_code"):
        return jsonify(error="Missing required identifiers: 'recorded_by' and 'patient_code'."), 400

    missing = [f for f in REQUIRED if data.get(f) in (None, "")]
    if missing:
        return jsonify(error="Missing required clinical fields.", fields=missing), 400

    # 1. Predict Severity
    try:
        patient_features = {model_name: data.get(api_name) for api_name, model_name in FIELD_MAP.items()}
        if patient_features["Chief_complain"] is not None:
            patient_features["Chief_complain"] = str(patient_features["Chief_complain"])
        
        result = predict_patient(patient_features)
    except (TypeError, ValueError):
        return jsonify(error="Numeric fields must be numbers."), 400

    severity_val = result.get("severity", "stable").lower()

    try:
        # 2. Insert or fetch the Patient
        # Using upsert based on patient_code to avoid duplicates if the patient returns
        patient_data = {
            "patient_code": data.get("patient_code"),
            "age": data.get("age"),
            "sex": str(data.get("sex"))
        }
        patient_res = supabase.table("patient").upsert(patient_data, on_conflict="patient_code").execute()
        patient_id = patient_res.data[0]["id"]

        # 3. Insert the Triage Record mapping to the SQL schema
        triage_payload = {
            "patient_id": patient_id,
            "recorded_by": data.get("recorded_by"),
            "token_number": data.get("token_number"),
            "systolic_bp": data.get("sbp"),
            "diastolic_bp": data.get("dbp"),
            "heart_rate": data.get("hr"),
            "resp_rate": data.get("rr"),
            "spo2": data.get("saturation"),
            "temperature": data.get("bt"),
            "pain_scale": data.get("nrs_pain") or data.get("pain"),
            "consciousness": str(data.get("mental")),
            "chief_complaint": str(data.get("chief_complaint")),
            "predicted_severity": severity_val,
            "top_features": result.get("explanations", {})  # SHAP JSON for the doctor's explainability view
        }
        
        triage_res = supabase.table("triage_record").insert(triage_payload).execute()
        
        return jsonify({
            "prediction": result,
            "record": triage_res.data[0]
        }), 201

    except Exception as e:
        return jsonify(error=f"Database error: {str(e)}"), 500


@app.get("/queue")
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
def review_triage(record_id):
    """Allows the Doctor to accept or override the predicted severity and triggers allocation."""
    data = request.get_json(silent=True)
    
    final_severity = data.get("final_severity")
    override_reason = data.get("override_reason")
    doctor_id = data.get("doctor_id")

    if not final_severity or not doctor_id:
        return jsonify(error="'final_severity' and 'doctor_id' are required."), 400

    try:
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

        # Trigger Step D: Room Recommendation
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
def decide_allocation(alloc_id):
    """
    Nurse in Charge confirms, modifies, or rejects the recommended room.
    Updates both the allocation record and the corresponding room statuses.
    """
    data = request.get_json(silent=True)
    decision = data.get("decision")
    nurse_id = data.get("nurse_id")

    if not decision or not nurse_id:
        return jsonify(error="'decision' and 'nurse_id' are required."), 400

    decision = decision.lower()
    if decision not in ["confirmed", "modified", "rejected"]:
        return jsonify(error="Invalid decision type."), 400

    try:
        # 1. Fetch current allocation to know which room is currently reserved
        alloc_res = supabase.table("allocation").select("*").eq("id", alloc_id).execute()
        if not alloc_res.data:
            return jsonify(error="Allocation not found."), 404
        
        current_alloc = alloc_res.data[0]
        current_room_id = current_alloc["room_id"]

        update_payload = {
            "decision": decision,
            "decided_by": nurse_id,
            "decided_at": datetime.now(timezone.utc).isoformat()
        }

        # 2. Handle room status changes based on the decision
        if decision == "confirmed":
            # Change the reserved room to occupied
            supabase.table("room").update({"status": "occupied"}).eq("id", current_room_id).execute()
            
        elif decision == "rejected":
            # Free up the reserved room
            supabase.table("room").update({"status": "free"}).eq("id", current_room_id).execute()
            
        elif decision == "modified":
            new_room_id = data.get("new_room_id")
            if not new_room_id:
                return jsonify(error="'new_room_id' is required when modifying an allocation."), 400
            
            # Free the originally recommended room
            supabase.table("room").update({"status": "free"}).eq("id", current_room_id).execute()
            # Occupy the newly chosen room
            supabase.table("room").update({"status": "occupied"}).eq("id", new_room_id).execute()
            # Update the allocation record to point to the new room
            update_payload["room_id"] = new_room_id

        # 3. Update the allocation record
        result = supabase.table("allocation").update(update_payload).eq("id", alloc_id).execute()

        return jsonify(result.data[0]), 200

    except Exception as e:
        return jsonify(error=str(e)), 500


@app.patch("/triage/<int:record_id>/outcome")
def record_outcome(record_id):
    """
    Nurse in Charge logs the final patient outcome, which releases their room.
    """
    data = request.get_json(silent=True)
    outcome = data.get("outcome")

    if not outcome:
        return jsonify(error="'outcome' is required."), 400

    outcome = outcome.lower()
    if outcome not in ["admitted", "discharged", "transferred"]:
        return jsonify(error="Invalid outcome type."), 400

    try:
        # 1. Update the Triage Record with the final outcome
        triage_update = {
            "outcome": outcome,
            "outcome_at": datetime.now(timezone.utc).isoformat()
        }
        triage_res = supabase.table("triage_record").update(triage_update).eq("id", record_id).execute()

        if not triage_res.data:
            return jsonify(error="Triage record not found."), 404

        # 2. Find the room this patient was occupying and free it
        alloc_res = supabase.table("allocation") \
            .select("room_id") \
            .eq("triage_record_id", record_id) \
            .in_("decision", ["confirmed", "modified"]) \
            .execute()
        
        freed_room_id = None
        if alloc_res.data:
            freed_room_id = alloc_res.data[0]["room_id"]
            supabase.table("room").update({"status": "free"}).eq("id", freed_room_id).execute()

        return jsonify({
            "message": f"Patient {outcome}, room released.",
            "triage_record": triage_res.data[0],
            "freed_room_id": freed_room_id
        }), 200

    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)