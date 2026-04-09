# IMentor AI Frontend (React + Vite)

Frontend client for the IMentor AI platform.

## Repository

[https://github.com/durgamangena41/imentor-ai](https://github.com/durgamangena41/imentor-ai)

## Tech Stack

- React 18 + Vite
- React Router
- Axios API layer
- Context-based auth/session state
- Tailwind + CSS modules

## Run Frontend

1. Install dependencies:

```bash
npm install
```

1. Start dev server:

```bash
npm run dev
```

1. Open the URL shown in terminal (commonly `http://localhost:3000`).

## Required Environment

Create `frontend/.env` with:

```env
VITE_API_BASE_URL=http://localhost:2000/api
VITE_ADMIN_USERNAME=admin@admin.com
VITE_ADMIN_PASSWORD=admin123
```

## Today's Frontend Updates (Apr 9, 2026)

- Admin login session flow fixed so valid admin users enter admin mode consistently.
- Prep Mode history rendering improved to show richer saved details from backend sessions.
- Login Network Error behavior documented and aligned with API port checks.
- Classroom dashboard navigation and related UI hooks removed from active frontend flow.

## Key Frontend Files

- `src/App.jsx`
- `src/contexts/AuthContext.jsx`
- `src/services/api.js`
- `src/components/auth/AuthModal.jsx`
- `src/pages/PrepModePage.jsx`

## Quick Troubleshooting

- If login shows Network Error, verify backend is running on port 2000.
- Ensure `VITE_API_BASE_URL` matches backend port and host.
- Restart frontend after `.env` changes.
