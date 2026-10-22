"""Sign-in checks for the TRAS backend.

The React app logs in with Supabase Auth and sends the resulting token in the
Authorization header. We verify the token, look up the person's role in the
app_user table, and let the endpoint run only if the role is allowed.
"""
from functools import wraps

from flask import g, jsonify, request

from db import supabase

# If your user_role enum uses different labels, change them here (one place).
ROLE_TRIAGE_NURSE = "triage_nurse"
ROLE_DOCTOR = "doctor"
ROLE_NURSE_IN_CHARGE = "nurse_in_charge"


def _identify():
    """Returns (user_dict, None) or (None, (response, status))."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None, (jsonify(error="Please sign in."), 401)
    token = header[len("Bearer "):]
    try:
        auth_user = supabase.auth.get_user(token).user
    except Exception:
        auth_user = None
    if auth_user is None:
        return None, (jsonify(error="Your session is invalid or has expired. Please sign in again."), 401)

    rows = supabase.table("app_user").select("id, full_name, role").eq("id", auth_user.id).execute()
    if not rows.data:
        return None, (jsonify(error="This account has no staff profile. Ask an administrator."), 403)
    return rows.data[0], None


def login_required(fn):
    """Any signed-in staff member."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user, problem = _identify()
        if problem:
            return problem
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def roles_required(*allowed):
    """Only the listed roles."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user, problem = _identify()
            if problem:
                return problem
            if user["role"] not in allowed:
                return jsonify(error="Your role is not allowed to do this."), 403
            g.user = user
            return fn(*args, **kwargs)
        return wrapper
    return decorator