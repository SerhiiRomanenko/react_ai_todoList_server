# AI ToDoList — Server

Express backend. In-memory storage.

## Setup

```bash
cp .env.example .env
# fill in GROQ_API_KEY and JWT_SECRET
npm install
npm start
```

Server: `http://localhost:3001`

## .env

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key for AI (task analysis + chat) |
| `JWT_SECRET` | Random string for signing auth tokens |

## Files

- `server.js` — Express app, all routes
- `auth.js` — register / login, bcrypt hashing, JWT signing
- `middleware.js` — auth middleware (verifies JWT, sets `req.userId`)

## Endpoints

- `POST /api/auth/register` — `{ email, password }`
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `GET /api/tasks` — protected, returns user's tasks
- `POST /api/tasks` — protected, `{ taskText }`, AI assigns category/priority
- `PUT /api/tasks/:id` — protected, `{ completed }`
- `DELETE /api/tasks/:id` — protected
- `POST /api/chat` — protected, `{ message, locale }` → `{ reply }`

All `/api/tasks` and `/api/chat` routes require `Authorization: Bearer <token>`.
