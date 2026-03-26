# FastAPI Project Management - API Endpoints Summary

**Base URL:** `https://fastapi-project-management-production-22e0.up.railway.app`

## Overview

This document provides a comprehensive overview of all REST API endpoints in the FastAPI Project Management system. The API follows RESTful principles and uses JWT authentication.

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## 1. Authentication Endpoints

### POST /auth/login
**Purpose:** Authenticate user and receive access token
**Method:** POST
**Auth Required:** No
**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```
**Response:**
```json
{
  "access_token": "string",
  "token_type": "bearer",
  "user": {
    "id": "integer",
    "username": "string",
    "email": "string",
    "full_name": "string",
    "role": "string"
  }
}
```

### POST /auth/register-admin
**Purpose:** Register a new admin user
**Method:** POST
**Auth Required:** No
**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "full_name": "string"
}
```

### GET /auth/me
**Purpose:** Get current authenticated user information
**Method:** GET
**Auth Required:** Yes
**Response:** User object

---

## 2. User Management Endpoints

### GET /users/
**Purpose:** Get all users with optional filtering
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Various filters available
**Response:** Array of user objects

### GET /users/{id}
**Purpose:** Get specific user by ID
**Method:** GET
**Auth Required:** Yes
**Response:** User object

### POST /users/
**Purpose:** Create a new user
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "full_name": "string",
  "role": "admin|manager|team_lead|employee"
}
```

### PUT /users/{id}
**Purpose:** Update user information
**Method:** PUT
**Auth Required:** Yes
**Request Body:** User fields to update

### DELETE /users/{id}
**Purpose:** Delete a user
**Method:** DELETE
**Auth Required:** Yes

### GET /users/managers
**Purpose:** Get all users with manager role
**Method:** GET
**Auth Required:** Yes
**Response:** Array of manager user objects

### GET /users/team-leads
**Purpose:** Get all users with team lead role
**Method:** GET
**Auth Required:** Yes
**Response:** Array of team lead user objects

### GET /users/employees
**Purpose:** Get all users with employee role
**Method:** GET
**Auth Required:** Yes
**Response:** Array of employee user objects

### GET /users/all-for-dashboard
**Purpose:** Get aggregated user data for dashboard
**Method:** GET
**Auth Required:** Yes
**Response:** Dashboard-specific user data

---

## 3. Team Management Endpoints

### GET /teams/
**Purpose:** Get all teams
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Optional filters
**Response:** Array of team objects

### GET /teams/{id}
**Purpose:** Get specific team by ID
**Method:** GET
**Auth Required:** Yes
**Response:** Team object with members

### POST /teams/
**Purpose:** Create a new team
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "name": "string",
  "description": "string"
}
```

### PUT /teams/{id}
**Purpose:** Update team information
**Method:** PUT
**Auth Required:** Yes
**Request Body:** Team fields to update

### DELETE /teams/{id}
**Purpose:** Delete a team
**Method:** DELETE
**Auth Required:** Yes

### POST /teams/{teamId}/members
**Purpose:** Add member to team
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "employee_id": "integer"
}
```

### DELETE /teams/{teamId}/members/{employeeId}
**Purpose:** Remove member from team
**Method:** DELETE
**Auth Required:** Yes

---

## 4. Task Management Endpoints

### GET /tasks/
**Purpose:** Get all tasks
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Various filters
**Response:** Array of task objects

### GET /tasks/{id}
**Purpose:** Get specific task by ID
**Method:** GET
**Auth Required:** Yes
**Response:** Task object with details

### POST /tasks/
**Purpose:** Create a new task
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "title": "string",
  "description": "string",
  "priority": "low|medium|high",
  "status": "pending|in_progress|completed",
  "assigned_to": "integer",
  "due_date": "date (optional)"
}
```

### PUT /tasks/{id}
**Purpose:** Update task information
**Method:** PUT
**Auth Required:** Yes
**Request Body:** Task fields to update

### DELETE /tasks/{id}
**Purpose:** Delete a task
**Method:** DELETE
**Auth Required:** Yes

### GET /tasks/my-tasks
**Purpose:** Get tasks assigned to current user
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Optional filters
**Response:** Array of user's tasks

### GET /tasks/assigned-by-me
**Purpose:** Get tasks created/assigned by current user
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Optional filters
**Response:** Array of tasks

### POST /tasks/{taskId}/work-log
**Purpose:** Add work log entry to task
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "hours": "number",
  "description": "string"
}
```

### GET /tasks/summary
**Purpose:** Get task statistics and summary
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Optional filters
**Response:** Task summary statistics

---

## 5. Attendance Endpoints

### POST /attendance/clock-in
**Purpose:** Clock in to start work session
**Method:** POST
**Auth Required:** Yes
**Response:** Attendance session object

### POST /attendance/clock-out
**Purpose:** Clock out to end work session
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "notes": "string (optional)"
}
```

### GET /attendance/current
**Purpose:** Get current active attendance session
**Method:** GET
**Auth Required:** Yes
**Response:** Current session object or 404 if not clocked in

### GET /attendance/history
**Purpose:** Get attendance history
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Date filters
**Response:** Array of attendance records

### GET /attendance/today-all
**Purpose:** Get today's attendance for all users (managers/admins)
**Method:** GET
**Auth Required:** Yes (Manager/Admin role)
**Response:** Array of today's attendance records

### POST /attendance/break/start
**Purpose:** Start a break session
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "break_type": "lunch|short|other"
}
```

### POST /attendance/break/end
**Purpose:** End current break session
**Method:** POST
**Auth Required:** Yes

### GET /attendance/break-settings/{teamId}
**Purpose:** Get break settings for a team
**Method:** GET
**Auth Required:** Yes

### POST /attendance/break-settings
**Purpose:** Create break settings for a team
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "team_id": "integer",
  "max_break_duration": "integer (minutes)",
  "max_breaks_per_day": "integer"
}
```

### PUT /attendance/break-settings/{teamId}
**Purpose:** Update break settings for a team
**Method:** PUT
**Auth Required:** Yes
**Request Body:** Break setting fields to update

### POST /attendance/screen-active-time
**Purpose:** Update screen active time for current session
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "active_seconds": "integer"
}
```

### POST /attendance/inactive-time
**Purpose:** Add inactive time to current session
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "inactive_seconds": "integer"
}
```

### POST /attendance/heartbeat
**Purpose:** Send periodic heartbeat to track activity
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "is_active": "boolean",
  "screenshot_data": "string (base64, optional)"
}
```

---

## 6. Form Management Endpoints

### GET /forms/
**Purpose:** Get all forms
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Optional filters
**Response:** Array of form objects

### GET /forms/{id}
**Purpose:** Get specific form by ID
**Method:** GET
**Auth Required:** Yes
**Response:** Form object with fields

### POST /forms/
**Purpose:** Create a new form
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "title": "string",
  "description": "string",
  "fields": [
    {
      "name": "string",
      "label": "string",
      "type": "text|number|date|select|checkbox",
      "required": "boolean",
      "options": "array (for select fields)"
    }
  ],
  "is_active": "boolean"
}
```

### PUT /forms/{id}
**Purpose:** Update form information
**Method:** PUT
**Auth Required:** Yes
**Request Body:** Form fields to update

### DELETE /forms/{id}
**Purpose:** Delete a form
**Method:** DELETE
**Auth Required:** Yes

### GET /forms/team/{teamId}
**Purpose:** Get forms assigned to a specific team
**Method:** GET
**Auth Required:** Yes
**Response:** Array of form objects

### POST /forms/{formId}/assign
**Purpose:** Assign form to a team
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "team_id": "integer"
}
```

### DELETE /forms/{formId}/unassign/{teamId}
**Purpose:** Unassign form from a team
**Method:** DELETE
**Auth Required:** Yes

---

## 7. Worksheet Management Endpoints

### GET /worksheets/
**Purpose:** Get all worksheets
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Optional filters
**Response:** Array of worksheet objects

### GET /worksheets/{id}
**Purpose:** Get specific worksheet by ID
**Method:** GET
**Auth Required:** Yes
**Response:** Worksheet object

### POST /worksheets/
**Purpose:** Create a new worksheet
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "form_id": "integer",
  "date": "date (YYYY-MM-DD)",
  "data": "object (form field values)"
}
```

### PUT /worksheets/{id}
**Purpose:** Update worksheet
**Method:** PUT
**Auth Required:** Yes
**Request Body:** Worksheet fields to update

### POST /worksheets/{id}/submit
**Purpose:** Submit worksheet for review
**Method:** POST
**Auth Required:** Yes

### POST /worksheets/{id}/verify
**Purpose:** Verify worksheet (Team Lead)
**Method:** POST
**Auth Required:** Yes (Team Lead role)

### POST /worksheets/{id}/approve
**Purpose:** Approve worksheet (Manager)
**Method:** POST
**Auth Required:** Yes (Manager role)

### POST /worksheets/{id}/dm-approve
**Purpose:** DM approve worksheet (Admin/DM)
**Method:** POST
**Auth Required:** Yes (Admin role)

### POST /worksheets/{id}/reject
**Purpose:** Reject worksheet
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "reason": "string"
}
```

### POST /worksheets/bulk-approve
**Purpose:** Approve multiple worksheets at once
**Method:** POST
**Auth Required:** Yes
**Request Body:**
```json
{
  "worksheet_ids": ["array of integers"]
}
```

### POST /worksheets/bulk-dm-approve
**Purpose:** DM approve multiple worksheets at once
**Method:** POST
**Auth Required:** Yes (Admin role)
**Request Body:**
```json
{
  "worksheet_ids": ["array of integers"]
}
```

### GET /worksheets/my-worksheets
**Purpose:** Get worksheets created by current user
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Optional filters
**Response:** Array of user's worksheets

### GET /worksheets/pending-verification
**Purpose:** Get worksheets pending team lead verification
**Method:** GET
**Auth Required:** Yes (Team Lead role)
**Response:** Array of pending worksheets

### GET /worksheets/pending-approval
**Purpose:** Get worksheets pending manager approval
**Method:** GET
**Auth Required:** Yes (Manager role)
**Response:** Array of pending worksheets

### GET /worksheets/pending-dm-approval
**Purpose:** Get worksheets pending DM approval
**Method:** GET
**Auth Required:** Yes (Admin role)
**Response:** Array of pending worksheets

### GET /worksheets/summary
**Purpose:** Get worksheet statistics and summary
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Optional filters
**Response:** Worksheet summary statistics

---

## 8. Notification Endpoints

### GET /notifications/
**Purpose:** Get all notifications for current user
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Pagination parameters
**Response:** Array of notification objects

### GET /notifications/unread
**Purpose:** Get unread notifications
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Pagination parameters
**Response:** Array of unread notifications

### GET /notifications/count
**Purpose:** Get unread notification count
**Method:** GET
**Auth Required:** Yes
**Response:**
```json
{
  "count": "integer"
}
```

### PUT /notifications/{id}/read
**Purpose:** Mark specific notification as read
**Method:** PUT
**Auth Required:** Yes

### PUT /notifications/read-all
**Purpose:** Mark all notifications as read
**Method:** PUT
**Auth Required:** Yes

### DELETE /notifications/{id}
**Purpose:** Delete specific notification
**Method:** DELETE
**Auth Required:** Yes

### DELETE /notifications
**Purpose:** Delete all notifications for current user
**Method:** DELETE
**Auth Required:** Yes

---

## 9. Report Endpoints

### GET /reports/productivity
**Purpose:** Get productivity report
**Method:** GET
**Auth Required:** Yes
**Query Parameters:**
- `start_date` (required): Start date (YYYY-MM-DD)
- `end_date` (required): End date (YYYY-MM-DD)
- `user_id` (optional): Filter by user
- `team_id` (optional): Filter by team
**Response:** Productivity report data

### GET /reports/attendance
**Purpose:** Get attendance report
**Method:** GET
**Auth Required:** Yes
**Query Parameters:**
- `start_date` (required): Start date (YYYY-MM-DD)
- `end_date` (required): End date (YYYY-MM-DD)
- `user_id` (optional): Filter by user
- `team_id` (optional): Filter by team
**Response:** Attendance report data

### GET /reports/overtime
**Purpose:** Get overtime report
**Method:** GET
**Auth Required:** Yes
**Query Parameters:**
- `start_date` (required): Start date (YYYY-MM-DD)
- `end_date` (required): End date (YYYY-MM-DD)
- `user_id` (optional): Filter by user
- `team_id` (optional): Filter by team
**Response:** Overtime report data

### GET /reports/team-performance
**Purpose:** Get team performance metrics
**Method:** GET
**Auth Required:** Yes
**Query Parameters:**
- `start_date` (required): Start date (YYYY-MM-DD)
- `end_date` (required): End date (YYYY-MM-DD)
- `team_id` (optional): Filter by team
**Response:** Team performance data

### GET /reports/worksheet-analytics
**Purpose:** Get worksheet analytics
**Method:** GET
**Auth Required:** Yes
**Query Parameters:**
- `start_date` (required): Start date (YYYY-MM-DD)
- `end_date` (required): End date (YYYY-MM-DD)
- `team_id` (optional): Filter by team
**Response:** Worksheet analytics data

### GET /reports/projects
**Purpose:** Get projects report
**Method:** GET
**Auth Required:** Yes
**Query Parameters:**
- `start_date` (required): Start date (YYYY-MM-DD)
- `end_date` (required): End date (YYYY-MM-DD)
**Response:** Projects report data

### GET /reports/manager-members
**Purpose:** Get manager's team members for reporting
**Method:** GET
**Auth Required:** Yes (Manager role)
**Response:** Array of team members under manager

### GET /reports/export/productivity
**Purpose:** Export productivity report as file
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Same as /reports/productivity
**Response:** File download (Excel/CSV)

### GET /reports/export/attendance
**Purpose:** Export attendance report as file
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Same as /reports/attendance
**Response:** File download (Excel/CSV)

### GET /reports/export/overtime
**Purpose:** Export overtime report as file
**Method:** GET
**Auth Required:** Yes
**Query Parameters:** Same as /reports/overtime
**Response:** File download (Excel/CSV)

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "detail": "Error message describing the validation error"
}
```

### 401 Unauthorized
```json
{
  "detail": "Not authenticated"
}
```

### 403 Forbidden
```json
{
  "detail": "Not enough permissions"
}
```

### 404 Not Found
```json
{
  "detail": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error"
}
```

---

## Request Headers

All requests should include:
```
Content-Type: application/json
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

For authenticated requests, also include:
```
Authorization: Bearer <access_token>
```

---

## Rate Limiting

The API has a 30-second timeout for all requests. Long-running operations should be designed to complete within this timeframe.

---

## Testing

A comprehensive test suite is available at `D:\Development\fastapi-project-management\frontend\tests\api-test.cjs`

Run tests with:
```bash
node D:\Development\fastapi-project-management\frontend\tests\api-test.cjs
```

The test suite covers:
- All authentication flows
- User CRUD operations
- Team management
- Task management
- Attendance tracking including heartbeats
- Form and worksheet workflows
- Notification system
- All report generation endpoints

---

## Notes

1. **Role-Based Access Control (RBAC)**: Many endpoints require specific roles:
   - `admin`: Full system access
   - `manager`: Team and employee management, approvals
   - `team_lead`: Team member management, worksheet verification
   - `employee`: Basic access to own data

2. **Worksheet Approval Flow**:
   - Employee creates worksheet
   - Employee submits worksheet
   - Team Lead verifies worksheet
   - Manager approves worksheet
   - Admin/DM performs final approval

3. **Attendance System**:
   - Clock in/out tracking
   - Break management with configurable limits
   - Screen activity monitoring via heartbeats
   - Active/inactive time tracking

4. **Cache Busting**: GET requests automatically include a timestamp parameter to prevent browser caching

5. **Date Formats**: All dates should be in ISO format (YYYY-MM-DD) unless otherwise specified
