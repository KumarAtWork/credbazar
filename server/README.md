# CredBazar Form Collector

Node.js server that receives form submissions, appends them to a daily Excel file and emails the daily file.

Setup


1. Install dependencies:

```bash
cd server
npm install
```

2. Create `.env` from `.env.example` and fill SMTP credentials (GoDaddy example provided).

3. Run server:

```bash
npm start
# or for development with nodemon:
npm run dev
```

Behavior changes
- The server writes daily Excel files to `server/data/YYYY-MM-DD.xlsx`.

- Submissions are appended to the day's file on POST `/submit-loan`.
- On every successful submission the server will now email the day's Excel file as an attachment immediately (in addition to the scheduled daily send at 23:59).
- You can manually trigger sending today's file by POSTing to `/send-today` with header `x-send-key` matching `SEND_TRIGGER_KEY` in your `.env` (optional).

Security & deployment notes
- Basic security middleware `helmet` and a simple rate limiter are enabled. For production, serve this over HTTPS behind a reverse proxy (nginx) and restrict access appropriately.
- If deploying to a public server, update the form `action` in `home-loan.html` to point to your deployed endpoint (https://yourdomain/submit-loan).
- Ensure your SMTP credentials are stored in `.env` and not checked into source control.

