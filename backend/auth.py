"""Sign-in checks for the TRAS backend.

The React app logs in with Supabase Auth and sends the resulting token in the
Authorization header. We verify the token, look up the person's role in the
app_user table, and let the endpoint run only if the role is allowed.

Speed: checking a token means two trips to Supabase (the auth service, then the
app_user table). Doing that on every request made every screen slow, so a
successful check is remembered for CACHE_SECONDS.
"""
import time
from functools import wraps

import httpx
from flask import g, jsonify, request

from db import supabase

# If your user_role enum uses different labels, change them here (one place).
ROLE_TRIAGE_NURSE = "triage_nurse"
ROLE_DOCTOR = "doctor"
ROLE_NURSE_IN_CHARGE = "nurse_in_charge"

CACHE_SECONDS = 60          # a removed user could stay valid this long
_cache = {}                 # token -> (valid_until, user)


def _is_network_problem(error):
    """True when the failure is the connection, not the person's sign-in."""
    return (
        isinstance(error, (httpx.HTTPError, ConnectionError, TimeoutError, OSError))
        or "Retryable" in type(error).__name__
    )


def _unavailable():
    return None, (jsonify(error="Cannot reach the sign-in service. Please try again."), 503)


def _identify():
    """Returns (user_dict, None) or (None, (response, status))."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None, (jsonify(error="Please sign in."), 401)
    token = header[len("Bearer "):]

    now = time.monotonic()
    hit = _cache.get(token)
    if hit and hit[0] > now:
        return hit[1], None

    try:
        auth_user = supabase.auth.get_user(token).user
    except Exception as e:
        if _is_network_problem(e):
            return _unavailable()      # a bad connection must not look like an expired session
        auth_user = None
    if auth_user is None:
        return None, (jsonify(error="Your session is invalid or has expired. Please sign in again."), 401)

    try:
        rows = supabase.table("app_user").select("id, full_name, role").eq("id", auth_user.id).execute()
    except Exception as e:
        if _is_network_problem(e):
            return _unavailable()
        raise
    if not rows.data:
        return None, (jsonify(error="This account has no staff profile. Ask an administrator."), 403)

    user = rows.data[0]
    if len(_cache) > 200:              # keep the cache small
        for key in [k for k, v in _cache.items() if v[0] <= now]:
            _cache.pop(key, None)
    _cache[token] = (now + CACHE_SECONDS, user)
    return user, None


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
