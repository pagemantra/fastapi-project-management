from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TeamBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None


class TeamCreate(TeamBase):
    team_lead_id: str  # User ID of the team lead
    manager_id: str  # User ID of the manager


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    team_lead_id: Optional[str] = None
    is_active: Optional[bool] = None


class TeamInDB(TeamBase):
    id: str = Field(alias="_id")
    team_lead_id: str
    manager_id: str
    members: List[str] = []  # List of employee user IDs
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class TeamResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    team_lead_id: str
    manager_id: str
    members: List[str] = []
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AddTeamMember(BaseModel):
    employee_id: str  # User ID of the employee to add
