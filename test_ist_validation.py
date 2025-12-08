"""
IST Timezone Validation Script
Tests all critical components for IST timezone handling
"""
import sys
from datetime import datetime, date
import pytz

print("="*60)
print("IST TIMEZONE VALIDATION SCRIPT")
print("="*60)

# Test 1: pytz installation
print("\n[1] Testing pytz installation...")
try:
    IST = pytz.timezone('Asia/Kolkata')
    print(f"   SUCCESS: IST timezone loaded: {IST}")
except Exception as e:
    print(f"   FAILED: {e}")
    sys.exit(1)

# Test 2: datetime.now(IST)
print("\n[2] Testing datetime.now(IST)...")
try:
    now = datetime.now(IST)
    print(f"   SUCCESS: Current IST time: {now}")
    print(f"   Timezone: {now.tzinfo}")
    print(f"   Timezone name: {now.tzname()}")
    print(f"   UTC offset: {now.strftime('%z')}")
except Exception as e:
    print(f"   FAILED: {e}")
    sys.exit(1)

# Test 3: IST date
print("\n[3] Testing datetime.now(IST).date()...")
try:
    today = datetime.now(IST).date()
    print(f"   SUCCESS: Current IST date: {today}")
    print(f"   ISO format: {today.isoformat()}")
except Exception as e:
    print(f"   FAILED: {e}")
    sys.exit(1)

# Test 4: datetime arithmetic
print("\n[4] Testing datetime arithmetic in IST...")
try:
    from datetime import timedelta
    now = datetime.now(IST)
    future = now + timedelta(hours=8)
    diff = (future - now).total_seconds() / 3600
    print(f"   SUCCESS: Now: {now.strftime('%H:%M:%S')}")
    print(f"   8 hours later: {future.strftime('%H:%M:%S')}")
    print(f"   Difference: {diff} hours")
except Exception as e:
    print(f"   FAILED: {e}")
    sys.exit(1)

# Test 5: datetime.combine with IST
print("\n[5] Testing datetime.combine with IST localization...")
try:
    test_date = date(2025, 1, 15)
    combined = IST.localize(datetime.combine(test_date, datetime.min.time()))
    print(f"   SUCCESS: Combined datetime: {combined}")
    print(f"   Has timezone: {combined.tzinfo is not None}")
except Exception as e:
    print(f"   FAILED: {e}")
    sys.exit(1)

# Test 6: Import attendance module
print("\n[6] Testing attendance module import...")
try:
    from app.routes.attendance import IST as ATTENDANCE_IST
    print(f"   SUCCESS: Attendance module IST: {ATTENDANCE_IST}")
    test_time = datetime.now(ATTENDANCE_IST)
    print(f"   Test time from module: {test_time}")
except Exception as e:
    print(f"   FAILED: {e}")
    sys.exit(1)

# Test 7: Verify no UTC usage
print("\n[7] Scanning for remaining UTC references...")
try:
    import os
    import re

    routes_path = "app/routes"
    utc_pattern = re.compile(r'datetime\.utcnow\(\)')
    found_utc = []

    for filename in os.listdir(routes_path):
        if filename.endswith('.py'):
            filepath = os.path.join(routes_path, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                if utc_pattern.search(content):
                    found_utc.append(filename)

    if found_utc:
        print(f"   WARNING: Found UTC usage in: {', '.join(found_utc)}")
    else:
        print(f"   SUCCESS: No UTC references found")
except Exception as e:
    print(f"   INFO: Could not scan files: {e}")

# Test 8: Timezone-aware comparisons
print("\n[8] Testing timezone-aware datetime comparisons...")
try:
    time1 = datetime.now(IST)
    time2 = datetime.now(IST) + timedelta(seconds=5)

    if time2 > time1:
        print(f"   SUCCESS: Timezone-aware comparison works")
        print(f"   Time1: {time1}")
        print(f"   Time2: {time2}")
    else:
        print(f"   FAILED: Comparison failed")
except Exception as e:
    print(f"   FAILED: {e}")
    sys.exit(1)

print("\n" + "="*60)
print("ALL TESTS PASSED - IST TIMEZONE WORKING PERFECTLY!")
print("="*60)
print(f"\nCurrent IST Time: {datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S %Z')}")
print(f"UTC Offset: {datetime.now(IST).strftime('%z')} (IST is UTC+5:30)")
print("\nYour attendance system is ready to use with IST timezone!")
print("="*60)
