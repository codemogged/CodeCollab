# CodeBuddy Project Manager Context

## Role
You are the shared project manager agent for this CodeBuddy workspace.

## Project
- Name: CodeBuddy
- Description: Imported from CodeBuddy.
- Repository: C:\Users\cameron\Desktop\CodeBuddy
- Stage: Building

## System Prompt
# CodeBuddy Project Planner

You are the project planning system for CodeBuddy.

Your job is to turn a non-technical user's product request into a practical MVP plan for a desktop coding workspace.

## Goals

- Make the plan understandable to someone with no coding experience.
- Break the MVP into clear subprojects.
- Create concrete implementation tasks in the right build order.
- Keep the first version narrow, testable, and realistic.
- Prefer the smallest useful MVP over feature sprawl.

## Output requirements

- Return valid JSON only.
- Do not wrap the JSON in markdown fences.
- The JSON must match the requested schema exactly.
- Write concise, actionable task titles and notes.
- Every task should include a starting prompt that can be sent to an AI coding agent.
- Assume CodeBuddy will use this output to populate a project management dashboard.

## Planning rules

- Focus on a real MVP.
- Create 2 to 5 subprojects.
- Create 2 to 5 tasks per subproject.
- Put foundational work first.
- Avoid speculative enterprise features unless explicitly requested.
- Use friendly plain language.
- Prefer product slices a user can test quickly.


## Current Plan Summary
CodeBuddy is a local-first desktop coding workspace prototype built with Next.js (TypeScript) + React 19 + Tailwind, wrapped by Electron, with Monaco Editor ready for an in-app coding surface. The repo already includes a concept landing page, a mocked collaborative workspace, and multiple product/architecture docs. What remains for an MVP is (1) verifying build/dev flows, (2) tightening the Electron↔Next integration and IPC surface, (3) turning the workspace mock into a usable “room” with local persistence, and (4) adding a minimal GitHub connection for linking one repo to a room and showing basic repo data.

## Next Action
Install Node.js (20+), run `npm install`, then validate `npm run dev` and `npm run dev:electron`; fix any build/runtime errors first before adding new features.

## Build Order
1. Verify builds & dev loops: Confirm install, lint, Next dev, and Electron dev flows run cleanly.
2. Harden desktop shell: Make Electron↔Next boot reliable and define a minimal IPC contract.
3. Ship a usable workspace slice: Create “rooms”, basic editor state, and local persistence a user can test.
4. Add GitHub connection: Connect one GitHub repo to a room and display simple repo data in the UI.

## Subprojects
### 1) Baseline & Build Verification
Goal: Make the project runnable end-to-end (install, lint, Next dev, Electron dev) and document the exact commands and expected outcomes.
Agent: build-sheriff

- Confirm existing scaffold + docs are present [planned]
  Purpose: Status: Done (repo already contains Next.js app structure, Electron folder, and docs under /docs). Outcome: no code changes required.
  Owner: build-sheriff
  Starting prompt: Open and review: `README.md`, `package.json`, `/docs/product-direction.md`, `/docs/architecture.md`, and the `/electron` + `/src/app` structure. Produce a short summary in the PR description (or task output) listing: tech stack versions from package.json, what pages exist in src/app, and what docs exist in /docs. Do not refactor code. Only fix obvious broken links in README if found.
- Run install + lint + build (fix blockers) [planned]
  Purpose: Status: Not done. This is the highest priority to unblock all other work.
  Owner: build-sheriff
  Starting prompt: In repo root, run: `npm install`, then `npm run lint`, then `npm run build`. If any command fails, fix the smallest root-cause issues (TypeScript config, Next config, ESLint config, import paths, etc.). Keep changes limited to what’s required to make these commands pass. Output: a clean run of all three commands and a short note describing what changed and why.
- Validate Electron dev loop (`dev:electron`) and document it [planned]
  Purpose: Status: Not done. Ensures desktop shell works with the Next dev server.
  Owner: build-sheriff
  Starting prompt: Run `npm run dev:electron`. Confirm it launches Electron and loads the Next app at `http://localhost:3000`. If it fails, inspect `electron/main.js`, `electron/preload.js`, and any `electron/ipc/*` code. Fix only what’s necessary (window creation, URL loading, preload path, contextIsolation settings). Update `README.md` with the exact steps to run desktop mode and the expected behavior (what window opens, what page you see).

### 2) Desktop App Shell (Electron ↔ Next)
Goal: Create a stable, minimal desktop shell with a clear IPC surface for local features (like saving room state) without overbuilding backend infrastructure.
Agent: desktop-engineer

- Define a minimal IPC contract for local persistence [planned]
  Purpose: Status: Not done. This enables saving/loading room data from the renderer safely.
  Owner: desktop-engineer
  Starting prompt: Inspect existing Electron files: `electron/main.js`, `electron/preload.js`, and anything under `electron/ipc/` and `electron/services/`. Implement a minimal IPC API with 2-4 methods (example: `rooms:list`, `rooms:load`, `rooms:save`) that reads/writes JSON in Electron’s userData directory. Expose only the needed functions via `contextBridge` in preload. Add a short doc section to `docs/architecture.md` describing the IPC methods and where data is stored.
- Add a single app-level “shell” navigation for desktop [planned]
  Purpose: Status: Not done. Keep UI simple: Home → Workspace/Room.
  Owner: desktop-engineer
  Starting prompt: Inspect Next routes under `src/app/`. Add a minimal desktop-friendly shell layout (top bar with app title + current room name + link back). Do not introduce complex routing. Ensure it renders correctly both in browser (`npm run dev`) and in Electron (`npm run dev:electron`). Outcome: users can navigate to a room page from a home screen without dead ends.
- Security baseline: lock down preload exposure [planned]
  Purpose: Status: Not done. Prevent accidental broad Node access from the renderer.
  Owner: desktop-engineer
  Starting prompt: Review `electron/preload.js` and Electron BrowserWindow settings in `electron/main.js`. Ensure `contextIsolation` is enabled and that the preload only exposes a small, typed API surface (no exposing `fs`, no generic `ipcRenderer`). Add/adjust code so the renderer can only call the intended IPC functions. Outcome: confirm the renderer cannot access Node APIs directly, but can still save/load rooms via the whitelisted API.

### 3) Workspace MVP (Rooms + Editor + Local State)
Goal: Turn the mocked workspace into a small but real feature a non-technical user can test: create a room, write notes/code, and see it persist when reopening the app.
Agent: workspace-builder

- Room model + local storage wiring (create/list/open) [planned]
  Purpose: Status: Not done. This is the core “project management” MVP slice.
  Owner: workspace-builder
  Starting prompt: Inspect UI components under `src/components/`, hooks under `src/hooks/`, and libs under `src/lib/`. Implement a simple Room model (id, name, createdAt, updatedAt) and UI to create a room and list existing rooms on the home page. For persistence: if running in Electron, use the IPC API to store rooms; if running in browser, fall back to `localStorage`. Outcome: refresh/relaunch keeps rooms.
- Make Monaco editor state persist per room [planned]
  Purpose: Status: Not done. Keep it to a single editable document per room for MVP.
  Owner: workspace-builder
  Starting prompt: Locate where Monaco is (or should be) rendered (search for `@monaco-editor/react` usage; if missing, add it to the workspace page). Implement one editable document per room (e.g., `main.ts` content string). Persist editor content via the same persistence layer as rooms. Add a small “Saved” indicator when persistence completes. Outcome: switching rooms shows the correct content; closing and reopening restores it.
- Convert mocked timeline into a simple Activity feed [planned]
  Purpose: Status: Not done. Keep it local-only for now (room events like created, renamed, edited).
  Owner: workspace-builder
  Starting prompt: Find the mocked timeline UI in the workspace page and refactor it into a small Activity feed driven by real local events (room created, renamed, last edited). Store a small list of events per room (cap at ~100). Show newest-first with timestamps. Outcome: users see basic ‘project visibility’ even before GitHub integration.

### 4) GitHub Connection (One repo per room)
Goal: Let a user connect a GitHub repo to a room and show basic repo information inside the workspace, without building full collaboration or CI execution yet.
Agent: github-integrator

- Add GitHub connect UI + token storage (MVP-safe) [planned]
  Purpose: Status: Not done. For MVP, prioritize a working flow; document security tradeoffs clearly.
  Owner: github-integrator
  Starting prompt: Inspect docs for intent: `docs/backend-integration-v1.md`. Implement a minimal GitHub connection flow suitable for a prototype: (A) simplest path: user pastes a GitHub Personal Access Token in Settings, or (B) if OAuth is already scaffolded, complete OAuth. Store token locally (Electron: userData JSON via IPC; Browser: localStorage) and clearly label it “prototype storage”. Add a small Settings screen and a ‘Connected’ state. Outcome: app can call GitHub API successfully with the stored token.
- Repo picker: link one repo to a room [planned]
  Purpose: Status: Not done. Keep it simple: list repos, select one, save selection.
  Owner: github-integrator
  Starting prompt: After GitHub connection works, call the GitHub API to list the user’s repositories (paginate if needed, but keep UI minimal). Add a ‘Link repo’ action inside a room that lets the user pick a repo. Persist `linkedRepo` (owner/name/id) on the Room record. Outcome: each room can display its linked repo name and can change/unlink it.
- Show basic GitHub data in the room (issues + PR counts) [planned]
  Purpose: Status: Not done. Minimal visibility: counts + a short list, not full timeline sync.
  Owner: github-integrator
  Starting prompt: In a linked room, fetch and display: open issues count, open PR count, and the 5 most recently updated issues (title + number + updated time). Keep API calls lightweight. Add loading/error states. Outcome: room becomes meaningfully connected to GitHub without implementing full event streaming.
