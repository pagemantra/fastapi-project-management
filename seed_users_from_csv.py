"""
Seed users from CSV file into MongoDB
Password format: ASSOCIATE_ID@456 (e.g., JSAN220@456)
"""
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

# MongoDB connection
MONGODB_URL = "mongodb+srv://koyalamudikavyasri_db_user:kjibqBlPHwFfIYIS@projectmanagement.x3gqxoe.mongodb.net/?appName=projectmanagement"
DATABASE_NAME = "employee_tracking"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# CSV Data - parsed from the file
users_data = [
    {"name": "Priyadrasani Mohanty", "employee_id": "JSAN220", "role": "employee", "department": "GIS"},
    {"name": "Panish Jain", "employee_id": "JSAN223", "role": "employee", "department": "GIS"},
    {"name": "Nagarchi Shabaz Mahammed", "employee_id": "JSAN230", "role": "employee", "department": "GIS"},
    {"name": "Gouthu Sai Durga", "employee_id": "JSAN234", "role": "employee", "department": "GIS"},
    {"name": "Panabaka Kusumapriya", "employee_id": "JSAN235", "role": "employee", "department": "GIS"},
    {"name": "Komuroju Varun kumar", "employee_id": "JSAN238", "role": "manager", "department": "GIS"},
    {"name": "Kavya Sri Koyalamudi", "employee_id": "JSAN243", "role": "employee", "department": "GIS"},
    {"name": "Chandrakant Pandey", "employee_id": "JSAN249", "role": "employee", "department": "GIS"},
    {"name": "Saumya Srivastava", "employee_id": "JSAN250", "role": "employee", "department": "GIS"},
    {"name": "Menez Tony Fernandes", "employee_id": "JSAN251", "role": "employee", "department": "GIS"},
    {"name": "Voleti Satish", "employee_id": "JSAN252", "role": "admin", "department": "GIS"},
    {"name": "Raghu D", "employee_id": "JSAN254", "role": "employee", "department": "GIS"},
    {"name": "Kolli Padma Kumari", "employee_id": "JSAN255", "role": "employee", "department": "GIS"},
    {"name": "Cheepalathurthi Santosh", "employee_id": "JSAN259", "role": "employee", "department": "GIS"},
    {"name": "Jacob Nada Anthony", "employee_id": "JSAN261", "role": "manager", "department": "GIS"},
    {"name": "Porumamilla Jashnavi", "employee_id": "JSAN264", "role": "employee", "department": "GIS"},
    {"name": "Cherukuri Varun Chaitanya", "employee_id": "JSAN265", "role": "employee", "department": "GIS"},
    {"name": "Mudadla Raghavendra", "employee_id": "JSAN266", "role": "employee", "department": "GIS"},
    {"name": "Madaka Gouri Sankara Rao", "employee_id": "JSAN267", "role": "team_lead", "department": "GIS"},
    {"name": "Garrepelli Vishwas", "employee_id": "JSAN268", "role": "employee", "department": "GIS"},
    {"name": "Thota Srihari", "employee_id": "JSAN269", "role": "employee", "department": "GIS"},
    {"name": "Mkolla Aishwarya", "employee_id": "JSAN276", "role": "employee", "department": "GIS"},
    {"name": "Gollapudi Venkata Pavan Kumar", "employee_id": "JSAN277", "role": "employee", "department": "GIS"},
    {"name": "Mendu Narender Reddy", "employee_id": "JSAN280", "role": "employee", "department": "GIS"},
    {"name": "Sourabh Kumar", "employee_id": "JSAN287", "role": "employee", "department": "GIS"},
    {"name": "Sachin Rajinder Agarwal", "employee_id": "JSAN288", "role": "employee", "department": "GIS"},
    {"name": "Shaik Yaseen", "employee_id": "JSAN290", "role": "employee", "department": "GIS"},
    {"name": "Burlagadda Dhanunjaya Ram Murthy", "employee_id": "JSAN291", "role": "employee", "department": "GIS"},
    {"name": "Kallepalli Venkatesh", "employee_id": "JSAN293", "role": "employee", "department": "GIS"},
    {"name": "S R K S Prasad", "employee_id": "JSAN295", "role": "employee", "department": "GIS"},
    {"name": "Syed Waheed", "employee_id": "JSAN296", "role": "employee", "department": "GIS"},
    {"name": "Feroz Khan", "employee_id": "JSAN298", "role": "employee", "department": "GIS"},
    {"name": "Sandeep Sankineni", "employee_id": "JSAN299", "role": "employee", "department": "GIS"},
    {"name": "Kartheek Nallapati", "employee_id": "JSAN300", "role": "employee", "department": "GIS"},
    {"name": "Patlolu Suryakanth Reddy", "employee_id": "JSAN301", "role": "employee", "department": "GIS"},
    {"name": "Chunchanakota Vijay Kumar Goud", "employee_id": "JSAN304", "role": "employee", "department": "GIS"},
    {"name": "Damerla Pravallika", "employee_id": "JSAN306", "role": "employee", "department": "GIS"},
    {"name": "Kandula Lakshmi", "employee_id": "JSAN307", "role": "employee", "department": "GIS"},
    {"name": "Gajerla Lakshman", "employee_id": "JSAN308", "role": "employee", "department": "GIS"},
    {"name": "Mohd Abdul Mukheem", "employee_id": "JSAN309", "role": "employee", "department": "GIS"},
    {"name": "Pogaku Harshini", "employee_id": "JSAN310", "role": "employee", "department": "GIS"},
    {"name": "Ragolu Naveen Sai Teja", "employee_id": "JSAN311", "role": "employee", "department": "GIS"},
    {"name": "Sindam Rohini", "employee_id": "JSAN312", "role": "employee", "department": "GIS"},
    {"name": "Nayak Naveen Babu", "employee_id": "JSAN313", "role": "employee", "department": "GIS"},
    {"name": "Pattabhi Pavankumar", "employee_id": "JSAN314", "role": "employee", "department": "GIS"},
    {"name": "Nallamothu Navya", "employee_id": "JSAN315", "role": "employee", "department": "GIS"},
    {"name": "Charan Jammula", "employee_id": "JSAN316", "role": "employee", "department": "GIS"},
]

async def seed_users():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    now = datetime.utcnow()

    # First, find or create admin, managers, and team lead to get their IDs
    admin_id = None
    manager_ids = {}
    team_lead_ids = {}

    # Sort users by role priority: admin first, then managers, then team leads, then employees
    role_priority = {"admin": 0, "manager": 1, "team_lead": 2, "employee": 3}
    sorted_users = sorted(users_data, key=lambda x: role_priority.get(x["role"], 99))

    print(f"Seeding {len(sorted_users)} users...")
    print("-" * 50)

    for user_data in sorted_users:
        employee_id = user_data["employee_id"].upper()
        password = f"{employee_id}@456"

        # Check if user already exists
        existing = await db.users.find_one({"employee_id": employee_id})
        if existing:
            print(f"SKIP: {user_data['name']} ({employee_id}) - already exists")
            # Store IDs for hierarchy
            if user_data["role"] == "admin":
                admin_id = str(existing["_id"])
            elif user_data["role"] == "manager":
                manager_ids[employee_id] = str(existing["_id"])
            elif user_data["role"] == "team_lead":
                team_lead_ids[employee_id] = str(existing["_id"])
            continue

        user_doc = {
            # Don't include email field - sparse index requires field to be absent, not null
            "full_name": user_data["name"].strip(),
            "employee_id": employee_id,
            "role": user_data["role"],
            "phone": None,
            "department": user_data["department"],
            "is_active": True,
            "hashed_password": get_password_hash(password),
            "manager_id": None,
            "team_lead_id": None,
            "created_at": now,
            "updated_at": now,
            "created_by": admin_id,
        }

        # Set hierarchy based on role
        if user_data["role"] == "team_lead":
            # Assign to first manager
            if manager_ids:
                user_doc["manager_id"] = list(manager_ids.values())[0]
        elif user_data["role"] == "employee":
            # Assign to first manager and first team lead
            if manager_ids:
                user_doc["manager_id"] = list(manager_ids.values())[0]
            if team_lead_ids:
                user_doc["team_lead_id"] = list(team_lead_ids.values())[0]

        result = await db.users.insert_one(user_doc)

        # Store IDs for hierarchy
        if user_data["role"] == "admin":
            admin_id = str(result.inserted_id)
        elif user_data["role"] == "manager":
            manager_ids[employee_id] = str(result.inserted_id)
        elif user_data["role"] == "team_lead":
            team_lead_ids[employee_id] = str(result.inserted_id)

        print(f"CREATED: {user_data['name']} ({employee_id}) - {user_data['role']} - Password: {password}")

    # Create indexes
    await db.users.create_index("employee_id", unique=True)
    await db.users.create_index("email", unique=True, sparse=True)  # sparse allows multiple nulls

    print("-" * 50)
    print(f"\nSeeding complete!")
    print(f"Admin: {admin_id}")
    print(f"Managers: {list(manager_ids.keys())}")
    print(f"Team Leads: {list(team_lead_ids.keys())}")
    print(f"\nAll passwords are in format: EMPLOYEE_ID@456")
    print(f"Example: JSAN252@456 for admin login")

    client.close()

if __name__ == "__main__":
    asyncio.run(seed_users())
