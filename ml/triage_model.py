"""TRAS severity prediction: raw triage fields in, tier + confidence + reasons out.

Used by the Flask backend (and testable from a notebook):

    from triage_model import predict_patient
    predict_patient({...})
"""
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
TIERS = ["Critical", "Urgent", "Stable"]   # model outputs 0, 1, 2

# Chief-complaint grouping. First matching rule wins, so keep the order.
RULES = [
    ("chest_pain", r"chest|palpitation|angina"),
    ("abdominal_pain", r"abd|epigast|stomach|flank|rlq|llq|ruq|luq|groin"),
    ("breathing", r"dyspnea|dyspnoea|shortness|sob|cough|breath|wheez|hemoptysis"),
    ("neuro", r"dizz|vertigo|mental|conscious|syncope|seizure|convuls|dysarthria|weakness|palsy|paresis|hemipar|loc$|^loc|amnesia|blurred|vision|numb|stroke|paralys|aphasia|confus|drows"),
    ("fever", r"fever|chill"),
    ("skin_ent_urinary_psych", r"rash|urticar|itch|epistaxis|nose|throat|ear|dysuria|urin|void|hematuria|anxiety|suicid|psych|agitat|violence|myalgia|cpr|ascites|catheter"),
    ("headache", r"headache|head ache|^ha$"),
    ("bleeding_gi", r"hematem|melena|hematochezia|bloody|bleed|vomit|diarrh|nausea|constipat"),
    ("injury_wound", r"wound|laceration|injur|trauma|fall|fracture|burn|bite|contusion|sprain|swelling|cut|abrasion"),
    ("pain_other", r"pain|ache"),
    ("unreadable", r"^[?\s]+$"),
]

BASE_COLS = ["Sex", "Age", "Arrival mode", "Injury", "Mental", "Pain","NRS_pain", "SBP", "DBP", "HR", "RR", "BT", "Saturation"]

#loading models
_model = xgb.XGBClassifier()
_model.load_model(MODEL_DIR / "severity_model.json")
with open(MODEL_DIR / "feature_columns.json") as f:
    _columns = json.load(f)


def group_complaint(text):
    text = str(text or "").lower().strip()
    for name, pattern in RULES:
        if re.search(pattern, text):
            return name
    return "other"

#reasons
def _describe(feature, value):
    if feature.startswith("cc_"):
        group = feature[3:].replace("_", " ")
        return f"complaint group is {'' if value == 1 else 'not '}'{group}'"
    if pd.isna(value):
        return f"{feature} not recorded"
    return f"{feature} = {value:g}"


def predict_patient(patient, top=4):
    """patient: dict with the dataset's field names  plus
    'Chief_complain'. Missing vitals can be None."""
    row = {c: np.nan if patient.get(c) is None else float(patient[c]) for c in BASE_COLS}
    if row["Pain"] == 0:                      
        row["NRS_pain"] = 0.0

    X = pd.DataFrame(0.0, index=[0], columns=_columns)
    for c in BASE_COLS:
        X.loc[0, c] = row[c]
    group_col = "cc_" + group_complaint(patient.get("Chief_complain"))
    if group_col in X.columns:
        X.loc[0, group_col] = 1.0

    probs = _model.predict_proba(X)[0]
    pred = int(probs.argmax())

    contrib = _model.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)
    scores = pd.Series(contrib[0, pred, :-1], index=_columns)
    strongest = scores.reindex(scores.abs().sort_values(ascending=False).index)[:top]
    reasons = [
        {"text": _describe(f, X.loc[0, f]),
         "direction": "toward" if s > 0 else "away from"}
        for f, s in strongest.items()
    ]
    return {
        #return the predicted tier, confidence, probabilities for each tier, complaint group, and reasons for the prediction
        "tier": TIERS[pred],
        "confidence": round(float(probs[pred]), 3),
        "probabilities": {t: round(float(p), 3) for t, p in zip(TIERS, probs)},
        "complaint_group": group_col[3:],
        "reasons": reasons,
    }