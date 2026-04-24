# Frontend Auth Handoff

This note is for implementing the frontend against the new backend auth flow.

## What changed

Auth is no longer email-only.

Backend now supports:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/session`
- `POST /auth/logout`

Passwords are required.

## Endpoints

### `POST /auth/register`

Creates a user account and immediately returns an authenticated session.

Request body:

```json
{
  "email": "ops@example.com",
  "password": "DemoPass123!",
  "displayName": "Ops"
}
```

Rules:

- `email`: valid email
- `password`: min 8 chars, max 128
- `displayName`: optional

Success response:

```json
{
  "status": "authenticated",
  "sessionToken": "<bearer-token>",
  "user": {
    "userId": "<uuid>",
    "email": "ops@example.com",
    "displayName": "Ops"
  },
  "organizations": []
}
```

Failure cases:

- `409 conflict` if email already exists
- `400 validation_error` if payload is invalid

### `POST /auth/login`

Creates a user session for an existing account.

Request body:

```json
{
  "email": "ops@example.com",
  "password": "DemoPass123!"
}
```

Success response:

```json
{
  "status": "authenticated",
  "sessionToken": "<bearer-token>",
  "user": {
    "userId": "<uuid>",
    "email": "ops@example.com",
    "displayName": "Ops"
  },
  "organizations": [...]
}
```

Failure cases:

- `401 invalid_credentials` for missing user or wrong password
- `400 validation_error` if payload is invalid

### `GET /auth/session`

Requires:

```http
Authorization: Bearer <sessionToken>
```

Success response:

```json
{
  "authenticated": true,
  "authType": "user_session",
  "user": {
    "userId": "<uuid>",
    "email": "ops@example.com",
    "displayName": "Ops"
  },
  "organizations": [...]
}
```

Use this as the source of truth for:

- route guarding
- restoring a session on app boot
- displaying current user info

### `POST /auth/logout`

Requires bearer token.

Returns:

- `204 No Content`

Client should clear local session token after success.

## Frontend flows to implement

### 1. Register page

Fields:

- email
- password
- displayName optional

On success:

- save `sessionToken`
- hydrate user/session state from response
- redirect into the authenticated app

### 2. Login page

Fields:

- email
- password

On success:

- save `sessionToken`
- hydrate user/session state from response
- redirect into the authenticated app

### 3. Session bootstrap

On app load:

1. read stored session token
2. if token exists, call `GET /auth/session`
3. if `401`, clear token and redirect to auth
4. if success, render app

### 4. Logout

Call `POST /auth/logout`, then:

- clear local token
- clear cached queries
- redirect to login

## Breaking change from old frontend

Old login used:

```ts
api.login({ email, displayName? })
```

That no longer works.

New client methods should be split:

```ts
api.register({ email, password, displayName? })
api.login({ email, password })
```

## Suggested API client changes

### Replace old login method

Current client likely has something like:

```ts
login(input: { email: string; displayName?: string })
```

Replace with:

```ts
register(input: { email: string; password: string; displayName?: string })
login(input: { email: string; password: string })
```

Both should hit public endpoints with `includeAuth: false`.

## Error handling

Prefer using backend `code` when available.

Important auth error codes:

- `validation_error`
- `invalid_credentials`
- `conflict`

Suggested UI behavior:

- `invalid_credentials`: "Invalid email or password."
- `conflict` on register: "An account with this email already exists."
- validation errors: field-level or inline form message

## Minimal UI scope

For demo, do not overbuild auth.

Just implement:

- login page
- register page
- logout action
- route guard from `/auth/session`

No need yet for:

- forgot password
- email verification
- password reset
- social auth
- invite flows

## Backend status

Verified:

- backend auth tests pass
- session/org/workspace setup still works

Known unrelated backend issue:

- `api` TypeScript build still has pre-existing unrelated errors in `collections.ts`, `collection-proof.ts`, `reconciliation.ts`, and `workspace-access.ts`
- auth itself is covered by tests and is working
