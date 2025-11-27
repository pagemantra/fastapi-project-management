from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ON_HOLD = "on_hold"
    CANCELLED = "cancelled"


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None


class TaskCreate(TaskBase):
    assigned_to: str  # Employee ID (user _id)
    team_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = None
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    assigned_to: Optional[str] = None


class WorkLog(BaseModel):
    task_id: str
    hours_worked: float = Field(..., gt=0)
    work_date: date
    notes: Optional[str] = None


class TaskInDB(TaskBase):
    id: str = Field(alias="_id")
    assigned_to: str
    assigned_by: str
    team_id: Optional[str] = None
    actual_hours: float = 0
    work_logs: List[dict] = []
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    priority: TaskPriority
    status: TaskStatus
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    actual_hours: float = 0
    assigned_to: str
    assigned_by: str
    team_id: Optional[str] = None
    work_logs: List[dict] = []
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
