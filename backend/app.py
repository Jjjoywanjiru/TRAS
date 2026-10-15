"""TRAS backend: receives triage data, returns an advisory severity prediction."""
import sys
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

# Make ml/triage_model.py importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ml"))
from triage_model import predict_patient  # noqa: E402

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
REQUIRED = ["sex", "age", "arrival_mode", "injury", "mental", "pain", "chief_complaint"]


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.post("/predict")
def predict():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Send a JSON body."), 400

    missing = [f for f in REQUIRED if data.get(f) in (None, "")]
    if missing:
        return jsonify(error="Missing required fields.", fields=missing), 400

    try:
        patient = {model_name: data.get(api_name) for api_name, model_name in FIELD_MAP.items()}
        if patient["Chief_complain"] is not None:
            patient["Chief_complain"] = str(patient["Chief_complain"])
        result = predict_patient(patient)
    except (TypeError, ValueError):
        return jsonify(error="Numeric fields must be numbers."), 400

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5000)