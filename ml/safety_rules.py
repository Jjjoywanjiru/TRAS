"""Safety floor for TRAS severity predictions.

The ML model can under-triage. These simple, explainable rules guarantee that
a patient with clearly dangerous vitals is never ranked below a minimum tier.

* The floor only RAISES severity, it never lowers it.
* The doctor still confirms or overrides every prediction.
* The numbers below are standard ADULT thresholds. Have them confirmed by
  your clinical supervisor, and edit them here (one place) if they change.
"""

TIER_ORDER = {"Critical": 0, "Urgent": 1, "Stable": 2}   # lower number = more severe

# Each rule: (tier it forces, vital name, test function, text shown to the doctor)
# Vital names are the model's field names: SBP, HR, RR, BT, Saturation, Mental.
RULES = [
    # --- Critical floor ---
    ("Critical", "Saturation", lambda v: v < 90,  "Oxygen saturation below 90%"),
    ("Critical", "SBP",        lambda v: v < 90,  "Systolic blood pressure below 90"),
    ("Critical", "HR",         lambda v: v > 130, "Heart rate above 130"),
    ("Critical", "HR",         lambda v: v < 40,  "Heart rate below 40"),
    ("Critical", "RR",         lambda v: v > 30,  "Breathing rate above 30"),
    ("Critical", "RR",         lambda v: v < 8,   "Breathing rate below 8"),
    ("Critical", "Mental",     lambda v: v >= 3,  "Responds only to pain or unresponsive"),
    # --- Urgent floor ---
    ("Urgent", "Saturation", lambda v: v < 94,  "Oxygen saturation below 94%"),
    ("Urgent", "SBP",        lambda v: v < 100, "Systolic blood pressure below 100"),
    ("Urgent", "HR",         lambda v: v > 110, "Heart rate above 110"),
    ("Urgent", "HR",         lambda v: v < 50,  "Heart rate below 50"),
    ("Urgent", "RR",         lambda v: v > 24,  "Breathing rate above 24"),
    ("Urgent", "RR",         lambda v: v < 10,  "Breathing rate below 10"),
    ("Urgent", "BT",         lambda v: v >= 39.5, "Temperature 39.5 or higher"),
    ("Urgent", "BT",         lambda v: v < 35,  "Temperature below 35"),
    ("Urgent", "Mental",     lambda v: v == 2,  "Responds only to voice"),
]


def _number(value):
    try:
        return None if value in (None, "") else float(value)
    except (TypeError, ValueError):
        return None


def apply_safety_floor(patient, result):
    """patient: dict with the model's field names. result: output of predict_patient.

    Returns a copy of result. If a rule fires for a tier more severe than the
    model's, the tier is raised and the reason is added to the explanation.
    Added keys: model_tier (what the model said), floor_applied (True/False).
    """
    out = dict(result)
    out["model_tier"] = result["tier"]
    out["floor_applied"] = False

    floor, fired = None, []
    for tier, field, test, text in RULES:
        value = _number(patient.get(field))
        if value is None or not test(value):
            continue
        fired.append((tier, f"{text} ({field} = {value:g})"))
        if floor is None or TIER_ORDER[tier] < TIER_ORDER[floor]:
            floor = tier

    if floor is None or TIER_ORDER[result["tier"]] <= TIER_ORDER[floor]:
        return out          # no rule fired, or the model is already at or above the floor

    out["tier"] = floor
    out["floor_applied"] = True
    # show the rules that forced this tier first, so the doctor sees why
    why = [{"text": "Safety rule: " + text, "direction": "toward"}
           for tier, text in fired if tier == floor]
    out["reasons"] = why + list(result["reasons"])
    return out
