# Architecture Outline

## Product surface

### Frontend
- Next.js app router web app
- role-based workspace UI
- room pages for project collaboration
- timeline, tasks, prompts, and status views

### Backend services
- authentication and GitHub OAuth
- project room service
- repo sync service
- activity summarizer
- permission service
- expert marketplace service

## Recommended stack for the actual build

### App layer
- Next.js
- TypeScript
- Tailwind CSS
- Vercel for fast iteration

### Data layer
- Postgres with Prisma or Drizzle
- Redis for transient room state and presence

### Realtime
- Liveblocks, Pusher, or Supabase Realtime for presence and comments

### GitHub integration
- GitHub App for repo-level actions
- webhook ingestion for pushes, pull requests, issue changes, and workflow status
- background jobs to summarize repo events into plain-English updates

### AI layer
- prompt orchestration service
- repo-aware summarization and planning
- task generation from natural language
- approval summaries before code lands

## Core entities
- user
- project_room
- room_member
- connected_repo
- task
- timeline_event
- expert_profile
- expert_booking
- ai_summary

## MVP event flow

1. User creates a project room from an idea.
2. The AI turns that idea into an initial task list.
3. User connects a GitHub repo.
4. Repo events are ingested through webhooks.
5. The system translates technical activity into plain-English timeline updates.
6. Friends collaborate from the room without needing to understand Git internals.

## Key implementation caution

Do not make GitHub the user interface.
Use GitHub as the execution backend while the product stays focused on clarity, explanation, and momentum.
