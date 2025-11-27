"""
Script to seed the initial admin user.
Run this after setting up the database to create the default admin account.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime

# Configuration - uses the same connection string as the app
MONGODB_URL = "mongodb+srv://koyalamudikavyasri_db_user:kjibqBlPHwFfIYIS@projectmanagement.x3gqxoe.mongodb.net/?appName=projectmanagement"
DATABASE_NAME = "employee_tracking"

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed_admin():
    """Create the initial admin user if it doesn't exist."""
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    try:
        # Test connection
        await client.admin.command('ping')
        print("Connected to MongoDB successfully!")
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        print("\nPlease check your MongoDB connection string and credentials.")
        client.close()
        return

    # Check if admin already exists
    existing_admin = await db.users.find_one({"role": "admin"})
    if existing_admin:
        print(f"Admin user already exists: {existing_admin['email']}")
        client.close()
        return

    # Create admin user
    admin_user = {
        "email": "admin@company.com",
        "employee_id": "ADMIN001",
        "hashed_password": pwd_context.hash("admin123"),
        "full_name": "System Administrator",
        "role": "admin",
        "phone": None,
        "department": "Administration",
        "is_active": True,
        "manager_id": None,
        "team_lead_id": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = await db.users.insert_one(admin_user)
    print(f"Admin user created successfully!")
    print(f"  Email: admin@company.com")
    print(f"  Password: admin123")
    print(f"  ID: {result.inserted_id}")

    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("employee_id", unique=True)
    print("Database indexes created.")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed_admin())
