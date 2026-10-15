from db import supabase

result = supabase.table("room").select("*").order("id").execute()

print(f"Found {len(result.data)} rooms:")
for room in result.data:
    print(f"  {room['id']}: {room['name']} ({room['room_type']}) - {room['status']}")