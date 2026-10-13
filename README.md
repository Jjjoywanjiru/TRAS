# TRAS: ML-Assisted Emergency Department Triage and Resource Allocation System

Advisory decision-support system that predicts emergency patient severity from
triage vitals, prioritises the waiting queue for doctors, and recommends
examination rooms to the nurse in charge.
Course project, SWE3090A, Fall 2026.

## Roles
- Triage Nurse: enters vitals
- Doctor: reviews and confirms predicted severity
- Nurse in Charge: confirms room allocations and manages rooms

## Structure
- frontend/ : React web app
- backend/ : Flask API (model inference, explanations, room allocation)
- ml/ : data preparation and model training
- db/ : Supabase (PostgreSQL) schema and migrations
- docs/ : proposal, diagrams, UI designs

## Design
Figma: [paste link here]

## Data
Only anonymised, public or synthetic data is used. No datasets, keys or
credentials are stored in this repository.

## Status
Work in progress.
