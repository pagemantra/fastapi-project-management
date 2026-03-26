# API Endpoints Quick Reference

**Base URL:** `https://fastapi-project-management-production-22e0.up.railway.app`

## Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/login | No | Login and get access token |
| POST | /auth/register-admin | No | Register new admin |
| GET | /auth/me | Yes | Get current user info |

## User Management
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /users/ | Yes | List all users |
| GET | /users/{id} | Yes | Get user by ID |
| POST | /users/ | Yes | Create new user |
| PUT | /users/{id} | Yes | Update user |
| DELETE | /users/{id} | Yes | Delete user |
| GET | /users/managers | Yes | List all managers |
| GET | /users/team-leads | Yes | List all team leads |
| GET | /users/employees | Yes | List all employees |
| GET | /users/all-for-dashboard | Yes | Get dashboard user data |

## Team Management
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /teams/ | Yes | List all teams |
| GET | /teams/{id} | Yes | Get team by ID |
| POST | /teams/ | Yes | Create new team |
| PUT | /teams/{id} | Yes | Update team |
| DELETE | /teams/{id} | Yes | Delete team |
| POST | /teams/{id}/members | Yes | Add team member |
| DELETE | /teams/{id}/members/{employeeId} | Yes | Remove team member |

## Task Management
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /tasks/ | Yes | List all tasks |
| GET | /tasks/{id} | Yes | Get task by ID |
| POST | /tasks/ | Yes | Create new task |
| PUT | /tasks/{id} | Yes | Update task |
| DELETE | /tasks/{id} | Yes | Delete task |
| GET | /tasks/my-tasks | Yes | Get my tasks |
| GET | /tasks/assigned-by-me | Yes | Get tasks I assigned |
| POST | /tasks/{id}/work-log | Yes | Add work log entry |
| GET | /tasks/summary | Yes | Get task statistics |

## Attendance System
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /attendance/clock-in | Yes | Start work session |
| POST | /attendance/clock-out | Yes | End work session |
| GET | /attendance/current | Yes | Get current session |
| GET | /attendance/history | Yes | Get attendance history |
| GET | /attendance/today-all | Yes | Get today's all attendance |
| POST | /attendance/break/start | Yes | Start break |
| POST | /attendance/break/end | Yes | End break |
| GET | /attendance/break-settings/{teamId} | Yes | Get break settings |
| POST | /attendance/break-settings | Yes | Create break settings |
| PUT | /attendance/break-settings/{teamId} | Yes | Update break settings |
| POST | /attendance/screen-active-time | Yes | Update screen time |
| POST | /attendance/inactive-time | Yes | Add inactive time |
| POST | /attendance/heartbeat | Yes | Send activity heartbeat |

## Form Management
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /forms/ | Yes | List all forms |
| GET | /forms/{id} | Yes | Get form by ID |
| POST | /forms/ | Yes | Create new form |
| PUT | /forms/{id} | Yes | Update form |
| DELETE | /forms/{id} | Yes | Delete form |
| GET | /forms/team/{teamId} | Yes | Get team forms |
| POST | /forms/{id}/assign | Yes | Assign form to team |
| DELETE | /forms/{id}/unassign/{teamId} | Yes | Unassign form from team |

## Worksheet Management
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /worksheets/ | Yes | List all worksheets |
| GET | /worksheets/{id} | Yes | Get worksheet by ID |
| POST | /worksheets/ | Yes | Create new worksheet |
| PUT | /worksheets/{id} | Yes | Update worksheet |
| POST | /worksheets/{id}/submit | Yes | Submit worksheet |
| POST | /worksheets/{id}/verify | Yes | Verify worksheet (TL) |
| POST | /worksheets/{id}/approve | Yes | Approve worksheet (Mgr) |
| POST | /worksheets/{id}/dm-approve | Yes | DM approve (Admin) |
| POST | /worksheets/{id}/reject | Yes | Reject worksheet |
| POST | /worksheets/bulk-approve | Yes | Bulk approve worksheets |
| POST | /worksheets/bulk-dm-approve | Yes | Bulk DM approve |
| GET | /worksheets/my-worksheets | Yes | Get my worksheets |
| GET | /worksheets/pending-verification | Yes | Get pending verification |
| GET | /worksheets/pending-approval | Yes | Get pending approval |
| GET | /worksheets/pending-dm-approval | Yes | Get pending DM approval |
| GET | /worksheets/summary | Yes | Get worksheet statistics |

## Notifications
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /notifications/ | Yes | List all notifications |
| GET | /notifications/unread | Yes | Get unread notifications |
| GET | /notifications/count | Yes | Get unread count |
| PUT | /notifications/{id}/read | Yes | Mark notification as read |
| PUT | /notifications/read-all | Yes | Mark all as read |
| DELETE | /notifications/{id} | Yes | Delete notification |
| DELETE | /notifications | Yes | Delete all notifications |

## Reports & Analytics
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /reports/productivity | Yes | Get productivity report |
| GET | /reports/attendance | Yes | Get attendance report |
| GET | /reports/overtime | Yes | Get overtime report |
| GET | /reports/team-performance | Yes | Get team performance |
| GET | /reports/worksheet-analytics | Yes | Get worksheet analytics |
| GET | /reports/projects | Yes | Get projects report |
| GET | /reports/manager-members | Yes | Get manager's members |
| GET | /reports/export/productivity | Yes | Export productivity (file) |
| GET | /reports/export/attendance | Yes | Export attendance (file) |
| GET | /reports/export/overtime | Yes | Export overtime (file) |

## Endpoint Count Summary

| Category | Total Endpoints |
|----------|----------------|
| Authentication | 3 |
| User Management | 9 |
| Team Management | 7 |
| Task Management | 9 |
| Attendance System | 13 |
| Form Management | 8 |
| Worksheet Management | 16 |
| Notifications | 7 |
| Reports & Analytics | 10 |
| **TOTAL** | **82** |

## Common Query Parameters

### Pagination
- `skip`: Number of records to skip (default: 0)
- `limit`: Max records to return (default: 100)

### Filtering
- `start_date`: Filter by start date (YYYY-MM-DD)
- `end_date`: Filter by end date (YYYY-MM-DD)
- `user_id`: Filter by user ID
- `team_id`: Filter by team ID
- `status`: Filter by status

### Sorting
- `sort_by`: Field to sort by
- `order`: Sort order (asc/desc)

## Role Permissions

| Role | Access Level |
|------|-------------|
| **admin** | Full system access, DM approvals, all reports |
| **manager** | Team management, approvals, team reports |
| **team_lead** | Worksheet verification, team member tasks |
| **employee** | Own data, task execution, worksheet creation |

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Server Error |

## Authentication Header

All authenticated requests require:
```
Authorization: Bearer <access_token>
```

## Common Request Headers

```
Content-Type: application/json
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

## Worksheet Approval Workflow

```
1. Employee creates worksheet
   POST /worksheets/

2. Employee submits for review
   POST /worksheets/{id}/submit

3. Team Lead verifies
   POST /worksheets/{id}/verify

4. Manager approves
   POST /worksheets/{id}/approve

5. DM/Admin final approval
   POST /worksheets/{id}/dm-approve
```

## Attendance Flow

```
1. Clock In
   POST /attendance/clock-in

2. Send Heartbeats (periodic)
   POST /attendance/heartbeat

3. Start Break (optional)
   POST /attendance/break/start

4. End Break
   POST /attendance/break/end

5. Clock Out
   POST /attendance/clock-out
```

## Quick Tips

1. **Testing**: Use the test suite at `frontend/tests/api-test.cjs`
2. **Cache Busting**: GET requests auto-include timestamp parameter
3. **Date Format**: Always use ISO format (YYYY-MM-DD)
4. **Timeout**: 30 seconds for all requests
5. **Bulk Operations**: Available for worksheet approvals
6. **File Exports**: Report exports return downloadable files
7. **Real-time**: Heartbeat endpoint for activity tracking
8. **Pagination**: Most list endpoints support pagination
9. **Filtering**: Most endpoints support query parameter filtering
10. **Validation**: Server provides detailed error messages
