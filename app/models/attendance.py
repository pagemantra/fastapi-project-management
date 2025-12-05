from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from enum import Enum


class BreakType(str, Enum):
    SHORT_BREAK = "short_break"
    LUNCH_BREAK = "lunch_break"
    TEA_BREAK = "tea_break"
    MEETING = "meeting"
    OTHER = "other"


class SessionStatus(str, Enum):
    ACTIVE = "active"
    ON_BREAK = "on_break"
    COMPLETED = "completed"
    INCOMPLETE = "incomplete"


class Break(BaseModel):
    break_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    break_type: BreakType = BreakType.SHORT_BREAK
    duration_minutes: int = 0
    comment: Optional[str] = None


class BreakSettingsBase(BaseModel):
    max_breaks_per_day: Optional[int] = None
    max_break_duration_minutes: Optional[int] = None
    lunch_break_duration: Optional[int] = 60
    short_break_duration: Optional[int] = 15
    enforce_limits: bool = False


class BreakSettingsCreate(BreakSettingsBase):
    team_id: str


class BreakSettingsUpdate(BaseModel):
    max_breaks_per_day: Optional[int] = None
    max_break_duration_minutes: Optional[int] = None
    lunch_break_duration: Optional[int] = None
    short_break_duration: Optional[int] = None
    enforce_limits: Optional[bool] = None


class BreakSettingsResponse(BreakSettingsBase):
    id: str
    team_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimeSessionBase(BaseModel):
    employee_id: str
    date: date


class TimeSessionCreate(BaseModel):
    pass  # Just needs authentication, employee_id comes from token


class ClockOut(BaseModel):
    force: bool = False  # Force logout without worksheet (admin only)


class StartBreak(BaseModel):
    break_type: BreakType = BreakType.SHORT_BREAK
    comment: Optional[str] = None


class TimeSessionInDB(TimeSessionBase):
    id: str = Field(alias="_id")
    login_time: datetime
    logout_time: Optional[datetime] = None
    breaks: List[Break] = []
    total_work_hours: float = 0
    total_break_minutes: int = 0
    overtime_hours: float = 0
    status: SessionStatus = SessionStatus.ACTIVE
    worksheet_submitted: bool = False
    current_break_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class TimeSessionResponse(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    date: date
    login_time: datetime
    logout_time: Optional[datetime] = None
    breaks: List[Break] = []
    total_work_hours: float = 0
    total_break_minutes: int = 0
    overtime_hours: float = 0
    status: SessionStatus
    worksheet_submitted: bool = False
    current_break_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AttendanceSummary(BaseModel):
    employee_id: str
    employee_name: str
    total_days: int
    total_work_hours: float
    total_break_minutes: int
    total_overtime_hours: float
    average_work_hours: float
    incomplete_sessions: int
