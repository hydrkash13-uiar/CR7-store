# SOMA Store

Project: Frontend + Backend for SOMA store with Telegram integration.

## How to run locally (backend)
1. cd backend
2. cp .env.example .env  # واملأ القيم
3. npm install
4. npm start

## Deploy backend
- Push to GitHub.
- Deploy backend on Render / Replit / Heroku (connect repo or upload).
- Set environment variables (JWT_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, ADMIN_USERNAME, ADMIN_PASSWORD).

## Frontend
- Place `frontend/index.html` in GitHub Pages (gh-pages) or serve it via any static host.
- Set `API_BASE` to the deployed backend URL.
