"""Quick checks for the safety floor. Run from the project root:

    python ml/test_safety_rules.py

No database or model is needed.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import safety_rules
from safety_rules import apply_safety_floor


def model_says(tier):
    return {"tier": tier, "confidence": 0.9, "probabilities": {}, "complaint_group": "other",
            "reasons": [{"text": "x", "direction": "toward"}]}


NORMAL = {"SBP": 120, "HR": 80, "RR": 16, "Saturation": 98, "BT": 37.0, "Mental": 1}

# (description, vitals changed from normal, model's tier, expected tier, floor should fire, Urgent rules on?)
CASES = [
    ("Stable + oxygen 85 -> Critical",         {"Saturation": 85}, "Stable",   "Critical", True, False),
    ("Stable + oxygen 92 -> Urgent",           {"Saturation": 92}, "Stable",   "Urgent",   True, True),
    ("Urgent + systolic BP 80 -> Critical",    {"SBP": 80},        "Urgent",   "Critical", True, False),
    ("Stable + heart rate 140 -> Critical",    {"HR": 140},        "Stable",   "Critical", True, False),
    ("Stable + breathing rate 35 -> Critical", {"RR": 35},         "Stable",   "Critical", True, False),
    ("Stable + unresponsive -> Critical",      {"Mental": 4},      "Stable",   "Critical", True, False),
    ("Stable + responds to voice -> Urgent",   {"Mental": 2},      "Stable",   "Urgent",   True, True),
    ("Stable + temperature 40 -> Urgent",      {"BT": 40.0},       "Stable",   "Urgent",   True, True),
    ("Critical stays Critical (never lowered)", {"Saturation": 92}, "Critical", "Critical", False, False),
    ("Normal vitals leave the model alone",    {},                 "Stable",   "Stable",   False, False),
    ("Normal vitals, model Urgent stays",      {},                 "Urgent",   "Urgent",   False, False),
    ("Urgent rules OFF: oxygen 92 leaves Stable alone", {"Saturation": 92}, "Stable", "Stable", False, False),
    ("Urgent rules OFF: heart rate 117 leaves Stable alone", {"HR": 117}, "Stable", "Stable", False, False),
    ("Missing vitals do not trigger rules",    {"SBP": None, "HR": None, "Saturation": None}, "Stable", "Stable", False, False),
]

failed = 0
for name, change, model_tier, expected, fires, urgent_on in CASES:
    safety_rules.URGENT_FLOOR = urgent_on
    r = apply_safety_floor({**NORMAL, **change}, model_says(model_tier))
    ok = r["tier"] == expected and r["floor_applied"] == fires and r["model_tier"] == model_tier
    if fires and ok:
        ok = r["reasons"][0]["text"].startswith("Safety rule:")
    print(("PASS  " if ok else "FAIL  ") + name)
    failed += not ok

print(f"\n{len(CASES) - failed} passed, {failed} failed")
sys.exit(1 if failed else 0)
