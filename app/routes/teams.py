from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime
from typing import List, Optional
from bson import ObjectId
from bson.errors import InvalidId
import pytz
from ..database import get_database
from ..models.team import TeamCreate, TeamUpdate, TeamResponse, AddTeamMember
from ..models.user import UserRole
from ..utils.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/teams", tags=["Teams"])

IST = pytz.timezone('Asia/Kolkata')


def team_to_response(team: dict) -> TeamResponse:
    return TeamResponse(
        id=str(team["_id"]),
        name=team["name"],
        description=team.get("description"),
        team_lead_id=team["team_lead_id"],
        manager_id=team["manager_id"],
        members=team.get("members", []),
        is_active=team.get("is_active", True),
        created_at=team["created_at"],
        updated_at=team["updated_at"],
    )


@router.post("/", response_model=TeamResponse)
async def create_team(
    team: TeamCreate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Create a new team.
    - Admin can create teams for any manager
    - Manager can create teams under themselves
    """
    db = get_database()
    user_role = current_user["role"]

    # Validate manager
    if user_role == UserRole.MANAGER.value:
        team.manager_id = str(current_user["_id"])
    else:
        if not ObjectId.is_valid(team.manager_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid manager ID format",
            )
        manager = await db.users.find_one({
            "_id": ObjectId(team.manager_id),
            "role": UserRole.MANAGER.value
        })
        if not manager:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid manager ID",
            )

    # Validate team lead
    if not ObjectId.is_valid(team.team_lead_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team lead ID format",
        )
    team_lead = await db.users.find_one({
        "_id": ObjectId(team.team_lead_id),
        "role": UserRole.TEAM_LEAD.value
    })
    if not team_lead:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team lead ID",
        )

    # If manager creating, ensure team lead is under them
    if user_role == UserRole.MANAGER.value:
        if team_lead.get("manager_id") != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Team lead must be under your management",
            )

    now = datetime.now(IST)
    team_dict = {
        "name": team.name,
        "description": team.description,
        "team_lead_id": team.team_lead_id,
        "manager_id": team.manager_id,
        "members": [],
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.teams.insert_one(team_dict)
    team_dict["_id"] = result.inserted_id

    return team_to_response(team_dict)


@router.get("/", response_model=List[TeamResponse])
async def get_teams(
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get teams based on role permissions.
    - Admin: sees all teams
    - Manager: sees teams under their management
    - Team Lead: sees their own teams
    - Employee: sees their team
    """
    db = get_database()
    query = {}
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role == UserRole.ADMIN.value:
        pass
    elif user_role == UserRole.MANAGER.value:
        query["manager_id"] = user_id
    elif user_role == UserRole.TEAM_LEAD.value:
        query["team_lead_id"] = user_id
    else:  # Employee
        query["members"] = user_id

    if is_active is not None:
        query["is_active"] = is_active

    cursor = db.teams.find(query).skip(skip).limit(limit)
    teams = await cursor.to_list(length=limit)

    return [team_to_response(team) for team in teams]


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get a specific team by ID"""
    db = get_database()

    if not ObjectId.is_valid(team_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team ID format",
        )

    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Check access permissions
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role == UserRole.MANAGER.value:
        if team["manager_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.TEAM_LEAD.value:
        if team["team_lead_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.ASSOCIATE.value:
        if user_id not in team.get("members", []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return team_to_response(team)


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    team_update: TeamUpdate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Update a team"""
    db = get_database()

    if not ObjectId.is_valid(team_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team ID format",
        )

    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Check permissions for managers
    if current_user["role"] == UserRole.MANAGER.value:
        if team["manager_id"] != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only update your own teams",
            )

    update_data = {k: v for k, v in team_update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(IST)

    await db.teams.update_one(
        {"_id": ObjectId(team_id)},
        {"$set": update_data}
    )

    updated_team = await db.teams.find_one({"_id": ObjectId(team_id)})
    return team_to_response(updated_team)


@router.post("/{team_id}/members", response_model=TeamResponse)
async def add_team_member(
    team_id: str,
    member: AddTeamMember,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Add an employee to a team"""
    db = get_database()

    if not ObjectId.is_valid(team_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team ID format",
        )

    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Check permissions
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role == UserRole.MANAGER.value:
        if team["manager_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.TEAM_LEAD.value:
        if team["team_lead_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Validate employee_id format
    if not ObjectId.is_valid(member.employee_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid employee ID format",
        )

    # Validate employee exists and is an employee
    employee = await db.users.find_one({
        "_id": ObjectId(member.employee_id),
        "role": UserRole.ASSOCIATE.value
    })
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid employee ID",
        )

    # Check if already a member
    if member.employee_id in team.get("members", []):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee is already a team member",
        )

    # Add member and update employee's team_lead_id
    await db.teams.update_one(
        {"_id": ObjectId(team_id)},
        {
            "$push": {"members": member.employee_id},
            "$set": {"updated_at": datetime.now(IST)}
        }
    )

    await db.users.update_one(
        {"_id": ObjectId(member.employee_id)},
        {
            "$set": {
                "team_lead_id": team["team_lead_id"],
                "manager_id": team["manager_id"],
                "updated_at": datetime.now(IST)
            }
        }
    )

    updated_team = await db.teams.find_one({"_id": ObjectId(team_id)})
    return team_to_response(updated_team)


@router.delete("/{team_id}/members/{employee_id}", response_model=TeamResponse)
async def remove_team_member(
    team_id: str,
    employee_id: str,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Remove an employee from a team"""
    db = get_database()

    if not ObjectId.is_valid(team_id) or not ObjectId.is_valid(employee_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ID format",
        )

    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Check permissions
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role == UserRole.MANAGER.value:
        if team["manager_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.TEAM_LEAD.value:
        if team["team_lead_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if employee_id not in team.get("members", []):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee is not a team member",
        )

    await db.teams.update_one(
        {"_id": ObjectId(team_id)},
        {
            "$pull": {"members": employee_id},
            "$set": {"updated_at": datetime.now(IST)}
        }
    )

    # Clear employee's team_lead_id
    await db.users.update_one(
        {"_id": ObjectId(employee_id)},
        {
            "$set": {
                "team_lead_id": None,
                "updated_at": datetime.now(IST)
            }
        }
    )

    updated_team = await db.teams.find_one({"_id": ObjectId(team_id)})
    return team_to_response(updated_team)


@router.delete("/{team_id}")
async def delete_team(
    team_id: str,
    current_user: dict = Depends(require_roles([UserRole.ADMIN]))
):
    """Soft delete a team (deactivate) - Admin only"""
    db = get_database()

    if not ObjectId.is_valid(team_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team ID format",
        )

    result = await db.teams.update_one(
        {"_id": ObjectId(team_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(IST)}}
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    return {"message": "Team deactivated successfully"}
