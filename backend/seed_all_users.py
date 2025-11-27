"""
Comprehensive seed script to create all user types with hierarchical relationships.
Creates: 1 Admin, 2 Managers, 4 Team Leads, 8 Employees, and sample teams.

Run: python seed_all_users.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone

# Configuration
MONGODB_URL = "mongodb+srv://koyalamudikavyasri_db_user:kjibqBlPHwFfIYIS@projectmanagement.x3gqxoe.mongodb.net/?appName=projectmanagement"
DATABASE_NAME = "employee_tracking"

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def now():
    return datetime.now(timezone.utc)


async def clear_database(db):
    """Clear all collections for fresh seeding."""
    print("Clearing existing data...")
    await db.users.delete_many({})
    await db.teams.delete_many({})
    await db.tasks.delete_many({})
    await db.worksheets.delete_many({})
    await db.forms.delete_many({})
    await db.notifications.delete_many({})
    await db.time_sessions.delete_many({})
    await db.break_settings.delete_many({})
    print("Database cleared.")


async def seed_all():
    """Create all users with proper hierarchy."""
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    try:
        await client.admin.command('ping')
        print("Connected to MongoDB successfully!\n")
    except Exception as e:
        print(f"Failed to connect: {e}")
        client.close()
        return

    # Clear existing data
    await clear_database(db)

    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("employee_id", unique=True)
    await db.teams.create_index("name", unique=True)

    # ============ ADMIN ============
    print("Creating Admin...")
    admin = {
        "email": "admin@company.com",
        "employee_id": "ADMIN001",
        "hashed_password": hash_password("admin123"),
        "full_name": "System Administrator",
        "role": "admin",
        "phone": "+1-555-0100",
        "department": "Administration",
        "is_active": True,
        "manager_id": None,
        "team_lead_id": None,
        "created_at": now(),
        "updated_at": now(),
    }
    admin_result = await db.users.insert_one(admin)
    admin_id = str(admin_result.inserted_id)
    print(f"  Admin: admin@company.com / admin123")

    # ============ MANAGERS ============
    print("\nCreating Managers...")
    managers_data = [
        {
            "email": "manager1@company.com",
            "employee_id": "MGR001",
            "full_name": "John Manager",
            "phone": "+1-555-0101",
            "department": "Engineering",
        },
        {
            "email": "manager2@company.com",
            "employee_id": "MGR002",
            "full_name": "Sarah Manager",
            "phone": "+1-555-0102",
            "department": "Operations",
        },
    ]

    manager_ids = []
    for m in managers_data:
        manager = {
            **m,
            "hashed_password": hash_password("manager123"),
            "role": "manager",
            "is_active": True,
            "manager_id": None,
            "team_lead_id": None,
            "created_at": now(),
            "updated_at": now(),
            "created_by": admin_id,
        }
        result = await db.users.insert_one(manager)
        manager_ids.append(str(result.inserted_id))
        print(f"  Manager: {m['email']} / manager123")

    # ============ TEAM LEADS ============
    print("\nCreating Team Leads...")
    team_leads_data = [
        # Under Manager 1 (Engineering)
        {
            "email": "teamlead1@company.com",
            "employee_id": "TL001",
            "full_name": "Mike TeamLead",
            "phone": "+1-555-0111",
            "department": "Frontend",
            "manager_id": manager_ids[0],
        },
        {
            "email": "teamlead2@company.com",
            "employee_id": "TL002",
            "full_name": "Lisa TeamLead",
            "phone": "+1-555-0112",
            "department": "Backend",
            "manager_id": manager_ids[0],
        },
        # Under Manager 2 (Operations)
        {
            "email": "teamlead3@company.com",
            "employee_id": "TL003",
            "full_name": "David TeamLead",
            "phone": "+1-555-0113",
            "department": "Support",
            "manager_id": manager_ids[1],
        },
        {
            "email": "teamlead4@company.com",
            "employee_id": "TL004",
            "full_name": "Emma TeamLead",
            "phone": "+1-555-0114",
            "department": "QA",
            "manager_id": manager_ids[1],
        },
    ]

    team_lead_ids = []
    for tl in team_leads_data:
        team_lead = {
            "email": tl["email"],
            "employee_id": tl["employee_id"],
            "full_name": tl["full_name"],
            "phone": tl["phone"],
            "department": tl["department"],
            "hashed_password": hash_password("teamlead123"),
            "role": "team_lead",
            "is_active": True,
            "manager_id": tl["manager_id"],
            "team_lead_id": None,
            "created_at": now(),
            "updated_at": now(),
            "created_by": admin_id,
        }
        result = await db.users.insert_one(team_lead)
        team_lead_ids.append(str(result.inserted_id))
        print(f"  Team Lead: {tl['email']} / teamlead123")

    # ============ EMPLOYEES ============
    print("\nCreating Employees...")
    employees_data = [
        # Team 1 - Frontend (TL1)
        {"email": "emp1@company.com", "employee_id": "EMP001", "full_name": "Alice Employee", "department": "Frontend", "team_lead_id": team_lead_ids[0], "manager_id": manager_ids[0]},
        {"email": "emp2@company.com", "employee_id": "EMP002", "full_name": "Bob Employee", "department": "Frontend", "team_lead_id": team_lead_ids[0], "manager_id": manager_ids[0]},
        # Team 2 - Backend (TL2)
        {"email": "emp3@company.com", "employee_id": "EMP003", "full_name": "Charlie Employee", "department": "Backend", "team_lead_id": team_lead_ids[1], "manager_id": manager_ids[0]},
        {"email": "emp4@company.com", "employee_id": "EMP004", "full_name": "Diana Employee", "department": "Backend", "team_lead_id": team_lead_ids[1], "manager_id": manager_ids[0]},
        # Team 3 - Support (TL3)
        {"email": "emp5@company.com", "employee_id": "EMP005", "full_name": "Eve Employee", "department": "Support", "team_lead_id": team_lead_ids[2], "manager_id": manager_ids[1]},
        {"email": "emp6@company.com", "employee_id": "EMP006", "full_name": "Frank Employee", "department": "Support", "team_lead_id": team_lead_ids[2], "manager_id": manager_ids[1]},
        # Team 4 - QA (TL4)
        {"email": "emp7@company.com", "employee_id": "EMP007", "full_name": "Grace Employee", "department": "QA", "team_lead_id": team_lead_ids[3], "manager_id": manager_ids[1]},
        {"email": "emp8@company.com", "employee_id": "EMP008", "full_name": "Henry Employee", "department": "QA", "team_lead_id": team_lead_ids[3], "manager_id": manager_ids[1]},
    ]

    employee_ids = []
    for emp in employees_data:
        employee = {
            "email": emp["email"],
            "employee_id": emp["employee_id"],
            "full_name": emp["full_name"],
            "phone": f"+1-555-02{emp['employee_id'][-2:]}",
            "department": emp["department"],
            "hashed_password": hash_password("employee123"),
            "role": "employee",
            "is_active": True,
            "manager_id": emp["manager_id"],
            "team_lead_id": emp["team_lead_id"],
            "created_at": now(),
            "updated_at": now(),
            "created_by": admin_id,
        }
        result = await db.users.insert_one(employee)
        employee_ids.append(str(result.inserted_id))
        print(f"  Employee: {emp['email']} / employee123")

    # ============ TEAMS ============
    print("\nCreating Teams...")
    teams_data = [
        {"name": "Frontend Team", "description": "Frontend development team", "team_lead_id": team_lead_ids[0], "manager_id": manager_ids[0], "member_ids": [employee_ids[0], employee_ids[1]]},
        {"name": "Backend Team", "description": "Backend development team", "team_lead_id": team_lead_ids[1], "manager_id": manager_ids[0], "member_ids": [employee_ids[2], employee_ids[3]]},
        {"name": "Support Team", "description": "Customer support team", "team_lead_id": team_lead_ids[2], "manager_id": manager_ids[1], "member_ids": [employee_ids[4], employee_ids[5]]},
        {"name": "QA Team", "description": "Quality assurance team", "team_lead_id": team_lead_ids[3], "manager_id": manager_ids[1], "member_ids": [employee_ids[6], employee_ids[7]]},
    ]

    for team in teams_data:
        team_doc = {
            **team,
            "is_active": True,
            "created_at": now(),
            "updated_at": now(),
            "created_by": admin_id,
        }
        await db.teams.insert_one(team_doc)
        print(f"  Team: {team['name']}")

    # ============ SUMMARY ============
    print("\n" + "="*60)
    print("SEEDING COMPLETE!")
    print("="*60)
    print("\nUser Credentials (all passwords work with any role):")
    print("-"*60)
    print("| Role       | Email                  | Password     |")
    print("-"*60)
    print("| Admin      | admin@company.com      | admin123     |")
    print("| Manager    | manager1@company.com   | manager123   |")
    print("| Manager    | manager2@company.com   | manager123   |")
    print("| Team Lead  | teamlead1@company.com  | teamlead123  |")
    print("| Team Lead  | teamlead2@company.com  | teamlead123  |")
    print("| Team Lead  | teamlead3@company.com  | teamlead123  |")
    print("| Team Lead  | teamlead4@company.com  | teamlead123  |")
    print("| Employee   | emp1@company.com       | employee123  |")
    print("| Employee   | emp2@company.com       | employee123  |")
    print("| Employee   | emp3@company.com       | employee123  |")
    print("| Employee   | emp4@company.com       | employee123  |")
    print("| Employee   | emp5@company.com       | employee123  |")
    print("| Employee   | emp6@company.com       | employee123  |")
    print("| Employee   | emp7@company.com       | employee123  |")
    print("| Employee   | emp8@company.com       | employee123  |")
    print("-"*60)
    print("\nHierarchy:")
    print("  Admin")
    print("  ├── Manager 1 (Engineering)")
    print("  │   ├── Team Lead 1 (Frontend)")
    print("  │   │   ├── Employee 1")
    print("  │   │   └── Employee 2")
    print("  │   └── Team Lead 2 (Backend)")
    print("  │       ├── Employee 3")
    print("  │       └── Employee 4")
    print("  └── Manager 2 (Operations)")
    print("      ├── Team Lead 3 (Support)")
    print("      │   ├── Employee 5")
    print("      │   └── Employee 6")
    print("      └── Team Lead 4 (QA)")
    print("          ├── Employee 7")
    print("          └── Employee 8")
    print()

    client.close()


if __name__ == "__main__":
    asyncio.run(seed_all())
