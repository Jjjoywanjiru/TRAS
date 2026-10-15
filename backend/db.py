import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# Read SUPABASE_URL and SUPABASE_KEY from the .env file at the repo root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY in the .env file")

supabase = create_client(url, key)