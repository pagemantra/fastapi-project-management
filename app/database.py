from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client: AsyncIOMotorClient = None
db = None


async def connect_to_mongo():
    global client, db
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]

    # Create indexes - handle existing indexes gracefully
    try:
        # Drop old email index if it exists (non-sparse version)
        await db.users.drop_index("email_1")
    except Exception:
        pass  # Index might not exist

    # Create sparse unique index for email (allows multiple null values)
    await db.users.create_index("email", unique=True, sparse=True, name="email_sparse")
    await db.users.create_index("employee_id", unique=True)

    print("Connected to MongoDB")


async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("Closed MongoDB connection")


def get_database():
    return db
