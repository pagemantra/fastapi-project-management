from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime
from enum import Enum


class FieldType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    TEXTAREA = "textarea"
    SELECT = "select"
    CHECKBOX = "checkbox"
    MULTI_SELECT = "multi_select"
    DATE = "date"
    TIME = "time"
    DATETIME = "datetime"
    FILE_UPLOAD = "file_upload"
    RATING = "rating"
    EMAIL = "email"
    PHONE = "phone"
    URL = "url"


class ConditionalOperator(str, Enum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    IS_EMPTY = "is_empty"
    IS_NOT_EMPTY = "is_not_empty"


class FieldValidation(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    pattern: Optional[str] = None  # Regex pattern
    file_types: Optional[List[str]] = None  # e.g., [".pdf", ".doc"]
    max_file_size: Optional[int] = None  # in KB
    max_rating: Optional[int] = 5


class ConditionalLogic(BaseModel):
    field_id: str  # Field to check
    operator: ConditionalOperator
    value: Optional[Any] = None  # Value to compare


class FormField(BaseModel):
    field_id: str
    field_type: FieldType
    label: str
    placeholder: Optional[str] = None
    required: bool = False
    options: Optional[List[str]] = None  # For select/checkbox/multi_select
    validation: Optional[FieldValidation] = None
    default_value: Optional[Any] = None
    order: int = 0
    conditional: Optional[ConditionalLogic] = None  # Show field if condition is met
    help_text: Optional[str] = None


class FormBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None


class FormCreate(FormBase):
    fields: List[FormField] = []
    assigned_teams: List[str] = []


class FormUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    fields: Optional[List[FormField]] = None
    assigned_teams: Optional[List[str]] = None
    is_active: Optional[bool] = None


class FormInDB(FormBase):
    id: str = Field(alias="_id")
    fields: List[FormField] = []
    created_by: str
    assigned_teams: List[str] = []
    is_active: bool = True
    version: int = 1
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class FormResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    fields: List[FormField] = []
    created_by: str
    assigned_teams: List[str] = []
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FormAssignment(BaseModel):
    team_ids: List[str]


class FormFieldResponse(BaseModel):
    """Response submitted by user for a form field"""
    field_id: str
    value: Any


class FormSubmission(BaseModel):
    """Form submission by employee"""
    form_id: str
    responses: List[FormFieldResponse]
