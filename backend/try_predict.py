import requests

patient = {
    "sex": 2, "age": 68, "arrival_mode": 2, "injury": 1, "mental": 1,
    "pain": 1, "nrs_pain": 7, "sbp": 90, "dbp": 60, "hr": 120,
    "rr": 24, "bt": 36.8, "saturation": None,
    "chief_complaint": "Ant. chest pain",
}

response = requests.post("http://127.0.0.1:5000/predict", json=patient)
print(response.status_code)
print(response.json())