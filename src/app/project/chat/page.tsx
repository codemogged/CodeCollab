"use client";

import { Suspense, useState, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChatBubble } from "@/components";
import { buildArtifacts, conversation, ideas, projectBuildPlans, taskConversationThreads, type BuildArtifact, type Message } from "@/lib/mock-data";
import ProjectSidebar from "@/components/project-sidebar";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const statusStyle = {
  done: { label: "Done", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  building: { label: "Building", dot: "bg-violet-500", bg: "bg-violet-50", text: "text-violet-700" },
  planned: { label: "Planned", dot: "bg-ink-muted/30", bg: "bg-black/[0.04]", text: "text-ink-muted" },
};

const textLimit = 108;
type BuildDetailTab = "details" | "preview" | "code" | "files";

function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <circle cx="10" cy="10" r="7" />
      <path strokeLinecap="round" d="M3 10h14M10 3c2 2.1 3 4.5 3 7s-1 4.9-3 7c-2-2.1-3-4.5-3-7s1-4.9 3-7Z" />
    </svg>
  );
}

function DocumentIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3.5h5l3 3V16a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 16V5A1.5 1.5 0 0 1 6.5 3.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.5V7h3.5" />
    </svg>
  );
}

function CodeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 6.5-3 3.5 3 3.5M12.5 6.5l3 3.5-3 3.5M11 5 9 15" />
    </svg>
  );
}

function FolderIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 6.5A1.5 1.5 0 0 1 5 5h3l1.1 1.2c.3.2.6.3.9.3H15A1.5 1.5 0 0 1 16.5 8v6A1.5 1.5 0 0 1 15 15.5H5A1.5 1.5 0 0 1 3.5 14Z" />
    </svg>
  );
}

function MoreIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <circle cx="5" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="15" cy="10" r="1.4" />
    </svg>
  );
}

function ChevronDownIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m5.5 7.5 4.5 5 4.5-5" />
    </svg>
  );
}

function FileCodeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3.5h5l3 3V16A1.5 1.5 0 0 1 12.5 17.5h-6A1.5 1.5 0 0 1 5 16V5A1.5 1.5 0 0 1 6.5 3.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.5V7h3.5M8 10.2l-1.4 1.3L8 12.8m4-2.6 1.4 1.3-1.4 1.3" />
    </svg>
  );
}

function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path strokeLinecap="round" d="m12 12 4 4" />
    </svg>
  );
}

function SplitViewIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <rect x="3.5" y="4.5" width="13" height="11" rx="1.5" />
      <path d="M10 4.5v11" />
    </svg>
  );
}

function CopyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <rect x="7" y="7" width="8.5" height="8.5" rx="1.5" />
      <path strokeLinecap="round" d="M5.5 12.5h-1A1.5 1.5 0 0 1 3 11V4.5A1.5 1.5 0 0 1 4.5 3h6.5A1.5 1.5 0 0 1 12.5 4.5v1" />
    </svg>
  );
}

function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 3.5v7m0 0 3-3m-3 3-3-3M4 13.5v1A1.5 1.5 0 0 0 5.5 16h9A1.5 1.5 0 0 0 16 14.5v-1" />
    </svg>
  );
}

function CloseSmallIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path strokeLinecap="round" d="m6 6 8 8M14 6l-8 8" />
    </svg>
  );
}

type QuickPromptType = "summary" | "remaining" | "documentation";

type ComposerAttachment = {
  id: string;
  label: string;
  path?: string;
};

type RealProjectConversationMessage = {
  id: string;
  from: string;
  text: string;
  time: string;
  isMine?: boolean;
  isAI?: boolean;
  attachments?: string[];
  modelId?: string;
  checkpointId?: string | null;
};

function inferTaskArtifactId(taskTitle = "", subprojectTitle = "", responseText = "") {
  const haystack = `${taskTitle} ${subprojectTitle} ${responseText}`.toLowerCase();

  if (/(seo|metadata|analytics|insights)/.test(haystack)) {
    return "offer-insights";
  }

  if (/(automation|backend|server|api|workflow)/.test(haystack)) {
    return "seller-automation";
  }

  if (/(listing|offer|form|contact|pricing|lead)/.test(haystack)) {
    return "offer-flow";
  }

  if (/(product|catalog|olive oil|inventory)/.test(haystack)) {
    return "product-page";
  }

  return "homepage";
}

function extractTaskArtifactChanges(text: string) {
  return normalizeChatDisplayText(text)
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

function buildTaskArtifactFromResponse(taskContext: NonNullable<ReturnType<typeof findTaskInProjectPlan>>, responseText: string): BuildArtifact {
  const artifactId = inferTaskArtifactId(taskContext.task.title, taskContext.subproject.title, responseText);
  const baseArtifact = buildArtifacts.find((artifact) => artifact.id === artifactId) ?? buildArtifacts[0];
  const changes = extractTaskArtifactChanges(responseText);

  return {
    ...baseArtifact,
    id: artifactId,
    title: taskContext.task.title,
    description: taskContext.task.note,
    updatedAgo: "Just now",
    status: taskContext.task.status === "done" ? "done" : taskContext.task.status === "building" ? "building" : "planned",
    changes: changes.length > 0 ? changes : baseArtifact.changes,
    code: responseText,
    preview: {
      ...baseArtifact.preview,
      summary: taskContext.task.note,
      primaryActionLabel: taskContext.task.title,
    },
  };
}

function toInlineBuildMessage(message: RealProjectConversationMessage | null | undefined, buildId: string): Message | undefined {
  if (!message) {
    return undefined;
  }

  return {
    id: message.id,
    from: message.from,
    initials: message.isMine ? "CM" : "✦",
    text: message.text,
    time: message.time,
    isMine: message.isMine,
    isAI: message.isAI,
    buildId,
  };
}

function getPromptForAssistantMessage(messages: RealProjectConversationMessage[], messageId: string) {
  const responseIndex = messages.findIndex((entry) => entry.id === messageId);
  if (responseIndex <= 0) {
    return null;
  }

  for (let index = responseIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.isMine) {
      return messages[index];
    }
  }

  return null;
}

function normalizeChatDisplayText(text: string) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\s+---\s+/g, "\n\n---\n\n")
    .replace(/\s+(#{1,3}\s+)/g, "\n\n$1")
    .replace(/\s+(?=\*\*[A-Z][^*\n]{1,50}\*\*:)/g, "\n")
    .trim();
}

function renderInlineChatFormatting(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return <strong key={`seg-${index}`} className="font-semibold">{segment.slice(2, -2)}</strong>;
    }

    return <span key={`seg-${index}`}>{segment}</span>;
  });
}

function renderChatMessageBody(text: string, tone: "user" | "assistant") {
  const normalized = normalizeChatDisplayText(text);
  if (!normalized) {
    return null;
  }

  const blocks = normalized.split(/\n{2,}/).filter(Boolean);

  return blocks.map((block, index) => {
    const lines = block.split("\n").filter(Boolean);
    const key = `block-${index}`;

    if (block.trim() === "---") {
      return <div key={key} className="my-3 h-px bg-black/10 dark:bg-white/10" />;
    }

    const headingMatch = block.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      const headingClass = level === 1
        ? "text-[17px] font-semibold"
        : level === 2
          ? "text-[16px] font-semibold"
          : "text-[15px] font-semibold";
      return <p key={key} className={`${headingClass} ${tone === "user" ? "text-white/98" : "theme-fg"}`}>{renderInlineChatFormatting(title)}</p>;
    }

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return (
        <ul key={key} className={`ml-5 list-disc space-y-1 ${tone === "user" ? "text-white/96" : "theme-fg"}`}>
          {lines.map((line, lineIndex) => <li key={`${key}-${lineIndex}`}>{renderInlineChatFormatting(line.replace(/^[-*]\s+/, ""))}</li>)}
        </ul>
      );
    }

    return (
      <p key={key} className={`whitespace-pre-wrap text-[15px] leading-[1.72] ${tone === "user" ? "text-white/96" : "theme-fg"}`}>
        {renderInlineChatFormatting(block)}
      </p>
    );
  });
}

function buildWorkingLabel(frame: number, base = "Working") {
  return `${base}${".".repeat((frame % 3) + 1)}`;
}

type ModelCatalogEntry = {
  id: string;
  label: string;
  provider: string;
  contextWindow: string;
  maxTokens: number;
  usage: string;
  group: "featured" | "other";
  warning?: string;
};

const quickPromptMeta: Record<QuickPromptType, { label: string; shortLabel: string }> = {
  summary: { label: "Summarize chat", shortLabel: "Summary" },
  remaining: { label: "What is left to build", shortLabel: "Remaining" },
  documentation: { label: "Create documentation", shortLabel: "Docs" },
};

const copilotModelCatalog: ModelCatalogEntry[] = [
  { id: "auto", label: "Auto", provider: "Best available", contextWindow: "Auto", maxTokens: 200000, usage: "10% discount", group: "featured" },
  { id: "claude-opus-4.6", label: "Claude Opus 4.6", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "3x", group: "featured" },
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "featured" },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "featured" },
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "0.33x", group: "other" },
  { id: "claude-opus-4.5", label: "Claude Opus 4.5", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "3x", group: "other" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "other" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "other" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", contextWindow: "1M", maxTokens: 1000000, usage: "1x", group: "other" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", provider: "Google", contextWindow: "1M", maxTokens: 1000000, usage: "0.33x", group: "other" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)", provider: "Google", contextWindow: "1M", maxTokens: 1000000, usage: "1x", group: "other", warning: "Preview model" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", provider: "Google", contextWindow: "1M", maxTokens: 1000000, usage: "1x", group: "other", warning: "Preview model" },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "other" },
  { id: "gpt-5.1", label: "GPT-5.1", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "other" },
  { id: "o3", label: "o3", provider: "OpenAI", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "other" },
];

function getModelCatalogEntry(modelId: string) {
  return copilotModelCatalog.find((entry) => entry.id === modelId) ?? copilotModelCatalog.find((entry) => entry.id === "gpt-5.4") ?? copilotModelCatalog[0];
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function formatTokenCount(tokens: number) {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${tokens}`;
}

function mergeComposerAttachments(current: ComposerAttachment[], nextFiles: File[]) {
  const nextAttachments = nextFiles.map((file) => {
    const fileWithPath = file as File & { path?: string };
    const normalizedPath = typeof fileWithPath.path === "string" && fileWithPath.path.trim() ? fileWithPath.path.trim() : undefined;
    const label = normalizedPath ? normalizedPath.split(/[/\\]/).pop() || normalizedPath : file.name;

    return {
      id: normalizedPath || `${file.name}-${file.size}-${file.lastModified}`,
      label,
      path: normalizedPath,
    };
  });

  const merged = [...current];
  nextAttachments.forEach((attachment) => {
    if (!merged.some((entry) => entry.id === attachment.id)) {
      merged.push(attachment);
    }
  });

  return merged;
}

function buildPromptWithAttachments(prompt: string, attachments: ComposerAttachment[]) {
  if (attachments.length === 0) {
    return prompt.trim();
  }

  return [
    prompt.trim(),
    "Attached files:",
    ...attachments.map((attachment) => `- ${attachment.path || attachment.label}`),
  ].join("\n");
}

function toComposerAttachments(attachments: string[] = []) {
  return attachments.map((attachment) => ({
    id: attachment,
    label: attachment.split(/[/\\]/).pop() || attachment,
    path: attachment,
  }));
}

function findTaskInProjectPlan(plan: RealProjectChatProps["activeProject"]["dashboard"]["plan"], taskId: string) {
  if (!plan) {
    return null;
  }

  for (const subproject of plan.subprojects) {
    const task = subproject.tasks.find((entry) => entry.id === taskId);
    if (task) {
      return { subproject, task };
    }
  }

  return null;
}

function buildRealProjectManagerMarkdown(project: RealProjectChatProps["activeProject"]) {
  const plan = project.dashboard.plan;
  const lines = [
    `# ${project.name} Project Manager Context`,
    "",
    `Description: ${project.description || "No project description provided."}`,
    `Repository: ${project.repoPath}`,
    "",
    "## System Prompt",
    project.dashboard.systemPromptMarkdown,
  ];

  if (plan) {
    lines.push("", "## Current Plan", plan.summary, "", `Next action: ${plan.nextAction}`, "", "## Tasks");
    plan.subprojects.forEach((subproject) => {
      lines.push(`### ${subproject.title}`);
      lines.push(subproject.goal);
      subproject.tasks.forEach((task) => {
        lines.push(`- ${task.title}: ${task.note}`);
      });
      lines.push("");
    });
  }

  return lines.join("\n").trim();
}

function buildTaskPreviewMarkdown(project: RealProjectChatProps["activeProject"], taskContext: NonNullable<ReturnType<typeof findTaskInProjectPlan>>, thread?: RealProjectChatProps["activeProject"]["dashboard"]["taskThreads"][number] | null) {
  const task = taskContext.task;
  const subproject = taskContext.subproject;

  return [
    `# ${task.title} Task Agent Context`,
    "",
    `Project: ${project.name}`,
    `Subproject: ${subproject.title}`,
    `Task purpose: ${thread?.purpose || task.note}`,
    `Owner: ${task.owner}`,
    `Reviewer: ${task.reviewer || "Cameron"}`,
    `Due date: ${task.dueDate}`,
    "",
    "## Starting Prompt",
    task.startingPrompt,
    "",
    "## System Prompt",
    thread?.systemPromptMarkdown || project.dashboard.systemPromptMarkdown,
  ].join("\n").trim();
}

function getBuildConversation(messages: Message[], buildId: string) {
  const responseIndex = messages.findIndex((message) => message.buildId === buildId);

  if (responseIndex === -1) {
    return { prompt: undefined, response: undefined };
  }

  const response = messages[responseIndex];
  const prompt = [...messages.slice(0, responseIndex)]
    .reverse()
    .find((message) => !message.isAI);

  return { prompt, response };
}

/* ─── task context helpers ─── */

function findTaskById(taskId: string) {
  for (const plan of projectBuildPlans) {
    for (const sp of plan.subprojects) {
      const task = sp.tasks.find((t) => t.id === taskId);
      if (task) return { task, subproject: sp, plan };
    }
  }
  return null;
}

function buildProjectMarkdown(planId: string) {
  const plan = projectBuildPlans.find((p) => p.id === planId) ?? projectBuildPlans[0];
  if (!plan) return "";

  const idea = ideas.find((i) => i.id === plan.projectId);
  let md = `# ${idea?.name ?? "Project"}\n\n`;
  md += `${plan.summary}\n\n`;
  md += `## Subprojects\n\n`;
  for (const sp of plan.subprojects) {
    md += `### ${sp.title}\n`;
    md += `**Goal:** ${sp.goal}\n\n`;
    for (const t of sp.tasks) {
      const check = t.status === "done" ? "x" : " ";
      md += `- [${check}] ${t.title} (${t.status})\n`;
    }
    md += `\n`;
  }
  return md;
}

function buildConversationTranscript(messages: Message[]) {
  return messages
    .map((message) => `${message.from} (${message.time}): ${message.text}`)
    .join("\n\n");
}

function buildQuickPrompt({
  type,
  messages,
  projectMarkdown,
  taskTitle,
  threadTitle,
}: {
  type: QuickPromptType;
  messages: Message[];
  projectMarkdown: string;
  taskTitle?: string;
  threadTitle?: string;
}) {
  const transcript = buildConversationTranscript(messages);
  const subject = threadTitle ?? taskTitle ?? "this chat";
  const request = type === "summary"
    ? "Summarize this full chat from start to finish. Include the goal, decisions made, code or UI changes discussed, unresolved questions, blockers, and any important context someone new would need before continuing."
    : type === "remaining"
      ? "Review this full chat and tell me what is still left to build. Break the remaining work into concrete steps, call out unfinished screens or features, note any missing edge cases or polish, and separate true blockers from nice-to-have follow-up work."
      : "Turn this chat into clean project documentation. Write a structured handoff with a short overview, completed work, architecture or UI decisions, important implementation details, open questions, and clear next steps so another person could pick it up fast.";

  return [
    `You are continuing work on ${subject}.`,
    taskTitle ? `Primary task: ${taskTitle}` : null,
    threadTitle ? `Thread: ${threadTitle}` : null,
    projectMarkdown ? `Project brief:\n${projectMarkdown}` : null,
    `Conversation transcript:\n${transcript}`,
    request,
  ].filter(Boolean).join("\n\n");
}

function getPreviewContent(buildId: string) {
  if (buildId === "product-page") {
    return {
      eyebrow: "Product preview",
      title: "Jordan 1 Retro High",
      subtitle: "Big photos, clear pricing, and one confident primary action.",
      accent: "from-stone-900 to-neutral-800",
      cards: ["Photo gallery", "$280 price block", "Offer button"],
    };
  }

  if (buildId === "offer-flow") {
    return {
      eyebrow: "Offer flow",
      title: "Send an offer in one step",
      subtitle: "The buyer sees one calm sheet. The seller gets a clear accept or counter choice.",
      accent: "from-violet-600 to-cyan-500",
      cards: ["Offer sheet", "Counter option", "Status update"],
    };
  }

  return {
    eyebrow: "Homepage preview",
    title: "Featured sneakers first",
    subtitle: "A warm entry screen with a hero, featured drop, and a fast browse grid.",
    accent: "from-neutral-900 to-stone-700",
    cards: ["Hero section", "Featured card", "Browse grid"],
  };
}

function getLocalPreviewUrl(buildId: string) {
  const urls: Record<string, string> = {
    homepage: "http://localhost:3000",
    "product-page": "http://localhost:3000/product/1",
    "offer-flow": "http://localhost:3000/offers",
    "seller-automation": "http://localhost:4000",
    "offer-insights": "http://localhost:3000/insights",
  };

  return urls[buildId] ?? "http://localhost:3000";
}

function getGeneratedFiles(artifact: BuildArtifact) {
  const generatedFiles: Record<string, Array<{ path: string; note: string }>> = {
    homepage: [
      { path: "src/app/page.tsx", note: "Homepage shell" },
      { path: "src/components/hero.tsx", note: "Hero section" },
      { path: "src/components/listing-grid.tsx", note: "Browse grid" },
    ],
    "product-page": [
      { path: "src/app/product/[id]/page.tsx", note: "Product page route" },
      { path: "src/components/photo-gallery.tsx", note: "Gallery" },
      { path: "src/components/offer-button.tsx", note: "Primary action" },
    ],
    "offer-flow": [
      { path: "src/components/offer-sheet.tsx", note: "Offer form" },
      { path: "src/components/seller-response-card.tsx", note: "Seller response" },
      { path: "src/lib/offer-state.ts", note: "Flow state" },
    ],
    "seller-automation": [
      { path: "src/lib/seller-automation.ts", note: "Automation handler" },
      { path: "src/lib/risk-profile.ts", note: "Risk scoring" },
      { path: "src/lib/escalation-rules.ts", note: "Fallback rules" },
    ],
    "offer-insights": [
      { path: "src/lib/offer-insights.ts", note: "Snapshot builder" },
      { path: "src/components/insights-table.tsx", note: "Data table" },
      { path: "src/lib/risk-signals.ts", note: "Signal mapping" },
    ],
  };

  return generatedFiles[artifact.id] ?? [{ path: artifact.preview.codeFileName ?? `${artifact.id}.tsx`, note: "Main output" }];
}

type GeneratedFileEntry = { path: string; note: string };

type FileTreeNode = {
  name: string;
  path: string;
  kind: "folder" | "file";
  note?: string;
  children?: FileTreeNode[];
};

function buildFileTree(files: GeneratedFileEntry[]) {
  const root: Array<FileTreeNode & { childMap?: Map<string, FileTreeNode & { childMap?: Map<string, FileTreeNode> }> }> = [];
  const rootMap = new Map<string, FileTreeNode & { childMap?: Map<string, FileTreeNode> }>();

  files.forEach((file) => {
    const parts = file.path.split("/");
    let currentNodes = root;
    let currentMap = rootMap;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      let node = currentMap.get(currentPath) as (FileTreeNode & { childMap?: Map<string, FileTreeNode> }) | undefined;

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          kind: isFile ? "file" : "folder",
          note: isFile ? file.note : undefined,
          children: isFile ? undefined : [],
          childMap: isFile ? undefined : new Map(),
        };
        currentMap.set(currentPath, node);
        currentNodes.push(node);
      }

      if (!isFile) {
        currentNodes = node.children as Array<FileTreeNode & { childMap?: Map<string, FileTreeNode> }>;
        currentMap = node.childMap as Map<string, FileTreeNode & { childMap?: Map<string, FileTreeNode> }>;
      }
    });
  });

  const stripMaps = (nodes: Array<FileTreeNode & { childMap?: Map<string, FileTreeNode> }>): FileTreeNode[] => {
    return nodes.map((node) => ({
      name: node.name,
      path: node.path,
      kind: node.kind,
      note: node.note,
      children: node.children ? stripMaps(node.children as Array<FileTreeNode & { childMap?: Map<string, FileTreeNode> }>) : undefined,
    }));
  };

  return stripMaps(root);
}

function getGeneratedFileContent(artifact: BuildArtifact, filePath: string) {
  if (filePath === artifact.preview.codeFileName || filePath.endsWith(`${artifact.id}.tsx`) || filePath.endsWith(`${artifact.id}.ts`)) {
    return artifact.code;
  }

  const fileContentMap: Record<string, string> = {
    "src/components/hero.tsx": `export function Hero() {
  return (
    <section>
      <h1>Featured drop</h1>
      <p>Editorial hero section</p>
    </section>
  );
}`,
    "src/components/listing-grid.tsx": `export function ListingGrid() {
  return <div>Listing grid</div>;
}`,
    "src/components/photo-gallery.tsx": `export function PhotoGallery() {
  return <div>Photo gallery</div>;
}`,
    "src/components/offer-button.tsx": `export function OfferButton() {
  return <button>Make offer</button>;
}`,
    "src/components/offer-sheet.tsx": `export function OfferSheet() {
  return <div>Offer sheet</div>;
}`,
    "src/components/seller-response-card.tsx": `export function SellerResponseCard() {
  return <div>Seller response</div>;
}`,
    "src/lib/offer-state.ts": `export const offerState = {
  current: "active",
};`,
    "src/lib/seller-automation.ts": artifact.code,
    "src/lib/risk-profile.ts": `export function scoreOffer() {
  return { requiresReview: false };
}`,
    "src/lib/escalation-rules.ts": `export const escalationRules = ["payment-mismatch", "duplicate-risk"];`,
    "src/lib/offer-insights.ts": artifact.code,
    "src/components/insights-table.tsx": `export function InsightsTable() {
  return <div>Insights table</div>;
}`,
    "src/lib/risk-signals.ts": `export const riskSignals = ["price-delta", "payment-match"];`,
  };

  return fileContentMap[filePath] ?? `// ${filePath}\n\nexport default function Placeholder() {\n  return null;\n}`;
}

function buildEditableFiles(artifact: BuildArtifact, files: GeneratedFileEntry[]) {
  return Object.fromEntries(files.map((file) => [file.path, getGeneratedFileContent(artifact, file.path)]));
}

function getEditorLanguage(filePath: string) {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".ts")) {
    return "typescript";
  }

  if (filePath.endsWith(".jsx") || filePath.endsWith(".js")) {
    return "javascript";
  }

  if (filePath.endsWith(".json")) {
    return "json";
  }

  if (filePath.endsWith(".css")) {
    return "css";
  }

  if (filePath.endsWith(".md")) {
    return "markdown";
  }

  if (filePath.endsWith(".html")) {
    return "html";
  }

  return "plaintext";
}

function TruncatedMessage({
  message,
  expanded,
  onToggle,
}: {
  message?: Message;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!message) {
    return <p className="text-[13px] leading-relaxed text-ink-muted/60">No message linked yet.</p>;
  }

  const shouldTruncate = message.text.length > textLimit;
  const content = shouldTruncate && !expanded
    ? `${message.text.slice(0, textLimit).trimEnd()}...`
    : message.text;

  return (
    <>
      <p className="text-[13px] leading-[1.65] theme-fg">{content}</p>
      {shouldTruncate && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-3 text-[12px] font-medium theme-muted transition hover:text-[var(--fg)]"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </>
  );
}

function InlineBuildPanel({
  artifact,
  activeTab,
  onTabChange,
  prompt,
  response,
  expandedPrompt,
  expandedResponse,
  onTogglePrompt,
  onToggleResponse,
  onClose,
  previewStatusLabel,
  variant = "inline",
}: {
  artifact: BuildArtifact;
  activeTab: BuildDetailTab;
  onTabChange: (tab: BuildDetailTab) => void;
  prompt?: Message;
  response?: Message;
  expandedPrompt: boolean;
  expandedResponse: boolean;
  onTogglePrompt: () => void;
  onToggleResponse: () => void;
  onClose: () => void;
  previewStatusLabel?: string;
  variant?: "inline" | "sidebar";
}) {
  const previewContent = getPreviewContent(artifact.id);
  const localPreviewUrl = getLocalPreviewUrl(artifact.id);
  const generatedFiles = getGeneratedFiles(artifact);
  const summary = artifact.changes.join(" • ");
  const requesterName = prompt?.from ?? "Someone";
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState(generatedFiles[0]?.path ?? artifact.preview.codeFileName ?? `${artifact.id}.tsx`);
  const [editableFiles, setEditableFiles] = useState<Record<string, string>>(() => buildEditableFiles(artifact, generatedFiles));
  const isSidebar = variant === "sidebar";
  const activeFileContent = editableFiles[selectedFilePath] ?? getGeneratedFileContent(artifact, selectedFilePath);
  const rawAiOutput = response?.text ?? "No AI output available yet.";
  const fileTree = buildFileTree(generatedFiles);
  const panelTabs: Array<{ id: BuildDetailTab; label: string; icon: ReactNode; compact: boolean }> = [
    { id: "preview", label: "Preview", icon: <GlobeIcon />, compact: true },
    { id: "details", label: "Details", icon: <DocumentIcon />, compact: true },
    { id: "code", label: "Code", icon: <CodeIcon />, compact: false },
    { id: "files", label: "Files", icon: <FolderIcon />, compact: true },
  ];
  const editorTabLabel = selectedFilePath;
  const editorLanguage = getEditorLanguage(selectedFilePath);

  const renderExplorerNodes = (nodes: FileTreeNode[], depth = 0): ReactNode => {
    return nodes.map((node) => {
      if (node.kind === "folder") {
        return (
          <div key={node.path}>
            <div
              className="flex items-center gap-2 px-2 py-1.5 text-[12px] font-medium text-white/82"
              style={{ paddingLeft: `${depth * 16 + 10}px` }}
            >
              <ChevronDownIcon className="h-3.5 w-3.5 text-white/34" />
              <FolderIcon className="h-3.5 w-3.5 text-white/48" />
              <span>{node.name}</span>
            </div>
            {node.children ? renderExplorerNodes(node.children, depth + 1) : null}
          </div>
        );
      }

      const active = selectedFilePath === node.path;

      return (
        <button
          key={node.path}
          type="button"
          onClick={() => setSelectedFilePath(node.path)}
          className={`flex w-full items-center gap-2 py-1.5 pr-2 text-left text-[12px] transition ${
            active ? "bg-[#171c25] text-white" : "text-white/72 hover:bg-white/[0.03] hover:text-white"
          }`}
          style={{ paddingLeft: `${depth * 16 + 31}px` }}
        >
          <FileCodeIcon className="h-3.5 w-3.5 shrink-0 text-white/34" />
          <span className="truncate">{node.name}</span>
        </button>
      );
    });
  };

  useEffect(() => {
    setEditableFiles(buildEditableFiles(artifact, generatedFiles));
    setSelectedFilePath(generatedFiles[0]?.path ?? artifact.preview.codeFileName ?? `${artifact.id}.tsx`);
  }, [artifact.id]);

  const handlePanelClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isSidebar) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest('[data-panel-interactive="true"]')) {
      return;
    }

    onClose();
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeFileContent);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      setCopiedCode(false);
    }
  };

  const handleDownloadCode = () => {
    const blob = new Blob([activeFileContent], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = selectedFilePath.split("/").pop() ?? "code.tsx";
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleEditorChange = (value?: string) => {
    setEditableFiles((current) => ({
      ...current,
      [selectedFilePath]: value ?? "",
    }));
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(localPreviewUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1600);
    } catch {
      setCopiedUrl(false);
    }
  };

  return (
    <div
      onClick={handlePanelClick}
      className={`app-surface overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.06)] transition dark:bg-[#1a1c20] dark:shadow-[0_24px_64px_rgba(0,0,0,0.24)] ${
        isSidebar ? "h-full rounded-none border-0" : "ml-11 rounded-[1.6rem]"
      }`}
    >
      <div className={`border-b border-white/[0.06] px-3 py-2.5 ${
        isSidebar ? "sticky top-0 z-10 bg-[#17191d]/96 backdrop-blur-xl" : "bg-[#17191d]"
      }`}>
        <div className="flex items-center justify-between gap-3 overflow-x-auto">
          <div data-panel-interactive="true" className="flex min-w-max items-center gap-2">
            {panelTabs.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`inline-flex h-9 items-center justify-center rounded-[10px] border text-[13px] font-semibold transition ${
                    isActive
                      ? "border-[#2e6cf6] bg-[#0f1629] px-4 text-[#69a0ff] shadow-[inset_0_0_0_1px_rgba(84,145,255,0.25)]"
                      : tab.compact
                        ? "w-9 border-white/[0.12] bg-[#1d2025] text-white/78 hover:border-white/[0.22] hover:bg-[#23262c] hover:text-white"
                        : "border-white/[0.12] bg-[#1d2025] px-4 text-white/78 hover:border-white/[0.22] hover:bg-[#23262c] hover:text-white"
                  }`}
                  aria-label={tab.label}
                  title={tab.label}
                >
                  <span className={`inline-flex items-center ${tab.compact ? "justify-center" : "gap-2"}`}>
                    {tab.icon}
                    {(!tab.compact || isActive) && <span>{tab.label}</span>}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.12] bg-[#1d2025] text-white/78 transition hover:border-white/[0.22] hover:bg-[#23262c] hover:text-white"
              aria-label="More options"
              title="More options"
            >
              <MoreIcon />
            </button>
          </div>

          <div data-panel-interactive="true" className="flex min-w-max items-center gap-2 pl-3">
            <span className="text-[11px] font-medium text-white/46">{statusStyle[artifact.status].label}</span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-white/[0.08] bg-transparent px-3 text-[12px] font-semibold text-white/54 transition hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-white/82"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {activeTab === "details" && (
        <div className="h-[calc(100vh-9rem)] bg-[#111317]">
          <div data-panel-interactive="true" className="flex h-full flex-col overflow-hidden bg-[#111317]">
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#14171b] px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Raw AI output</p>
                <p className="mt-1 text-[12px] text-white/56">{artifact.title}</p>
              </div>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/72 transition hover:bg-white/[0.08] hover:text-white"
              >
                {copiedUrl ? "Copied" : "Copy localhost"}
              </button>
            </div>
            <pre className="custom-scroll flex-1 overflow-auto bg-[#0f1115] px-5 py-5 text-[12px] leading-7 text-[#d6def0] whitespace-pre-wrap">
              <code>{rawAiOutput}</code>
            </pre>
          </div>
        </div>
      )}

      {activeTab === "preview" && (
        <div className="h-[calc(100vh-9rem)] bg-[#0d0f12]">
          <div data-panel-interactive="true" className="flex h-full flex-col overflow-hidden bg-[#0d0f12]">
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#14171b] px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/12" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/12" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/12" />
              </div>
              <div className="mx-auto w-full max-w-[320px] rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 text-center text-[11px] font-medium text-white/66">
                {localPreviewUrl}
              </div>
              <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/72">
                {previewStatusLabel || "Preview"}
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scroll bg-[#0b0d10] p-0">
              {localPreviewUrl.startsWith("http://localhost") ? (
                <div className="relative h-full min-h-full bg-white">
                  <iframe title={`${artifact.title} preview`} src={localPreviewUrl} className="h-full min-h-[540px] w-full border-0 bg-white" />
                  {previewStatusLabel && previewStatusLabel !== "Preview server ready" ? (
                    <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-[#111317]/82 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)]">
                      {previewStatusLabel}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={`min-h-full bg-gradient-to-br ${previewContent.accent} px-8 py-10 text-white`}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/52">{previewContent.eyebrow}</p>
                  <h4 className="mt-6 display-font text-[clamp(3.4rem,8vw,6.2rem)] font-semibold leading-[0.92] tracking-tight">{previewContent.title}</h4>
                  <p className="mt-6 max-w-[42rem] text-[18px] leading-relaxed text-white/72">{previewContent.subtitle}</p>
                  <div className="mt-10 grid gap-4 xl:grid-cols-3">
                    {previewContent.cards.map((card) => (
                      <div key={card} className="rounded-[1.3rem] border border-white/10 bg-white/8 px-4 py-5 text-[13px] font-semibold backdrop-blur-sm">
                        {card}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "code" && (
        <div className="h-[calc(100vh-9rem)] bg-[#111317]">
          <div data-panel-interactive="true" className="grid h-full grid-cols-[288px_minmax(0,1fr)] overflow-hidden border-t border-white/[0.04]">
            <div className="border-r border-white/[0.06] bg-[#17191d]">
              <div className="border-b border-white/[0.06] px-3 py-3">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" />
                  <input
                    type="text"
                    readOnly
                    placeholder="Search code"
                    className="w-full rounded-[8px] border border-white/[0.08] bg-[#1c1f24] py-2 pl-10 pr-3 text-[12px] text-white/54 outline-none placeholder:text-white/34"
                  />
                </div>
              </div>
              <div className="custom-scroll h-[calc(100%-65px)] overflow-y-auto px-2 py-2">
                <div className="space-y-1">{renderExplorerNodes(fileTree)}</div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col bg-[#1a1c20]">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#1b1d21] px-3 pt-2">
                <div className="flex min-w-0 items-end">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-t-[10px] border border-b-0 border-white/[0.08] bg-[#202227] px-4 py-2 text-white/82">
                    <FileCodeIcon className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    <span className="truncate text-[12px] font-medium">{editorTabLabel}</span>
                    <CloseSmallIcon className="h-3.5 w-3.5 shrink-0 text-white/28" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/[0.08] bg-[#202227] text-white/64 transition hover:border-white/[0.14] hover:text-white"
                    aria-label="Copy code"
                    title={copiedCode ? "Copied" : "Copy code"}
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/[0.08] bg-[#202227] text-white/64 transition hover:border-white/[0.14] hover:text-white"
                    aria-label="Split view"
                    title="Split view"
                  >
                    <SplitViewIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCode}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-[10px] bg-white px-3.5 text-[12px] font-semibold text-[#1d2025] transition hover:bg-white/90"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden bg-[#1e2025]">
                <MonacoEditor
                  key={selectedFilePath}
                  path={selectedFilePath}
                  language={editorLanguage}
                  theme="vs-dark"
                  value={activeFileContent}
                  onChange={handleEditorChange}
                  options={{
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
                    lineHeight: 24,
                    lineNumbers: "on",
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    renderLineHighlight: "line",
                    padding: { top: 16, bottom: 16 },
                    wordWrap: "off",
                    overviewRulerBorder: false,
                    folding: true,
                    glyphMargin: false,
                    tabSize: 2,
                    insertSpaces: true,
                    smoothScrolling: true,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "files" && (
        <div className="space-y-4 bg-[#111317] px-5 py-5 sm:px-6">
          <div className="rounded-[1.2rem] border border-white/[0.06] bg-[#14171b] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">Generated by AI</p>
            <p className="mt-2 text-[13px] text-white/58">These are the files created for this build in chat.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {generatedFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                data-panel-interactive="true"
                onClick={() => {
                  setSelectedFilePath(file.path);
                  onTabChange("code");
                }}
                className="rounded-[1.15rem] border border-white/[0.06] bg-[#14171b] p-4 text-left text-white transition hover:border-white/[0.12] hover:bg-[#191c22]"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/34">Generated file</p>
                <p className="mt-2 text-[14px] font-semibold text-white/92">{file.path}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-white/52">{file.note}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectChatPageContent() {
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task");
  const askParam = searchParams.get("ask");
  const threadParam = searchParams.get("thread");
  const taskContext = (taskParam || askParam) ? findTaskById(taskParam || askParam || "") : null;
  const threadContext = threadParam
    ? taskConversationThreads.find((thread) => thread.id === threadParam && (!taskParam || thread.taskId === taskParam)) ?? null
    : null;
  const projectMd = taskContext ? buildProjectMarkdown(taskContext.plan.id) : "";
  const isAskMode = !!askParam;
  const isTaskStartMode = !!taskParam && !threadContext && !isAskMode;
  const activeConversation = threadContext ? threadContext.messages : isTaskStartMode || isAskMode ? [] : conversation;

  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<BuildDetailTab>("details");
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  const [expandedResponse, setExpandedResponse] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [activeQuickPrompt, setActiveQuickPrompt] = useState<QuickPromptType | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [showPromptMenu, setShowPromptMenu] = useState(false);
  const [showProjectBrief, setShowProjectBrief] = useState(!!taskContext && !threadContext);
  const [buildPaneWidth, setBuildPaneWidth] = useState(46);
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [hasDesktopApi, setHasDesktopApi] = useState(false);
  const [desktopRepoPath, setDesktopRepoPath] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("gpt-5.2");
  const [desktopToolsLoading, setDesktopToolsLoading] = useState(false);
  const [desktopToolsError, setDesktopToolsError] = useState<string | null>(null);
  const [copilotReady, setCopilotReady] = useState(false);
  const [isCopilotRunning, setIsCopilotRunning] = useState(false);
  const [pendingCopilotLaunch, setPendingCopilotLaunch] = useState(false);
  const [copilotProcessId, setCopilotProcessId] = useState<string | null>(null);
  const [copilotPrompt, setCopilotPrompt] = useState<string | null>(null);
  const [copilotOutput, setCopilotOutput] = useState("");
  const [copilotExitCode, setCopilotExitCode] = useState<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptMenuRef = useRef<HTMLDivElement | null>(null);

  const syncComposerHeight = (textarea: HTMLTextAreaElement) => {
    const computedLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 18;
    const maxHeight = computedLineHeight * 15;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  /* preload chat composer based on entry mode */
  useEffect(() => {
    if (isAskMode && taskContext) {
      setComposerText(`I need more context on the task "${taskContext.task.title}". What exactly should I build, and what are the key requirements?`);
      setActiveQuickPrompt(null);
    } else if (isTaskStartMode && taskContext?.task.startingPrompt) {
      setComposerText(taskContext.task.startingPrompt);
      setActiveQuickPrompt(null);
    } else {
      setComposerText("");
      setActiveQuickPrompt(null);
    }
  }, [isAskMode, isTaskStartMode, taskContext?.task.startingPrompt, taskContext?.task.title, threadParam]);

  useEffect(() => {
    if (!composerRef.current) {
      return;
    }

    syncComposerHeight(composerRef.current);
  }, [composerText]);

  useEffect(() => {
    setShowProjectBrief(!!taskContext && !threadContext);
  }, [taskContext, threadContext]);

  useEffect(() => {
    if (!showPromptMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
      const target = event.target as Node;

      if (promptMenuRef.current?.contains(target)) {
        return;
      }

      setShowPromptMenu(false);
    };

    window.addEventListener("mousedown", handlePointerDown);

    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showPromptMenu]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktopLayout = () => setIsDesktopLayout(mediaQuery.matches);

    syncDesktopLayout();
    mediaQuery.addEventListener("change", syncDesktopLayout);

    return () => mediaQuery.removeEventListener("change", syncDesktopLayout);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const desktopApiAvailable = Boolean(window.electronAPI?.tools && window.electronAPI?.settings && window.electronAPI?.process);
    setHasDesktopApi(desktopApiAvailable);

    if (!desktopApiAvailable) {
      return;
    }

    let cancelled = false;

    const loadDesktopWorkspace = async () => {
      try {
        setDesktopToolsLoading(true);
        setDesktopToolsError(null);

        const [settings, toolStatuses] = await Promise.all([
          window.electronAPI!.settings.get(),
          window.electronAPI!.tools.listStatus(),
        ]);

        if (cancelled) {
          return;
        }

        setDesktopRepoPath(settings.recentRepositories[0] ?? settings.workspaceRoots[0] ?? null);
        setSelectedModel(settings.projectDefaults?.copilotModel ?? "gpt-5.2");
        setCopilotReady(Boolean(toolStatuses.find((tool) => tool.id === "githubCopilotCli")?.available));
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to load desktop tool status.";
        setDesktopToolsError(message);
      } finally {
        if (!cancelled) {
          setDesktopToolsLoading(false);
        }
      }
    };

    void loadDesktopWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasDesktopApi || !window.electronAPI?.process) {
      return;
    }

    const stopStarted = window.electronAPI.process.onStarted((event) => {
      if (pendingCopilotLaunch && event.command?.includes("copilot")) {
        setCopilotProcessId(event.processId);
        setPendingCopilotLaunch(false);
      }
    });

    const stopOutput = window.electronAPI.process.onOutput((event) => {
      if (event.processId === copilotProcessId) {
        setCopilotOutput((current) => `${current}${event.chunk}`);
      }
    });

    const stopCompleted = window.electronAPI.process.onCompleted((event) => {
      if (event.processId === copilotProcessId) {
        setIsCopilotRunning(false);
        setCopilotExitCode(event.exitCode ?? null);
      }
    });

    const stopError = window.electronAPI.process.onError((event) => {
      if (event.processId === copilotProcessId) {
        setIsCopilotRunning(false);
        setDesktopToolsError(event.message ?? "GitHub Copilot CLI failed.");
      }
    });

    const stopCancelled = window.electronAPI.process.onCancelled((event) => {
      if (event.processId === copilotProcessId) {
        setIsCopilotRunning(false);
        setDesktopToolsError("GitHub Copilot CLI run was cancelled.");
      }
    });

    const stopTimeout = window.electronAPI.process.onTimeout((event) => {
      if (event.processId === copilotProcessId) {
        setIsCopilotRunning(false);
        setDesktopToolsError(`GitHub Copilot CLI timed out after ${event.timeoutMs ?? 0}ms.`);
      }
    });

    return () => {
      stopStarted();
      stopOutput();
      stopCompleted();
      stopError();
      stopCancelled();
      stopTimeout();
    };
  }, [copilotProcessId, hasDesktopApi, pendingCopilotLaunch]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handlePointerMove = (event: globalThis.MouseEvent) => {
      const container = splitContainerRef.current;

      if (!container) {
        return;
      }

      const bounds = container.getBoundingClientRect();
      const leftWidth = event.clientX - bounds.left;
      const nextRightWidth = ((bounds.width - leftWidth) / bounds.width) * 100;

      if (nextRightWidth <= 12) {
        setSelectedBuildId(null);
        setIsResizing(false);
        return;
      }

      setBuildPaneWidth(Math.min(76, Math.max(24, nextRightWidth)));
    };

    const handlePointerUp = () => setIsResizing(false);

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [isDesktopLayout, isResizing]);

  const hasConversation = activeConversation.length > 0;
  const selectedBuild = selectedBuildId
    ? buildArtifacts.find((artifact) => artifact.id === selectedBuildId) ?? null
    : null;
  const buildThread = selectedBuild ? getBuildConversation(activeConversation, selectedBuild.id) : { prompt: undefined, response: undefined };
  const showFooterBuildState = Boolean(selectedBuild && selectedBuild.status === "building");
  const showDesktopBuildPane = Boolean(selectedBuild && isDesktopLayout);
  const isTightComposer = showDesktopBuildPane && buildPaneWidth >= 52;
  const chatShellClasses = showDesktopBuildPane
    ? "max-w-none px-4 pt-[4.5rem] sm:px-5 xl:px-6"
    : "max-w-[900px] px-5 pt-[5rem] sm:px-6 xl:px-0";
  const composerShellClasses = showDesktopBuildPane
    ? "max-w-none px-4 sm:px-5 xl:px-6"
    : "max-w-[900px]";

  const openBuild = (artifactId: string, tab: BuildDetailTab = "details") => {
    setSelectedBuildId(artifactId);
    setDetailTab(tab);
    setExpandedPrompt(false);
    setExpandedResponse(false);
  };

  const handleResizeStart = () => {
    setIsResizing(true);
  };

  const handleComposerChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;

    setComposerText(textarea.value);
    setActiveQuickPrompt(null);
    syncComposerHeight(textarea);
  };

  const handleLoadQuickPrompt = (type: QuickPromptType) => {
    if (!hasConversation) {
      return;
    }

    setComposerText(buildQuickPrompt({
      type,
      messages: activeConversation,
      projectMarkdown: projectMd,
      taskTitle: taskContext?.task.title,
      threadTitle: threadContext?.title,
    }));
    setActiveQuickPrompt(type);
    setShowPromptMenu(false);

    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      if (composerRef.current) {
        const length = composerRef.current.value.length;
        composerRef.current.setSelectionRange(length, length);
      }
    });
  };

  const handleAttachFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []).map((file) => file.name);
    setAttachedFiles(nextFiles);
  };

  const handleRunCopilot = async () => {
    const prompt = composerText.trim();

    if (!prompt) {
      return;
    }

    if (!window.electronAPI?.tools) {
      setDesktopToolsError("Open the desktop app to run GitHub Copilot locally.");
      return;
    }

    if (!desktopRepoPath) {
      setDesktopToolsError("Connect a local repository first from the Files page so Copilot has a working directory.");
      return;
    }

    setDesktopToolsError(null);
    setIsCopilotRunning(true);
    setPendingCopilotLaunch(true);
    setCopilotProcessId(null);
    setCopilotPrompt(prompt);
    setCopilotOutput("");
    setCopilotExitCode(null);

    try {
      const result = await window.electronAPI.tools.runCopilotPrompt({
        prompt,
        cwd: desktopRepoPath,
        timeoutMs: 120000,
        model: selectedModel,
      });

      setCopilotProcessId(result.processId);
      setCopilotOutput((current) => current || result.stdout || result.stderr);
      setCopilotExitCode(result.exitCode);
      setComposerText("");
      setAttachedFiles([]);
      setActiveQuickPrompt(null);

      window.requestAnimationFrame(() => {
        if (composerRef.current) {
          syncComposerHeight(composerRef.current);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub Copilot CLI failed.";
      setDesktopToolsError(message);
      setIsCopilotRunning(false);
      setPendingCopilotLaunch(false);
    }
  };

  const isSendDisabled = !composerText.trim() || isCopilotRunning || desktopToolsLoading;

  return (
    <div className="flex h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div ref={splitContainerRef} className="min-h-0 flex flex-1 overflow-hidden">
          <div
            className={`relative min-w-0 overflow-hidden ${showDesktopBuildPane ? "shrink-0" : "flex-1"}`}
            style={showDesktopBuildPane ? { width: `${100 - buildPaneWidth}%` } : undefined}
          >
            <div className="min-h-0 h-full overflow-y-auto custom-scroll">
              <div className={`mx-auto flex min-h-full w-full flex-col pb-40 ${chatShellClasses}`}>
                {!hasConversation && !taskContext && (
                  <div className="flex flex-1 items-center justify-center pb-24">
                    <div className="text-center">
                      <h1 className="display-font text-[2.2rem] font-semibold tracking-tight theme-fg">What can I help with?</h1>
                    </div>
                  </div>
                )}

                {!hasConversation && taskContext && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-24">
                    <div className="text-center">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] theme-muted">{isAskMode ? "Asking about" : "Working on"}</p>
                      <h1 className="display-font mt-2 text-[2rem] font-semibold tracking-tight theme-fg">{taskContext.task.title}</h1>
                      <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed theme-soft">{taskContext.task.note}</p>
                      {isAskMode && (
                        <p className="mx-auto mt-2 max-w-md text-[13px] text-violet-600/70">Project Manager mode — ask anything about this task</p>
                      )}
                    </div>

                    {showProjectBrief && (
                      <div className="app-surface w-full max-w-2xl rounded-[1.5rem] p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] theme-muted">Project brief</p>
                          <button
                            type="button"
                            onClick={() => setShowProjectBrief(false)}
                            className="text-[11px] font-medium theme-muted transition hover:text-[var(--fg)]"
                          >
                            Hide
                          </button>
                        </div>
                        <pre className="custom-scroll mt-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed theme-soft">
                          {projectMd}
                        </pre>
                      </div>
                    )}

                    <p className="text-[12px] theme-muted">
                      {isAskMode
                        ? "Your question is preloaded below — press send to ask the project manager."
                        : "The task brief prompt is preloaded below so you can kick off work from the original planning prompt."}
                    </p>
                  </div>
                )}

                {hasConversation && (
                  <div className="flex-1 space-y-8 pb-6">
                    {activeConversation.map((msg) => {
                      const artifact = msg.buildId
                        ? buildArtifacts.find((item) => item.id === msg.buildId)
                        : undefined;

                      return (
                        <div key={msg.id} className="space-y-4">
                          <ChatBubble
                            msg={msg}
                            artifact={artifact}
                            isSelected={artifact?.id === selectedBuildId}
                            isSplitView={showDesktopBuildPane}
                            onOpenBuild={openBuild}
                          />
                        </div>
                      );
                    })}

                    <div className="flex items-start gap-3 pb-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5d8bff,#7c5cfc)] text-[11px] font-bold text-white shadow-[0_8px_24px_rgba(93,139,255,0.24)]">
                        ✦
                      </div>
                      <div>
                        <div className="mb-1.5 flex items-center gap-2">
                          <p className="text-[10px] font-semibold theme-muted">Project Manager</p>
                          {showFooterBuildState && <span className="text-[10px] theme-muted">still building</span>}
                        </div>
                        <div className="app-surface rounded-[1.2rem] px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex gap-[3px]">
                              <span className="inline-block h-[6px] w-[6px] rounded-full bg-ink/20 animate-pulse-soft" />
                              <span className="inline-block h-[6px] w-[6px] rounded-full bg-ink/20 animate-pulse-soft" style={{ animationDelay: "0.15s" }} />
                              <span className="inline-block h-[6px] w-[6px] rounded-full bg-ink/20 animate-pulse-soft" style={{ animationDelay: "0.3s" }} />
                            </div>
                            <span className="text-[14px] theme-soft">Building your changes...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {hasDesktopApi && (copilotPrompt || desktopRepoPath || desktopToolsError) && (
                  <div className="pb-6">
                    <div className="app-surface rounded-[1.4rem] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Desktop agent</p>
                          <h2 className="mt-2 text-[15px] font-semibold theme-fg">GitHub Copilot CLI</h2>
                          <p className="mt-1 text-[12px] leading-relaxed theme-muted">
                            {desktopRepoPath
                              ? `Running inside ${desktopRepoPath}`
                              : "Connect a local repository from the Files screen so the desktop backend has a working directory."}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${copilotReady ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200" : "bg-amber-100 text-amber-700 dark:bg-amber-500/12 dark:text-amber-200"}`}>
                          {copilotReady ? (isCopilotRunning ? "Running" : "Ready") : "Setup needed"}
                        </span>
                      </div>

                      {desktopToolsError ? (
                        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                          {desktopToolsError}
                        </p>
                      ) : null}

                      {copilotPrompt && (
                        <div className="mt-4 space-y-3">
                          <div className="rounded-[1rem] border border-black/[0.06] bg-black/[0.02] px-3 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted">Last prompt</p>
                            <p className="mt-2 text-[12px] leading-relaxed theme-fg">{copilotPrompt}</p>
                          </div>

                          <div className="rounded-[1rem] border border-black/[0.06] bg-[#0f1216] px-3 py-3 text-white dark:border-white/[0.08]">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/52">Streamed output</p>
                              <p className="text-[10px] text-white/46">
                                {isCopilotRunning ? "Running..." : copilotExitCode !== null ? `Exit ${copilotExitCode}` : "Idle"}
                              </p>
                            </div>
                            <pre className="custom-scroll mt-3 max-h-[260px] overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-white/82">
                              {copilotOutput || (isCopilotRunning ? "Waiting for GitHub Copilot CLI output..." : "No output yet.")}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-[linear-gradient(180deg,rgba(243,239,231,0)_0%,rgba(243,239,231,0.86)_26%,rgba(243,239,231,1)_100%)] px-4 pb-5 pt-12 sm:px-6 dark:bg-[linear-gradient(180deg,rgba(14,14,14,0)_0%,rgba(14,14,14,0.86)_26%,rgba(14,14,14,1)_100%)]">
              <div className={`pointer-events-auto mx-auto w-full ${composerShellClasses}`}>
                <div className="app-surface-strong rounded-[1.35rem] shadow-[0_18px_48px_rgba(0,0,0,0.08)] dark:shadow-[0_22px_48px_rgba(0,0,0,0.28)]">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleAttachFiles}
                    className="hidden"
                  />

                  <div className="p-2.5 sm:p-3">
                    <div className="min-w-0 rounded-[1.05rem] bg-white/52 px-3 py-2.5 dark:bg-white/[0.03]">
                      <textarea
                        ref={composerRef}
                        placeholder="Ask the Project Manager anything"
                        rows={1}
                        value={composerText}
                        onChange={handleComposerChange}
                        className="min-h-[1.3rem] w-full resize-none overflow-y-hidden bg-transparent text-[13px] leading-[1.35] text-ink placeholder:text-ink-muted/40 outline-none dark:text-[var(--fg)] dark:placeholder:text-[var(--muted)]"
                      />
                      {attachedFiles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {attachedFiles.map((fileName) => (
                            <span
                              key={fileName}
                              className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-medium theme-muted dark:bg-white/[0.06]"
                            >
                              {fileName}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className={`mt-2 flex gap-2 ${isTightComposer ? "flex-col items-stretch" : "items-center justify-between"}`}>
                        <div className={`flex min-w-0 gap-2 ${isTightComposer ? "items-center justify-between" : "items-center"}`}>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={`inline-flex h-8 items-center gap-2 rounded-full bg-black/[0.04] text-[11px] font-semibold theme-fg transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] ${isTightComposer ? "px-3" : "px-3"}`}
                            title="Attach files"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path d="M8.5 3.75A3.75 3.75 0 0012.25 7.5v5a2.75 2.75 0 11-5.5 0V6.75a1.75 1.75 0 113.5 0v5.5a.75.75 0 01-1.5 0V7.5a.75.75 0 00-1.5 0v4.75a2.25 2.25 0 104.5 0v-5a5.25 5.25 0 10-10.5 0v5.25a4.75 4.75 0 109.5 0v-4.5a.75.75 0 011.5 0v4.5a6.25 6.25 0 11-12.5 0V8.25A6.75 6.75 0 018.5 1.5a.75.75 0 010 1.5z" />
                            </svg>
                            {isTightComposer ? "Attach" : "Attach files"}
                          </button>

                          <p className={`min-w-0 text-[10px] font-medium theme-muted ${isTightComposer ? "hidden" : "hidden sm:block"}`}>
                            {activeQuickPrompt
                              ? `${quickPromptMeta[activeQuickPrompt].label} prompt loaded`
                              : hasDesktopApi
                                ? copilotReady
                                  ? "Send runs through GitHub Copilot CLI"
                                  : "Install GitHub CLI to enable Copilot"
                                : "Type or use tools"}
                          </p>
                          <select
                            value={selectedModel}
                            onChange={(event) => setSelectedModel(event.target.value)}
                            className="h-8 rounded-full bg-black/[0.04] px-3 text-[11px] font-semibold theme-fg outline-none transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                            title="Copilot model"
                          >
                            {copilotModelCatalog.map((model) => (
                              <option key={model.id} value={model.id}>{model.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className={`flex gap-2 ${isTightComposer ? "items-center justify-between" : "items-center"}`}>
                          {hasConversation && (
                            <div ref={promptMenuRef} className="relative">
                              <button
                                type="button"
                                onClick={() => setShowPromptMenu((value) => !value)}
                                className="inline-flex h-8 items-center gap-2 rounded-full bg-black/[0.04] px-3 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                                title="Prompt tools"
                              >
                                Tools
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition ${showPromptMenu ? "rotate-180" : ""}`}>
                                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                              </button>

                              {showPromptMenu && (
                                <div className="absolute bottom-10 right-0 z-30 w-[220px] overflow-hidden rounded-[1rem] border border-black/[0.06] bg-[rgba(255,255,255,0.96)] p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#1a1c20]/95 dark:shadow-[0_18px_44px_rgba(0,0,0,0.34)]">
                                  {(["summary", "remaining", "documentation"] as QuickPromptType[]).map((type) => {
                                    const isActive = activeQuickPrompt === type;

                                    return (
                                      <button
                                        key={type}
                                        type="button"
                                        onClick={() => handleLoadQuickPrompt(type)}
                                        className={`flex w-full items-center justify-between rounded-[0.85rem] px-3 py-2.5 text-left text-[11px] font-semibold transition ${isActive
                                          ? "bg-ink text-cream dark:bg-white dark:text-[#141414]"
                                          : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
                                      >
                                        <span>{quickPromptMeta[type].label}</span>
                                        <span className={`text-[10px] ${isActive ? "text-cream/75 dark:text-[#141414]/70" : "theme-muted"}`}>
                                          {quickPromptMeta[type].shortLabel}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => void handleRunCopilot()}
                            disabled={isSendDisabled}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-cream shadow-[0_10px_24px_rgba(0,0,0,0.12)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-[#141414] ${isTightComposer ? "ml-auto" : ""}`}
                            title={copilotReady ? "Run with GitHub Copilot CLI" : "GitHub Copilot CLI not ready"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {showDesktopBuildPane && selectedBuild && (
            <>
              <button
                type="button"
                onMouseDown={handleResizeStart}
                aria-label="Resize panels"
                title="Drag to resize"
                className={`group hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center bg-transparent lg:flex ${isResizing ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"}`}
              >
                <span className="my-auto h-16 w-[3px] rounded-full bg-black/[0.12] transition group-hover:bg-black/[0.18] dark:bg-white/[0.12] dark:group-hover:bg-white/[0.22]" />
              </button>

              <aside
                className="hidden min-h-0 shrink-0 border-l border-black/[0.06] bg-[rgba(249,245,237,0.82)] backdrop-blur-xl lg:block dark:border-white/[0.08] dark:bg-[#14161a]/88"
                style={{ width: `${buildPaneWidth}%` }}
              >
              <div className="h-full overflow-y-auto custom-scroll">
                <InlineBuildPanel
                  artifact={selectedBuild}
                  activeTab={detailTab}
                  onTabChange={setDetailTab}
                  prompt={buildThread.prompt}
                  response={buildThread.response}
                  expandedPrompt={expandedPrompt}
                  expandedResponse={expandedResponse}
                  onTogglePrompt={() => setExpandedPrompt((value) => !value)}
                  onToggleResponse={() => setExpandedResponse((value) => !value)}
                  onClose={() => setSelectedBuildId(null)}
                  variant="sidebar"
                />
              </div>
              </aside>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type RealProjectChatProps = {
  activeProject: {
    id: string;
    name: string;
    description: string;
    repoPath: string;
    stage?: string;
    dashboard: {
      systemPromptMarkdown: string;
      initialPrompt: string;
      projectManagerContextMarkdown?: string;
      projectManagerContextPath?: string | null;
      plan: {
        summary: string;
        nextAction: string;
        subprojects: Array<{
          id: string;
          title: string;
          goal: string;
          agentName?: string;
          tasks: Array<{
            id: string;
            title: string;
            note: string;
            status: string;
            owner: string;
            reviewer?: string;
            dueDate: string;
            startingPrompt: string;
          }>;
        }>;
      } | null;
      conversation: Array<{
        id: string;
        from: string;
        text: string;
        time: string;
        isMine?: boolean;
        isAI?: boolean;
      }>;
      taskThreads: Array<{
        id: string;
        taskId: string;
        subprojectId: string;
        subprojectTitle: string;
        title: string;
        summary: string;
        updatedAgo: string;
        agentName: string;
        purpose?: string;
        systemPromptMarkdown?: string;
        contextMarkdown?: string;
        contextFilePath?: string | null;
        lastModel?: string | null;
        attachedFiles?: string[];
        messages: Array<{
          id: string;
          from: string;
          text: string;
          time: string;
          isMine?: boolean;
          isAI?: boolean;
          attachments?: string[];
        }>;
      }>;
    };
  };
};

function RealProjectChatPage({ activeProject }: RealProjectChatProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task") || searchParams.get("ask");
  const threadParam = searchParams.get("thread");
  const isTaskQuestionMode = Boolean(searchParams.get("ask"));
  const taskContext = taskParam ? findTaskInProjectPlan(activeProject.dashboard.plan, taskParam) : null;
  const activeTaskThread = taskContext
    ? activeProject.dashboard.taskThreads.find((thread) => thread.id === threadParam)
      || activeProject.dashboard.taskThreads.find((thread) => thread.taskId === taskContext.task.id)
      || null
    : null;

  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-5.2");
  const [attachedFiles, setAttachedFiles] = useState<ComposerAttachment[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ComposerAttachment[]>([]);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [pendingCheckpointId, setPendingCheckpointId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [agentLiveStatus, setAgentLiveStatus] = useState("Idle");
  const [agentLiveOutput, setAgentLiveOutput] = useState("");
  const [liveStatusFrame, setLiveStatusFrame] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState("");
  const [replacementSourceMessageId, setReplacementSourceMessageId] = useState<string | null>(null);
  const [isRestoringCheckpoint, setIsRestoringCheckpoint] = useState(false);
  const [selectedBuildArtifact, setSelectedBuildArtifact] = useState<BuildArtifact | null>(null);
  const [selectedBuildMessageId, setSelectedBuildMessageId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<BuildDetailTab>("details");
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  const [expandedResponse, setExpandedResponse] = useState(false);
  const [selectedBuildPrompt, setSelectedBuildPrompt] = useState<Message | undefined>(undefined);
  const [selectedBuildResponse, setSelectedBuildResponse] = useState<Message | undefined>(undefined);
  const [pendingPreviewLaunch, setPendingPreviewLaunch] = useState(false);
  const [previewProcessId, setPreviewProcessId] = useState<string | null>(null);
  const [previewServerStatus, setPreviewServerStatus] = useState("Idle");
  const [previewServerOutput, setPreviewServerOutput] = useState("");
  const [detectedPreviewUrl, setDetectedPreviewUrl] = useState<string | null>(null);
  const [showRightPane, setShowRightPane] = useState(false);
  const [rightPaneMode, setRightPaneMode] = useState<"preview" | "details">("preview");
  const [rightPaneResponseText, setRightPaneResponseText] = useState("");
  const [cancelledRun, setCancelledRun] = useState<null | {
    messageId: string;
    prompt: string;
    attachments: string[];
    modelId: string;
    checkpointId: string | null;
    replaceFromMessageId?: string | null;
  }>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const taskMenuRef = useRef<HTMLDivElement | null>(null);
  const [showTaskMenu, setShowTaskMenu] = useState(false);
  const conversation = taskContext ? (activeTaskThread?.messages ?? []) : activeProject.dashboard.conversation;
  const hasPlan = Boolean(activeProject.dashboard.plan);
  const assistantName = taskContext
    ? activeTaskThread?.agentName || taskContext.subproject.agentName || "Task Agent"
    : "Project Manager";
  const contextMarkdown = taskContext
    ? activeTaskThread?.contextMarkdown || buildTaskPreviewMarkdown(activeProject, taskContext, activeTaskThread)
    : activeProject.dashboard.projectManagerContextMarkdown || buildRealProjectManagerMarkdown(activeProject);
  const contextPath = taskContext
    ? activeTaskThread?.contextFilePath || `.codebuddy/agents/tasks/${taskContext.task.id}.md`
    : activeProject.dashboard.projectManagerContextPath || ".codebuddy/agents/project-manager.md";
  const legacyStarterMessageId = taskContext ? `thread-user-${taskContext.task.id}` : null;
  const filteredConversation = taskContext
    ? conversation.filter((msg, idx) => !(idx === 0 && msg.isMine && !msg.isAI && msg.id === legacyStarterMessageId && msg.text === taskContext.task.startingPrompt))
    : conversation;
  const visibleConversationBase: RealProjectConversationMessage[] = (() => {
    const sourceMessageId = isGenerating
      ? replacementSourceMessageId
      : cancelledRun?.replaceFromMessageId ?? null;

    if (!sourceMessageId) {
      return filteredConversation;
    }

    const sourceIndex = filteredConversation.findIndex((entry) => entry.id === sourceMessageId);
    return sourceIndex >= 0 ? filteredConversation.slice(0, sourceIndex) : filteredConversation;
  })();
  const visibleConversation: RealProjectConversationMessage[] = pendingPrompt
    ? [...visibleConversationBase, { id: "pending-user-message", from: "Cameron", text: pendingPrompt, time: "Now", isMine: true, attachments: pendingAttachments.map((file) => file.path || file.label) }]
    : visibleConversationBase;
  const hasConversation = visibleConversation.length > 0;
  const hasSavedConversation = visibleConversationBase.length > 0;
  const canUseStartingPrompt = Boolean(taskContext?.task.startingPrompt?.trim()) && !hasSavedConversation && !pendingPrompt;
  const taskMenuSections = activeProject.dashboard.plan?.subprojects ?? [];
  const currentHeaderTitle = taskContext ? taskContext.task.title : `Project Manager for ${activeProject.name}`;
  const liveOutputTitle = isGenerating ? buildWorkingLabel(liveStatusFrame) : "Live output";
  const liveOutputFooter = isGenerating
    ? `${assistantName} is actively responding ${"•".repeat((liveStatusFrame % 3) + 1)}`
    : pendingPreviewLaunch || previewProcessId
      ? previewServerStatus
      : agentLiveOutput
        ? "Last model transcript captured."
        : "The model transcript will stay visible here while it works.";
  const liveOutputBody = agentLiveOutput || previewServerOutput || (isGenerating ? "Preparing context..." : "No live output yet.");

  useEffect(() => {
    setPrompt("");
    setAttachedFiles([]);
    setPendingAttachments([]);
    setPendingModelId(null);
    setPendingCheckpointId(null);
    setEditingMessageId(null);
    setReplacementSourceMessageId(null);
    setCancelledRun(null);
    setGenerationError(null);
    setAgentLiveOutput("");
    setAgentLiveStatus("Idle");
    setShowTaskMenu(false);
    setSelectedBuildArtifact(null);
    setSelectedBuildMessageId(null);
    setSelectedBuildPrompt(undefined);
    setSelectedBuildResponse(undefined);
    setPendingPreviewLaunch(false);
    setPreviewProcessId(null);
    setPreviewServerStatus("Idle");
    setPreviewServerOutput("");
    setDetectedPreviewUrl(null);
    setShowRightPane(false);
    setRightPaneMode("preview");
    setRightPaneResponseText("");
    setInlineEditId(null);
    setInlineEditText("");
  }, [activeProject.id, taskParam, threadParam]);

  useEffect(() => {
    if (!isGenerating) {
      setLiveStatusFrame(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLiveStatusFrame((current) => (current + 1) % 3);
    }, 650);

    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!showTaskMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (taskMenuRef.current?.contains(target)) {
        return;
      }

      setShowTaskMenu(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showTaskMenu]);

  useEffect(() => {
    if (!window.electronAPI?.project) {
      return;
    }

    const matchesCurrentRequest = (event: { projectId?: string; taskId?: string; threadId?: string }) => {
      if (event.projectId && event.projectId !== activeProject.id) {
        return false;
      }

      if (taskContext) {
        if (event.taskId && event.taskId !== taskContext.task.id) {
          return false;
        }

        if (event.threadId && activeTaskThread?.id && event.threadId !== activeTaskThread.id) {
          return false;
        }
      }

      return true;
    };

    const stopStarted = window.electronAPI.project.onAgentStarted((event) => {
      if (!matchesCurrentRequest(event)) {
        return;
      }

      setAgentLiveStatus(event.message || "Starting agent...");
      setAgentLiveOutput("");
      setPendingCheckpointId(event.checkpointId || null);
    });

    const stopOutput = window.electronAPI.project.onAgentOutput((event) => {
      if (!matchesCurrentRequest(event)) {
        return;
      }

      setAgentLiveStatus(event.stream === "stderr" ? "Agent reported an issue" : "Working...");
      setAgentLiveOutput((current) => `${current}${event.chunk || ""}`.slice(-12000));
    });

    const stopCompleted = window.electronAPI.project.onAgentCompleted((event) => {
      if (!matchesCurrentRequest(event)) {
        return;
      }

      setAgentLiveStatus(event.message || "Agent finished.");
    });

    const stopError = window.electronAPI.project.onAgentError((event) => {
      if (!matchesCurrentRequest(event)) {
        return;
      }

      setAgentLiveStatus("Agent failed");
      setAgentLiveOutput((current) => `${current}${event.message ? `${event.message}\n` : ""}`.slice(-12000));
    });

    const stopCancelled = window.electronAPI.project.onAgentCancelled((event) => {
      if (!matchesCurrentRequest(event)) {
        return;
      }

      setAgentLiveStatus(event.message || "Stopped.");
    });

    return () => {
      stopStarted();
      stopOutput();
      stopCompleted();
      stopError();
      stopCancelled();
    };
  }, [activeProject.id, activeTaskThread?.id, taskContext]);

  useEffect(() => {
    if (!window.electronAPI?.process) {
      return;
    }

    const isPreviewCommand = (command?: string, cwd?: string) => {
      return Boolean(cwd === activeProject.repoPath && command && /run dev|vite|next dev/i.test(command));
    };

    const stopStarted = window.electronAPI.process.onStarted((event) => {
      if (!isPreviewCommand(event.command, event.cwd)) {
        return;
      }

      setPreviewProcessId(event.processId);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus("Starting preview server...");
    });

    const stopOutput = window.electronAPI.process.onOutput((event) => {
      if (event.processId !== previewProcessId) {
        return;
      }

      const nextChunk = event.chunk || "";
      setPreviewServerOutput((current) => `${current}${nextChunk}`.slice(-12000));
      const urlMatch = nextChunk.match(/https?:\/\/localhost:\d+/);
      if (urlMatch) {
        setDetectedPreviewUrl(urlMatch[0]);
        setPreviewServerStatus("Preview server ready");
      } else if (/ready|compiled|started/i.test(nextChunk)) {
        setPreviewServerStatus("Preview server ready");
        setDetectedPreviewUrl((current) => current || "http://localhost:3000");
      } else {
        setPreviewServerStatus("Starting preview server...");
      }
    });

    const stopCompleted = window.electronAPI.process.onCompleted((event) => {
      if (event.processId !== previewProcessId) {
        return;
      }

      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus(event.exitCode === 0 ? "Preview server exited" : `Preview server exited (${event.exitCode ?? "?"})`);
    });

    const stopError = window.electronAPI.process.onError((event) => {
      if (event.processId !== previewProcessId) {
        return;
      }

      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus(event.message || "Preview server failed");
      setPreviewServerOutput((current) => `${current}${event.message ? `${event.message}\n` : ""}`.slice(-12000));
    });

    const stopCancelled = window.electronAPI.process.onCancelled((event) => {
      if (event.processId !== previewProcessId) {
        return;
      }

      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus("Preview server stopped");
    });

    const stopTimeout = window.electronAPI.process.onTimeout((event) => {
      if (event.processId !== previewProcessId) {
        return;
      }

      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus(`Preview startup timed out after ${event.timeoutMs ?? 0}ms`);
    });

    return () => {
      stopStarted();
      stopOutput();
      stopCompleted();
      stopError();
      stopCancelled();
      stopTimeout();
    };
  }, [activeProject.repoPath, previewProcessId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCopilotModel() {
      if (!window.electronAPI?.settings) {
        return;
      }

      try {
        const settings = await window.electronAPI.settings.get();
        if (!cancelled) {
          setSelectedModel(settings.projectDefaults?.copilotModel ?? "gpt-5.2");
        }
      } catch {
        if (!cancelled) {
          setSelectedModel("gpt-5.2");
        }
      }
    }

    void loadCopilotModel();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!conversationRef.current) {
      return;
    }

    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [visibleConversation.length, isGenerating, taskParam, threadParam]);

  const handleAttachFiles = (nextFiles: File[]) => {
    const unsupported = nextFiles.filter((f) => /\.(exe|dll|bin|iso|dmg|zip|tar|gz|7z|rar|mp4|mov|avi|mkv|mp3|wav)$/i.test(f.name));
    if (unsupported.length > 0) {
      setGenerationError(`Can't attach ${unsupported.map((f) => f.name).join(", ")} — binary and media files are not supported.`);
      const supported = nextFiles.filter((f) => !unsupported.includes(f));
      if (supported.length > 0) {
        setAttachedFiles((current) => mergeComposerAttachments(current, supported));
      }
      return;
    }
    setGenerationError(null);
    setAttachedFiles((current) => mergeComposerAttachments(current, nextFiles));
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachedFiles((current) => current.filter((entry) => entry.id !== attachmentId));
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files?.length) {
      setIsDraggingFiles(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFiles(false);
  };

  const handleDropFiles = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFiles(false);
    handleAttachFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleOpenUsagePage = async () => {
    await window.electronAPI?.system?.openExternal?.("https://github.com/settings/billing/budgets?utm_source=vscode");
  };

  const handleNavigateConversation = (nextTaskId?: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextTaskId) {
      params.set("task", nextTaskId);
      params.delete("ask");
      const nextThread = activeProject.dashboard.taskThreads.find((thread) => thread.taskId === nextTaskId && (thread.messages?.length ?? 0) > 0);
      if (nextThread) {
        params.set("thread", nextThread.id);
      } else {
        params.delete("thread");
      }
    } else {
      params.delete("task");
      params.delete("ask");
      params.delete("thread");
    }

    setShowTaskMenu(false);
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const ensureLocalPreviewServer = async (artifact: BuildArtifact) => {
    const previewUrl = getLocalPreviewUrl(artifact.id);

    if (!previewUrl.startsWith("http://localhost") || !window.electronAPI?.process) {
      return;
    }

    if (previewProcessId || pendingPreviewLaunch) {
      return;
    }

    const command = window.electronAPI.platform === "win32"
      ? '"C:\\Program Files\\nodejs\\npm.cmd" run dev'
      : "npm run dev";

    try {
      setPendingPreviewLaunch(true);
      setPreviewServerStatus("Starting preview server...");
      setPreviewServerOutput("");
      void window.electronAPI.process.run({
        command,
        cwd: activeProject.repoPath,
        options: {
          env: {
            BROWSER: "none",
          },
        },
      }).catch((error) => {
        const message = error instanceof Error ? error.message : "Unable to start preview server.";
        setPendingPreviewLaunch(false);
        setPreviewProcessId(null);
        setPreviewServerStatus(message);
        setPreviewServerOutput((current) => `${current}${message}\n`.slice(-12000));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start preview server.";
      setPendingPreviewLaunch(false);
      setPreviewProcessId(null);
      setPreviewServerStatus(message);
      setPreviewServerOutput((current) => `${current}${message}\n`.slice(-12000));
    }
  };

  const handleRunApp = async () => {
    if (!window.electronAPI?.process || previewProcessId || pendingPreviewLaunch) {
      return;
    }

    try {
      setPendingPreviewLaunch(true);
      setPreviewServerStatus("Detecting how to run your app...");
      setPreviewServerOutput("");
      setDetectedPreviewUrl(null);

      let command = "";
      const isWin = window.electronAPI.platform === "win32";
      const npmCmd = isWin ? '"C:\\Program Files\\nodejs\\npm.cmd"' : "npm";

      try {
        const pkgJson = await window.electronAPI.repo.readFileContent(`${activeProject.repoPath}${isWin ? "\\" : "/"}package.json`);
        const pkg = JSON.parse(pkgJson.content);
        const scripts = pkg.scripts ?? {};
        if (scripts.dev) command = `${npmCmd} run dev`;
        else if (scripts.start) command = `${npmCmd} start`;
        else if (scripts.serve) command = `${npmCmd} run serve`;
      } catch { /* no package.json - try other detection */ }

      if (!command) {
        try {
          await window.electronAPI.repo.readFileContent(`${activeProject.repoPath}${isWin ? "\\" : "/"}requirements.txt`);
          command = "python -m flask run";
        } catch { /* not Python */ }
      }
      if (!command) {
        try {
          await window.electronAPI.repo.readFileContent(`${activeProject.repoPath}${isWin ? "\\" : "/"}Cargo.toml`);
          command = "cargo run";
        } catch { /* not Rust */ }
      }
      if (!command) {
        command = `${npmCmd} run dev`;
      }

      setPreviewServerStatus("Starting preview server...");
      void window.electronAPI.process.run({
        command,
        cwd: activeProject.repoPath,
        options: { env: { BROWSER: "none" } },
      }).catch((error) => {
        const message = error instanceof Error ? error.message : "Unable to start preview server.";
        setPendingPreviewLaunch(false);
        setPreviewProcessId(null);
        setPreviewServerStatus(message);
      });
    } catch {
      setPendingPreviewLaunch(false);
      setPreviewProcessId(null);
      setPreviewServerStatus("Unable to start preview server.");
    }
  };

  const handleStopPreviewServer = async () => {
    if (previewProcessId && window.electronAPI?.process?.cancel) {
      try {
        await window.electronAPI.process.cancel(previewProcessId);
      } catch { /* ignore */ }
    }
    setPreviewProcessId(null);
    setPendingPreviewLaunch(false);
    setPreviewServerStatus("Idle");
    setDetectedPreviewUrl(null);
  };

  const handleOpenResponsePanel = (message: RealProjectConversationMessage, tab: BuildDetailTab) => {
    if (!taskContext) {
      return;
    }

    const artifact = buildTaskArtifactFromResponse(taskContext, message.text);
    const promptMessage = getPromptForAssistantMessage(filteredConversation, message.id);

    setSelectedBuildArtifact(artifact);
    setSelectedBuildMessageId(message.id);
    setSelectedBuildPrompt(toInlineBuildMessage(promptMessage, artifact.id));
    setSelectedBuildResponse(toInlineBuildMessage(message, artifact.id));
    setDetailTab(tab);
    setExpandedPrompt(false);
    setExpandedResponse(false);

    if (tab === "preview") {
      setShowRightPane(true);
      setRightPaneMode("preview");
      void ensureLocalPreviewServer(artifact);
    } else if (tab === "details") {
      setShowRightPane(true);
      setRightPaneMode("details");
      setRightPaneResponseText(message.text);
    }
  };

  const handleCloseResponsePanel = () => {
    setSelectedBuildArtifact(null);
    setSelectedBuildMessageId(null);
    setSelectedBuildPrompt(undefined);
    setSelectedBuildResponse(undefined);
  };

  const handleCloseRightPane = () => {
    setShowRightPane(false);
    setRightPaneResponseText("");
  };

  const handleShowPreviewPane = () => {
    setShowRightPane(true);
    setRightPaneMode("preview");
  };

  const handleUseStartingPrompt = () => {
    if (!taskContext?.task.startingPrompt) {
      return;
    }

    setGenerationError(null);
    setPrompt(taskContext.task.startingPrompt);
  };

  const handleBeginEditMessage = (message: { id: string; text: string; attachments?: string[]; modelId?: string }) => {
    setGenerationError(null);
    setCancelledRun(null);
    setInlineEditId(message.id);
    setInlineEditText(message.text);
    setEditingMessageId(message.id);
    setSelectedModel(message.modelId || "gpt-5.2");
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setInlineEditId(null);
    setInlineEditText("");
    setPrompt("");
    setAttachedFiles([]);
  };

  const handleSubmitInlineEdit = () => {
    if (!inlineEditId || !inlineEditText.trim()) return;
    setPrompt(inlineEditText.trim());
    const replaceId = inlineEditId;
    setInlineEditId(null);
    setInlineEditText("");
    void handleGeneratePlan({ replaceFromMessageId: replaceId });
  };

  const handleRestoreCheckpoint = async (checkpointId: string) => {
    if (!window.electronAPI?.project?.restoreCheckpoint) {
      setGenerationError("Checkpoint restore is only available in the desktop app.");
      return;
    }

    try {
      setIsRestoringCheckpoint(true);
      setGenerationError(null);
      await window.electronAPI.project.restoreCheckpoint({
        projectId: activeProject.id,
        checkpointId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to restore that checkpoint.";
      setGenerationError(message);
    } finally {
      setIsRestoringCheckpoint(false);
    }
  };

  const handleCancelGeneration = async () => {
    if (pendingPrompt) {
      setCancelledRun({
        messageId: replacementSourceMessageId || `cancelled-${Date.now()}`,
        prompt: pendingPrompt,
        attachments: pendingAttachments.map((file) => file.path || file.label),
        modelId: pendingModelId || selectedModel,
        checkpointId: pendingCheckpointId,
        replaceFromMessageId: replacementSourceMessageId,
      });
    }
    try {
      await window.electronAPI?.project?.cancelActiveRequest?.();
    } catch { /* ignore */ }
    setIsGenerating(false);
    setPendingPrompt(null);
    setPendingAttachments([]);
    setPendingModelId(null);
    setPendingCheckpointId(null);
    setReplacementSourceMessageId(null);
  };

  const handleGeneratePlan = async (options?: {
    prompt?: string;
    attachments?: ComposerAttachment[];
    modelId?: string;
    replaceFromMessageId?: string;
  }) => {
    const draftPrompt = options?.prompt ?? prompt;
    const trimmedPrompt = draftPrompt.trim();
    const currentAttachments = [...(options?.attachments ?? attachedFiles)];
    const currentModelId = options?.modelId ?? selectedModel;
    const replaceFromMessageId = options?.replaceFromMessageId ?? editingMessageId ?? undefined;

    if (!trimmedPrompt) {
      setGenerationError(taskContext ? "Talk to the task agent first." : "Talk to the project manager first.");
      return;
    }

    const attachmentPaths = currentAttachments.map((file) => file.path || file.label);

    if (taskContext) {
      if (!window.electronAPI?.project?.sendTaskMessage) {
        setGenerationError("Open the Electron desktop app to continue this task session.");
        return;
      }

      try {
        setIsGenerating(true);
        setGenerationError(null);
        setAgentLiveOutput("");
        setAgentLiveStatus("Starting agent...");
        setCancelledRun(null);
        setPendingPrompt(trimmedPrompt);
        setPendingAttachments(currentAttachments);
        setPendingModelId(currentModelId);
        setPendingCheckpointId(null);
        setReplacementSourceMessageId(replaceFromMessageId ?? null);
        setPrompt("");
        setAttachedFiles([]);
        setEditingMessageId(null);
        await window.electronAPI.project.sendTaskMessage({
          projectId: activeProject.id,
          taskId: taskContext.task.id,
          threadId: activeTaskThread?.id,
          prompt: trimmedPrompt,
          model: currentModelId,
          attachedFiles: attachmentPaths,
          replaceFromMessageId,
        });
        setEditingMessageId(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to continue the task session.";
        setPrompt(trimmedPrompt);
        setAttachedFiles(currentAttachments);
        setSelectedModel(currentModelId);
        setEditingMessageId(replaceFromMessageId ?? null);
        setGenerationError(message);
      } finally {
        setIsGenerating(false);
        setPendingPrompt(null);
        setPendingAttachments([]);
        setPendingModelId(null);
        setPendingCheckpointId(null);
        setReplacementSourceMessageId(null);
      }

      return;
    }

    if (!window.electronAPI?.project) {
      setGenerationError("Open the Electron desktop app to use the project manager.");
      return;
    }

    const isFollowUp = hasPlan;

    try {
      setIsGenerating(true);
      setGenerationError(null);
      setAgentLiveOutput("");
      setAgentLiveStatus("Starting agent...");
      setCancelledRun(null);
      setPendingPrompt(trimmedPrompt);
      setPendingAttachments(currentAttachments);
      setPendingModelId(currentModelId);
      setPendingCheckpointId(null);
      setReplacementSourceMessageId(replaceFromMessageId ?? null);
      setPrompt("");
      setAttachedFiles([]);
      setEditingMessageId(null);

      if (isFollowUp && window.electronAPI.project.sendPMMessage) {
        await window.electronAPI.project.sendPMMessage({
          projectId: activeProject.id,
          prompt: buildPromptWithAttachments(trimmedPrompt, currentAttachments),
          model: currentModelId,
          attachedFiles: attachmentPaths,
          replaceFromMessageId,
        });
      } else {
        await window.electronAPI.project.generatePlan({
          projectId: activeProject.id,
          prompt: buildPromptWithAttachments(trimmedPrompt, currentAttachments),
          model: currentModelId,
        });
      }
      setEditingMessageId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong. Try again.";
      setPrompt(trimmedPrompt);
      setAttachedFiles(currentAttachments);
      setSelectedModel(currentModelId);
      setEditingMessageId(replaceFromMessageId ?? null);
      setGenerationError(message);
    } finally {
      setIsGenerating(false);
      setPendingPrompt(null);
      setPendingAttachments([]);
      setPendingModelId(null);
      setPendingCheckpointId(null);
      setReplacementSourceMessageId(null);
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleGeneratePlan();
    }
  };

  const isImportedProject = Boolean((activeProject as Record<string, unknown>).imported);

  const handleAnalyzeImportedProject = () => {
    const analysisPrompt = `Analyze this existing codebase at ${activeProject.repoPath} and create a comprehensive project plan. Read the package.json, README, and key source files to understand the project structure, tech stack, and current state. Then generate a structured plan with subprojects and tasks that reflect the existing work and any clear next steps. Treat this as an already-in-progress project — mark completed work as done and identify what remains.`;
    setPrompt(analysisPrompt);
    void handleGeneratePlan({ prompt: analysisPrompt });
  };

  if (!hasConversation && !hasPlan && !isGenerating) {
    return (
      <div className="flex min-h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
        <ProjectSidebar />

        <div className="flex min-w-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 items-center justify-center px-6 pb-32 pt-[5.2rem]">
              <div className="max-w-xl text-center">
                <h1 className="display-font text-[2.2rem] font-semibold tracking-tight theme-fg">
                  {activeProject.name}
                </h1>
                {isImportedProject ? (
                  <div className="mt-6">
                    <p className="text-[14px] leading-relaxed theme-muted">This project was imported from an existing directory.</p>
                    <button
                      type="button"
                      onClick={handleAnalyzeImportedProject}
                      className="mt-4 rounded-full bg-[linear-gradient(135deg,#2563eb,#7c3aed)] px-6 py-3 text-[13px] font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.3)] transition hover:-translate-y-[1px] hover:shadow-[0_16px_36px_rgba(37,99,235,0.4)]"
                    >
                      Create Project Dashboard
                    </button>
                    <p className="mt-2 text-[11px] theme-muted">Analyzes your codebase and generates tasks and a project plan.</p>
                  </div>
                ) : null}
                {generationError ? (
                  <p className="mx-auto mt-5 max-w-xl rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    {generationError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-8 pt-4 sm:px-6">
              <div className="pointer-events-auto mx-auto flex w-full max-w-[980px] flex-col gap-3">
                <RealProjectComposer
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={() => void handleGeneratePlan()}
                  onKeyDown={handleComposerKeyDown}
                  disabled={isGenerating}
                  isGenerating={isGenerating}
                  onCancel={() => void handleCancelGeneration()}
                  placeholder="Talk to the project manager"
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  attachedFiles={attachedFiles}
                  onAttachFiles={handleAttachFiles}
                  onRemoveAttachment={handleRemoveAttachment}
                  onOpenUsagePage={() => void handleOpenUsagePage()}
                  contextMarkdown={contextMarkdown}
                  contextPath={contextPath}
                  contextTitle={`${activeProject.name} project context`}
                  isDraggingFiles={isDraggingFiles}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropFiles}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
      <ProjectSidebar />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-black/[0.05] px-5 py-4 sm:px-6 xl:px-8 dark:border-white/[0.08]">
            <div className="mx-auto w-full max-w-[980px]">
              <div ref={taskMenuRef} className="relative inline-flex max-w-full">
                <button
                  type="button"
                  onClick={() => setShowTaskMenu((value) => !value)}
                  className="group inline-flex max-w-full items-center gap-3 rounded-full border border-black/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(247,241,232,0.95))] px-4 py-2.5 text-left shadow-[0_10px_24px_rgba(28,21,14,0.08)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(28,21,14,0.12)] dark:border-white/[0.1] dark:bg-[linear-gradient(135deg,rgba(34,36,42,0.96),rgba(24,26,31,0.96))] dark:hover:bg-[linear-gradient(135deg,rgba(38,40,46,0.98),rgba(27,29,34,0.98))]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[18px] font-semibold tracking-tight theme-fg">{currentHeaderTitle}</p>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-ink/60 transition group-hover:bg-black/[0.06] group-hover:text-ink dark:bg-white/[0.06] dark:text-white/60 dark:group-hover:bg-white/[0.1] dark:group-hover:text-white">
                    <ChevronDownIcon className={`h-4 w-4 transition ${showTaskMenu ? "rotate-180" : ""}`} />
                  </span>
                </button>

                {showTaskMenu ? (
                  <div className="absolute left-0 top-[calc(100%+0.8rem)] z-30 w-[min(620px,calc(100vw-3rem))] overflow-hidden rounded-[1.5rem] border border-black/[0.08] bg-[rgba(255,252,246,0.98)] shadow-[0_24px_60px_rgba(22,18,12,0.16)] backdrop-blur-xl dark:border-white/[0.1] dark:bg-[rgba(24,26,31,0.98)] dark:shadow-[0_28px_72px_rgba(0,0,0,0.34)]">
                    <div className="border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.08]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Conversations</p>
                      <p className="mt-2 text-[14px] leading-relaxed theme-muted">Jump between the project manager and every task chat for this project.</p>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto custom-scroll px-3 py-3">
                      <button
                        type="button"
                        onClick={() => handleNavigateConversation()}
                        className={`mb-3 flex w-full items-center justify-between gap-3 rounded-[1.15rem] px-4 py-3 text-left transition ${!taskContext ? "bg-[#1f2937] text-white shadow-[0_14px_30px_rgba(31,41,55,0.22)]" : "bg-black/[0.03] hover:bg-black/[0.05] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"}`}
                      >
                        <div className="min-w-0">
                          <p className={`truncate text-[14px] font-semibold ${!taskContext ? "text-white" : "theme-fg"}`}>Project Manager for {activeProject.name}</p>
                        </div>
                        {!taskContext ? <span className="rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/88">Current</span> : null}
                      </button>

                      {taskMenuSections.map((subproject, subprojectIndex) => (
                        <div key={subproject.id} className="mb-3 last:mb-0">
                          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">{subprojectIndex + 1}) {subproject.title}</p>
                          <div className="space-y-2">
                            {subproject.tasks.map((task) => {
                              const isActive = taskContext?.task.id === task.id;
                              const taskThread = activeProject.dashboard.taskThreads.find((thread) => thread.taskId === task.id);
                              const hasMessages = (taskThread?.messages?.length ?? 0) > 0;

                              return (
                                <button
                                  key={task.id}
                                  type="button"
                                  onClick={() => handleNavigateConversation(task.id)}
                                  className={`flex w-full items-start justify-between gap-3 rounded-[1.15rem] px-4 py-3 text-left transition ${isActive ? "bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] text-white shadow-[0_14px_30px_rgba(29,78,216,0.24)]" : "bg-black/[0.03] hover:bg-black/[0.05] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"}`}
                                >
                                  <div className="min-w-0">
                                    <p className={`truncate text-[14px] font-semibold ${isActive ? "text-white" : "theme-fg"}`}>{task.title}</p>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${isActive ? "bg-white/12 text-white/88" : hasMessages ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200" : "bg-amber-100 text-amber-700 dark:bg-amber-500/12 dark:text-amber-200"}`}>
                                    {isActive ? "Current" : hasMessages ? "Active" : "Ready"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div ref={conversationRef} className="custom-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-40 pt-6 sm:px-6 xl:px-8">
            <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8">
              <div className="space-y-8">
                {editingMessageId ? (
                  <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p>Editing this prompt will replace that message and everything after it.</p>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="rounded-full border border-sky-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition hover:bg-sky-100 dark:border-sky-400/30 dark:hover:bg-sky-400/10"
                      >
                        Cancel edit
                      </button>
                    </div>
                  </div>
                ) : null}

                {taskContext && canUseStartingPrompt ? (
                  <div className="rounded-[1.35rem] border border-black/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(248,242,233,0.92))] p-5 shadow-[0_14px_40px_rgba(24,18,11,0.06)] dark:border-white/[0.08] dark:bg-[linear-gradient(135deg,rgba(35,37,43,0.96),rgba(24,26,31,0.96))]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Starter prompt</p>
                        <p className="mt-2 text-[15px] font-semibold theme-fg">Start this task with the PM-generated kickoff prompt.</p>
                        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed theme-muted">{taskContext.task.startingPrompt}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleUseStartingPrompt}
                        className="shrink-0 rounded-full bg-[linear-gradient(135deg,#111827,#1d4ed8)] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_12px_30px_rgba(29,78,216,0.24)] transition hover:-translate-y-[1px] hover:shadow-[0_16px_34px_rgba(29,78,216,0.3)]"
                      >
                        Autofill prompt
                      </button>
                    </div>
                  </div>
                ) : null}

                {visibleConversation.map((message) => (
                  <div key={message.id} className="space-y-4">
                    {message.isMine && inlineEditId === message.id ? (
                      <div className="flex justify-end">
                        <div className="w-full max-w-[78%] xl:max-w-[74%]">
                          <div className="mb-1.5 flex justify-end">
                            <p className="text-[11px] font-medium theme-muted">{message.from}</p>
                          </div>
                          <div className="rounded-[1.65rem] rounded-br-md border-2 border-blue-500/40 bg-[#2d2b29] px-4 py-3 shadow-[0_12px_28px_rgba(32,24,18,0.16),0_0_0_1px_rgba(59,130,246,0.2)] dark:border-blue-400/30 dark:bg-[#25272b] dark:shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
                            <textarea
                              value={inlineEditText}
                              onChange={(e) => setInlineEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitInlineEdit(); }
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                              rows={Math.min(8, Math.max(2, inlineEditText.split("\n").length))}
                              className="w-full resize-none bg-transparent text-[14px] leading-[1.55] text-white/96 outline-none placeholder:text-white/40"
                              autoFocus
                            />
                          </div>
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={handleCancelEdit} className="rounded-full border border-white/[0.12] px-3 py-1.5 text-[11px] font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white">Cancel</button>
                            <button type="button" onClick={handleSubmitInlineEdit} disabled={!inlineEditText.trim()} className="rounded-full bg-[linear-gradient(135deg,#2563eb,#7c3aed)] px-4 py-1.5 text-[11px] font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)] transition hover:-translate-y-[0.5px] hover:shadow-[0_10px_24px_rgba(37,99,235,0.35)] disabled:opacity-50">Resend</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <RealProjectChatBubble
                        message={message}
                        actions={message.isMine ? (
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            {(!taskContext || !String(message.id).startsWith("msg-user-")) ? (
                              <button
                                type="button"
                                onClick={() => handleBeginEditMessage(message)}
                                className="rounded-full border border-black/[0.12] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/60 transition hover:bg-black/[0.04] hover:text-ink dark:border-white/[0.12] dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white"
                              >
                                Edit prompt
                              </button>
                            ) : null}
                            {message.checkpointId ? (
                              <button
                                type="button"
                                onClick={() => void handleRestoreCheckpoint(message.checkpointId!)}
                                disabled={isRestoringCheckpoint}
                                className="rounded-full border border-black/[0.12] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/60 transition hover:bg-black/[0.04] hover:text-ink disabled:opacity-50 dark:border-white/[0.12] dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white"
                              >
                                {isRestoringCheckpoint ? "Restoring..." : "Restore checkpoint"}
                              </button>
                            ) : null}
                          </div>
                        ) : message.isAI && taskContext ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => { setShowRightPane(true); setRightPaneMode("details"); setRightPaneResponseText(message.text); }}
                              className="rounded-full border border-black/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted transition hover:bg-black/[0.04] hover:theme-fg dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShowPreviewPane()}
                              className="rounded-full border border-black/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted transition hover:bg-black/[0.04] hover:theme-fg dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
                            >
                              Preview
                            </button>
                          </div>
                        ) : message.isAI && !taskContext ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => { setShowRightPane(true); setRightPaneMode("details"); setRightPaneResponseText(message.text); }}
                              className="rounded-full border border-black/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted transition hover:bg-black/[0.04] hover:theme-fg dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
                            >
                              Details
                            </button>
                          </div>
                        ) : null}
                      />
                    )}

                    {selectedBuildArtifact && selectedBuildMessageId === message.id ? (
                      <InlineBuildPanel
                        artifact={selectedBuildArtifact}
                        activeTab={detailTab}
                        onTabChange={setDetailTab}
                        prompt={selectedBuildPrompt}
                        response={selectedBuildResponse}
                        expandedPrompt={expandedPrompt}
                        expandedResponse={expandedResponse}
                        onTogglePrompt={() => setExpandedPrompt((value) => !value)}
                        onToggleResponse={() => setExpandedResponse((value) => !value)}
                        onClose={handleCloseResponsePanel}
                        previewStatusLabel={pendingPreviewLaunch ? buildWorkingLabel(liveStatusFrame, "Starting preview") : previewServerStatus}
                      />
                    ) : null}
                  </div>
                ))}

                {cancelledRun ? (
                  <>
                    <RealProjectChatBubble
                      message={{
                        id: cancelledRun.messageId,
                        from: "Cameron",
                        text: cancelledRun.prompt,
                        time: "Cancelled",
                        isMine: true,
                        attachments: cancelledRun.attachments,
                      }}
                      actions={
                        <div className="mt-2 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleBeginEditMessage({ id: cancelledRun.messageId, text: cancelledRun.prompt, attachments: cancelledRun.attachments, modelId: cancelledRun.modelId })}
                            className="rounded-full border border-black/[0.12] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/60 transition hover:bg-black/[0.04] hover:text-ink dark:border-white/[0.12] dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white"
                          >
                            Edit prompt
                          </button>
                          {cancelledRun.checkpointId ? (
                            <button
                              type="button"
                              onClick={() => void handleRestoreCheckpoint(cancelledRun.checkpointId!)}
                              disabled={isRestoringCheckpoint}
                              className="rounded-full border border-black/[0.12] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/60 transition hover:bg-black/[0.04] hover:text-ink disabled:opacity-50 dark:border-white/[0.12] dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white"
                            >
                              {isRestoringCheckpoint ? "Restoring..." : "Restore checkpoint"}
                            </button>
                          ) : null}
                        </div>
                      }
                    />
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#64748b,#475569)] text-[11px] font-bold text-white shadow-[0_8px_24px_rgba(71,85,105,0.24)]">
                        !
                      </div>
                      <div className="min-w-0 flex-1 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                        <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-200">Chat cancelled</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-amber-700/90 dark:text-amber-200/80">This run was stopped before the agent replied. You can retry the same state or edit the prompt first.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void handleGeneratePlan({
                                prompt: cancelledRun.prompt,
                                attachments: toComposerAttachments(cancelledRun.attachments),
                                modelId: cancelledRun.modelId,
                              });
                              setCancelledRun(null);
                            }}
                            className="rounded-full bg-amber-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-amber-600"
                          >
                            Try again
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBeginEditMessage({ id: cancelledRun.messageId, text: cancelledRun.prompt, attachments: cancelledRun.attachments, modelId: cancelledRun.modelId })}
                            className="rounded-full border border-amber-300 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 transition hover:bg-amber-100 dark:border-amber-400/30 dark:text-amber-200 dark:hover:bg-amber-400/10"
                          >
                            Edit before retry
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                {isGenerating ? (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5d8bff,#7c5cfc)] text-[11px] font-bold text-white shadow-[0_8px_24px_rgba(93,139,255,0.24)]">
                      ✦
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-2">
                        <p className="text-[11px] font-medium theme-fg">{assistantName}</p>
                        <span className="text-[11px] theme-muted">thinking</span>
                      </div>
                      <div className="app-surface rounded-[1.2rem] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex gap-[3px]">
                              <span className="inline-block h-[6px] w-[6px] rounded-full bg-ink/20 animate-pulse-soft" />
                              <span className="inline-block h-[6px] w-[6px] rounded-full bg-ink/20 animate-pulse-soft" style={{ animationDelay: "0.15s" }} />
                              <span className="inline-block h-[6px] w-[6px] rounded-full bg-ink/20 animate-pulse-soft" style={{ animationDelay: "0.3s" }} />
                            </div>
                            <span className="text-[14px] theme-soft">Thinking...</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCancelGeneration()}
                            className="rounded-full border border-black/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted transition hover:bg-black/[0.04] hover:theme-fg dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {generationError ? (
                <p className="max-w-xl rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {generationError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-6 pt-4 sm:px-6">
            <div className="pointer-events-auto mx-auto flex w-full max-w-[980px] flex-col gap-2">
              {isGenerating ? (
                <div className="flex items-center justify-center gap-2 py-2">
                  <span className="animate-pulse text-[13px] font-medium theme-muted">{buildWorkingLabel(liveStatusFrame)}</span>
                  <button
                    type="button"
                    onClick={() => void handleCancelGeneration()}
                    className="rounded-full border border-black/[0.08] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted transition hover:bg-black/[0.04] hover:theme-fg dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
                  >
                    Stop
                  </button>
                </div>
              ) : null}

              <RealProjectComposer
                value={prompt}
                onChange={setPrompt}
                onSubmit={() => void handleGeneratePlan()}
                onKeyDown={handleComposerKeyDown}
                disabled={isGenerating}
                isGenerating={isGenerating}
                onCancel={() => void handleCancelGeneration()}
                placeholder={taskContext ? "Talk to the task agent" : "Talk to the project manager"}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                attachedFiles={attachedFiles}
                onAttachFiles={handleAttachFiles}
                onRemoveAttachment={handleRemoveAttachment}
                onOpenUsagePage={() => void handleOpenUsagePage()}
                contextMarkdown={contextMarkdown}
                contextPath={contextPath}
                contextTitle={taskContext ? `${taskContext.task.title} context` : `${activeProject.name} project context`}
                isDraggingFiles={isDraggingFiles}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropFiles}
              />
            </div>
          </div>
        </div>

        {showRightPane ? (
          <div className="flex w-[50%] flex-shrink-0 flex-col border-l border-black/[0.06] bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] dark:border-white/[0.08]">
            <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setRightPaneMode("preview")}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${rightPaneMode === "preview" ? "bg-ink/10 theme-fg dark:bg-white/[0.1]" : "theme-muted hover:theme-fg"}`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setRightPaneMode("details")}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${rightPaneMode === "details" ? "bg-ink/10 theme-fg dark:bg-white/[0.1]" : "theme-muted hover:theme-fg"}`}
                >
                  Details
                </button>
              </div>
              <div className="flex-1" />
              {rightPaneMode === "preview" && previewServerStatus === "Preview server ready" ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">Live</span>
              ) : null}
              <button
                type="button"
                onClick={handleCloseRightPane}
                className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
              >
                <span className="text-[14px] theme-muted">&times;</span>
              </button>
            </div>

            {rightPaneMode === "preview" ? (
              detectedPreviewUrl && previewServerStatus === "Preview server ready" ? (
                <div className="relative flex-1 overflow-y-auto bg-white">
                  <iframe title="App preview" src={detectedPreviewUrl} className="h-full min-h-[540px] w-full border-0 bg-white" />
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <button type="button" onClick={() => { const iframe = document.querySelector('iframe[title="App preview"]') as HTMLIFrameElement | null; if (iframe) iframe.src = iframe.src; }} className="rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-sm transition hover:bg-black/80 hover:text-white dark:bg-white/10 dark:hover:bg-white/20">Refresh</button>
                    <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/80 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-sm transition hover:bg-red-600">Stop</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
                  <GlobeIcon className="h-12 w-12 theme-muted opacity-30" />
                  <div>
                    <p className="text-[16px] font-semibold theme-fg">Your app will be previewed here</p>
                    <p className="mt-2 text-[13px] theme-muted">Start a local dev server to see your app running live.</p>
                  </div>
                  {pendingPreviewLaunch ? (
                    <p className="animate-pulse text-[13px] font-medium theme-muted">Starting server...</p>
                  ) : previewProcessId ? (
                    <div className="flex flex-col items-center gap-3">
                      <p className="animate-pulse text-[13px] font-medium theme-muted">{previewServerStatus}</p>
                      <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/20 px-5 py-2.5 text-[13px] font-semibold text-red-600 transition hover:bg-red-500/30 dark:text-red-400">Stop Server</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => void handleRunApp()} className="rounded-full bg-[linear-gradient(135deg,#2563eb,#7c3aed)] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.3)] transition hover:-translate-y-[1px] hover:shadow-[0_12px_28px_rgba(37,99,235,0.4)]">Run App</button>
                  )}
                </div>
              )
            ) : (
              <div className="flex-1 overflow-y-auto custom-scroll px-6 py-5">
                {rightPaneResponseText ? (
                  <div className="space-y-3 text-[14px] leading-[1.7] theme-fg">{renderChatMessageBody(rightPaneResponseText, "assistant")}</div>
                ) : (
                  <p className="text-[13px] theme-muted">Click &ldquo;Details&rdquo; on any AI response to see the full text here.</p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RealProjectChatBubble({
  message,
  actions,
}: {
  message: RealProjectConversationMessage;
  actions?: ReactNode;
}) {
  if (message.isMine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] xl:max-w-[74%]">
          <div className="mb-1.5 flex justify-end">
            <p className="text-[11px] font-medium theme-muted">{message.from}</p>
          </div>
          <div className="rounded-[1.65rem] rounded-br-md border border-black/[0.08] bg-[#2d2b29] px-5 py-3 text-white shadow-[0_12px_28px_rgba(32,24,18,0.16)] dark:border-white/[0.08] dark:bg-[#25272b] dark:shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
            {message.attachments?.length ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {message.attachments.map((attachment) => (
                  <span key={attachment} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/78">
                    {attachment.split(/[/\\]/).pop() || attachment}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="space-y-3 text-[14px] leading-[1.55] text-white/96">{renderChatMessageBody(message.text, "user")}</div>
          </div>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5d8bff,#7c5cfc)] text-[11px] font-bold text-white shadow-[0_8px_24px_rgba(93,139,255,0.24)]">
        ✦
      </div>
      <div className="max-w-[82%] xl:max-w-[76%]">
        <div className="mb-1.5 flex items-center gap-2">
          <p className="text-[11px] font-medium theme-fg">{message.from}</p>
          <span className="text-[11px] theme-muted">{message.time}</span>
        </div>
        <div className="rounded-[1.15rem] px-0 py-0 theme-fg">
          <div className="space-y-3">{renderChatMessageBody(message.text, "assistant")}</div>
        </div>
        {actions ? <div className="mt-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function RealProjectComposer({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  disabled,
  isGenerating,
  onCancel,
  placeholder,
  selectedModel,
  onModelChange,
  attachedFiles,
  onAttachFiles,
  onRemoveAttachment,
  onOpenUsagePage,
  contextMarkdown,
  contextPath,
  contextTitle,
  isDraggingFiles,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  isGenerating: boolean;
  onCancel: () => void;
  placeholder: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
  attachedFiles: ComposerAttachment[];
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onOpenUsagePage: () => void;
  contextMarkdown: string;
  contextPath: string;
  contextTitle: string;
  isDraggingFiles: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const contextPanelRef = useRef<HTMLDivElement | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  const selectedModelMeta = getModelCatalogEntry(selectedModel);
  const estimatedTokens = estimateTokens([contextMarkdown, value].filter(Boolean).join("\n"));
  const maxTokens = selectedModelMeta.maxTokens;
  const tokenPercent = Math.min(100, Math.round((estimatedTokens / maxTokens) * 100));
  const tokenLabel = `${formatTokenCount(estimatedTokens)} / ${selectedModelMeta.contextWindow}`;
  const filteredModels = copilotModelCatalog.filter((entry) => {
    const haystack = `${entry.label} ${entry.provider} ${entry.id}`.toLowerCase();
    return haystack.includes(modelSearch.trim().toLowerCase());
  });

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    const computedLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 24;
    const maxHeight = computedLineHeight * 15;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    if (!showModelMenu && !showContextPanel) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
      const target = event.target as Node;

      if (modelMenuRef.current?.contains(target) || contextPanelRef.current?.contains(target)) {
        return;
      }

      setShowModelMenu(false);
      setShowContextPanel(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showContextPanel, showModelMenu]);

  return (
    <div
      className={`app-surface-strong rounded-[1.7rem] shadow-[0_18px_48px_rgba(0,0,0,0.08)] transition dark:shadow-[0_22px_48px_rgba(0,0,0,0.28)] ${isDraggingFiles ? "ring-2 ring-sky-400/60" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(event) => {
          onAttachFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
        className="hidden"
      />

      <div className="p-3">
        <div className="relative rounded-[1.25rem] bg-white/52 px-4 py-3 dark:bg-white/[0.03]">
          {showContextPanel ? (
            <div ref={contextPanelRef} className="mb-3 overflow-hidden rounded-lg border border-black/[0.08] bg-[#1e1f25] text-white shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold text-white/90">Context Window</p>
                  <p className="text-[10px] text-white/50">{tokenLabel} • {tokenPercent}%</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowContextPanel(false)}
                  className="rounded p-1 text-white/50 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <CloseSmallIcon />
                </button>
              </div>
              <div className="relative h-1 bg-white/[0.08]">
                <div className="absolute inset-y-0 left-0 bg-[#0078d4] transition-all" style={{ width: `${tokenPercent}%` }} />
              </div>
              <div className="px-3 py-2 text-[11px]">
                <div className="mb-1.5 font-semibold text-white/70">System</div>
                <div className="mb-1 flex justify-between text-white/55"><span className="pl-2">System Instructions</span><span>{contextMarkdown ? `${Math.round((estimateTokens(contextMarkdown) / maxTokens) * 100)}%` : "0%"}</span></div>
                <div className="mb-1 flex justify-between text-white/55"><span className="pl-2">Reserved Output</span><span>~25%</span></div>
                <div className="mb-1.5 mt-2.5 font-semibold text-white/70">User Context</div>
                <div className="mb-1 flex justify-between text-white/55"><span className="pl-2">Messages</span><span>{value ? `${Math.round((estimateTokens(value) / maxTokens) * 100)}%` : "0%"}</span></div>
                <div className="mb-1 flex justify-between text-white/55"><span className="pl-2">Files</span><span>{attachedFiles.length > 0 ? `${attachedFiles.length} attached` : "0%"}</span></div>
              </div>
            </div>
          ) : null}

          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-ink/70 transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.12]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={placeholder}
              className="min-h-[1.5rem] flex-1 resize-none overflow-y-hidden bg-transparent text-[16px] leading-[1.5] text-ink placeholder:text-ink-muted/45 outline-none dark:text-[var(--fg)] dark:placeholder:text-[var(--muted)]"
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={onCancel}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-600 transition hover:bg-red-500/25 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30"
                title="Stop generating"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <rect x="5" y="5" width="10" height="10" rx="1.5" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled || !value.trim()}
                onClick={onSubmit}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.08] text-ink transition hover:bg-black/[0.12] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white/[0.1] dark:text-white dark:hover:bg-white/[0.14]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                </svg>
              </button>
            )}
          </div>

          {attachedFiles.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachedFiles.map((attachment) => (
                <span key={attachment.id} className="inline-flex items-center gap-2 rounded-full bg-black/[0.05] px-3 py-1.5 text-[11px] font-medium theme-fg dark:bg-white/[0.07]">
                  <span>{attachment.label}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="rounded-full text-ink-muted transition hover:text-ink dark:hover:text-white"
                  >
                    <CloseSmallIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowContextPanel((value) => !value);
                  setShowModelMenu(false);
                }}
                className="group flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2 py-1 transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
                  <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" className="text-black/[0.08] dark:text-white/[0.1]" />
                  <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${2 * Math.PI * 7}`} strokeDashoffset={`${2 * Math.PI * 7 * (1 - tokenPercent / 100)}`} strokeLinecap="round" className="text-[#0078d4] transition-all" />
                </svg>
                <span className="text-[10px] font-medium theme-muted group-hover:theme-fg">{tokenPercent}%</span>
              </button>

              <div ref={modelMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowModelMenu((value) => !value);
                    setShowContextPanel(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-black/[0.04] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                >
                  <span>{selectedModelMeta.label}</span>
                  <ChevronDownIcon className={`h-3.5 w-3.5 transition ${showModelMenu ? "rotate-180" : ""}`} />
                </button>

                {showModelMenu ? (
                  <div className="absolute bottom-9 left-0 z-30 max-h-[340px] w-[260px] overflow-hidden rounded-lg border border-black/[0.08] bg-[rgba(255,255,255,0.98)] shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1e1f25]/98 dark:shadow-[0_8px_24px_rgba(0,0,0,0.36)]">
                    <div className="flex items-center gap-2 border-b border-black/[0.06] px-2.5 py-1.5 dark:border-white/[0.08]">
                      <SearchIcon className="h-3 w-3 theme-muted" />
                      <input
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                        placeholder="Search models"
                        className="w-full bg-transparent text-[11px] theme-fg outline-none placeholder:theme-muted"
                      />
                    </div>

                    <div className="custom-scroll max-h-[296px] overflow-y-auto py-1">
                    {(["featured", "other"] as const).map((group) => {
                      const groupModels = filteredModels.filter((entry) => entry.group === group);
                      if (groupModels.length === 0) {
                        return null;
                      }

                      return (
                        <div key={group} className="mb-0.5 last:mb-0">
                          <p className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted">
                            {group === "featured" ? "Recommended" : "Other models"}
                          </p>
                          {groupModels.map((entry) => {
                              const isSelected = entry.id === selectedModel;

                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => {
                                    onModelChange(entry.id);
                                    setShowModelMenu(false);
                                  }}
                                  className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition ${isSelected ? "bg-[#0078d4] text-white" : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
                                >
                                  <div className="min-w-0">
                                    <span className="text-[11px] font-medium">{entry.label}</span>
                                    {entry.warning ? <span className={`ml-1.5 text-[10px] ${isSelected ? "text-white/70" : "theme-muted"}`}>{entry.warning}</span> : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className={`text-[10px] ${isSelected ? "text-white/70" : "theme-muted"}`}>{entry.usage}</span>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onOpenUsagePage}
                className="rounded-full bg-black/[0.04] px-3 py-1.5 text-[11px] font-semibold theme-fg transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
              >
                Usage
              </button>
            </div>

{attachedFiles.length > 0 ? <p className="text-[10px] theme-muted">{attachedFiles.length} file{attachedFiles.length === 1 ? "" : "s"} attached</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectChatPageRouter() {
  const { activeProject, canUseDesktopProject } = useActiveDesktopProject();

  if (activeProject?.dashboard) {
    return <RealProjectChatPage activeProject={activeProject as RealProjectChatProps["activeProject"]} />;
  }

  if (canUseDesktopProject) {
    return (
      <div className="flex min-h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
        <ProjectSidebar />

        <div className="flex min-w-0 flex-1 items-center justify-center px-6 pt-[5.2rem]">
          <div className="app-surface max-w-2xl rounded-[1.8rem] p-8 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Project manager chat</p>
            <h1 className="display-font mt-4 text-[2.1rem] font-semibold tracking-tight theme-fg">No active real project</h1>
            <p className="mt-4 text-[14px] leading-relaxed theme-soft">
              PM Chat no longer falls back to seeded demo data in desktop mode. Open or create a real project first, then generate the MVP plan from this screen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <ProjectChatPageContent />;
}

export default function ProjectChatPage() {
  return (
    <Suspense fallback={null}>
      <ProjectChatPageRouter />
    </Suspense>
  );
}