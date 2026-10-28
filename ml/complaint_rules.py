"""Chief-complaint grouping shared by the notebook (training) and the app (prediction).

Keep this the ONLY copy of the rules. If you change it, retrain the model.
"""
import re

# First matching rule wins, so keep the order.
RULES = [
    ("chest_pain", r"chest|palpitation|angina|heart ?burn|heart (racing|pain|attack)|racing heart"),
    ("abdominal_pain", r"abd|epigast|stomach|flank|rlq|llq|ruq|luq|groin"),
    ("breathing", r"dyspn|shortness|\bsob\b|short of breath|can'?t breathe|cannot breathe|difficulty breathing|difficult breathing|cough|breath|wheez|hemoptysis|hyperventil"),
    ("neuro", r"dizz|vertigo|mental|conscious|syncope|seizure|convuls|\bfits?\b|dysarthria|weakness|palsy|paresis|hemipar|\bloc\b|amnesia|blurred|vision|numb|stroke|paralys|aphasia|confus|drows|faint|passed out|collaps|sezure|se[iz]+ure|delirium|involuntary|hypoglyc"),
    ("fever", r"fever|chill"),
    ("skin_ent_urinary_psych", r"rash|urticar|itch|epistaxis|\bnose|throat|\bears?\b|earache|hearing|dysuria|urin|\bvoid|hematuria|anxiety|suicid|psych|agitat|violence|myalgia|\bcpr\b|ascites|catheter|\beye|eyelid|\bfb\b|foreign body|otalgia|eczema|cellulitis|skin defect|oligur|intoxicat|alcohol|drunk"),
    ("headache", r"headache|head ache|^ha$"),
    ("bleeding_gi", r"hematem|melena|hematochezia|bloody|bleed|vomit|diarrh|nausea|constipat|spotting"),
    ("injury_wound", r"wound|laceration|injur|trauma|\bfall|fracture|burn|\bbite|contusion|sprain|swelling|\bcut\b|abrasion|accident|\blac\b|\blac\."),
    ("pain_other", r"pain|ache"),
    ("unreadable", r"^[?\s]+$"),
]


def group_complaint(text):
    text = str(text or "").lower().strip()
    for name, pattern in RULES:
        if re.search(pattern, text):
            return name
    return "other"