import asyncio
from datetime import datetime, date
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = 'mongodb+srv://koyalamudikavyasri_db_user:kjibqBlPHwFfIYIS@projectmanagement.x3gqxoe.mongodb.net/?appName=projectmanagement'
DATABASE_NAME = 'employee_tracking'

async def main():
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    print("Connected! Running tests...")
    print()
    print('=' * 80)
    print('ATTENDANCE API DATABASE TEST')
    print('=' * 80)
    print()
    
    today = date.today().isoformat()
    sessions = await db.time_sessions.find({'date': today}).to_list(length=10)
    print(f'Found {len(sessions)} sessions for today ({today})')
    
    if sessions:
        print('\nFirst session details:')
        s = sessions[0]
        for k, v in s.items():
            print(f'  {k}: {type(v).__name__} = {str(v)[:80]}')
    
    all_sessions = await db.time_sessions.find({}).to_list(length=None)
    print(f'\nTotal sessions: {len(all_sessions)}')
    
    client.close()

asyncio.run(main())
