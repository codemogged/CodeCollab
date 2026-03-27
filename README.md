# CodeBuddy

CodeBuddy is a product prototype for collaborative vibe coding.

The concept is a hybrid of:
- AI coding assistance
- friend-first collaboration
- simple project management
- GitHub-backed execution
- optional vetted expert help

## Product thesis

Most tools in this market optimize for one of three things:
- solo AI app generation
- professional developer productivity
- enterprise work coordination

CodeBuddy is aimed at the gap between them: people who want to build software together, but do not want to learn a full developer workflow before they can get started.

## MVP in this repo

This repo currently contains:
- a landing page describing the concept and market position
- a mocked collaborative workspace page
- a minimal Next.js setup ready for iteration
- product strategy documents in the `docs` folder

## Suggested near-term roadmap

1. Add GitHub OAuth and connect one repository per project room.
2. Convert the mocked timeline into live issue, branch, and pull request events.
3. Add real-time room presence and comments.
4. Add permissions for owner, friend, contributor, and vetted expert roles.
5. Add an expert marketplace with scoped task requests.

## Local run

This environment does not currently have Node.js or npm installed, so I could not run the project here.

Once Node.js is available, install dependencies and start the app with:

```bash
npm install
npm run dev
```
