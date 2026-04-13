# Vibe Code with Your Friends

**A White Paper on CodeBuddy**

---

There is a problem in AI-assisted software development that nobody talks about because everyone assumes it's unsolvable. The problem is this: two people cannot use an AI coding agent on the same project at the same time without breaking things.

That sentence sounds wrong. We live in an era of real-time collaboration. You can edit a Google Doc with thirty people simultaneously. You can design in Figma while your colleague watches your cursor move. But try to build software with a friend using AI agents, and you will discover something remarkable — it doesn't work.

Here is why.

---

## I. The Context Problem

When you talk to an AI coding agent, you are not just sending messages. You are building context. Every instruction you give, every file the agent reads, every decision it makes — these accumulate into a shared understanding between you and the machine. The agent knows what you tried, what failed, what you're building toward, and why you made the choices you made.

This context is the most valuable thing in the conversation. It is also completely trapped on your computer.

If your friend wants to help, they have two options, both bad. They can remote into your machine — which means you can't use your own computer while they work. Or they can open their own agent on their own machine — which means their agent knows nothing. It hasn't seen your conversation. It doesn't know what was tried. It doesn't know what broke or why. It will suggest the same things you already rejected. It will make changes that conflict with changes you already made. It will break your code in ways that take hours to untangle, because it is working from a fundamentally different understanding of the project.

This is not a minor inconvenience. This is the central bottleneck of collaborative AI development. Two agents, same codebase, different context — the result is chaos.

CodeBuddy eliminates this problem entirely.

When two people open the same project in CodeBuddy, their agents share the same context. Not a copy. Not a summary. The same living, evolving context — every message, every decision, every file change, synchronized in real time across both machines. Your friend picks up exactly where you left off. Their agent knows everything your agent knows. They can use Claude while you use Codex. It doesn't matter. The context is identical.

This has never existed before. Not in any product, from any company, at any price.

The reason it hasn't existed is instructive. Every AI company builds collaboration as a cloud feature — something that runs on their servers, behind their paywall, under their control. They synchronize through centralized infrastructure because that's what they can charge for.

We took a different approach. We asked a simpler question: what if the computers just talked to each other?

---

## II. The Git Problem

GitHub is one of the most powerful tools ever built for software development. It provides version history, backup, collaboration, code review, and deployment — for free. It is also, for most people, essentially unusable.

The command line interface is unforgiving. The concepts are unintuitive. Staging, committing, pushing, pulling, merging, rebasing, resolving conflicts — each of these is a skill that takes time to learn and is easy to get wrong. For someone who just wants to build something with AI, git is a wall between them and a tool that would transform their workflow.

I know this because I lived it. I could have benefited enormously from using GitHub throughout my own coding experience. I never used it because it was never easy. And I am not unusual — the majority of people who write code with AI assistance today do not use version control, which means they have no backup, no history, and no way to undo catastrophic changes.

CodeBuddy makes GitHub invisible.

When you create a project, CodeBuddy initializes a repository. When your files change, CodeBuddy commits them. When you want your friend to have your latest code, it's already there — pushed automatically, pulled automatically, on a working branch that stays out of your way. You never type a git command. You never open a terminal. You never think about it.

The technology underneath is exactly the same GitHub that powers every major software project in the world. You get all of its power — version history, rollback, branching — without any of its complexity. And when you're ready, the code is sitting in a real GitHub repository that you own, that you can take anywhere.

The best tools are the ones you don't notice you're using.

---

## III. The Cost Problem

Here is something that should bother you: your laptop is a supercomputer.

A modern consumer laptop has more processing power, more memory, and more network bandwidth than the servers that ran most of the internet fifteen years ago. It is more than capable of establishing encrypted peer-to-peer connections, synchronizing state with another computer, and managing a git repository. These are not expensive operations. Your machine does harder things every time you open a web browser.

And yet, if you want to collaborate on AI-assisted coding today, you are expected to pay for cloud infrastructure. You pay for seats. You pay for sync. You pay for storage. You pay for the privilege of two computers talking to each other through a server farm in Virginia, when those two computers could just talk to each other directly.

This is not a technology problem. It is a business model.

AI companies build collaboration into their cloud because every feature that requires their servers is a feature they can charge for. The infrastructure becomes a moat. The moat justifies the valuation. The valuation demands more revenue. And so the cycle continues — more features behind more paywalls, solving problems that your own hardware solved a decade ago.

CodeBuddy uses peer-to-peer connections. Your computer talks directly to your friend's computer. The context synchronization, the state management, the real-time updates — all of it runs on hardware you already own. There is no server in between. There is no subscription. There is no company extracting rent from the space between two laptops.

This is a deliberate choice, and the reasoning is simple.

It doesn't cost anything to post a picture on Instagram. It doesn't cost anything to tweet a thought. It doesn't cost anything to send an email. These are the products that billions of people use, and they are free because their creators understood something fundamental: when you remove the barrier, everyone comes.

It shouldn't cost anything to build software with your friends.

---

## Why This Exists

I should be honest about something. The technical problems described above — shared context, invisible git, peer-to-peer sync — these are interesting engineering challenges. But they are not why I built this.

I built this because coding saved my life, and I do not know where I would be without it.

I built this because the best moments I've had as a developer were not moments of individual brilliance. They were the moments when a friend helped me see a bug I'd been staring at for hours. When someone suggested an approach I never would have considered. When we stayed up too late, failing at everything, and then the next morning a small fix made it all work.

I love the successes. I love the failures. I love the long nights where nothing goes right and the short mornings where everything clicks. And if you code, you know — it is always better with your friends.

Every feature in CodeBuddy exists to make that experience easier. Shared agent context so you can think together. Invisible git so the tools stay out of your way. Free, because the connection between two people building something they care about is not something anyone should charge for.

It comes down to one sentence.

*Vibe code with your friends.*

---

**CodeBuddy** — Local-first. Peer-to-peer. Multi-agent. Free.
