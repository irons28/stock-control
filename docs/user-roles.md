# User Roles

## Where to change the user list

Change the demo user list in [frontend/src/config/users.js](/Users/bencollen/Documents/projects/stock-control/frontend/src/config/users.js).

The `USERS` array is the frontend source of truth for:

- the sidebar user switcher
- the persisted current user
- the request headers sent to the backend

## Valid role values

Use these lowercase role values internally:

- `admin`
- `office`
- `warehouse`

The UI can display friendly labels like `Admin`, `Office`, and `Warehouse` through `roleLabel`.

## Access by role

- `admin`: full access to protected routes and all demo workflows
- `office`: office workflows such as purchase orders, sales orders, allocation, dispatch, imports, and master data editing
- `warehouse`: warehouse workflows such as receiving, serial tracking, stock visibility, and warehouse-facing operations

## How the frontend passes role data to the backend

Every frontend API request sends:

- `x-user-id`
- `x-user-name`
- `x-user-role`

The backend auth middleware reads those headers, normalizes `x-user-role` to lowercase, then uses that value for permission checks and activity logging.

## How to add real staff names later

1. Open [frontend/src/config/users.js](/Users/bencollen/Documents/projects/stock-control/frontend/src/config/users.js).
2. Replace the demo entries in `USERS`.
3. Keep each record in this shape:

```js
{
  id: "unique-user-id",
  name: "Full Name",
  role: "admin",
  roleLabel: "Admin",
}
```

4. Keep `role` set to one of `admin`, `office`, or `warehouse`.
5. If real authentication is added later, keep the same header contract so frontend and backend permissions stay aligned.
