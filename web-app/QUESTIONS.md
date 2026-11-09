# Checks that need the manager login

Browser checks to do together with the owner, one row per check. They need the owner's own manager
login. Scripted checks (`pnpm *:check`) log in with the checks account (`CHECK_EMAIL` /
`CHECK_PASSWORD` in `.env`), never with a person's account.

Before them: start Docker Desktop, then `docker compose up -d --wait` (after a code change,
`docker compose up --build -d --wait` rebuilds the images). The web app is at http://localhost:8080.

At each merge (owner, step 16): this file is not deleted. Every row still open moves to doc 05
first, then only the rows fully checked are removed.

**Step 16 merge, 2026-11-09.** Rows 1 to 7 and 9 were checked and removed. Rows 8 (in part), 10, 11
and 13 are still open: they moved to doc 05 "Browser checks still open". Row 12 (the run on the
Raspberry Pi 5) moved earlier to doc 05 "Before deploying to the Raspberry Pi". No row is open in
this file now; the next step adds its own.

**Step 17 merge, 2026-11-09.** Rows 1 (the line), 2 (the camera box), 7 (the cabinet) and 8 (the
header: "54 من 54" in the owner's screenshot) were checked and removed. Rows 3, 4, 5, 6, 9, 10 (in
part) and 11 are still open: they moved to doc 05 "Browser checks still open". No row is open in
this file now; the next step adds its own.
