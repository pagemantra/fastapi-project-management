from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, date, timedelta
from typing import List, Optional
from bson import ObjectId
from bson.errors import InvalidId
import uuid
import pytz
from ..database import get_database
from ..models.attendance import (
    TimeSessionResponse, TimeSessionCreate, ClockOut, StartBreak,
    BreakSettingsCreate, BreakSettingsUpdate, BreakSettingsResponse,
    SessionStatus, BreakType, Break, AttendanceSummary
)
from ..models.user import UserRole
from ..utils.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/attendance", tags=["Attendance"])

STANDARD_WORK_HOURS = 8.0
IST = pytz.timezone('Asia/Kolkata')


def calculate_work_hours(login_time: datetime, logout_time: datetime, total_break_minutes: int) -> tuple:
    """Calculate total work hours and overtime"""
    total_minutes = (logout_time - login_time).total_seconds() / 60
    work_minutes = total_minutes - total_break_minutes
    work_hours = max(0, work_minutes / 60)
    overtime_hours = max(0, work_hours - STANDARD_WORK_HOURS)
    return round(work_hours, 2), round(overtime_hours, 2)


def session_to_response(session: dict, employee_name: str = None) -> TimeSessionResponse:
    return TimeSessionResponse(
        id=str(session["_id"]),
        employee_id=session["employee_id"],
        employee_name=employee_name,
        date=session["date"],
        login_time=session["login_time"],
        logout_time=session.get("logout_time"),
        breaks=session.get("breaks", []),
        total_work_hours=session.get("total_work_hours", 0),
        total_break_minutes=session.get("total_break_minutes", 0),
        overtime_hours=session.get("overtime_hours", 0),
        status=session["status"],
        worksheet_submitted=session.get("worksheet_submitted", False),
        current_break_id=session.get("current_break_id"),
        created_at=session["created_at"],
        updated_at=session["updated_at"],
    )


# ============ CLOCK IN/OUT ============

@router.post("/clock-in", response_model=TimeSessionResponse)
async def clock_in(current_user: dict = Depends(get_current_active_user)):
    """Clock in - Start a new time session"""
    db = get_database()
    user_id = str(current_user["_id"])
    today = date.today()

    # Check if already clocked in today
    existing_session = await db.time_sessions.find_one({
        "employee_id": user_id,
        "date": today.isoformat(),
        "status": {"$in": [SessionStatus.ACTIVE.value, SessionStatus.ON_BREAK.value]}
    })

    if existing_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already clocked in for today",
        )

    now = datetime.now(IST)
    session_dict = {
        "employee_id": user_id,
        "date": today.isoformat(),
        "login_time": now,
        "logout_time": None,
        "breaks": [],
        "total_work_hours": 0,
        "total_break_minutes": 0,
        "overtime_hours": 0,
        "status": SessionStatus.ACTIVE.value,
        "worksheet_submitted": False,
        "current_break_id": None,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.time_sessions.insert_one(session_dict)
    session_dict["_id"] = result.inserted_id

    return session_to_response(session_dict)


@router.post("/clock-out", response_model=TimeSessionResponse)
async def clock_out(
    clock_out_data: ClockOut = ClockOut(),
    current_user: dict = Depends(get_current_active_user)
):
    """Clock out - End the current time session"""
    db = get_database()
    user_id = str(current_user["_id"])
    today = date.today()

    session = await db.time_sessions.find_one({
        "employee_id": user_id,
        "date": today.isoformat(),
        "status": {"$in": [SessionStatus.ACTIVE.value, SessionStatus.ON_BREAK.value]}
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active session found for today",
        )

    # Check if on break - end break first
    if session["status"] == SessionStatus.ON_BREAK.value:
        await end_current_break(db, session)
        session = await db.time_sessions.find_one({"_id": session["_id"]})

    # Check if worksheet submitted (unless force logout by admin)
    if not session.get("worksheet_submitted", False) and not clock_out_data.force:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please submit your daily worksheet before clocking out",
        )

    # Only admin can force logout
    if clock_out_data.force and current_user["role"] != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin can force clock out without worksheet",
        )

    now = datetime.now(IST)
    total_break_minutes = sum(b.get("duration_minutes", 0) for b in session.get("breaks", []))
    work_hours, overtime_hours = calculate_work_hours(session["login_time"], now, total_break_minutes)

    await db.time_sessions.update_one(
        {"_id": session["_id"]},
        {
            "$set": {
                "logout_time": now,
                "status": SessionStatus.COMPLETED.value,
                "total_work_hours": work_hours,
                "total_break_minutes": total_break_minutes,
                "overtime_hours": overtime_hours,
                "updated_at": now,
            }
        }
    )

    # Create overtime notification if applicable
    if overtime_hours > 0:
        await create_overtime_notification(db, current_user, overtime_hours)

    updated_session = await db.time_sessions.find_one({"_id": session["_id"]})
    return session_to_response(updated_session)


# ============ BREAKS ============

@router.post("/break/start", response_model=TimeSessionResponse)
async def start_break(
    break_data: StartBreak,
    current_user: dict = Depends(get_current_active_user)
):
    """Start a break"""
    db = get_database()
    user_id = str(current_user["_id"])
    today = date.today()

    session = await db.time_sessions.find_one({
        "employee_id": user_id,
        "date": today.isoformat(),
        "status": SessionStatus.ACTIVE.value
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active session found. Please clock in first.",
        )

    # Check break limits if enforced
    await check_break_limits(db, current_user, session, break_data.break_type)

    now = datetime.now(IST)
    break_id = str(uuid.uuid4())
    new_break = {
        "break_id": break_id,
        "start_time": now,
        "end_time": None,
        "break_type": break_data.break_type.value,
        "duration_minutes": 0,
        "comment": break_data.comment,
    }

    await db.time_sessions.update_one(
        {"_id": session["_id"]},
        {
            "$push": {"breaks": new_break},
            "$set": {
                "status": SessionStatus.ON_BREAK.value,
                "current_break_id": break_id,
                "updated_at": now,
            }
        }
    )

    updated_session = await db.time_sessions.find_one({"_id": session["_id"]})
    return session_to_response(updated_session)


@router.post("/break/end", response_model=TimeSessionResponse)
async def end_break(current_user: dict = Depends(get_current_active_user)):
    """End the current break"""
    db = get_database()
    user_id = str(current_user["_id"])
    today = date.today()

    session = await db.time_sessions.find_one({
        "employee_id": user_id,
        "date": today.isoformat(),
        "status": SessionStatus.ON_BREAK.value
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active break found",
        )

    await end_current_break(db, session)
    updated_session = await db.time_sessions.find_one({"_id": session["_id"]})
    return session_to_response(updated_session)


async def end_current_break(db, session: dict):
    """Helper to end current break"""
    now = datetime.now(IST)
    current_break_id = session.get("current_break_id")

    if not current_break_id:
        return

    breaks = session.get("breaks", [])
    for i, b in enumerate(breaks):
        if b.get("break_id") == current_break_id:
            start_time = datetime.fromisoformat(b["start_time"]) if isinstance(b["start_time"], str) else b["start_time"]
            duration = int((now - start_time).total_seconds() / 60)
            breaks[i]["end_time"] = now
            breaks[i]["duration_minutes"] = duration
            break

    await db.time_sessions.update_one(
        {"_id": session["_id"]},
        {
            "$set": {
                "breaks": breaks,
                "status": SessionStatus.ACTIVE.value,
                "current_break_id": None,
                "updated_at": now,
            }
        }
    )


async def check_break_limits(db, user: dict, session: dict, break_type: BreakType):
    """Check if break limits are exceeded"""
    # Get team for this user
    team = await db.teams.find_one({"members": str(user["_id"])})
    if not team:
        return  # No team, no limits

    settings = await db.break_settings.find_one({"team_id": str(team["_id"])})
    if not settings or not settings.get("enforce_limits", False):
        return  # No settings or not enforced

    current_breaks = session.get("breaks", [])

    # Check max breaks per day
    if settings.get("max_breaks_per_day"):
        if len(current_breaks) >= settings["max_breaks_per_day"]:
            # Create warning notification instead of blocking
            await db.notifications.insert_one({
                "recipient_id": str(user["_id"]),
                "type": "BREAK_LIMIT_WARNING",
                "title": "Break Limit Warning",
                "message": f"You have reached the maximum breaks ({settings['max_breaks_per_day']}) for today.",
                "related_id": str(session["_id"]),
                "is_read": False,
                "created_at": datetime.now(IST),
            })

    # Check total break duration
    if settings.get("max_break_duration_minutes"):
        total_break_minutes = sum(b.get("duration_minutes", 0) for b in current_breaks)
        if total_break_minutes >= settings["max_break_duration_minutes"]:
            await db.notifications.insert_one({
                "recipient_id": str(user["_id"]),
                "type": "BREAK_LIMIT_WARNING",
                "title": "Break Duration Warning",
                "message": f"You have exceeded the total break duration ({settings['max_break_duration_minutes']} minutes) for today.",
                "related_id": str(session["_id"]),
                "is_read": False,
                "created_at": datetime.now(IST),
            })


async def create_overtime_notification(db, user: dict, overtime_hours: float):
    """Create notification for overtime"""
    # Notify the user's manager
    if user.get("manager_id"):
        await db.notifications.insert_one({
            "recipient_id": user["manager_id"],
            "type": "OVERTIME_ALERT",
            "title": "Overtime Alert",
            "message": f"{user['full_name']} worked {overtime_hours:.1f} hours overtime today.",
            "related_id": str(user["_id"]),
            "is_read": False,
            "created_at": datetime.now(IST),
        })


# ============ GET SESSIONS ============

@router.get("/current", response_model=Optional[TimeSessionResponse])
async def get_current_session(current_user: dict = Depends(get_current_active_user)):
    """Get current active session for today"""
    db = get_database()
    user_id = str(current_user["_id"])
    today = date.today()

    session = await db.time_sessions.find_one({
        "employee_id": user_id,
        "date": today.isoformat(),
        "status": {"$in": [SessionStatus.ACTIVE.value, SessionStatus.ON_BREAK.value]}
    })

    if not session:
        return None

    return session_to_response(session)


@router.get("/today-all", response_model=List[TimeSessionResponse])
async def get_all_today_attendance(
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get all attendance sessions for today (filtered by role hierarchy)"""
    db = get_database()
    today = date.today().isoformat()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    query = {"date": today}

    # Role-based filtering - only show team members assigned to this manager/team lead
    if user_role == UserRole.TEAM_LEAD.value:
        # Get team members under this team lead
        team_members = await db.users.find({"team_lead_id": user_id}).to_list(length=1000)
        member_ids = [str(m["_id"]) for m in team_members]
        query["employee_id"] = {"$in": member_ids}
    elif user_role == UserRole.MANAGER.value:
        # Get all employees under this manager (including team leads and their members)
        employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        query["employee_id"] = {"$in": employee_ids}
    # Admin sees all

    cursor = db.time_sessions.find(query).limit(1000)
    sessions = await cursor.to_list(length=1000)

    # Fetch employee names
    employee_ids = list(set(s["employee_id"] for s in sessions))
    employee_cache = {}
    for emp_id in employee_ids:
        if ObjectId.is_valid(emp_id):
            emp = await db.users.find_one({"_id": ObjectId(emp_id)})
            if emp:
                employee_cache[emp_id] = emp.get("full_name", "Unknown")

    return [session_to_response(s, employee_cache.get(s["employee_id"])) for s in sessions]


@router.get("/history", response_model=List[TimeSessionResponse])
async def get_attendance_history(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    employee_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: dict = Depends(get_current_active_user)
):
    """Get attendance history"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    query = {}

    # Role-based filtering
    if user_role == UserRole.ASSOCIATE.value:
        query["employee_id"] = user_id
    elif user_role == UserRole.TEAM_LEAD.value:
        if employee_id:
            # Verify employee is in their team
            employee = await db.users.find_one({"_id": ObjectId(employee_id)})
            if employee and employee.get("team_lead_id") == user_id:
                query["employee_id"] = employee_id
            else:
                query["employee_id"] = user_id
        else:
            # Get all team members
            team_members = await db.users.find({"team_lead_id": user_id}).to_list(length=1000)
            member_ids = [str(m["_id"]) for m in team_members] + [user_id]
            query["employee_id"] = {"$in": member_ids}
    elif user_role == UserRole.MANAGER.value:
        if employee_id:
            query["employee_id"] = employee_id
        else:
            employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
            employee_ids = [str(e["_id"]) for e in employees] + [user_id]
            query["employee_id"] = {"$in": employee_ids}
    else:  # Admin
        if employee_id:
            query["employee_id"] = employee_id

    if start_date:
        query["date"] = {"$gte": start_date.isoformat()}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date.isoformat()
        else:
            query["date"] = {"$lte": end_date.isoformat()}

    cursor = db.time_sessions.find(query).sort("date", -1).skip(skip).limit(limit)
    sessions = await cursor.to_list(length=limit)

    # Fetch employee names for all sessions
    employee_ids = list(set(s["employee_id"] for s in sessions))
    employee_cache = {}
    for emp_id in employee_ids:
        if ObjectId.is_valid(emp_id):
            emp = await db.users.find_one({"_id": ObjectId(emp_id)})
            if emp:
                employee_cache[emp_id] = emp.get("full_name", "Unknown")

    return [session_to_response(s, employee_cache.get(s["employee_id"])) for s in sessions]


# ============ BREAK SETTINGS ============

@router.post("/break-settings", response_model=BreakSettingsResponse)
async def create_break_settings(
    settings: BreakSettingsCreate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Create break settings for a team"""
    db = get_database()

    # Verify team exists
    team = await db.teams.find_one({"_id": ObjectId(settings.team_id)})
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Check if manager owns this team
    if current_user["role"] == UserRole.MANAGER.value:
        if team["manager_id"] != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only set break settings for your own teams",
            )

    # Check if settings already exist
    existing = await db.break_settings.find_one({"team_id": settings.team_id})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Break settings already exist for this team. Use PUT to update.",
        )

    now = datetime.now(IST)
    settings_dict = {
        "team_id": settings.team_id,
        "max_breaks_per_day": settings.max_breaks_per_day,
        "max_break_duration_minutes": settings.max_break_duration_minutes,
        "lunch_break_duration": settings.lunch_break_duration,
        "short_break_duration": settings.short_break_duration,
        "enforce_limits": settings.enforce_limits,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.break_settings.insert_one(settings_dict)
    settings_dict["_id"] = result.inserted_id

    return BreakSettingsResponse(
        id=str(settings_dict["_id"]),
        team_id=settings_dict["team_id"],
        max_breaks_per_day=settings_dict["max_breaks_per_day"],
        max_break_duration_minutes=settings_dict["max_break_duration_minutes"],
        lunch_break_duration=settings_dict["lunch_break_duration"],
        short_break_duration=settings_dict["short_break_duration"],
        enforce_limits=settings_dict["enforce_limits"],
        created_at=settings_dict["created_at"],
        updated_at=settings_dict["updated_at"],
    )


@router.get("/break-settings/{team_id}", response_model=Optional[BreakSettingsResponse])
async def get_break_settings(
    team_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get break settings for a team"""
    db = get_database()

    settings = await db.break_settings.find_one({"team_id": team_id})
    if not settings:
        return None

    return BreakSettingsResponse(
        id=str(settings["_id"]),
        team_id=settings["team_id"],
        max_breaks_per_day=settings.get("max_breaks_per_day"),
        max_break_duration_minutes=settings.get("max_break_duration_minutes"),
        lunch_break_duration=settings.get("lunch_break_duration"),
        short_break_duration=settings.get("short_break_duration"),
        enforce_limits=settings.get("enforce_limits", False),
        created_at=settings["created_at"],
        updated_at=settings["updated_at"],
    )


@router.put("/break-settings/{team_id}", response_model=BreakSettingsResponse)
async def update_break_settings(
    team_id: str,
    settings_update: BreakSettingsUpdate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Update break settings for a team"""
    db = get_database()

    settings = await db.break_settings.find_one({"team_id": team_id})
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Break settings not found for this team",
        )

    # Check if manager owns this team
    if current_user["role"] == UserRole.MANAGER.value:
        team = await db.teams.find_one({"_id": ObjectId(team_id)})
        if team and team["manager_id"] != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only update break settings for your own teams",
            )

    update_data = {k: v for k, v in settings_update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(IST)

    await db.break_settings.update_one(
        {"team_id": team_id},
        {"$set": update_data}
    )

    updated = await db.break_settings.find_one({"team_id": team_id})
    return BreakSettingsResponse(
        id=str(updated["_id"]),
        team_id=updated["team_id"],
        max_breaks_per_day=updated.get("max_breaks_per_day"),
        max_break_duration_minutes=updated.get("max_break_duration_minutes"),
        lunch_break_duration=updated.get("lunch_break_duration"),
        short_break_duration=updated.get("short_break_duration"),
        enforce_limits=updated.get("enforce_limits", False),
        created_at=updated["created_at"],
        updated_at=updated["updated_at"],
    )
