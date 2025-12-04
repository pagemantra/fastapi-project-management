from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from ..database import get_database
from ..models.user import UserCreate, UserLogin, UserResponse, UserRole, Token
from ..utils.security import get_password_hash, verify_password, create_access_token
from ..utils.dependencies import get_current_active_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register-admin", response_model=UserResponse)
async def register_admin(user: UserCreate):
    """Register the first admin user (only works if no admin exists)"""
    db = get_database()

    # Check if any admin already exists
    existing_admin = await db.users.find_one({"role": UserRole.ADMIN.value})
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin already exists. Please contact existing admin.",
        )

    # Check if email already exists (case-insensitive) - only if email provided
    if user.email:
        existing_user = await db.users.find_one({"email": user.email.lower()})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

    # Check if employee_id already exists
    existing_emp = await db.users.find_one({"employee_id": user.employee_id.upper()})
    if existing_emp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee ID already exists",
        )

    now = datetime.utcnow()
    user_dict = {
        "full_name": user.full_name,
        "employee_id": user.employee_id.upper(),  # Store employee_id in uppercase
        "role": UserRole.ADMIN.value,  # Force admin role
        "phone": user.phone,
        "department": user.department,
        "is_active": True,
        "hashed_password": get_password_hash(user.password),
        "manager_id": None,
        "team_lead_id": None,
        "created_at": now,
        "updated_at": now,
        "created_by": None,
    }

    # Only include email if provided (sparse index allows multiple docs without email field)
    if user.email:
        user_dict["email"] = user.email.lower()

    try:
        result = await db.users.insert_one(user_dict)
    except DuplicateKeyError as e:
        error_msg = str(e)
        if "email" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        elif "employee_id" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee ID already exists",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate entry detected",
            )
    user_dict["id"] = str(result.inserted_id)

    return UserResponse(
        id=user_dict["id"],
        email=user_dict["email"],
        full_name=user_dict["full_name"],
        employee_id=user_dict["employee_id"],
        role=user_dict["role"],
        phone=user_dict["phone"],
        department=user_dict["department"],
        is_active=user_dict["is_active"],
        manager_id=user_dict["manager_id"],
        team_lead_id=user_dict["team_lead_id"],
        created_at=user_dict["created_at"],
        updated_at=user_dict["updated_at"],
    )


@router.post("/login", response_model=Token)
async def login(user_credentials: UserLogin):
    """Login with email or employee_id and get access token"""
    db = get_database()

    # Must provide either email or employee_id
    if not user_credentials.email and not user_credentials.employee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide email or employee ID",
        )

    # Find user by email or employee_id
    user = None
    if user_credentials.employee_id:
        # Login with employee_id (case-insensitive)
        user = await db.users.find_one({"employee_id": user_credentials.employee_id.upper()})
    elif user_credentials.email:
        # Login with email (case-insensitive)
        user = await db.users.find_one({"email": user_credentials.email.lower()})

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not verify_password(user_credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    access_token = create_access_token(
        data={
            "sub": str(user["_id"]),
            "email": user.get("email"),
            "employee_id": user["employee_id"],
            "role": user["role"],
        }
    )

    return Token(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_active_user)):
    """Get current logged-in user details"""
    return UserResponse(
        id=str(current_user["_id"]),
        email=current_user.get("email"),  # Email is optional
        full_name=current_user["full_name"],
        employee_id=current_user["employee_id"],
        role=current_user["role"],
        phone=current_user.get("phone"),
        department=current_user.get("department"),
        is_active=current_user["is_active"],
        manager_id=current_user.get("manager_id"),
        team_lead_id=current_user.get("team_lead_id"),
        created_at=current_user["created_at"],
        updated_at=current_user["updated_at"],
    )
