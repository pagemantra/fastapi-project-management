from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime
from typing import List, Optional
from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError
from ..database import get_database
from ..models.user import UserCreate, UserUpdate, UserResponse, UserRole
from ..utils.security import get_password_hash
from ..utils.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/users", tags=["Users"])


def user_to_response(user: dict) -> UserResponse:
    return UserResponse(
        id=str(user["_id"]),
        email=user.get("email"),  # Email is now optional
        full_name=user["full_name"],
        employee_id=user["employee_id"],
        role=user["role"],
        phone=user.get("phone"),
        department=user.get("department"),
        is_active=user["is_active"],
        manager_id=user.get("manager_id"),
        team_lead_id=user.get("team_lead_id"),
        created_at=user["created_at"],
        updated_at=user["updated_at"],
    )


@router.post("/", response_model=UserResponse)
async def create_user(
    user: UserCreate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """
    Create a new user.
    - Admin can create: managers, team leads, associates
    - Manager can create: team leads, associates (under them)
    - Team Lead can create: associates (under them)
    """
    db = get_database()
    creator_role = current_user["role"]

    # Validate role creation permissions
    if creator_role == UserRole.ADMIN.value:
        if user.role == UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot create another admin",
            )
    elif creator_role == UserRole.MANAGER.value:
        if user.role not in [UserRole.TEAM_LEAD, UserRole.ASSOCIATE]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Managers can only create team leads and associates",
            )
        # Set manager_id to current manager
        user.manager_id = str(current_user["_id"])
    elif creator_role == UserRole.TEAM_LEAD.value:
        if user.role != UserRole.ASSOCIATE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Team leads can only create associates",
            )
        # Set team_lead_id to current team lead
        user.team_lead_id = str(current_user["_id"])
        user.manager_id = current_user.get("manager_id")

    # Check if email already exists (case-insensitive) - only if email provided
    if user.email:
        existing_user = await db.users.find_one({"email": user.email.lower()})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

    # Check if employee_id already exists
    existing_emp = await db.users.find_one({"employee_id": user.employee_id})
    if existing_emp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Associate ID already exists",
        )

    # Validate manager_id if provided
    if user.manager_id:
        if not ObjectId.is_valid(user.manager_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid manager ID format",
            )
        manager = await db.users.find_one({
            "_id": ObjectId(user.manager_id),
            "role": UserRole.MANAGER.value
        })
        if not manager:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid manager ID",
            )

    # Validate team_lead_id if provided
    if user.team_lead_id:
        if not ObjectId.is_valid(user.team_lead_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid team lead ID format",
            )
        team_lead = await db.users.find_one({
            "_id": ObjectId(user.team_lead_id),
            "role": UserRole.TEAM_LEAD.value
        })
        if not team_lead:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid team lead ID",
            )

    now = datetime.utcnow()
    user_dict = {
        "full_name": user.full_name,
        "employee_id": user.employee_id,
        "role": user.role.value,
        "phone": user.phone,
        "department": user.department,
        "is_active": user.is_active,
        "hashed_password": get_password_hash(user.password),
        "manager_id": user.manager_id,
        "team_lead_id": user.team_lead_id,
        "created_at": now,
        "updated_at": now,
        "created_by": str(current_user["_id"]),
    }

    # Only include email if provided (sparse index allows multiple docs without email field)
    if user.email:
        user_dict["email"] = user.email.lower()

    try:
        result = await db.users.insert_one(user_dict)
    except DuplicateKeyError as e:
        # Handle duplicate key errors (email or employee_id)
        error_msg = str(e)
        if "email" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        elif "employee_id" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Associate ID already exists",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate entry detected",
            )

    user_dict["_id"] = result.inserted_id

    return user_to_response(user_dict)


@router.get("/", response_model=List[UserResponse])
async def get_users(
    role: Optional[UserRole] = Query(None),
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get users based on role permissions.
    - Admin: sees all users
    - Manager: sees their team leads and associates
    - Team Lead: sees their team members
    - Associate: sees only themselves
    """
    db = get_database()
    query = {}
    user_role = current_user["role"]

    if user_role == UserRole.ADMIN.value:
        pass  # No filter, see all
    elif user_role == UserRole.MANAGER.value:
        query["manager_id"] = str(current_user["_id"])
    elif user_role == UserRole.TEAM_LEAD.value:
        query["team_lead_id"] = str(current_user["_id"])
    else:  # Associate
        query["_id"] = current_user["_id"]

    if role:
        query["role"] = role.value
    if is_active is not None:
        query["is_active"] = is_active

    cursor = db.users.find(query).skip(skip).limit(limit)
    users = await cursor.to_list(length=limit)

    return [user_to_response(user) for user in users]


@router.get("/all-for-dashboard", response_model=List[UserResponse])
async def get_all_users_for_dashboard(
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get all non-admin users for dashboard display (Admin, Manager, Team Lead only)"""
    db = get_database()
    cursor = db.users.find({"role": {"$ne": UserRole.ADMIN.value}}).limit(1000)
    users = await cursor.to_list(length=1000)
    return [user_to_response(user) for user in users]


@router.get("/managers", response_model=List[UserResponse])
async def get_managers(
    current_user: dict = Depends(require_roles([UserRole.ADMIN]))
):
    """Get all managers (Admin only)"""
    db = get_database()
    cursor = db.users.find({"role": UserRole.MANAGER.value, "is_active": True})
    managers = await cursor.to_list(length=100)
    return [user_to_response(m) for m in managers]


@router.get("/team-leads", response_model=List[UserResponse])
async def get_team_leads(
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Get team leads (filtered by manager for managers)"""
    db = get_database()
    query = {"role": UserRole.TEAM_LEAD.value, "is_active": True}

    if current_user["role"] == UserRole.MANAGER.value:
        query["manager_id"] = str(current_user["_id"])

    cursor = db.users.find(query)
    team_leads = await cursor.to_list(length=100)
    return [user_to_response(tl) for tl in team_leads]


@router.get("/employees", response_model=List[UserResponse])
async def get_employees(
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get associates (filtered by hierarchy)"""
    db = get_database()
    query = {"role": UserRole.ASSOCIATE.value, "is_active": True}

    if current_user["role"] == UserRole.MANAGER.value:
        query["manager_id"] = str(current_user["_id"])
    elif current_user["role"] == UserRole.TEAM_LEAD.value:
        query["team_lead_id"] = str(current_user["_id"])

    cursor = db.users.find(query)
    employees = await cursor.to_list(length=100)
    return [user_to_response(e) for e in employees]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get a specific user by ID"""
    db = get_database()

    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check access permissions
    user_role = current_user["role"]
    if user_role == UserRole.ASSOCIATE.value:
        if str(user["_id"]) != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
    elif user_role == UserRole.TEAM_LEAD.value:
        if user.get("team_lead_id") != str(current_user["_id"]) and str(user["_id"]) != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
    elif user_role == UserRole.MANAGER.value:
        if user.get("manager_id") != str(current_user["_id"]) and str(user["_id"]) != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )

    return user_to_response(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Update a user"""
    db = get_database()

    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check update permissions
    user_role = current_user["role"]
    if user_role == UserRole.MANAGER.value:
        if user.get("manager_id") != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only update users under your management",
            )
    elif user_role == UserRole.TEAM_LEAD.value:
        if user.get("team_lead_id") != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only update users in your team",
            )

    update_data = {k: v for k, v in user_update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()

    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_data}
    )

    updated_user = await db.users.find_one({"_id": ObjectId(user_id)})
    return user_to_response(updated_user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_roles([UserRole.ADMIN]))
):
    """Soft delete a user (deactivate) - Admin only"""
    db = get_database()

    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )

    if str(current_user["_id"]) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )

    result = await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return {"message": "User deactivated successfully"}
