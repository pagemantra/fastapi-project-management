from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime
from typing import List, Optional
from bson import ObjectId
from bson.errors import InvalidId
import uuid
from ..database import get_database
from ..models.form import (
    FormCreate, FormUpdate, FormResponse, FormField, FormAssignment,
    FieldType, FieldValidation
)
from ..models.user import UserRole
from ..utils.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/forms", tags=["Forms"])


def form_to_response(form: dict) -> FormResponse:
    # Convert fields back to FormField objects
    fields = []
    for f in form.get("fields", []):
        validation = None
        if f.get("validation"):
            validation = FieldValidation(**f["validation"])

        field = FormField(
            field_id=f["field_id"],
            field_type=f["field_type"],
            label=f["label"],
            placeholder=f.get("placeholder"),
            required=f.get("required", False),
            options=f.get("options"),
            validation=validation,
            default_value=f.get("default_value"),
            order=f.get("order", 0),
            conditional=f.get("conditional"),
            help_text=f.get("help_text"),
        )
        fields.append(field)

    return FormResponse(
        id=str(form["_id"]),
        name=form["name"],
        description=form.get("description"),
        fields=fields,
        created_by=form["created_by"],
        assigned_teams=form.get("assigned_teams", []),
        is_active=form.get("is_active", True),
        version=form.get("version", 1),
        created_at=form["created_at"],
        updated_at=form["updated_at"],
    )


@router.post("/", response_model=FormResponse)
async def create_form(
    form: FormCreate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Create a new dynamic form"""
    db = get_database()
    user_id = str(current_user["_id"])

    # Generate field IDs if not provided
    for field in form.fields:
        if not field.field_id:
            field.field_id = str(uuid.uuid4())

    # Validate assigned teams if manager
    if current_user["role"] == UserRole.MANAGER.value and form.assigned_teams:
        for team_id in form.assigned_teams:
            team = await db.teams.find_one({"_id": ObjectId(team_id)})
            if not team or team["manager_id"] != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Team {team_id} is not under your management",
                )

    now = datetime.utcnow()
    form_dict = {
        "name": form.name,
        "description": form.description,
        "fields": [f.model_dump() for f in form.fields],
        "created_by": user_id,
        "assigned_teams": form.assigned_teams,
        "is_active": True,
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.forms.insert_one(form_dict)
    form_dict["_id"] = result.inserted_id

    return form_to_response(form_dict)


@router.get("/", response_model=List[FormResponse])
async def get_forms(
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user)
):
    """Get forms based on role"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])
    query = {}

    if user_role == UserRole.ADMIN.value:
        pass  # See all forms
    elif user_role == UserRole.MANAGER.value:
        # See forms created by them or assigned to their teams
        my_teams = await db.teams.find({"manager_id": user_id}).to_list(length=100)
        team_ids = [str(t["_id"]) for t in my_teams]
        query["$or"] = [
            {"created_by": user_id},
            {"assigned_teams": {"$in": team_ids}}
        ]
    elif user_role == UserRole.TEAM_LEAD.value:
        # See forms assigned to their team
        my_team = await db.teams.find_one({"team_lead_id": user_id})
        if my_team:
            query["assigned_teams"] = str(my_team["_id"])
        else:
            query["_id"] = None  # No forms
    else:  # Employee
        # See forms assigned to their team
        teams = await db.teams.find({"members": user_id}).to_list(length=10)
        if teams:
            team_ids = [str(t["_id"]) for t in teams]
            query["assigned_teams"] = {"$in": team_ids}
        else:
            query["_id"] = None

    if is_active is not None:
        query["is_active"] = is_active

    cursor = db.forms.find(query).sort("created_at", -1).skip(skip).limit(limit)
    forms = await cursor.to_list(length=limit)

    return [form_to_response(f) for f in forms]


@router.get("/team/{team_id}", response_model=List[FormResponse])
async def get_team_forms(
    team_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get forms assigned to a specific team"""
    db = get_database()

    # Verify team access
    team = await db.teams.find_one({"_id": ObjectId(team_id)})
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    # Check access
    if user_role == UserRole.ASSOCIATE.value:
        if user_id not in team.get("members", []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.TEAM_LEAD.value:
        if team["team_lead_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.MANAGER.value:
        if team["manager_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    cursor = db.forms.find({
        "assigned_teams": team_id,
        "is_active": True
    })
    forms = await cursor.to_list(length=100)

    return [form_to_response(f) for f in forms]


@router.get("/{form_id}", response_model=FormResponse)
async def get_form(
    form_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get a specific form"""
    db = get_database()

    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format",
        )

    form = await db.forms.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Check access
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role not in [UserRole.ADMIN.value, UserRole.MANAGER.value]:
        # Check if user has access through team
        user_teams = await db.teams.find({
            "$or": [
                {"members": user_id},
                {"team_lead_id": user_id}
            ]
        }).to_list(length=10)
        user_team_ids = [str(t["_id"]) for t in user_teams]

        has_access = any(tid in form.get("assigned_teams", []) for tid in user_team_ids)
        if not has_access:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return form_to_response(form)


@router.put("/{form_id}", response_model=FormResponse)
async def update_form(
    form_id: str,
    form_update: FormUpdate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Update a form"""
    db = get_database()

    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format",
        )

    form = await db.forms.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Check ownership for managers
    if current_user["role"] == UserRole.MANAGER.value:
        if form["created_by"] != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only update forms you created",
            )

    update_data = {}
    if form_update.name is not None:
        update_data["name"] = form_update.name
    if form_update.description is not None:
        update_data["description"] = form_update.description
    if form_update.fields is not None:
        update_data["fields"] = [f.model_dump() for f in form_update.fields]
        update_data["version"] = form.get("version", 1) + 1
    if form_update.assigned_teams is not None:
        update_data["assigned_teams"] = form_update.assigned_teams
    if form_update.is_active is not None:
        update_data["is_active"] = form_update.is_active

    update_data["updated_at"] = datetime.utcnow()

    await db.forms.update_one(
        {"_id": ObjectId(form_id)},
        {"$set": update_data}
    )

    updated_form = await db.forms.find_one({"_id": ObjectId(form_id)})
    return form_to_response(updated_form)


@router.post("/{form_id}/assign", response_model=FormResponse)
async def assign_form_to_teams(
    form_id: str,
    assignment: FormAssignment,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Assign form to teams"""
    db = get_database()

    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format",
        )

    form = await db.forms.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    user_id = str(current_user["_id"])

    # Validate teams for managers
    if current_user["role"] == UserRole.MANAGER.value:
        for team_id in assignment.team_ids:
            team = await db.teams.find_one({"_id": ObjectId(team_id)})
            if not team or team["manager_id"] != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Team {team_id} is not under your management",
                )

    # Add teams to assigned_teams (merge with existing)
    current_teams = set(form.get("assigned_teams", []))
    current_teams.update(assignment.team_ids)

    await db.forms.update_one(
        {"_id": ObjectId(form_id)},
        {
            "$set": {
                "assigned_teams": list(current_teams),
                "updated_at": datetime.utcnow(),
            }
        }
    )

    updated_form = await db.forms.find_one({"_id": ObjectId(form_id)})
    return form_to_response(updated_form)


@router.delete("/{form_id}/unassign/{team_id}", response_model=FormResponse)
async def unassign_form_from_team(
    form_id: str,
    team_id: str,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Remove a team from form assignment"""
    db = get_database()

    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format",
        )

    form = await db.forms.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    await db.forms.update_one(
        {"_id": ObjectId(form_id)},
        {
            "$pull": {"assigned_teams": team_id},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    updated_form = await db.forms.find_one({"_id": ObjectId(form_id)})
    return form_to_response(updated_form)


@router.delete("/{form_id}")
async def delete_form(
    form_id: str,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Soft delete a form (deactivate)"""
    db = get_database()

    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format",
        )

    form = await db.forms.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Check ownership for managers
    if current_user["role"] == UserRole.MANAGER.value:
        if form["created_by"] != str(current_user["_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only delete forms you created",
            )

    await db.forms.update_one(
        {"_id": ObjectId(form_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )

    return {"message": "Form deactivated successfully"}
