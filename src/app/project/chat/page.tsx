"use client";

import { Suspense, useState, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
      return <p key={key} className={`${headingClass} break-words ${tone === "user" ? "text-white/98" : "theme-fg"}`}>{renderInlineChatFormatting(title)}</p>;
    }

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return (
        <ul key={key} className={`ml-5 list-disc space-y-1 break-words text-[15px] leading-[1.7] ${tone === "user" ? "text-white/96" : "theme-fg"}`}>
          {lines.map((line, lineIndex) => <li key={`${key}-${lineIndex}`}>{renderInlineChatFormatting(line.replace(/^[-*]\s+/, ""))}</li>)}
        </ul>
      );
    }

    return (
      <p key={key} className={`whitespace-pre-wrap break-words text-[15px] leading-[1.72] ${tone === "user" ? "text-white/96" : "theme-fg"}`}>
        {renderInlineChatFormatting(block)}
      </p>
    );
  });
}

function buildWorkingLabel(frame: number, base = "Working") {
  return `${base}${".".repeat((frame % 3) + 1)}`;
}

function getTaskStatusPresentation(status?: string) {
  switch (status) {
    case "done":
      return { label: "Done", className: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/14 dark:text-emerald-200" };
    case "review":
      return { label: "In review", className: "bg-amber-500/12 text-amber-700 dark:bg-amber-500/14 dark:text-amber-200" };
    case "building":
      return { label: "Building", className: "bg-sky-500/12 text-sky-700 dark:bg-sky-500/14 dark:text-sky-200" };
    default:
      return { label: "Planned", className: "bg-stone-500/12 text-stone-700 dark:bg-stone-500/14 dark:text-stone-200" };
  }
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

const chatActionButtonClass = "app-control-rail rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] app-control-idle";

// ── Default model catalogs (fallback when IPC is unavailable) ──
const DEFAULT_copilotModels: ModelCatalogEntry[] = [
  { id: "auto", label: "Auto", provider: "Best available", contextWindow: "Auto", maxTokens: 200000, usage: "10% discount", group: "featured" },
  { id: "claude-opus-4.6", label: "Claude Opus 4.6", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "3x", group: "featured" },
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "featured" },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "featured" },
];
const DEFAULT_claudeModels: ModelCatalogEntry[] = [
  { id: "sonnet", label: "Claude Sonnet (Latest)", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "Included", group: "featured" },
  { id: "opus", label: "Claude Opus (Latest)", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "Included", group: "featured" },
];
const DEFAULT_codexModels: ModelCatalogEntry[] = [
  { id: "default", label: "Default (ChatGPT)", provider: "OpenAI", contextWindow: "200K", maxTokens: 200000, usage: "Included", group: "featured" },
  { id: "o4-mini", label: "o4-mini", provider: "OpenAI", contextWindow: "200K", maxTokens: 200000, usage: "Included", group: "other" },
];

type FeatureFlags = { githubCopilotCli?: boolean; claudeCode?: boolean; codexCli?: boolean };
type CatalogSources = { copilot: ModelCatalogEntry[]; claude: ModelCatalogEntry[]; codex: ModelCatalogEntry[] };

function getActiveModelCatalog(featureFlags: FeatureFlags, catalogs: CatalogSources): ModelCatalogEntry[] {
  const hasCopilot = !!featureFlags?.githubCopilotCli;
  const hasClaude = !!featureFlags?.claudeCode;
  const hasCodex = !!featureFlags?.codexCli;
  const enabledCatalogs: ModelCatalogEntry[] = [];
  if (hasClaude) enabledCatalogs.push(...catalogs.claude);
  if (hasCopilot) enabledCatalogs.push(...catalogs.copilot);
  if (hasCodex) enabledCatalogs.push(...catalogs.codex);
  if (enabledCatalogs.length > 0) return enabledCatalogs;
  return catalogs.copilot;
}

function getDefaultModelId(featureFlags: FeatureFlags): string {
  const hasCopilot = !!featureFlags?.githubCopilotCli;
  const hasClaude = !!featureFlags?.claudeCode;
  const hasCodex = !!featureFlags?.codexCli;
  if (hasClaude && !hasCopilot && !hasCodex) return "sonnet";
  if (hasCodex && !hasClaude && !hasCopilot) return "default";
  return "gpt-5.2";
}

function getModelRecommendation(featureFlags: FeatureFlags, isTaskChat: boolean): { modelId: string; label: string; reason: string } {
  const hasCopilot = !!featureFlags?.githubCopilotCli;
  const hasClaude = !!featureFlags?.claudeCode;
  const hasCodex = !!featureFlags?.codexCli;

  if (isTaskChat) {
    if (hasClaude) return { modelId: "sonnet", label: "Claude Sonnet (Latest)", reason: "Best for implementation tasks" };
    if (hasCodex) return { modelId: "default", label: "Default (ChatGPT)", reason: "Best for implementation tasks" };
    return { modelId: "gpt-5.4", label: "GPT-5.4", reason: "Best for implementation tasks" };
  }

  if (hasClaude && hasCopilot) return { modelId: "claude-opus-4.6", label: "Claude Opus 4.6", reason: "Best for planning & architecture" };
  if (hasClaude) return { modelId: "opus", label: "Claude Opus (Latest)", reason: "Best for planning & architecture" };
  if (hasCodex) return { modelId: "default", label: "Default (ChatGPT)", reason: "Best for planning & architecture" };
  return { modelId: "claude-opus-4.6", label: "Claude Opus 4.6", reason: "Best for planning & architecture" };
}

function getModelCatalogEntry(modelId: string, catalog: ModelCatalogEntry[]) {
  return catalog.find((entry) => entry.id === modelId) ?? catalog[0];
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

function findNextIncompleteTask(project: RealProjectChatProps["activeProject"], currentTaskId?: string | null) {
  const orderedTasks = (project.dashboard.plan?.subprojects ?? []).flatMap((subproject) =>
    (subproject.tasks ?? []).map((task) => ({ subproject, task })),
  );

  if (orderedTasks.length === 0) {
    return null;
  }

  const currentIndex = currentTaskId
    ? orderedTasks.findIndex((entry) => entry.task.id === currentTaskId)
    : -1;

  const nextAfterCurrent = orderedTasks
    .slice(currentIndex >= 0 ? currentIndex + 1 : 0)
    .find((entry) => entry.task.status !== "done");

  if (nextAfterCurrent) {
    return nextAfterCurrent;
  }

  return orderedTasks.find((entry) => entry.task.status !== "done" && entry.task.id !== currentTaskId) ?? null;
}

function shouldAutoStartTaskThread(project: RealProjectChatProps["activeProject"], taskId: string) {
  const taskContext = findTaskInProjectPlan(project.dashboard.plan, taskId);
  if (!taskContext?.task.startingPrompt?.trim()) {
    return false;
  }

  const existingThread = project.dashboard.taskThreads.find((thread) => thread.taskId === taskId);
  return (existingThread?.messages?.length ?? 0) === 0;
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
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ githubCopilotCli: true });
  const [catalogSources, setCatalogSources] = useState<CatalogSources>({
    copilot: DEFAULT_copilotModels,
    claude: DEFAULT_claudeModels,
    codex: DEFAULT_codexModels,
  });
  const [providerTab, setProviderTab] = useState<"claude" | "copilot" | "codex">("copilot");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelCatalog = getActiveModelCatalog(featureFlags, catalogSources);
  const enabledProviderCount = [!!featureFlags?.githubCopilotCli, !!featureFlags?.claudeCode, !!featureFlags?.codexCli].filter(Boolean).length;
  const hasMultipleProviders = enabledProviderCount > 1;
  const modelMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const [desktopToolsLoading, setDesktopToolsLoading] = useState(false);
  const [desktopToolsError, setDesktopToolsError] = useState<string | null>(null);
  const [copilotReady, setCopilotReady] = useState(false);
  const [isCopilotRunning, setIsCopilotRunning] = useState(false);
  const [pendingCopilotLaunch, setPendingCopilotLaunch] = useState(false);
  const [copilotProcessId, setCopilotProcessId] = useState<string | null>(null);
  const [copilotPrompt, setCopilotPrompt] = useState<string | null>(null);
  const [copilotOutput, setCopilotOutput] = useState("");
  const [copilotExitCode, setCopilotExitCode] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
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
    if (!showModelMenu) return;
    const handleClick = (e: MouseEvent | globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (modelMenuRef.current?.contains(target) || modelMenuBtnRef.current?.contains(target)) return;
      setShowModelMenu(false);
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [showModelMenu]);

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

        // listStatus triggers auto-sync of featureFlags on the backend,
        // so we call it first, then read settings to get the updated flags.
        const toolStatuses = await window.electronAPI!.tools.listStatus();
        const settings = await window.electronAPI!.settings.get();

        if (cancelled) {
          return;
        }

        const flags = settings.featureFlags ?? { githubCopilotCli: true };
        setFeatureFlags(flags);
        const defaultModel = getDefaultModelId(flags);
        setDesktopRepoPath(settings.recentRepositories[0] ?? settings.workspaceRoots[0] ?? null);
        setSelectedModel(settings.projectDefaults?.copilotModel ?? defaultModel);
        setCopilotReady(Boolean(toolStatuses.find((tool) => tool.id === "githubCopilotCli")?.available));
        if ((settings as unknown as Record<string, unknown>).displayName) {
          setDisplayName((settings as unknown as Record<string, unknown>).displayName as string);
        }

        // Determine initial provider tab from the selected model
        const cs = catalogSources;
        if (cs.claude.some((m) => m.id === (settings.projectDefaults?.copilotModel ?? defaultModel))) {
          setProviderTab("claude");
        } else if (cs.codex.some((m) => m.id === (settings.projectDefaults?.copilotModel ?? defaultModel))) {
          setProviderTab("codex");
        } else {
          setProviderTab("copilot");
        }

        // Load dynamic model catalogs
        try {
          const catalogs = await window.electronAPI?.tools?.getModelCatalogs?.();
          if (!cancelled && catalogs) {
            setCatalogSources({
              copilot: catalogs.copilot?.length ? catalogs.copilot : DEFAULT_copilotModels,
              claude: catalogs.claude?.length ? catalogs.claude : DEFAULT_claudeModels,
              codex: catalogs.codex?.length ? catalogs.codex : DEFAULT_codexModels,
            });
          }
        } catch { /* keep defaults */ }
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

    // Listen for settings changes (e.g. auto-synced featureFlags)
    const stopSettingsListener = window.electronAPI?.settings?.onChanged?.((s) => {
      if (!cancelled) {
        const flags = s.featureFlags ?? { githubCopilotCli: true };
        setFeatureFlags(flags);
      }
    });

    return () => {
      cancelled = true;
      stopSettingsListener?.();
    };
  }, []);

  useEffect(() => {
    if (!hasDesktopApi || !window.electronAPI?.process) {
      return;
    }

    const stopStarted = window.electronAPI.process.onStarted((event) => {
      if (pendingCopilotLaunch && (event.command?.includes("copilot") || event.command?.includes("claude") || event.command?.includes("codex"))) {
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
      setDesktopToolsError("Open the desktop app to run AI prompts locally.");
      return;
    }

    if (!desktopRepoPath) {
      setDesktopToolsError("Connect a local repository first from the Files page so the AI CLI has a working directory.");
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
      const runFn = window.electronAPI.tools.runGenericPrompt ?? window.electronAPI.tools.runCopilotPrompt;
      const result = await runFn({
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
      const message = error instanceof Error ? error.message : "AI CLI prompt failed.";
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
                                ? enabledProviderCount > 0
                                  ? "Send runs through AI CLI"
                                  : "Install an AI CLI to enable prompts"
                                : "Type or use tools"}
                          </p>
                          <div className="relative">
                            <button
                              ref={modelMenuBtnRef}
                              type="button"
                              onClick={() => setShowModelMenu((v) => !v)}
                              className="h-8 rounded-full bg-black/[0.04] px-3 text-[11px] font-semibold theme-fg outline-none transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                              title="Model"
                            >
                              {modelCatalog.find((m) => m.id === selectedModel)?.label ?? selectedModel}
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="ml-1 inline h-3 w-3">
                                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                              </svg>
                            </button>
                            {showModelMenu && (
                              <div
                                ref={modelMenuRef}
                                className="absolute bottom-10 right-0 z-50 w-[260px] overflow-hidden rounded-[1rem] border border-black/[0.06] bg-[rgba(255,255,255,0.96)] shadow-[0_18px_44px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#1a1c20]/95 dark:shadow-[0_18px_44px_rgba(0,0,0,0.34)]"
                              >
                                {hasMultipleProviders && (
                                  <div className="flex gap-1 border-b border-black/[0.06] px-2 pt-2 pb-1.5 dark:border-white/[0.08]">
                                    {featureFlags.claudeCode && (
                                      <button type="button" onClick={() => setProviderTab("claude")} className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${providerTab === "claude" ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-muted hover:theme-fg"}`}>Claude</button>
                                    )}
                                    {featureFlags.githubCopilotCli && (
                                      <button type="button" onClick={() => setProviderTab("copilot")} className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${providerTab === "copilot" ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-muted hover:theme-fg"}`}>Copilot</button>
                                    )}
                                    {featureFlags.codexCli && (
                                      <button type="button" onClick={() => setProviderTab("codex")} className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${providerTab === "codex" ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-muted hover:theme-fg"}`}>Codex</button>
                                    )}
                                  </div>
                                )}
                                <div className="max-h-[240px] overflow-y-auto p-1.5">
                                  {(() => {
                                    const cs = catalogSources;
                                    const tabModels = providerTab === "claude" ? cs.claude : providerTab === "codex" ? cs.codex : cs.copilot;
                                    const featured = tabModels.filter((m) => m.group === "featured");
                                    const other = tabModels.filter((m) => m.group !== "featured");
                                    return (
                                      <>
                                        {featured.map((m) => (
                                          <button key={m.id} type="button" onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }} className={`flex w-full items-center justify-between rounded-[0.7rem] px-3 py-2 text-left text-[11px] font-semibold transition ${m.id === selectedModel ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}>
                                            <span>{m.label}</span>
                                            {m.contextWindow && <span className={`text-[9px] ${m.id === selectedModel ? "text-cream/60 dark:text-[#141414]/60" : "theme-muted"}`}>{m.contextWindow}</span>}
                                          </button>
                                        ))}
                                        {other.length > 0 && (
                                          <>
                                            <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider theme-muted">Other</div>
                                            {other.map((m) => (
                                              <button key={m.id} type="button" onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }} className={`flex w-full items-center justify-between rounded-[0.7rem] px-3 py-2 text-left text-[11px] font-semibold transition ${m.id === selectedModel ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}>
                                                <span>{m.label}</span>
                                                {(m as Record<string, unknown>).warning ? <span className="text-[9px] text-amber-500">{String((m as Record<string, unknown>).warning)}</span> : null}
                                              </button>
                                            ))}
                                          </>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>
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
                            title={enabledProviderCount > 0 ? "Run with AI CLI" : "No AI CLI available"}
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
    imported?: boolean;
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
  const autoStartParam = searchParams.get("autostart");
  const isTaskQuestionMode = Boolean(searchParams.get("ask"));
  const taskContext = taskParam ? findTaskInProjectPlan(activeProject.dashboard.plan, taskParam) : null;
  const activeTaskThread = taskContext
    ? activeProject.dashboard.taskThreads.find((thread) => thread.id === threadParam)
      || activeProject.dashboard.taskThreads.find((thread) => thread.taskId === taskContext.task.id)
      || null
    : null;

  const [prompt, setPrompt] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ githubCopilotCli: true });
  const [catalogSources, setCatalogSources] = useState<CatalogSources>({
    copilot: DEFAULT_copilotModels,
    claude: DEFAULT_claudeModels,
    codex: DEFAULT_codexModels,
  });
  const modelCatalog = getActiveModelCatalog(featureFlags, catalogSources);
  const [selectedModel, setSelectedModel] = useState(() => getDefaultModelId(featureFlags));
  const [attachedFiles, setAttachedFiles] = useState<ComposerAttachment[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ComposerAttachment[]>([]);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [pendingCheckpointId, setPendingCheckpointId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingViaAwaitRef = useRef(false); // true when handleGeneratePlan is actively awaiting
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
  const previewProcessIdRef = useRef<string | null>(null);
  const previewPortRef = useRef<number>(0);
  const previewReadyRef = useRef(false);
  const [previewReady, setPreviewReady] = useState(false);
  const setPreviewReadyState = (value: boolean) => {
    previewReadyRef.current = value;
    setPreviewReady(value);
  };
  const [previewServerStatus, setPreviewServerStatus] = useState("Idle");
  const [previewServerOutput, setPreviewServerOutput] = useState("");
  const [previewExited, setPreviewExited] = useState(false);
  const [detectedPreviewUrl, setDetectedPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"web" | "terminal">("web");
  const previewModeRef = useRef<"web" | "terminal">("web");
  const setPreviewModeState = (value: "web" | "terminal") => {
    previewModeRef.current = value;
    setPreviewMode(value);
  };
  const [showRightPane, setShowRightPane] = useState(false);
  const [rightPaneMode, setRightPaneMode] = useState<"preview" | "details" | "terminal">("preview");
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [rightPaneResponseText, setRightPaneResponseText] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalCommand, setTerminalCommand] = useState("");
  const [terminalProcessId, setTerminalProcessId] = useState<string | null>(null);
  const terminalProcessIdRef = useRef<string | null>(null);
  const terminalOutputRef = useRef<HTMLPreElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [splitRatio, setSplitRatio] = useState(46);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [isAutoPrompting, setIsAutoPrompting] = useState(false);
  const [autoAdvanceTasks, setAutoAdvanceTasks] = useState(false);
  const [taskAutomationNotice, setTaskAutomationNotice] = useState<null | { tone: "info" | "success"; message: string }>(null);
  const [cancelledRun, setCancelledRun] = useState<null | {
    messageId: string;
    prompt: string;
    attachments: string[];
    modelId: string;
    checkpointId: string | null;
    replaceFromMessageId?: string | null;
  }>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const thinkingOutputRef = useRef<HTMLPreElement | null>(null);
  const [thinkingPanelExpanded, setThinkingPanelExpanded] = useState(true);
  const [interruptPrompt, setInterruptPrompt] = useState("");
  const previousTaskStateRef = useRef<{ taskId: string | null; status: string | null }>({ taskId: null, status: null });
  const pendingAutoAdvanceTaskIdRef = useRef<string | null>(null);
  const handledAutoStartTaskIdRef = useRef<string | null>(null);
  const localAgentCompletedTaskIdRef = useRef<string | null>(null);
  const taskMenuRef = useRef<HTMLDivElement | null>(null);
  const taskMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [taskMenuLayout, setTaskMenuLayout] = useState<null | { top: number; left: number; width: number; maxHeight: number }>(null);
  const [showTaskMenu, setShowTaskMenu] = useState(false);
  const [customContextMarkdown, setCustomContextMarkdown] = useState<string | null>(null);

  // ── P2P Peer Activity State ─────────────────────────────────
  const [peerStreams, setPeerStreams] = useState<Record<string, { peerName: string; conversationId: string; scope: string; tokens: string; updatedAt: number; taskId?: string | null; taskName?: string | null; sessionId?: string | null; sessionTitle?: string | null }>>({});
  const [peerMessages, setPeerMessages] = useState<Array<{ id: string; peerName: string; conversationId: string; scope: string; text: string; time: string }>>([]);
  const peerStreamTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Track which task/scope the local agent is generating for ──
  const [generatingForMeta, setGeneratingForMeta] = useState<{ taskId?: string; taskName?: string; scope?: string } | null>(null);
  // ── Track active agent on a DIFFERENT task/scope (for banner display) ──
  const [otherAgentMeta, setOtherAgentMeta] = useState<{ taskId?: string; taskName?: string; scope?: string } | null>(null);

  const conversation = taskContext ? (activeTaskThread?.messages ?? []) : activeProject.dashboard.conversation;
  const hasPlan = Boolean(activeProject.dashboard.plan);
  const assistantName = taskContext
    ? activeTaskThread?.agentName || taskContext.subproject.agentName || "Task Agent"
    : "Project Manager";
  const baseContextMarkdown = taskContext
    ? activeTaskThread?.contextMarkdown || buildTaskPreviewMarkdown(activeProject, taskContext, activeTaskThread)
    : activeProject.dashboard.projectManagerContextMarkdown || buildRealProjectManagerMarkdown(activeProject);
  const contextMarkdown = customContextMarkdown ?? baseContextMarkdown;
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
    ? [...visibleConversationBase, { id: "pending-user-message", from: displayName || "You", text: pendingPrompt, time: "Now", isMine: true, attachments: pendingAttachments.map((file) => file.path || file.label) }]
    : visibleConversationBase;
  const hasConversation = visibleConversation.length > 0;
  const hasSavedConversation = visibleConversationBase.length > 0;
  const peerIsActive = Object.keys(peerStreams).length > 0;
  const chatLocked = isGenerating || peerIsActive || Boolean(otherAgentMeta);
  const canUseStartingPrompt = Boolean(taskContext?.task.startingPrompt?.trim()) && !hasSavedConversation && !pendingPrompt;
  const taskMenuSections = activeProject.dashboard.plan?.subprojects ?? [];
  const currentHeaderTitle = taskContext ? taskContext.task.title : `Project Manager for ${activeProject.name}`;
  const currentHeaderEyebrow = taskContext ? `${taskContext.subproject.title} task chat` : "Project manager chat";
  const currentHeaderDescription = taskContext
    ? taskContext.task.note
    : activeProject.imported
      ? "Analyze what already exists, tighten the roadmap, and move directly from planning into execution."
      : "Define the product, break it into tasks, and keep preview and implementation attached to the conversation.";
  const currentHeaderStatus = taskContext
    ? getTaskStatusPresentation(taskContext.task.status)
    : { label: activeProject.imported ? "Imported repo" : "Planning", className: "bg-black/[0.05] text-ink/70 dark:bg-white/[0.08] dark:text-white/72" };
  const taskAutomationMessage = taskContext
    ? taskAutomationNotice?.message ?? (taskContext.task.status === "done"
      ? "This task is already marked done. Use a verification or polish prompt if you want another pass."
      : "Generate a context-aware next-step prompt instead of writing the task kickoff manually.")
    : "";
  const liveOutputTitle = isGenerating ? buildWorkingLabel(liveStatusFrame) : "Live output";
  const liveOutputFooter = isGenerating
    ? `${assistantName} is actively responding ${"•".repeat((liveStatusFrame % 3) + 1)}`
    : pendingPreviewLaunch || previewProcessId
      ? previewServerStatus
      : agentLiveOutput
        ? "Last model transcript captured."
        : "The model transcript will stay visible here while it works.";
  const liveOutputBody = agentLiveOutput || previewServerOutput || (isGenerating ? "Preparing context..." : "No live output yet.");

  // Reset conversation-level state when switching tasks or threads
  useEffect(() => {
    setPrompt("");
    setAttachedFiles([]);
    setPendingPrompt(null);
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
    setTaskAutomationNotice(null);
    setSelectedBuildArtifact(null);
    setSelectedBuildMessageId(null);
    setSelectedBuildPrompt(undefined);
    setSelectedBuildResponse(undefined);
    setRightPaneResponseText("");
    setInlineEditId(null);
    setInlineEditText("");
    // Clear stale P2P peer state when switching projects/tasks
    setPeerStreams({});
    setPeerMessages([]);
  }, [activeProject.id, taskParam, threadParam]);

  // Reset preview server state only when switching projects (preview is project-level)
  useEffect(() => {
    setPendingPreviewLaunch(false);
    setPreviewReadyState(false);
    previewProcessIdRef.current = null;
    setPreviewProcessId(null);
    setPreviewServerStatus("Idle");
    setPreviewServerOutput("");
    setDetectedPreviewUrl(null);
    setShowRightPane(false);
    setRightPaneMode("preview");
    setPreviewFullscreen(false);
  }, [activeProject.id]);

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

  // Escape key exits fullscreen preview
  useEffect(() => {
    if (!previewFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewFullscreen]);

  useEffect(() => {
    if (!showTaskMenu) {
      setTaskMenuLayout(null);
      return;
    }

    const handlePointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (taskMenuRef.current?.contains(target) || taskMenuPanelRef.current?.contains(target)) {
        return;
      }

      setShowTaskMenu(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [showTaskMenu]);

  useEffect(() => {
    if (!showTaskMenu) {
      return;
    }

    const updateTaskMenuLayout = () => {
      const button = taskMenuButtonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const viewportPadding = 20;
      const width = Math.min(620, Math.max(320, window.innerWidth - viewportPadding * 2));
      const left = Math.min(
        window.innerWidth - width - viewportPadding,
        Math.max(viewportPadding, rect.left),
      );
      const top = rect.bottom + 14;
      const maxHeight = Math.max(240, window.innerHeight - top - viewportPadding);

      setTaskMenuLayout({ top, left, width, maxHeight });
    };

    updateTaskMenuLayout();
    window.addEventListener("resize", updateTaskMenuLayout);
    window.addEventListener("scroll", updateTaskMenuLayout, true);

    return () => {
      window.removeEventListener("resize", updateTaskMenuLayout);
      window.removeEventListener("scroll", updateTaskMenuLayout, true);
    };
  }, [showRightPane, showTaskMenu, splitRatio]);

  useEffect(() => {
    if (!showRightPane && isDraggingSplit) {
      setIsDraggingSplit(false);
    }
  }, [isDraggingSplit, showRightPane]);

  useEffect(() => {
    if (!isDraggingSplit) {
      return;
    }

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const container = splitContainerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const nextRatio = ((rect.right - event.clientX) / rect.width) * 100;
      const clampedRatio = Math.min(72, Math.max(28, nextRatio));

      setSplitRatio((current) => (Math.abs(current - clampedRatio) < 0.2 ? current : clampedRatio));
    };

    const stopDragging = () => {
      setIsDraggingSplit(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDragging);
    window.addEventListener("blur", stopDragging);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDragging);
      window.removeEventListener("blur", stopDragging);
    };
  }, [isDraggingSplit]);

  useEffect(() => {
    if (!window.electronAPI?.project) {
      return;
    }

    const matchesCurrentRequest = (event: { projectId?: string; taskId?: string; threadId?: string }) => {
      if (event.projectId && event.projectId !== activeProject.id) {
        return false;
      }

      // If the event belongs to a specific task, only accept it when we're viewing that task
      if (event.taskId && (!taskContext || event.taskId !== taskContext.task.id)) {
        return false;
      }

      if (taskContext && event.threadId && activeTaskThread?.id && event.threadId !== activeTaskThread.id) {
        return false;
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
      setAgentLiveOutput((current) => {
        const next = `${current}${event.chunk || ""}`.slice(-12000);
        requestAnimationFrame(() => {
          if (thinkingOutputRef.current) {
            thinkingOutputRef.current.scrollTop = thinkingOutputRef.current.scrollHeight;
          }
        });
        return next;
      });
    });

    const stopCompleted = window.electronAPI.project.onAgentCompleted((event) => {
      if (!matchesCurrentRequest(event)) {
        return;
      }

      // Mark that the LOCAL agent completed this task (not a peer).
      // This prevents auto-advance from firing on P2P task status changes.
      if (taskContext?.task?.id) {
        localAgentCompletedTaskIdRef.current = taskContext.task.id;
      }

      setAgentLiveStatus(event.message || "Agent finished.");

      // Always clear pendingPrompt immediately so the saved conversation message
      // (which arrives via settings:changed before the IPC resolves) doesn't
      // duplicate alongside the still-visible pending-user-message.
      setPendingPrompt(null);
      setPendingAttachments([]);
      setPendingModelId(null);
      setPendingCheckpointId(null);
      setReplacementSourceMessageId(null);

      // When reconnected to an in-progress generation (no handleGeneratePlan await),
      // the event listener must reset isGenerating since there's no finally block.
      if (!isGeneratingViaAwaitRef.current) {
        setTimeout(() => {
          setIsGenerating(false);
          setAgentLiveOutput("");
          setAgentLiveStatus("Idle");
        }, 1500);
      } else {
        // Even when the await will handle final cleanup, dismiss the live
        // output panel quickly so it doesn't linger alongside the saved response.
        setTimeout(() => {
          setAgentLiveOutput("");
          setAgentLiveStatus("Idle");
        }, 300);
      }
    });

    const stopError = window.electronAPI.project.onAgentError((event) => {
      if (!matchesCurrentRequest(event)) {
        return;
      }

      setAgentLiveStatus("Agent failed");
      setAgentLiveOutput((current) => `${current}${event.message ? `${event.message}\n` : ""}`.slice(-12000));
      setPendingPrompt(null);
      setPendingAttachments([]);
      setPendingModelId(null);
      setPendingCheckpointId(null);
      setReplacementSourceMessageId(null);
      if (!isGeneratingViaAwaitRef.current) {
        setTimeout(() => {
          setIsGenerating(false);
          setAgentLiveOutput("");
          setAgentLiveStatus("Idle");
        }, 2000);
      }
    });

    const stopCancelled = window.electronAPI.project.onAgentCancelled((event) => {
      if (!matchesCurrentRequest(event)) {
        return;
      }

      setAgentLiveStatus(event.message || "Stopped.");
      setPendingPrompt(null);
      setPendingAttachments([]);
      setPendingModelId(null);
      setPendingCheckpointId(null);
      setReplacementSourceMessageId(null);
      if (!isGeneratingViaAwaitRef.current) {
        setTimeout(() => {
          setIsGenerating(false);
          setAgentLiveOutput("");
          setAgentLiveStatus("Idle");
        }, 1000);
      }
    });

    return () => {
      stopStarted();
      stopOutput();
      stopCompleted();
      stopError();
      stopCancelled();
    };
  }, [activeProject.id, activeTaskThread?.id, taskContext]);

  // ── Reconnect to active generation on mount ─────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const req = await window.electronAPI?.project?.getActiveRequest?.();
        if (cancelled || !req?.active) {
          setOtherAgentMeta(null);
          return;
        }
        // Only reconnect if the active request belongs to this project
        if (req.projectId && req.projectId !== activeProject.id) return;
        // If the active request belongs to a different task, show a banner instead of reconnecting
        if (req.taskId && (!taskContext || req.taskId !== taskContext.task.id)) {
          const reqTaskName = req.taskName || (() => {
            for (const sub of activeProject.dashboard.plan?.subprojects ?? []) {
              const t = (sub.tasks ?? []).find((t: { id: string; title: string }) => t.id === req.taskId);
              if (t) return t.title;
            }
            return req.taskId;
          })();
          setOtherAgentMeta({ taskId: req.taskId, taskName: reqTaskName, scope: req.scope });
          return;
        }
        // If a PM-scoped request is active but we're viewing a task, show banner
        if (!req.taskId && req.scope === "project-manager" && taskContext) {
          setOtherAgentMeta({ scope: "project-manager" });
          return;
        }
        setOtherAgentMeta(null);
        setIsGenerating(true);
        setGeneratingForMeta({ taskId: req.taskId, taskName: req.taskName, scope: req.scope });
        setAgentLiveStatus("Working...");
        // Restore accumulated output from main process
        if (req.output) {
          setAgentLiveOutput(req.output);
        }
        // Restore the user's prompt so it shows above the thinking panel
        if (req.promptText) {
          setPendingPrompt(req.promptText);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [activeProject.id, taskContext?.task?.id]);

  // ── Safety watchdog: detect stuck isGenerating state ─────────
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(async () => {
      try {
        const req = await window.electronAPI?.project?.getActiveRequest?.();
        if (!req?.active && !isGeneratingViaAwaitRef.current) {
          console.warn("[watchdog] isGenerating=true but no active request — resetting.");
          setIsGenerating(false);
          setAgentLiveOutput("");
          setAgentLiveStatus("Idle");
          setOtherAgentMeta(null);
          setPendingPrompt(null);
          setPendingAttachments([]);
          setPendingModelId(null);
        }
      } catch { /* ignore */ }
    }, 15000); // check every 15 seconds
    return () => clearInterval(interval);
  }, [isGenerating]);

  // ── P2P Peer Activity Listeners ─────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.p2p) {
      return;
    }

    const stopChatToken = window.electronAPI.p2p.onChatToken((event: { projectId?: string; peerId?: string; peerName?: string; conversationId?: string; token?: string; scope?: string; taskId?: string; taskName?: string; sessionId?: string; sessionTitle?: string }) => {
      if (event.projectId && event.projectId !== activeProject.id) return;
      const peerId = event.peerId || "unknown";
      const peerName = event.peerName || "Peer";
      const conversationId = event.conversationId || "unknown";
      const scope = event.scope || "unknown";
      const token = event.token || "";

      setPeerStreams((prev) => {
        const existing = prev[peerId];
        return {
          ...prev,
          [peerId]: {
            peerName,
            conversationId,
            scope,
            tokens: ((existing?.tokens || "") + token).slice(-4000),
            updatedAt: Date.now(),
            taskId: event.taskId || existing?.taskId || null,
            taskName: event.taskName || existing?.taskName || null,
            sessionId: event.sessionId || existing?.sessionId || null,
            sessionTitle: event.sessionTitle || existing?.sessionTitle || null,
          },
        };
      });

      // Safety timeout: clear stale peer streams after 30 seconds of no tokens.
      // The stream is properly cleared when a chat-message (completion) signal arrives.
      if (peerStreamTimeoutsRef.current[peerId]) {
        clearTimeout(peerStreamTimeoutsRef.current[peerId]);
      }
      peerStreamTimeoutsRef.current[peerId] = setTimeout(() => {
        setPeerStreams((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
        delete peerStreamTimeoutsRef.current[peerId];
      }, 30000);
    });

    const stopChatMessage = window.electronAPI.p2p.onChatMessage((event: { projectId?: string; peerId?: string; peerName?: string; conversationId?: string; message?: { text?: string }; scope?: string }) => {
      if (event.projectId && event.projectId !== activeProject.id) return;
      const peerId = event.peerId || "unknown";
      const peerName = event.peerName || "Peer";

      // Clear the stream for this peer since the message is complete
      setPeerStreams((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });

      // Add to peer messages log (keep last 20)
      if (event.message?.text) {
        setPeerMessages((prev) => [
          {
            id: `peer-msg-${Date.now()}-${peerId}`,
            peerName,
            conversationId: event.conversationId || "unknown",
            scope: event.scope || "unknown",
            text: event.message?.text || "",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
          ...prev,
        ].slice(0, 20));
      }
    });

    const stopPeerLeft = window.electronAPI.p2p.onPeerLeft((event: { projectId?: string; peerId?: string }) => {
      if (event.projectId && event.projectId !== activeProject.id) return;
      const peerId = event.peerId || "unknown";
      // Don't immediately clear active streams on peerLeft — the peer may reconnect
      // or the heartbeat may have just been delayed. The 5-minute token timeout
      // will clean up stale streams instead.
      setPeerStreams((prev) => {
        if (!prev[peerId]) return prev; // nothing to do
        // Only clear if the stream hasn't received a token in >30 seconds
        const stream = prev[peerId];
        if (Date.now() - stream.updatedAt > 30000) {
          const next = { ...prev };
          delete next[peerId];
          return next;
        }
        return prev;
      });
    });

    // Restore accumulated peer streams from main process (for reconnect after navigation)
    (async () => {
      try {
        const streams = await window.electronAPI?.p2p?.getActivePeerStreams?.({ projectId: activeProject.id });
        if (streams && Object.keys(streams).length > 0) {
          setPeerStreams((prev) => {
            const merged = { ...prev };
            for (const [peerId, acc] of Object.entries(streams) as [string, { peerName: string; conversationId: string; scope: string; tokens: string; updatedAt: number; taskId?: string | null; taskName?: string | null; sessionId?: string | null; sessionTitle?: string | null }][]) {
              // Only restore if not already receiving live tokens
              if (!merged[peerId]) {
                merged[peerId] = { ...acc };
              }
            }
            return merged;
          });
        }
      } catch { /* ignore */ }
    })();

    return () => {
      stopChatToken();
      stopChatMessage();
      stopPeerLeft();
      // Clear all stream timeouts
      for (const timeout of Object.values(peerStreamTimeoutsRef.current)) {
        clearTimeout(timeout);
      }
      peerStreamTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.process) {
      return;
    }

    const isPreviewCommand = (command?: string, cwd?: string) => {
      // Case-insensitive cwd comparison for Windows path normalization
      const cwdMatch = typeof cwd === "string" && typeof activeProject.repoPath === "string"
        && cwd.toLowerCase().replace(/[\\/]+$/g, "") === activeProject.repoPath.toLowerCase().replace(/[\\/]+$/g, "");
      return Boolean(cwdMatch && command && /npm|node|python|flask|cargo|vite|next|concurrently|react-scripts|webpack|parcel|rollup|esbuild|turbo|pnpm|yarn|bun|pip|uvicorn|gunicorn|rails|bundle|cargo|go\s+run/i.test(command));
    };

    const isOurProcess = (processId?: string) =>
      processId != null && processId === previewProcessIdRef.current;

    const stopStarted = window.electronAPI.process.onStarted((event) => {
      if (!isPreviewCommand(event.command, event.cwd)) {
        return;
      }

      // Use the ref so all subsequent event handlers see the processId immediately
      previewProcessIdRef.current = event.processId;
      setPreviewProcessId(event.processId);
      setPendingPreviewLaunch(false);

      if (previewModeRef.current === "terminal") {
        setPreviewServerStatus("Running...");
        setPreviewReadyState(true);
      } else {
        setPreviewServerStatus("Server starting — waiting for localhost URL...");
      }
    });

    // Health-check: poll a URL until it actually responds before marking "ready"
    let healthCheckTimer: ReturnType<typeof setTimeout> | null = null;
    let keywordFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let detectedRealUrl: string | null = null;
    const markPreviewReady = (url: string) => {
      setPreviewReadyState(true);
      setDetectedPreviewUrl(url);
      setPreviewServerStatus("Preview server ready");
    };
    const waitForServerReady = (url: string) => {
      if (previewReadyRef.current) return; // already ready — don't re-trigger

      // If a real URL was detected, cancel any pending fallback
      if (keywordFallbackTimer) {
        clearTimeout(keywordFallbackTimer);
        keywordFallbackTimer = null;
      }

      detectedRealUrl = url;
      let attempts = 0;
      const maxAttempts = 30; // ~30 seconds

      const check = () => {
        if (previewReadyRef.current) return; // became ready from another path
        attempts++;
        fetch(url, { mode: "no-cors" })
          .then(() => {
            if (!previewReadyRef.current) markPreviewReady(url);
          })
          .catch(() => {
            if (attempts < maxAttempts && !previewReadyRef.current) {
              healthCheckTimer = setTimeout(check, 1000);
            } else if (!previewReadyRef.current) {
              markPreviewReady(url);
            }
          });
      };
      check();
    };

    // Probe a list of candidate ports to find the running server
    const probePortsForServer = async () => {
      if (previewReadyRef.current || detectedRealUrl) return;
      const agentPort = previewPortRef.current;
      // Build candidate list: agent-predicted port first, then common defaults
      const commonPorts = [3000, 3001, 5173, 5174, 8080, 8000, 4200, 4000, 8888, 1234];
      const candidates = agentPort && agentPort > 0
        ? [agentPort, ...commonPorts.filter((p) => p !== agentPort)]
        : commonPorts;

      for (const port of candidates) {
        if (previewReadyRef.current || detectedRealUrl) return;
        try {
          await fetch(`http://localhost:${port}`, { mode: "no-cors" });
          // If fetch succeeds (no connection refused), this port is live
          if (!previewReadyRef.current && !detectedRealUrl) {
            waitForServerReady(`http://localhost:${port}`);
          }
          return;
        } catch {
          // Connection refused — try next port
        }
      }
      // None responded — fall back to agent port if available, or 3000
      const lastResort = agentPort && agentPort > 0 ? agentPort : 3000;
      if (!previewReadyRef.current && !detectedRealUrl) {
        waitForServerReady(`http://localhost:${lastResort}`);
      }
    };

    const stopOutput = window.electronAPI.process.onOutput((event) => {
      if (!isOurProcess(event.processId)) {
        return;
      }

      const nextChunk = event.chunk || "";
      setPreviewServerOutput((current) => `${current}${nextChunk}`.slice(-12000));

      // Once the preview is marked ready, stop looking for URLs — don't re-trigger
      if (previewReadyRef.current) return;

      // Terminal mode: no URL detection needed — output is the preview
      if (previewModeRef.current === "terminal") return;

      // Detect localhost URL in output — always takes priority over keyword fallback
      const urlMatch = nextChunk.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
      if (urlMatch) {
        // Cancel any pending fallback — we have the real URL now
        if (healthCheckTimer) { clearTimeout(healthCheckTimer); healthCheckTimer = null; }
        setPreviewServerStatus("Server found — waiting for it to be ready...");
        waitForServerReady(urlMatch[0]);
      } else if (!detectedRealUrl && /ready|compiled|successfully|listening|started|available/i.test(nextChunk)) {
        // Keyword hint detected but no URL yet — delay the fallback to give the server
        // a chance to print the actual URL in the next output chunk
        if (!keywordFallbackTimer) {
          setPreviewServerStatus("Server appears ready — looking for URL...");
          keywordFallbackTimer = setTimeout(() => {
            keywordFallbackTimer = null;
            if (!detectedRealUrl && !previewReadyRef.current) {
              // No URL found in output — probe ports to find the server
              setPreviewServerStatus("Scanning ports to find the server...");
              void probePortsForServer();
            }
          }, 3000);
        }
      }
    });

    const stopCompleted = window.electronAPI.process.onCompleted((event) => {
      if (!isOurProcess(event.processId)) {
        return;
      }

      // Terminal mode: process completion IS the expected outcome
      if (previewModeRef.current === "terminal") {
        previewProcessIdRef.current = null;
        setPreviewProcessId(null);
        setPendingPreviewLaunch(false);
        setPreviewServerStatus(
          event.exitCode === 0 || event.exitCode === null
            ? "Completed successfully"
            : `Exited with code ${event.exitCode}`
        );
        // Keep previewReady true so the terminal output stays visible
        return;
      }

      // If the webview is already showing, keep it visible — the page is
      // already loaded in the webview and doesn't need the server to stay
      // alive (or the server exited cleanly after handoff).
      const wasReady = previewReadyRef.current;

      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);

      if (wasReady) {
        // Keep detectedPreviewUrl and previewServerStatus so the webview stays
        setPreviewServerStatus("Server exited — preview may still work");
      } else {
        setPreviewExited(true);
        setPreviewReadyState(false);
        setPreviewServerStatus(
          event.exitCode === 0 || event.exitCode === null
            ? "Server exited"
            : `Server exited with code ${event.exitCode}`
        );
      }
    });

    const stopError = window.electronAPI.process.onError((event) => {
      if (!isOurProcess(event.processId)) {
        return;
      }

      const wasReady = previewReadyRef.current;

      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);

      if (!wasReady) {
        setPreviewExited(true);
        setPreviewReadyState(false);
        setPreviewServerStatus(event.message || "Server failed to start");
      }
      setPreviewServerOutput((current) =>
        `${current}${event.message ? `ERROR: ${event.message}\n` : ""}`.slice(-12000)
      );
    });

    const stopCancelled = window.electronAPI.process.onCancelled((event) => {
      if (!isOurProcess(event.processId)) {
        return;
      }

      setPreviewReadyState(false);
      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus("Server stopped");
    });

    const stopTimeout = window.electronAPI.process.onTimeout((event) => {
      if (!isOurProcess(event.processId)) {
        return;
      }

      setPreviewReadyState(false);
      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewServerStatus(`Server startup timed out`);
    });

    return () => {
      if (healthCheckTimer) clearTimeout(healthCheckTimer);
      if (keywordFallbackTimer) clearTimeout(keywordFallbackTimer);
      stopStarted();
      stopOutput();
      stopCompleted();
      stopError();
      stopCancelled();
      stopTimeout();
    };
  }, [activeProject.repoPath]);

  // --- Built-in terminal event listeners ---
  useEffect(() => {
    if (!window.electronAPI?.process) return;

    const isTerminalProcess = (processId?: string) =>
      processId != null && processId === terminalProcessIdRef.current;

    const tStarted = window.electronAPI.process.onStarted((event) => {
      if (event.cwd !== activeProject.repoPath || isTerminalProcess(event.processId)) return;
      // Capture terminal processes that are not the preview server
      if (event.processId === previewProcessIdRef.current) return;
      if (!terminalProcessIdRef.current) {
        terminalProcessIdRef.current = event.processId;
        setTerminalProcessId(event.processId);
      }
    });

    const tOutput = window.electronAPI.process.onOutput((event) => {
      if (!isTerminalProcess(event.processId)) return;
      const chunk = event.chunk || "";
      setTerminalOutput((prev) => `${prev}${chunk}`.slice(-30000));
      requestAnimationFrame(() => {
        if (terminalOutputRef.current) {
          terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
        }
      });
    });

    const tCompleted = window.electronAPI.process.onCompleted((event) => {
      if (!isTerminalProcess(event.processId)) return;
      const suffix = event.exitCode === 0 || event.exitCode == null
        ? "\n[Process exited]\n"
        : `\n[Process exited with code ${event.exitCode}]\n`;
      setTerminalOutput((prev) => `${prev}${suffix}`.slice(-30000));
      terminalProcessIdRef.current = null;
      setTerminalProcessId(null);
    });

    const tError = window.electronAPI.process.onError((event) => {
      if (!isTerminalProcess(event.processId)) return;
      setTerminalOutput((prev) => `${prev}\nERROR: ${event.message || "Unknown error"}\n`.slice(-30000));
      terminalProcessIdRef.current = null;
      setTerminalProcessId(null);
    });

    return () => {
      tStarted();
      tOutput();
      tCompleted();
      tError();
    };
  }, [activeProject.repoPath]);

  const handleRunTerminalCommand = async () => {
    const cmd = terminalCommand.trim();
    if (!cmd || !window.electronAPI?.process) return;

    setTerminalOutput((prev) => `${prev}$ ${cmd}\n`);
    setTerminalCommand("");

    try {
      terminalProcessIdRef.current = null;
      setTerminalProcessId(null);

      const result = await window.electronAPI.process.run({
        command: cmd,
        cwd: activeProject.repoPath,
        options: { env: { FORCE_COLOR: "0" } },
      });

      // If output wasn't captured by the event listener (fast commands)
      if (result?.stdout && !terminalProcessIdRef.current) {
        setTerminalOutput((prev) => `${prev}${result.stdout}`.slice(-30000));
      }
      if (result?.stderr) {
        setTerminalOutput((prev) => `${prev}${result.stderr}`.slice(-30000));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed";
      setTerminalOutput((prev) => `${prev}ERROR: ${message}\n`.slice(-30000));
    }
  };

  const handleStopTerminalProcess = () => {
    if (terminalProcessIdRef.current && window.electronAPI?.process?.cancel) {
      window.electronAPI.process.cancel(terminalProcessIdRef.current);
      terminalProcessIdRef.current = null;
      setTerminalProcessId(null);
      setTerminalOutput((prev) => `${prev}\n[Process cancelled]\n`.slice(-30000));
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadModelAndFlags() {
      if (!window.electronAPI?.settings) {
        return;
      }

      // Fetch dynamic model catalogs from backend config file
      try {
        const catalogs = await window.electronAPI?.tools?.getModelCatalogs?.();
        if (!cancelled && catalogs) {
          const next: CatalogSources = {
            copilot: catalogs.copilot?.length ? catalogs.copilot : DEFAULT_copilotModels,
            claude: catalogs.claude?.length ? catalogs.claude : DEFAULT_claudeModels,
            codex: catalogs.codex?.length ? catalogs.codex : DEFAULT_codexModels,
          };
          setCatalogSources(next);
        }
      } catch {
        // keep defaults on error
      }

      try {
        const settings = await window.electronAPI.settings.get();
        if (!cancelled) {
          const flags = settings.featureFlags ?? { githubCopilotCli: true };
          setFeatureFlags(flags);
          const defaultModel = getDefaultModelId(flags);
          setSelectedModel(settings.projectDefaults?.copilotModel ?? defaultModel);
          if ((settings as unknown as Record<string, unknown>).displayName) {
            setDisplayName((settings as unknown as Record<string, unknown>).displayName as string);
          }
        }
      } catch {
        if (!cancelled) {
          setSelectedModel(getDefaultModelId(featureFlags));
        }
      }
    }

    void loadModelAndFlags();

    const stopListening = window.electronAPI?.settings?.onChanged((settings) => {
      if (!cancelled) {
        const flags = settings.featureFlags ?? { githubCopilotCli: true };
        setFeatureFlags(flags);
        if (!pendingModelId) {
          const defaultModel = getDefaultModelId(flags);
          setSelectedModel(settings.projectDefaults?.copilotModel ?? defaultModel);
        }
        if ((settings as unknown as Record<string, unknown>).displayName) {
          setDisplayName((settings as unknown as Record<string, unknown>).displayName as string);
        }
      }
    });

    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, [pendingModelId]);

  useEffect(() => {
    if (!conversationRef.current) {
      return;
    }

    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [visibleConversation.length, isGenerating, taskParam, threadParam]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedPreference = window.localStorage.getItem("codebuddy.task-auto-advance");
    if (savedPreference === "true") {
      setAutoAdvanceTasks(true);
    } else if (savedPreference === "false") {
      setAutoAdvanceTasks(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("codebuddy.task-auto-advance", autoAdvanceTasks ? "true" : "false");
  }, [autoAdvanceTasks]);

  const scrollComposerToBottom = (behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior });
      window.requestAnimationFrame(() => {
        composerDockRef.current?.scrollIntoView({ block: "end", behavior });
      });
    });
  };

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
    // Determine billing page based on active model's provider
    const isClaudeModel = catalogSources.claude.some((m) => m.id === selectedModel);
    // Also check feature flags: if only Claude Code is enabled, always go to Anthropic
    const claudeOnly = !!featureFlags?.claudeCode && !featureFlags?.githubCopilotCli;
    const url = (isClaudeModel || claudeOnly)
      ? "https://console.anthropic.com/settings/billing"
      : "https://github.com/settings/billing/budgets?utm_source=vscode";
    await window.electronAPI?.system?.openExternal?.(url);
  };

  const handleNavigateConversation = (nextTaskId?: string, options?: { autoStart?: boolean }) => {
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

      if (options?.autoStart) {
        params.set("autostart", "1");
      } else {
        params.delete("autostart");
      }
    } else {
      params.delete("task");
      params.delete("ask");
      params.delete("thread");
      params.delete("autostart");
    }

    setShowTaskMenu(false);
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const ensureLocalPreviewServer = async (_artifact: BuildArtifact) => {
    if (previewProcessId || pendingPreviewLaunch) return;
    // Delegate to handleRunApp which uses the agent-backed approach
    void handleRunApp();
  };

  const handleRunApp = async () => {
    if (pendingPreviewLaunch || previewProcessIdRef.current) return;

    setPendingPreviewLaunch(true);
    setPreviewReadyState(false);
    setPreviewExited(false);
    setPreviewServerStatus("Analyzing project...");
    setPreviewServerOutput(""); 
    setDetectedPreviewUrl(null);
    setShowRightPane(true);
    setRightPaneMode("preview");

    try {
      let launchCommand: string | null = null;
      let expectedPort: number | null = null;

      // Phase 1: agent-backed analysis (fast — no tool use, just text analysis)
      if (window.electronAPI?.project?.launchDevServer) {
        try {
          setPreviewServerStatus("Copilot is determining the best way to start your app...");
          const result = await window.electronAPI.project.launchDevServer({
            projectId: activeProject.id,
            model: selectedModel,
          });
          if (result?.launchCommand) {
            launchCommand = result.launchCommand;
          }
          if (result?.expectedPort) {
            expectedPort = result.expectedPort;
          }
          if (result?.previewMode === "terminal" || result?.previewMode === "web") {
            setPreviewModeState(result.previewMode);
          }
        } catch {
          // Agent failed — we'll use the fallback below
        }
      }

      // Fallback: simple heuristic
      if (!launchCommand) {
        const isWin = window.electronAPI?.platform === "win32";
        const npm = isWin ? "npm.cmd" : "npm";
        launchCommand = `${npm} install && ${npm} run dev`;

        try {
          const sep = isWin ? "\\" : "/";
          const pkgJson = await window.electronAPI?.repo?.readFileContent(`${activeProject.repoPath}${sep}package.json`);
          if (pkgJson?.content) {
            const pkg = JSON.parse(pkgJson.content);
            const scripts = pkg.scripts ?? {};
            const isDesktopShellScript = (scriptValue: unknown) =>
              typeof scriptValue === "string"
              && /\b(electron(?:mon)?|tauri|cargo\s+tauri|wails|neutralino|nw(?:js)?|cordova|capacitor)\b/i.test(scriptValue);
            const isLikelyPreviewScript = (scriptName: string, scriptValue: unknown) =>
              typeof scriptValue === "string"
              && !isDesktopShellScript(scriptValue)
              && !/\b(concurrently|wait-on)\b/i.test(scriptValue)
              && (
                scriptName === "react-start"
                || scriptName === "serve"
                || /(^|:)(web|client|frontend|renderer)(:|$)/.test(scriptName)
                || /\b(react-scripts\s+start|vite(?:\s|$)|next\s+dev|webpack\s+serve|parcel(?:\s|$)|astro\s+dev|nuxt(?:\s+dev)?|svelte-kit\s+dev|serve(?:\s|$)|http-server|live-server)\b/i.test(scriptValue)
              );
            const preferredScriptNames = [
              "preview:web",
              "web:dev",
              "web:start",
              "web",
              "client:dev",
              "client:start",
              "client",
              "frontend:dev",
              "frontend:start",
              "frontend",
              "renderer:dev",
              "renderer:start",
              "renderer",
              "react-start",
              "serve",
            ];
            let selectedScript = preferredScriptNames.find((name) => isLikelyPreviewScript(name, scripts[name])) ?? null;

            if (!selectedScript) {
              for (const wrapperName of ["preview", "dev", "start"]) {
                const wrapper = typeof scripts[wrapperName] === "string" ? scripts[wrapperName] : "";
                const nestedScriptNames = Array.from(wrapper.matchAll(/\bnpm(?:\.cmd)?\s+run\s+([a-z0-9:_-]+)/ig), (match) => match[1]);
                const nestedCandidate = nestedScriptNames.find((name) => isLikelyPreviewScript(name, scripts[name]));
                if (nestedCandidate) {
                  selectedScript = nestedCandidate;
                  break;
                }
              }
            }

            const startCmd = selectedScript
              ? `${npm} run ${selectedScript}`
              : scripts.dev && !isDesktopShellScript(scripts.dev) && !/\b(concurrently|wait-on)\b/i.test(scripts.dev)
                ? `${npm} run dev`
                : scripts.start && !isDesktopShellScript(scripts.start) && !/\b(concurrently|wait-on)\b/i.test(scripts.start)
                  ? `${npm} start`
                  : scripts.serve && !isDesktopShellScript(scripts.serve)
                    ? `${npm} run serve`
                    : `${npm} run dev`;
            launchCommand = `${npm} install && ${startCmd}`;
          }
        } catch { /* no package.json or parse error */ }
      }

      // Phase 2: launch the dev server process
      if (!window.electronAPI?.process) {
        throw new Error("Process API not available");
      }

      // Store the agent-predicted port for fallback URL detection
      // We do NOT override the project's port — the project knows its own port best
      previewPortRef.current = expectedPort || 0;

      setPreviewServerStatus(expectedPort
        ? `Installing deps & starting server (expected port ${expectedPort})...`
        : "Installing deps & starting server...");
      setPreviewServerOutput(`> ${launchCommand}\n`);

      // Fire the process — this is a long-running server so do NOT await
      window.electronAPI.process.run({
        command: launchCommand,
        cwd: activeProject.repoPath,
        options: {
          env: {
            BROWSER: "none",          // CRA: don't open a browser
            OPEN_BROWSER: "false",     // Vite / some CRA forks
            FORCE_COLOR: "0",          // Disable ANSI color codes in output
          },
        },
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Server process failed";
        previewProcessIdRef.current = null;
        setPreviewProcessId(null);
        setPendingPreviewLaunch(false);
        setPreviewExited(true);
        setPreviewServerStatus(message);
        setPreviewServerOutput((current) => `${current}ERROR: ${message}\n`.slice(-12000));
      });

      // The process:started event listener sets previewProcessIdRef + state
      // The process:output listener watches for localhost URLs
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start the app";
      previewProcessIdRef.current = null;
      setPreviewProcessId(null);
      setPendingPreviewLaunch(false);
      setPreviewExited(true);
      setPreviewServerStatus(message);
      setPreviewServerOutput((current) => `${current}ERROR: ${message}\n`.slice(-12000));
    }
  };

  const handleStopPreviewServer = async () => {
    const pid = previewProcessIdRef.current;
    if (pid && window.electronAPI?.process?.cancel) {
      try {
        await window.electronAPI.process.cancel(pid);
      } catch { /* ignore */ }
    }
    setPreviewReadyState(false);
    previewProcessIdRef.current = null;
    setPreviewProcessId(null);
    setPendingPreviewLaunch(false);
    setPreviewExited(false);
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
    setPreviewFullscreen(false);
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
    setTaskAutomationNotice(null);
    setPrompt(taskContext.task.startingPrompt);
    scrollComposerToBottom();
  };

  const handleGenerateTaskPrompt = async () => {
    if (!taskContext || !window.electronAPI?.project?.generateTaskPrompt) {
      return;
    }

    if (autoAdvanceTasks && taskContext.task.status === "done") {
      const nextTask = findNextIncompleteTask(activeProject, taskContext.task.id);
      if (nextTask) {
        handleNavigateConversation(nextTask.task.id, {
          autoStart: shouldAutoStartTaskThread(activeProject, nextTask.task.id),
        });
        return;
      }
    }

    try {
      setIsAutoPrompting(true);
      setGenerationError(null);
      setTaskAutomationNotice(null);

      const result = await window.electronAPI.project.generateTaskPrompt({
        projectId: activeProject.id,
        taskId: taskContext.task.id,
        threadId: activeTaskThread?.id,
        model: selectedModel,
      });

      // Flow-in-Auto: if the task is now done, auto-advance to next task
      if (autoAdvanceTasks && result.taskStatus === "done") {
        const nextTask = findNextIncompleteTask(activeProject, taskContext.task.id);
        if (nextTask) {
          setTaskAutomationNotice({
            tone: "success",
            message: `${result.reason} Moving to next task...`,
          });
          setIsAutoPrompting(false);
          handleNavigateConversation(nextTask.task.id, {
            autoStart: shouldAutoStartTaskThread(activeProject, nextTask.task.id),
          });
          return;
        }
      }

      setPrompt(result.prompt || "");
      setTaskAutomationNotice({
        tone: result.taskStatus === "done" ? "success" : "info",
        message: result.taskStatus === "done"
          ? `${result.reason} This task is now marked done.`
          : result.reason,
      });
      scrollComposerToBottom();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate a task prompt.";
      setGenerationError(message);
    } finally {
      setIsAutoPrompting(false);
    }
  };

  const handleBeginEditMessage = (message: { id: string; text: string; attachments?: string[]; modelId?: string }) => {
    setGenerationError(null);
    setCancelledRun(null);
    setInlineEditId(message.id);
    setInlineEditText(message.text);
    setEditingMessageId(message.id);
    const messageModel = message.modelId || getDefaultModelId(featureFlags);
    const validModel = modelCatalog.some((entry) => entry.id === messageModel) ? messageModel : modelCatalog[0]?.id ?? getDefaultModelId(featureFlags);
    setSelectedModel(validModel);
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

  const handleForceReset = async () => {
    try {
      await window.electronAPI?.project?.forceResetAgent?.({ repoPath: activeProject.repoPath });
    } catch { /* ignore */ }
    setIsGenerating(false);
    setPendingPrompt(null);
    setPendingAttachments([]);
    setPendingModelId(null);
    setPendingCheckpointId(null);
    setReplacementSourceMessageId(null);
    setAgentLiveOutput("");
    setAgentLiveStatus("Idle");
    setOtherAgentMeta(null);
    setGeneratingForMeta(null);
    setCancelledRun(null);
    setGenerationError(null);
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
        isGeneratingViaAwaitRef.current = true;
        setIsGenerating(true);
        setGeneratingForMeta({ taskId: taskContext.task.id, taskName: taskContext.task.title, scope: "task-agent" });
        setOtherAgentMeta(null);
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
        isGeneratingViaAwaitRef.current = false;
        setIsGenerating(false);
        setAgentLiveOutput("");
        setAgentLiveStatus("Idle");
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
      isGeneratingViaAwaitRef.current = true;
      setIsGenerating(true);
      setGeneratingForMeta({ scope: "project-manager" });
      setOtherAgentMeta(null);
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
      isGeneratingViaAwaitRef.current = false;
      setIsGenerating(false);
      setGeneratingForMeta(null);
      setAgentLiveOutput("");
      setAgentLiveStatus("Idle");
      setPendingPrompt(null);
      setPendingAttachments([]);
      setPendingModelId(null);
      setPendingCheckpointId(null);
      setReplacementSourceMessageId(null);
    }
  };

  useEffect(() => {
    if (!taskContext) {
      previousTaskStateRef.current = { taskId: null, status: null };
      pendingAutoAdvanceTaskIdRef.current = null;
      return;
    }

    const previous = previousTaskStateRef.current;
    if (
      previous.taskId === taskContext.task.id
      && previous.status
      && previous.status !== "done"
      && taskContext.task.status === "done"
      // Only auto-advance if the LOCAL agent completed this task,
      // not when a peer's status change arrived via P2P.
      && localAgentCompletedTaskIdRef.current === taskContext.task.id
    ) {
      pendingAutoAdvanceTaskIdRef.current = taskContext.task.id;
      localAgentCompletedTaskIdRef.current = null; // reset after consuming
    }

    previousTaskStateRef.current = {
      taskId: taskContext.task.id,
      status: taskContext.task.status,
    };
  }, [taskContext?.task.id, taskContext?.task.status]);

  useEffect(() => {
    if (!autoAdvanceTasks || !taskContext || isGenerating) {
      return;
    }

    if (pendingAutoAdvanceTaskIdRef.current !== taskContext.task.id) {
      return;
    }

    pendingAutoAdvanceTaskIdRef.current = null;
    const nextTask = findNextIncompleteTask(activeProject, taskContext.task.id);
    if (!nextTask) {
      return;
    }

    handleNavigateConversation(nextTask.task.id, {
      autoStart: shouldAutoStartTaskThread(activeProject, nextTask.task.id),
    });
  }, [activeProject, autoAdvanceTasks, isGenerating, taskContext]);

  useEffect(() => {
    if (autoStartParam !== "1" || !taskContext || isGenerating || pendingPrompt) {
      return;
    }

    const clearAutoStart = () => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("autostart");
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    };

    if (handledAutoStartTaskIdRef.current === taskContext.task.id) {
      clearAutoStart();
      return;
    }

    if (hasSavedConversation || !taskContext.task.startingPrompt?.trim()) {
      handledAutoStartTaskIdRef.current = taskContext.task.id;
      clearAutoStart();
      return;
    }

    handledAutoStartTaskIdRef.current = taskContext.task.id;
    void handleGeneratePlan({ prompt: taskContext.task.startingPrompt });
    clearAutoStart();
  }, [autoStartParam, hasSavedConversation, isGenerating, pathname, pendingPrompt, router, searchParams, taskContext]);

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleGeneratePlan();
    }
  };

  const handleAnalyzeProject = () => {
    const analysisPrompt = activeProject.imported
      ? `Analyze this existing codebase and map out what has already been built. Group the work into subprojects, mark completed features as done, partially built features as building, and remaining work as planned. Focus on giving a clear picture of current project state and the best next steps.`
      : `Analyze this project and create a comprehensive project plan. Identify the tech stack, current state, what's been built, and what remains. Generate subprojects and tasks that reflect the existing work and clear next steps. Mark completed work as done.`;
    setPrompt(analysisPrompt);
    void handleGeneratePlan({ prompt: analysisPrompt });
  };

  if (!hasConversation && !hasPlan && !isGenerating) {
    return (
      <div className="flex min-h-screen bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] text-ink dark:text-[var(--fg)]">
        <ProjectSidebar />

        <div className="flex min-w-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="orb left-[-4rem] top-20 h-40 w-40 bg-[#9ec5ff]" />
            <div className="orb bottom-[-2rem] right-10 h-44 w-44 bg-[#f7c87f]" />
            <div className="flex flex-1 items-center justify-center px-6 pb-32 pt-[5.2rem]">
              <div className="relative w-full max-w-[860px] text-center">
                <div className="app-surface relative overflow-hidden rounded-[2.2rem] px-8 py-10 shadow-[0_24px_80px_rgba(20,16,10,0.08)] dark:shadow-[0_28px_88px_rgba(0,0,0,0.3)]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(90deg,rgba(59,130,246,0.14),rgba(255,255,255,0),rgba(245,158,11,0.12))] dark:bg-[linear-gradient(90deg,rgba(59,130,246,0.18),rgba(255,255,255,0),rgba(251,191,36,0.1))]" />
                  <div className="relative">
                    <div className="inline-flex rounded-full bg-black/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted dark:bg-white/[0.06]">
                      {currentHeaderEyebrow}
                    </div>
                    <h1 className="display-font mt-5 text-[2.4rem] font-semibold tracking-tight theme-fg sm:text-[2.8rem]">
                      {activeProject.name}
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-[14px] leading-[1.75] theme-soft">{currentHeaderDescription}</p>
                  </div>

                  <div className="mt-8">
                  {activeProject.imported ? (
                    <>
                      <p className="text-[13px] leading-relaxed theme-muted">This project was imported from an existing directory and is ready for a structured audit.</p>
                      <button
                        type="button"
                        onClick={handleAnalyzeProject}
                        className="mt-5 rounded-full bg-[#111827] px-6 py-3 text-[13px] font-semibold text-white shadow-[0_14px_34px_rgba(17,24,39,0.18)] transition hover:-translate-y-[1px] hover:bg-[#0b1220] hover:shadow-[0_18px_38px_rgba(17,24,39,0.24)]"
                      >
                        Create Project Dashboard
                      </button>
                      <p className="mt-3 text-[11px] theme-muted">Analyzes the repo, creates tasks, and sets up the execution plan.</p>
                    </>
                  ) : (
                    <p className="mx-auto max-w-xl text-[14px] leading-relaxed theme-muted">Start by explaining what you want to build. The PM will shape the plan, then you can move straight into task threads and preview.</p>
                  )}
                  </div>
                  {(() => {
                    const rec = getModelRecommendation(featureFlags, !!taskContext);
                    const isAlreadySelected = selectedModel === rec.modelId;
                    return (
                      <div className="mx-auto mt-5 flex items-center justify-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.58a.75.75 0 0 1-1.12.814L8 11.86l-3.134 1.96a.75.75 0 0 1-1.12-.814l.852-3.58-2.79-2.39a.75.75 0 0 1 .427-1.317l3.664-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" /></svg>
                          {rec.label}
                        </span>
                        <span className="text-[10px] theme-muted">{rec.reason}</span>
                        {!isAlreadySelected && (
                          <button
                            type="button"
                            onClick={() => setSelectedModel(rec.modelId)}
                            className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25"
                          >
                            Use
                          </button>
                        )}
                      </div>
                    );
                  })()}
                {generationError ? (
                  <p className="danger-surface mx-auto mt-6 max-w-xl rounded-[1.15rem] px-4 py-3 text-[12px]">
                    {generationError}
                  </p>
                ) : null}
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-8 pt-4 sm:px-6">
              <div className="pointer-events-auto mx-auto flex w-full max-w-[1040px] flex-col gap-3">
                <RealProjectComposer
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={() => void handleGeneratePlan()}
                  onKeyDown={handleComposerKeyDown}
                  disabled={chatLocked}
                  isGenerating={isGenerating}
                  onCancel={() => void handleCancelGeneration()}
                  placeholder="Talk to the project manager"
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  modelCatalog={modelCatalog}
                  catalogSources={catalogSources}
                  attachedFiles={attachedFiles}
                  onAttachFiles={handleAttachFiles}
                  onRemoveAttachment={handleRemoveAttachment}
                  onOpenUsagePage={() => void handleOpenUsagePage()}
                  contextMarkdown={contextMarkdown}
                  contextPath={contextPath}
                  contextTitle={`${activeProject.name} project context`}
                  onContextEdit={setCustomContextMarkdown}
                  isDraggingFiles={isDraggingFiles}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropFiles}
                  featureFlags={featureFlags}
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

      <div ref={splitContainerRef} className="flex min-w-0 flex-1 overflow-hidden" data-split-container>
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="orb left-[-4rem] top-24 h-36 w-36 bg-[#9ec5ff]" />
          <div className="orb bottom-10 right-[-3rem] h-44 w-44 bg-[#f7c87f]" />
          <div className="relative px-5 pb-2 pt-4 sm:px-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1040px]">
              <div ref={taskMenuRef} className="relative">
                <button
                  ref={taskMenuButtonRef}
                  type="button"
                  onClick={() => setShowTaskMenu((value) => !value)}
                  className="group flex w-full items-center justify-between gap-3 rounded-[1.2rem] bg-[rgba(255,255,255,0.56)] px-4 py-3 text-left shadow-[0_8px_28px_rgba(20,16,11,0.05)] backdrop-blur-md transition hover:bg-[rgba(255,255,255,0.74)] dark:bg-[rgba(255,255,255,0.04)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.16)] dark:hover:bg-[rgba(255,255,255,0.06)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold tracking-[-0.02em] theme-fg sm:text-[19px]">{currentHeaderTitle}</p>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-ink/60 transition group-hover:bg-black/[0.06] group-hover:text-ink dark:bg-white/[0.06] dark:text-white/60 dark:group-hover:bg-white/[0.1] dark:group-hover:text-white">
                    <ChevronDownIcon className={`h-4 w-4 transition ${showTaskMenu ? "rotate-180" : ""}`} />
                  </span>
                </button>

                {showTaskMenu && taskMenuLayout ? (
                  <>
                    <button
                      type="button"
                      aria-label="Close conversations menu"
                      onClick={() => setShowTaskMenu(false)}
                      className="fixed inset-0 z-30 bg-transparent"
                    />
                    <div
                      ref={taskMenuPanelRef}
                      style={{ top: taskMenuLayout.top, left: taskMenuLayout.left, width: taskMenuLayout.width, maxHeight: taskMenuLayout.maxHeight }}
                      className="fixed z-40 overflow-hidden rounded-[1.6rem] border border-black/[0.08] bg-[rgba(255,252,246,0.99)] shadow-[0_28px_72px_rgba(22,18,12,0.16)] backdrop-blur-xl dark:border-white/[0.1] dark:bg-[rgba(24,26,31,0.99)] dark:shadow-[0_32px_84px_rgba(0,0,0,0.34)]"
                    >
                      <div className="border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.08]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] theme-muted">Conversations</p>
                        <p className="mt-2 text-[14px] leading-relaxed theme-muted">Jump between the project manager and every task chat for this project.</p>
                      </div>

                      <div className="custom-scroll overflow-y-auto px-3 py-3" style={{ maxHeight: taskMenuLayout.maxHeight - 84 }}>
                        <button
                          type="button"
                          onClick={() => handleNavigateConversation()}
                          className={`mb-3 flex w-full items-center justify-between gap-3 rounded-[1.2rem] border px-4 py-3 text-left transition ${!taskContext ? "border-transparent bg-[linear-gradient(135deg,#0f172a,#2563eb)] text-white shadow-[0_18px_34px_rgba(37,99,235,0.24)]" : "border-black/[0.05] bg-black/[0.02] hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"}`}
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
                                const statusLabel = isActive
                                  ? "Current"
                                  : task.status === "done"
                                    ? "Done"
                                    : task.status === "review"
                                      ? "Review"
                                      : task.status === "building"
                                        ? "Building"
                                        : hasMessages
                                          ? "Active"
                                          : "Ready";
                                const statusClass = isActive
                                  ? "bg-white/12 text-white/88"
                                  : task.status === "done"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200"
                                    : task.status === "review"
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/12 dark:text-amber-200"
                                      : task.status === "building"
                                        ? "bg-violet-100 text-violet-700 dark:bg-violet-500/12 dark:text-violet-200"
                                        : hasMessages
                                          ? "bg-sky-100 text-sky-700 dark:bg-sky-500/12 dark:text-sky-200"
                                          : "bg-stone-100 text-stone-700 dark:bg-stone-500/12 dark:text-stone-200";

                                return (
                                  <button
                                    key={task.id}
                                    type="button"
                                    onClick={() => handleNavigateConversation(task.id)}
                                    className={`flex w-full items-start justify-between gap-3 rounded-[1.2rem] border px-4 py-3 text-left transition ${isActive ? "border-transparent bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] text-white shadow-[0_18px_34px_rgba(29,78,216,0.24)]" : "border-black/[0.05] bg-black/[0.02] hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"}`}
                                  >
                                    <div className="min-w-0">
                                      <p className={`truncate text-[14px] font-semibold ${isActive ? "text-white" : "theme-fg"}`}>{task.title}</p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass}`}>
                                      {statusLabel}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div ref={conversationRef} className="custom-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2 sm:px-6 xl:px-8">
            <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-8">
              <div className="space-y-6">
                {editingMessageId ? (
                  <div className="app-surface rounded-[1.35rem] px-5 py-4 text-[13px] shadow-[0_14px_34px_rgba(18,14,10,0.05)] dark:shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="theme-fg">Editing this prompt will replace that message and everything after it.</p>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className={chatActionButtonClass}
                      >
                        Cancel edit
                      </button>
                    </div>
                  </div>
                ) : null}

                {taskContext && canUseStartingPrompt ? (
                  <div className="app-surface rounded-[1.55rem] p-5 shadow-[0_16px_42px_rgba(24,18,11,0.06)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.22)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">Starter prompt</p>
                        <p className="mt-2 text-[15px] font-semibold theme-fg">Start this task with the PM-generated kickoff prompt.</p>
                        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed theme-muted">{taskContext.task.startingPrompt}</p>
                        {(() => {
                          const rec = getModelRecommendation(featureFlags, true);
                          const isAlreadySelected = selectedModel === rec.modelId;
                          return (
                            <div className="mt-3 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.58a.75.75 0 0 1-1.12.814L8 11.86l-3.134 1.96a.75.75 0 0 1-1.12-.814l.852-3.58-2.79-2.39a.75.75 0 0 1 .427-1.317l3.664-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" /></svg>
                                Recommended: {rec.label}
                              </span>
                              <span className="text-[10px] theme-muted">{rec.reason}</span>
                              {!isAlreadySelected && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedModel(rec.modelId)}
                                  className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25"
                                >
                                  Switch
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <button
                        type="button"
                        onClick={handleUseStartingPrompt}
                        className="shrink-0 rounded-full bg-[#111827] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_12px_30px_rgba(17,24,39,0.18)] transition hover:-translate-y-[1px] hover:bg-[#0b1220] hover:shadow-[0_16px_34px_rgba(17,24,39,0.24)]"
                      >
                        Use kickoff
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
                          <div className="rounded-[1.7rem] rounded-br-[0.6rem] border border-sky-400/30 bg-[linear-gradient(135deg,#1e293b,#0f172a)] px-5 py-4 shadow-[0_18px_36px_rgba(15,23,42,0.22)] dark:border-sky-400/24 dark:shadow-[0_22px_44px_rgba(0,0,0,0.32)]">
                            <textarea
                              value={inlineEditText}
                              onChange={(e) => setInlineEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitInlineEdit(); }
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                              rows={Math.min(8, Math.max(2, inlineEditText.split("\n").length))}
                              className="w-full resize-none bg-transparent text-[15px] leading-[1.65] text-white/96 outline-none placeholder:text-white/40"
                              autoFocus
                            />
                          </div>
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={handleCancelEdit} className="rounded-full border border-white/[0.12] px-3 py-1.5 text-[11px] font-semibold text-white/64 transition hover:bg-white/[0.08] hover:text-white">Cancel</button>
                            <button type="button" onClick={handleSubmitInlineEdit} disabled={!inlineEditText.trim()} className="rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold text-slate-900 shadow-[0_8px_20px_rgba(255,255,255,0.16)] transition hover:-translate-y-[0.5px] hover:shadow-[0_10px_24px_rgba(255,255,255,0.22)] disabled:opacity-50">Resend</button>
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
                                className={chatActionButtonClass}
                              >
                                Edit prompt
                              </button>
                            ) : null}
                            {message.checkpointId ? (
                              <button
                                type="button"
                                onClick={() => void handleRestoreCheckpoint(message.checkpointId!)}
                                disabled={isRestoringCheckpoint}
                                className={`${chatActionButtonClass} disabled:opacity-50`}
                              >
                                {isRestoringCheckpoint ? "Restoring..." : "Restore checkpoint"}
                              </button>
                            ) : null}
                          </div>
                        ) : message.isAI && taskContext ? (
                          <div className="mt-1.5 flex items-center gap-3 text-[11px] theme-muted">
                            <button
                              type="button"
                              onClick={() => { setShowRightPane(true); setRightPaneMode("details"); setRightPaneResponseText(message.text); }}
                              className="transition hover:theme-fg"
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShowPreviewPane()}
                              className="transition hover:theme-fg"
                            >
                              Preview
                            </button>
                          </div>
                        ) : message.isAI && !taskContext ? (
                          <div className="mt-1.5 flex items-center gap-3 text-[11px] theme-muted">
                            <button
                              type="button"
                              onClick={() => { setShowRightPane(true); setRightPaneMode("details"); setRightPaneResponseText(message.text); }}
                              className="transition hover:theme-fg"
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShowPreviewPane()}
                              className="transition hover:theme-fg"
                            >
                              Preview
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
                        from: displayName || "You",
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
                            className={chatActionButtonClass}
                          >
                            Edit prompt
                          </button>
                          {cancelledRun.checkpointId ? (
                            <button
                              type="button"
                              onClick={() => void handleRestoreCheckpoint(cancelledRun.checkpointId!)}
                              disabled={isRestoringCheckpoint}
                              className={`${chatActionButtonClass} disabled:opacity-50`}
                            >
                              {isRestoringCheckpoint ? "Restoring..." : "Restore checkpoint"}
                            </button>
                          ) : null}
                        </div>
                      }
                    />
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#64748b,#475569)] text-[11px] font-bold text-white shadow-[0_8px_24px_rgba(71,85,105,0.24)]">
                        !
                      </div>
                      <div className="danger-surface min-w-0 flex-1 rounded-[1.35rem] px-5 py-4 shadow-[0_12px_26px_rgba(185,28,28,0.06)] dark:shadow-none">
                        <p className="text-[13px] font-semibold text-red-700 dark:text-red-200">Chat cancelled</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-red-700/85 dark:text-red-200/82">This run was stopped before the agent replied. You can retry the same state or edit the prompt first.</p>
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
                            className="rounded-full bg-[#111827] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#0b1220]"
                          >
                            Try again
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBeginEditMessage({ id: cancelledRun.messageId, text: cancelledRun.prompt, attachments: cancelledRun.attachments, modelId: cancelledRun.modelId })}
                            className="danger-button rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition"
                          >
                            Edit before retry
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                {/* ── P2P Peer Live Stream (inline at bottom of messages) ── */}
                {Object.keys(peerStreams).length > 0 && Object.entries(peerStreams).map(([peerId, stream]) => {
                  // Determine if this peer stream matches the current view
                  const peerMatchesView = (() => {
                    if (stream.scope === "task-agent") {
                      // Task agent stream: show full output only if viewing the same task
                      if (taskContext && stream.taskId && stream.taskId === taskContext.task.id) return true;
                      if (taskContext && stream.conversationId && stream.conversationId.includes(taskContext.task.id)) return true;
                      return false;
                    }
                    if (stream.scope === "project-manager") {
                      // PM stream: show full output only if in PM chat (no taskContext)
                      return !taskContext;
                    }
                    // solo-chat or other: show banner only (this page is not freestyle)
                    return false;
                  })();

                  if (!peerMatchesView) {
                    // Show compact "Agent running in X" banner
                    const peerLabel = stream.scope === "task-agent"
                      ? `${stream.taskName || "a task"} chat`
                      : stream.scope === "project-manager"
                        ? "PM Chat"
                        : stream.scope === "solo-chat"
                          ? `${stream.sessionTitle || "Freestyle"}`
                          : stream.scope;
                    const peerNavHref = stream.scope === "task-agent" && stream.taskId
                      ? `/project/chat?task=${encodeURIComponent(stream.taskId)}`
                      : stream.scope === "project-manager"
                        ? "/project/chat"
                        : stream.scope === "solo-chat"
                          ? "/project/code"
                          : null;

                    return (
                      <div key={peerId} className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600/20 text-[10px] font-bold text-cyan-500">
                          {(stream.peerName || "P").slice(0, 2).toUpperCase()}
                        </div>
                        {peerNavHref ? (
                          <a
                            href={peerNavHref}
                            className="group flex items-center gap-2 rounded-full bg-cyan-500/8 px-3.5 py-2 ring-1 ring-cyan-500/15 transition hover:bg-cyan-500/14 hover:ring-cyan-500/25"
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                            </span>
                            <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                              {stream.peerName} — Agent running in {peerLabel}
                            </span>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-cyan-500/50 transition group-hover:text-cyan-500">
                              <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                            </svg>
                          </a>
                        ) : (
                          <div className="flex items-center gap-2 rounded-full bg-cyan-500/8 px-3.5 py-2 ring-1 ring-cyan-500/15">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                            </span>
                            <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                              {stream.peerName} — Agent running in {peerLabel}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                  <div key={peerId} className="flex items-start gap-3">
                    <div className="avatar-ring shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">
                        {(stream.peerName || "P").slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                    <div className="max-w-[84%] xl:max-w-[78%] min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-2">
                        <p className="text-[11px] font-medium theme-fg">{stream.peerName}</p>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-400">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                          </span>
                          AI responding
                        </span>
                        <span className="text-[10px] font-normal theme-muted">
                          ({stream.scope === "project-manager" ? "PM Chat" : stream.scope === "solo-chat" ? "Solo Chat" : stream.scope === "task-agent" ? "Task Agent" : stream.scope})
                        </span>
                      </div>
                      <div className="app-surface overflow-hidden rounded-[1.45rem] rounded-tl-[0.7rem] shadow-[0_16px_38px_rgba(20,16,10,0.05)] dark:shadow-[0_18px_42px_rgba(0,0,0,0.2)]">
                        <pre className="custom-scroll max-h-[280px] min-h-[60px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.72] theme-soft whitespace-pre-wrap selection:bg-cyan-500/15">
                          {stream.tokens.slice(-4000) || <span className="theme-muted italic">Waiting for response...</span>}
                        </pre>
                      </div>
                    </div>
                  </div>
                  );
                })}

                {/* ── Local Agent: "Agent running in X" banner when viewing different task ── */}
                {isGenerating && generatingForMeta && taskContext && generatingForMeta.taskId && generatingForMeta.taskId !== taskContext.task.id ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-500">✦</div>
                    <a
                      href={`/project/chat?task=${encodeURIComponent(generatingForMeta.taskId)}`}
                      className="group flex items-center gap-2 rounded-full bg-violet-500/8 px-3.5 py-2 ring-1 ring-violet-500/15 transition hover:bg-violet-500/14 hover:ring-violet-500/25"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                      </span>
                      <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                        Agent running in {generatingForMeta.taskName || "another task"} chat
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-violet-500/50 transition group-hover:text-violet-500">
                        <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                      </svg>
                    </a>
                  </div>
                ) : isGenerating && generatingForMeta && !taskContext && generatingForMeta.scope === "task-agent" && generatingForMeta.taskId ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-500">✦</div>
                    <a
                      href={`/project/chat?task=${encodeURIComponent(generatingForMeta.taskId)}`}
                      className="group flex items-center gap-2 rounded-full bg-violet-500/8 px-3.5 py-2 ring-1 ring-violet-500/15 transition hover:bg-violet-500/14 hover:ring-violet-500/25"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                      </span>
                      <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                        Agent running in {generatingForMeta.taskName || "a task"} chat
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-violet-500/50 transition group-hover:text-violet-500">
                        <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                      </svg>
                    </a>
                  </div>
                ) : null}

                {/* ── "Other agent" banner from reconnect check (not peer, not local-generating) ── */}
                {!isGenerating && otherAgentMeta ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-500">✦</div>
                    <a
                      href={otherAgentMeta.taskId
                        ? `/project/chat?task=${encodeURIComponent(otherAgentMeta.taskId)}`
                        : otherAgentMeta.scope === "project-manager"
                          ? "/project/chat"
                          : otherAgentMeta.scope === "solo-chat"
                            ? "/project/code"
                            : "/project/chat"}
                      className="group flex items-center gap-2 rounded-full bg-violet-500/8 px-3.5 py-2 ring-1 ring-violet-500/15 transition hover:bg-violet-500/14 hover:ring-violet-500/25"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                      </span>
                      <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                        Agent running in {otherAgentMeta.taskName || (otherAgentMeta.scope === "project-manager" ? "PM Chat" : otherAgentMeta.scope === "solo-chat" ? "Freestyle" : "another chat")}
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-violet-500/50 transition group-hover:text-violet-500">
                        <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                      </svg>
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleForceReset()}
                      className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold text-amber-600 transition hover:bg-amber-500/18 dark:text-amber-400 dark:hover:bg-amber-500/20"
                      title="Force-kill the stuck agent and clean up"
                    >
                      Force Reset
                    </button>
                  </div>
                ) : null}

                {isGenerating && (!generatingForMeta || !generatingForMeta.taskId || (taskContext && generatingForMeta.taskId === taskContext.task.id) || (!taskContext && generatingForMeta.scope !== "task-agent")) ? (
                  <div className="flex items-start gap-3">
                    <div className="avatar-ring shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f2937] text-[11px] font-bold text-white dark:bg-[#f2efe8] dark:text-[#17181b]">
                        ✦
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-2">
                        <p className="text-[11px] font-medium theme-fg">{assistantName}</p>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:bg-violet-400/10 dark:text-violet-400">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                          </span>
                          Thinking
                        </span>
                      </div>
                      <div className="app-surface overflow-hidden rounded-[1.45rem] shadow-[0_16px_38px_rgba(20,16,10,0.05)] dark:shadow-[0_18px_42px_rgba(0,0,0,0.2)]">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-3 border-b border-black/[0.04] px-4 py-3 dark:border-white/[0.06]">
                          <div className="flex items-center gap-2.5">
                            <div className="flex gap-[3px]">
                              <span className="inline-block h-[5px] w-[5px] rounded-full bg-violet-500/50 animate-pulse-soft" />
                              <span className="inline-block h-[5px] w-[5px] rounded-full bg-violet-500/50 animate-pulse-soft" style={{ animationDelay: "0.15s" }} />
                              <span className="inline-block h-[5px] w-[5px] rounded-full bg-violet-500/50 animate-pulse-soft" style={{ animationDelay: "0.3s" }} />
                            </div>
                            <span className="text-[12px] font-medium theme-soft">{agentLiveStatus === "Idle" ? "Preparing..." : agentLiveStatus}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setThinkingPanelExpanded((v) => !v)}
                              className="rounded-full p-1.5 text-[11px] theme-muted transition hover:bg-black/[0.04] hover:theme-fg dark:hover:bg-white/[0.06]"
                              title={thinkingPanelExpanded ? "Collapse" : "Expand"}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 transition ${thinkingPanelExpanded ? "rotate-180" : ""}`}>
                                <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCancelGeneration()}
                              className="rounded-full bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-500/18 dark:text-red-400 dark:hover:bg-red-500/20"
                            >
                              Stop
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleForceReset()}
                              className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-600 transition hover:bg-amber-500/18 dark:text-amber-400 dark:hover:bg-amber-500/20"
                              title="Force-kill the agent and clean up git state"
                            >
                              Force Reset
                            </button>
                          </div>
                        </div>
                        {/* Live output stream */}
                        {thinkingPanelExpanded ? (
                          <div className="relative">
                            <pre
                              ref={thinkingOutputRef}
                              className="custom-scroll max-h-[280px] min-h-[80px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.72] theme-soft selection:bg-violet-500/15"
                            >
                              {agentLiveOutput || (
                                <span className="theme-muted italic">Waiting for model response...</span>
                              )}
                            </pre>
                            {/* Fade-out gradient at top for visual depth */}
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[var(--surface)] to-transparent opacity-60" />
                          </div>
                        ) : null}
                        {/* Interrupt input */}
                        <div className="border-t border-black/[0.04] px-4 py-2.5 dark:border-white/[0.06]">
                          <div className="flex items-center gap-2">
                            <input
                              value={interruptPrompt}
                              onChange={(e) => setInterruptPrompt(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && interruptPrompt.trim()) {
                                  e.preventDefault();
                                  const msg = interruptPrompt.trim();
                                  setInterruptPrompt("");
                                  void handleCancelGeneration().then(() => {
                                    setCancelledRun(null);
                                    setPrompt(msg);
                                    void handleGeneratePlan({ prompt: msg });
                                  });
                                }
                              }}
                              placeholder="Interrupt with a message..."
                              className="min-w-0 flex-1 bg-transparent text-[12px] theme-fg outline-none placeholder:theme-muted/50"
                            />
                            <button
                              type="button"
                              disabled={!interruptPrompt.trim()}
                              onClick={() => {
                                const msg = interruptPrompt.trim();
                                if (!msg) return;
                                setInterruptPrompt("");
                                void handleCancelGeneration().then(() => {
                                  setCancelledRun(null);
                                  setPrompt(msg);
                                  void handleGeneratePlan({ prompt: msg });
                                });
                              }}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/12 text-violet-600 transition hover:bg-violet-500/20 disabled:opacity-30 dark:text-violet-400"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                                <path d="M2.87 2.298a.75.75 0 0 0-.812.93l1.962 4.856A1.5 1.5 0 0 0 5.419 9.2h3.831a.75.75 0 0 0 0-1.5H5.419l-1.2-2.968 8.086 3.24a.75.75 0 0 0 .024-1.395L2.87 2.298Z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {generationError ? (
                <p className="danger-surface max-w-xl rounded-[1.15rem] px-4 py-3 text-[12px]">
                  {generationError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="relative z-20 flex-shrink-0 px-4 pb-5 pt-2 sm:px-6">
            <div ref={composerDockRef} className="mx-auto w-full max-w-[1040px]">
              <RealProjectComposer
                value={prompt}
                onChange={setPrompt}
                onSubmit={() => void handleGeneratePlan()}
                onKeyDown={handleComposerKeyDown}
                disabled={chatLocked}
                isGenerating={isGenerating}
                onCancel={() => void handleCancelGeneration()}
                placeholder={taskContext ? "Talk to the task agent" : "Talk to the project manager"}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                modelCatalog={modelCatalog}
                catalogSources={catalogSources}
                attachedFiles={attachedFiles}
                onAttachFiles={handleAttachFiles}
                onRemoveAttachment={handleRemoveAttachment}
                onOpenUsagePage={() => void handleOpenUsagePage()}
                contextMarkdown={contextMarkdown}
                contextPath={contextPath}
                contextTitle={taskContext ? `${taskContext.task.title} context` : `${activeProject.name} project context`}
                onContextEdit={setCustomContextMarkdown}
                taskAutomation={taskContext ? {
                  message: taskAutomationMessage,
                  noticeTone: taskAutomationNotice?.tone,
                  statusLabel: currentHeaderStatus.label,
                  statusClassName: currentHeaderStatus.className,
                  workingLabel: isGenerating ? buildWorkingLabel(liveStatusFrame) : null,
                  canUseStartingPrompt,
                  autoAdvanceEnabled: autoAdvanceTasks,
                  onUseStartingPrompt: handleUseStartingPrompt,
                  onToggleAutoAdvance: () => setAutoAdvanceTasks((value) => !value),
                  onAutoPrompt: () => void handleGenerateTaskPrompt(),
                  isAutoPrompting,
                } : undefined}
                isDraggingFiles={isDraggingFiles}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropFiles}
                featureFlags={featureFlags}
              />
            </div>
          </div>
        </div>

        {showRightPane ? (
          <>
            <div
              role="separator"
              aria-label="Resize preview pane"
              aria-orientation="vertical"
              className={`relative z-20 flex w-3 flex-shrink-0 cursor-col-resize select-none items-stretch justify-center ${isDraggingSplit ? "bg-sky-500/10" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDraggingSplit(true);
              }}
            >
              <div className={`my-3 w-[2px] rounded-full transition ${isDraggingSplit ? "bg-sky-500/70" : "bg-black/[0.15] dark:bg-white/[0.15]"}`} />
            </div>
            <div
              style={{ flexBasis: `${splitRatio}%`, width: `${splitRatio}%`, minWidth: 320 }}
              className="flex min-w-0 flex-shrink-0 flex-col overflow-hidden border-l border-black/[0.06] bg-[linear-gradient(180deg,var(--gradient-page-start)_0%,var(--gradient-page-end)_100%)] dark:border-white/[0.08]"
            >
              <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">
                <div className="app-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.8rem] shadow-[0_20px_52px_rgba(20,16,10,0.08)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
            <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-4 dark:border-white/[0.08]">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] theme-muted">{rightPaneMode === "preview" ? (previewMode === "terminal" ? "Terminal preview" : "Live preview") : "Response details"}</p>
                <p className="mt-1 truncate text-[14px] font-semibold theme-fg">{taskContext ? taskContext.task.title : activeProject.name}</p>
              </div>
              <div className="app-control-rail ml-auto flex gap-1 rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setRightPaneMode("preview")}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${rightPaneMode === "preview" ? "app-control-active" : "app-control-idle"}`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setRightPaneMode("details")}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${rightPaneMode === "details" ? "app-control-active" : "app-control-idle"}`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => { setRightPaneMode("terminal"); }}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${rightPaneMode === "terminal" ? "app-control-active" : "app-control-idle"}`}
                >
                  Terminal
                </button>
              </div>
              {rightPaneMode === "preview" && previewReady && (previewMode === "terminal" || detectedPreviewUrl) ? (
                <>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">{previewMode === "terminal" ? (previewProcessId ? "Running" : "Done") : (previewProcessId ? "Live" : "Cached")}</span>
                  <button
                    type="button"
                    onClick={() => setPreviewFullscreen(true)}
                    title="Fullscreen preview"
                    className="app-control-rail flex h-8 w-8 items-center justify-center rounded-full transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 theme-muted">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 7V4.5A1 1 0 0 1 4.5 3.5H7M13 3.5h2.5a1 1 0 0 1 1 1V7M16.5 13v2.5a1 1 0 0 1-1 1H13M7 16.5H4.5a1 1 0 0 1-1-1V13" />
                    </svg>
                  </button>
                </>
              ) : rightPaneMode === "preview" ? (
                <button
                  type="button"
                  onClick={() => setPreviewFullscreen(true)}
                  title="Fullscreen preview"
                  className="app-control-rail flex h-8 w-8 items-center justify-center rounded-full transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 theme-muted">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 7V4.5A1 1 0 0 1 4.5 3.5H7M13 3.5h2.5a1 1 0 0 1 1 1V7M16.5 13v2.5a1 1 0 0 1-1 1H13M7 16.5H4.5a1 1 0 0 1-1-1V13" />
                  </svg>
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleCloseRightPane}
                className="app-control-rail flex h-8 w-8 items-center justify-center rounded-full transition"
              >
                <span className="text-[14px] theme-muted">&times;</span>
              </button>
            </div>

            {rightPaneMode === "preview" ? (
              previewMode === "terminal" && previewReady ? (
                <div className="min-h-0 flex-1 p-3">
                  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-black/[0.06] bg-[#0d1117] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:border-white/[0.08]">
                    <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#161b22] px-4 py-3">
                      <div className="flex gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
                      </div>
                      <div className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/60">
                        {activeProject.repoPath}
                      </div>
                      {!previewProcessId ? (
                        <span className="text-[10px] font-medium text-white/40">{previewServerStatus}</span>
                      ) : null}
                    </div>
                    <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-[1.65] text-green-300/90 selection:bg-green-600/30">
                      {previewServerOutput || "Waiting for output...\n"}
                    </pre>
                    <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-[#161b22] px-4 py-2.5">
                      {previewProcessId ? (
                        <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/20 px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/30">Stop</button>
                      ) : (
                        <button type="button" onClick={() => { setPreviewExited(false); setPreviewServerOutput(""); void handleRunApp(); }} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.14]">Re-run</button>
                      )}
                    </div>
                  </div>
                </div>
              ) : detectedPreviewUrl && previewReady ? (
                <div className="min-h-0 flex-1 p-3">
                  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-black/[0.06] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.08]">
                  <div className="flex items-center gap-3 border-b border-black/[0.06] bg-[#f8fafc] px-4 py-3 dark:border-white/[0.08] dark:bg-[#171a1f]">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
                    </div>
                    <div className="min-w-0 flex-1 truncate rounded-full bg-black/[0.04] px-3 py-1 text-[11px] text-slate-500 dark:bg-white/[0.06] dark:text-white/60">{detectedPreviewUrl}</div>
                  </div>
                  <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
                  {/* Use <webview> instead of <iframe> — Electron's webview bypasses X-Frame-Options
                      and other iframe restrictions that dev servers impose */}
                  <webview
                    key={detectedPreviewUrl}
                    src={detectedPreviewUrl}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    ref={(el: HTMLElement | null) => {
                      if (!el) return;
                      // Block the webview from opening new windows (focus steal / popups)
                      const wv = el as HTMLElement & { addEventListener: HTMLElement["addEventListener"]; getWebContentsId?: () => number };
                      const handler = (e: Event) => { e.preventDefault(); };
                      wv.addEventListener("new-window", handler);
                    }}
                  />
                  <div className="absolute bottom-4 right-4 flex gap-2" style={{ zIndex: 10 }}>
                    <button type="button" onClick={() => { const wv = document.querySelector('webview') as HTMLElement & { reload?: () => void } | null; if (wv?.reload) wv.reload(); }} className="rounded-full bg-black/68 px-3 py-1.5 text-[11px] font-semibold text-white/88 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-sm transition hover:bg-black/84 hover:text-white dark:bg-white/12 dark:hover:bg-white/20">Refresh</button>
                    <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/84 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-sm transition hover:bg-red-600">Stop</button>
                  </div>
                </div>
                </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col overflow-hidden p-4">
                  <div className="app-surface-soft flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-[1.45rem] px-8 text-center">
                  <GlobeIcon className="h-12 w-12 flex-shrink-0 theme-muted opacity-30" />
                  <div className="flex-shrink-0">
                    <p className="text-[16px] font-semibold theme-fg">Your app will be previewed here</p>
                    <p className="mt-2 text-[13px] theme-muted">Start a local dev server to see your app running live.</p>
                  </div>
                  {pendingPreviewLaunch || previewProcessId ? (
                    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-hidden">
                      <p className="flex-shrink-0 animate-pulse text-[13px] font-medium theme-muted">{previewServerStatus}</p>
                      {previewServerOutput ? (
                        <pre className="min-h-0 w-full flex-1 overflow-auto rounded-[1rem] bg-black/5 p-3 text-left text-[11px] leading-relaxed theme-muted dark:bg-white/5">{previewServerOutput.slice(-3000)}</pre>
                      ) : null}
                      <button type="button" onClick={() => void handleStopPreviewServer()} className="flex-shrink-0 rounded-full bg-red-500/16 px-5 py-2.5 text-[13px] font-semibold text-red-600 transition hover:bg-red-500/24 dark:text-red-400">Stop</button>
                    </div>
                  ) : previewExited && previewServerOutput ? (
                    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-hidden">
                      <p className="flex-shrink-0 text-[13px] font-medium text-red-500">{previewServerStatus}</p>
                      <pre className="min-h-0 w-full flex-1 overflow-auto rounded-[1rem] bg-red-500/5 p-3 text-left text-[11px] leading-relaxed theme-muted dark:bg-red-500/10">{previewServerOutput.slice(-3000)}</pre>
                      <button type="button" onClick={() => { setPreviewExited(false); setPreviewServerOutput(""); void handleRunApp(); }} className="flex-shrink-0 rounded-full bg-[#111827] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(17,24,39,0.18)] transition hover:-translate-y-[1px] hover:bg-[#0b1220] hover:shadow-[0_14px_30px_rgba(17,24,39,0.24)]">Retry</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => void handleRunApp()} className="rounded-full bg-[#111827] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(17,24,39,0.18)] transition hover:-translate-y-[1px] hover:bg-[#0b1220] hover:shadow-[0_14px_30px_rgba(17,24,39,0.24)]">Run App</button>
                  )}
                </div>
                </div>
              )
            ) : rightPaneMode === "terminal" ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.35rem] border border-black/[0.06] bg-[#0d1117] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:border-white/[0.08]">
                  <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#161b22] px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
                    </div>
                    <div className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/60">
                      {activeProject.repoPath}
                    </div>
                    {terminalProcessId ? (
                      <button
                        type="button"
                        onClick={handleStopTerminalProcess}
                        className="rounded-full bg-red-500/20 px-2.5 py-1 text-[10px] font-semibold text-red-400 transition hover:bg-red-500/30"
                      >
                        Stop
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setTerminalOutput("")}
                      className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/50 transition hover:bg-white/[0.1] hover:text-white/70"
                    >
                      Clear
                    </button>
                  </div>
                  <pre
                    ref={terminalOutputRef}
                    className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-[1.65] text-green-300/90 selection:bg-green-600/30"
                  >
                    {terminalOutput || "Run commands in your project directory.\nType a command below and press Enter.\n\n"}
                  </pre>
                  <div className="flex items-center gap-2 border-t border-white/[0.06] bg-[#161b22] px-4 py-2.5">
                    <span className="text-[12px] font-bold text-green-400/70">$</span>
                    <input
                      value={terminalCommand}
                      onChange={(e) => setTerminalCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleRunTerminalCommand();
                        }
                      }}
                      placeholder="Enter a command..."
                      className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-white/90 outline-none placeholder:text-white/25"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scroll px-5 py-4">
                {rightPaneResponseText ? (
                  <div className="app-surface-soft space-y-3 rounded-[1.45rem] px-5 py-4 text-[14px] leading-[1.7] theme-fg">{renderChatMessageBody(rightPaneResponseText, "assistant")}</div>
                ) : (
                  <p className="text-[13px] theme-muted">Click &ldquo;Details&rdquo; on any AI response to see the full text here.</p>
                )}
              </div>
            )}
                </div>
              </div>
          </div>
          </>
        ) : null}
      </div>

      {/* Fullscreen preview overlay */}
      {previewFullscreen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117]">
          <div className="flex items-center gap-3 border-b border-white/[0.08] bg-[#161b22] px-5 py-3">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
            </div>
            {previewMode === "terminal" ? (
              <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/60">
                {activeProject.repoPath} — Terminal Preview
              </div>
            ) : (
              <div className="min-w-0 flex-1 truncate rounded-full bg-white/[0.06] px-3 py-1 text-[12px] text-white/60">
                {detectedPreviewUrl || "No preview URL"}
              </div>
            )}
            {previewProcessId ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-400">{previewMode === "terminal" ? "Running" : "Live"}</span>
            ) : null}
            {previewMode !== "terminal" ? (
              <button
                type="button"
                onClick={() => { const wv = document.querySelector('.fullscreen-preview-webview') as HTMLElement & { reload?: () => void } | null; if (wv?.reload) wv.reload(); }}
                className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.14] hover:text-white"
              >
                Refresh
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPreviewFullscreen(false)}
              title="Exit fullscreen"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] transition hover:bg-white/[0.14]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 text-white/70">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.5v2.5a1 1 0 0 1-1 1H3.5M16.5 7h-2.5a1 1 0 0 1-1-1V3.5M13 16.5v-2.5a1 1 0 0 1 1-1h2.5M3.5 13H6a1 1 0 0 1 1 1v2.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void handleStopPreviewServer()}
              className="rounded-full bg-red-500/20 px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/30"
            >
              Stop
            </button>
          </div>
          <div className="relative min-h-0 flex-1 bg-white">
            {previewMode === "terminal" ? (
              <div className="flex h-full flex-col bg-[#0d1117]">
                <pre className="min-h-0 flex-1 overflow-auto px-6 py-4 font-mono text-[13px] leading-[1.7] text-green-300/90 selection:bg-green-600/30">
                  {previewServerOutput || "Waiting for output...\n"}
                </pre>
                <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-[#161b22] px-5 py-2.5">
                  {previewProcessId ? (
                    <button type="button" onClick={() => void handleStopPreviewServer()} className="rounded-full bg-red-500/20 px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/30">Stop</button>
                  ) : (
                    <button type="button" onClick={() => { setPreviewExited(false); setPreviewServerOutput(""); void handleRunApp(); }} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.14]">Re-run</button>
                  )}
                </div>
              </div>
            ) : detectedPreviewUrl && previewReady ? (
              <webview
                key={`fs-${detectedPreviewUrl}`}
                src={detectedPreviewUrl}
                className="fullscreen-preview-webview"
                style={{ width: "100%", height: "100%", border: "none" }}
                ref={(el: HTMLElement | null) => {
                  if (!el) return;
                  const wv = el as HTMLElement & { addEventListener: HTMLElement["addEventListener"] };
                  const handler = (e: Event) => { e.preventDefault(); };
                  wv.addEventListener("new-window", handler);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#0d1117]">
                <div className="text-center">
                  <GlobeIcon className="mx-auto h-12 w-12 text-white/20" />
                  <p className="mt-4 text-[14px] font-medium text-white/60">{pendingPreviewLaunch || previewProcessId ? previewServerStatus : previewExited ? previewServerStatus : "No preview running"}</p>
                  {previewServerOutput ? (
                    <pre className={`mx-auto mt-4 max-h-64 max-w-xl overflow-auto rounded-xl p-4 text-left text-[11px] leading-relaxed ${previewExited ? "bg-red-500/10 text-red-300/70" : "bg-white/[0.04] text-white/50"}`}>{previewServerOutput.slice(-3000)}</pre>
                  ) : null}
                  {!pendingPreviewLaunch && !previewProcessId ? (
                    <button type="button" onClick={() => { if (previewExited) { setPreviewExited(false); setPreviewServerOutput(""); } void handleRunApp(); }} className="mt-6 rounded-full bg-white/12 px-5 py-2.5 text-[13px] font-semibold text-white shadow transition hover:bg-white/18">{previewExited ? "Retry" : "Run App"}</button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
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
  // Peer user messages should show as left-aligned (not "mine") on the receiving machine
  const isEffectivelyMine = message.isMine && !(message as any).fromPeer;

  if (isEffectivelyMine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] xl:max-w-[74%]">
          <div className="mb-2 flex items-center justify-end gap-2">
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted dark:bg-white/[0.06]">You</span>
            <p className="text-[11px] font-medium theme-muted">{message.time}</p>
          </div>
          <div className="rounded-[1.75rem] rounded-br-[0.65rem] border border-slate-900/10 bg-[linear-gradient(135deg,#1e293b,#0f172a)] px-5 py-4 text-white shadow-[0_18px_34px_rgba(15,23,42,0.18)] dark:border-white/[0.08] dark:shadow-[0_22px_42px_rgba(0,0,0,0.3)]">
            {message.attachments?.length ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {message.attachments.map((attachment) => (
                  <span key={attachment} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/78 backdrop-blur-sm">
                    {attachment.split(/[/\\]/).pop() || attachment}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="space-y-3 text-[14px] leading-[1.65] text-white/96">{renderChatMessageBody(message.text, "user")}</div>
          </div>
          {actions}
        </div>
      </div>
    );
  }

  const isPeerMessage = (message as any).fromPeer;
  const peerDisplayName = isPeerMessage ? ((message as any).peerName || "Peer") : null;
  const avatarBg = isPeerMessage && !message.isAI ? "bg-cyan-600" : "bg-[#1f2937]";
  const avatarText = isPeerMessage && !message.isAI
    ? (peerDisplayName || "P").slice(0, 2).toUpperCase()
    : "✦";

  return (
    <div className="flex items-start gap-3">
      <div className="avatar-ring shrink-0">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${avatarBg} text-[11px] font-bold text-white dark:${isPeerMessage ? avatarBg : "bg-[#f2efe8] dark:text-[#17181b]"}`}>
          {avatarText}
        </div>
      </div>
      <div className="max-w-[84%] xl:max-w-[78%]">
        <div className="mb-1.5 flex items-center gap-2">
          <p className="text-[11px] font-medium theme-fg">{isPeerMessage && !message.isAI ? peerDisplayName : message.from}</p>
          {isPeerMessage && (
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
              {message.isAI ? `via ${peerDisplayName}` : "Peer"}
            </span>
          )}
          <span className="text-[11px] theme-muted">{message.time}</span>
        </div>
        <div className="app-surface rounded-[1.6rem] rounded-tl-[0.7rem] px-5 py-4 shadow-[0_16px_38px_rgba(20,16,10,0.05)] dark:shadow-[0_20px_44px_rgba(0,0,0,0.22)]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted dark:bg-white/[0.06]">{message.isAI ? "Assistant" : peerDisplayName || message.from}</span>
          </div>
          <div className="space-y-3 theme-fg">{renderChatMessageBody(message.text, message.isAI ? "assistant" : "user")}</div>
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
  modelCatalog = DEFAULT_copilotModels,
  catalogSources: catalogs,
  attachedFiles,
  onAttachFiles,
  onRemoveAttachment,
  onOpenUsagePage,
  contextMarkdown,
  contextPath,
  contextTitle,
  onContextEdit,
  taskAutomation,
  isDraggingFiles,
  onDragOver,
  onDragLeave,
  onDrop,
  featureFlags,
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
  modelCatalog?: ModelCatalogEntry[];
  catalogSources?: CatalogSources;
  attachedFiles: ComposerAttachment[];
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onOpenUsagePage: () => void;
  contextMarkdown: string;
  contextPath: string;
  contextTitle: string;
  onContextEdit?: (newContext: string) => void;
  taskAutomation?: {
    message: string;
    noticeTone?: "info" | "success";
    statusLabel?: string;
    statusClassName?: string;
    workingLabel?: string | null;
    canUseStartingPrompt: boolean;
    autoAdvanceEnabled: boolean;
    onUseStartingPrompt: () => void;
    onToggleAutoAdvance: () => void;
    onAutoPrompt: () => void;
    isAutoPrompting: boolean;
  };
  isDraggingFiles: boolean;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  featureFlags?: FeatureFlags;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const contextPanelRef = useRef<HTMLDivElement | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const [editingContext, setEditingContext] = useState(false);
  const [editedContext, setEditedContext] = useState("");
  const [chatMode, setChatMode] = useState<"agent" | "ask" | "plan">("agent");

  const cs = catalogs ?? { copilot: DEFAULT_copilotModels, claude: DEFAULT_claudeModels, codex: DEFAULT_codexModels };
  const enabledProviderCount = [!!featureFlags?.githubCopilotCli, !!featureFlags?.claudeCode, !!featureFlags?.codexCli].filter(Boolean).length;
  const hasMultipleProviders = enabledProviderCount > 1;
  const [providerTab, setProviderTab] = useState<"claude" | "copilot" | "codex">(() => {
    if (cs.claude.some((m) => m.id === selectedModel)) return "claude";
    if (cs.codex.some((m) => m.id === selectedModel)) return "codex";
    return "copilot";
  });

  const selectedModelMeta = getModelCatalogEntry(selectedModel, modelCatalog);
  const estimatedTokens = estimateTokens([contextMarkdown, value].filter(Boolean).join("\n"));
  const maxTokens = selectedModelMeta.maxTokens;
  const tokenPercent = Math.min(100, Math.round((estimatedTokens / maxTokens) * 100));
  const tokenLabel = `${formatTokenCount(estimatedTokens)} / ${selectedModelMeta.contextWindow}`;
  const contextPreview = contextMarkdown.trim().split(/\r?\n/).slice(0, 14).join("\n");
  const filteredModels = modelCatalog.filter((entry) => {
    const haystack = `${entry.label} ${entry.provider} ${entry.id}`.toLowerCase();
    const matchesSearch = haystack.includes(modelSearch.trim().toLowerCase());
    if (!hasMultipleProviders || !matchesSearch) return matchesSearch;
    if (providerTab === "claude") return matchesSearch && cs.claude.some((m) => m.id === entry.id);
    if (providerTab === "codex") return matchesSearch && cs.codex.some((m) => m.id === entry.id);
    return matchesSearch && cs.copilot.some((m) => m.id === entry.id);
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

      if (modelMenuRef.current?.contains(target) || contextPanelRef.current?.contains(target) || modelButtonRef.current?.contains(target)) {
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
      className={`relative overflow-hidden rounded-2xl bg-[rgba(245,241,234,0.7)] backdrop-blur-xl transition dark:bg-[rgba(28,30,36,0.6)] ${isDraggingFiles ? "ring-2 ring-sky-400/60" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDraggingFiles ? (
        <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-[1.5rem] border border-sky-400/35 bg-sky-500/10 text-[13px] font-semibold text-sky-700 backdrop-blur-sm dark:text-sky-200">
          Drop files to attach them to this prompt
        </div>
      ) : null}

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

      <div className="px-3 pb-3 pt-3">
        <div className="relative">
          {showContextPanel ? (
            <div ref={contextPanelRef} className="app-surface mb-3 overflow-hidden rounded-[1.3rem] shadow-[0_18px_42px_rgba(18,14,10,0.12)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.28)]">
              <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold theme-fg">Context</p>
                  <p className="truncate text-[10px] theme-muted">{contextTitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowContextPanel(false)}
                  className="app-control-rail rounded-full p-1.5 transition"
                >
                  <CloseSmallIcon />
                </button>
              </div>
              <div className="relative h-1 bg-black/[0.06] dark:bg-white/[0.08]">
                <div className="absolute inset-y-0 left-0 bg-[#0078d4] transition-all" style={{ width: `${tokenPercent}%` }} />
              </div>
              <div className="grid gap-3 px-4 py-3 text-[11px]">
                <div className="rounded-[1rem] bg-black/[0.03] px-3 py-3 dark:bg-white/[0.04]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold theme-fg">Source</p>
                    <p className="text-[10px] theme-muted">{tokenLabel}</p>
                  </div>
                  {contextPath ? <p className="mt-1.5 break-all text-[10px] leading-relaxed theme-muted">{contextPath}</p> : null}
                </div>
                <div className="rounded-[1rem] bg-black/[0.03] px-3 py-3 dark:bg-white/[0.04]">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold theme-fg">Preview</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] theme-muted">{tokenPercent}% of window</p>
                      {!editingContext ? (
                        <button
                          type="button"
                          onClick={() => { setEditingContext(true); setEditedContext(contextMarkdown); }}
                          className="rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-400 transition hover:bg-violet-500/20"
                        >
                          Edit
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingContext(false)}
                            className="rounded-lg bg-black/[0.04] px-2 py-1 text-[10px] font-semibold theme-muted transition hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (onContextEdit) onContextEdit(editedContext);
                              setEditingContext(false);
                            }}
                            className="rounded-lg bg-[#0078d4] px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-[#006cbf]"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {editingContext ? (
                    <textarea
                      value={editedContext}
                      onChange={(e) => setEditedContext(e.target.value)}
                      className="custom-scroll w-full min-h-[180px] max-h-[320px] resize-y overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/[0.03] p-2 font-mono text-[10.5px] leading-6 theme-soft outline-none ring-1 ring-violet-500/30 focus:ring-violet-500/50 dark:bg-white/[0.03]"
                    />
                  ) : (
                    <pre className="custom-scroll max-h-[180px] overflow-y-auto whitespace-pre-wrap text-[10.5px] leading-6 theme-soft">{contextPreview || "No context loaded yet."}</pre>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[1.45rem] border border-black/[0.06] bg-[rgba(255,255,255,0.56)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-white/[0.08] dark:bg-[rgba(255,255,255,0.03)]">
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="app-control-rail flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
              </button>

              <div className="min-w-0 flex-1">
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={placeholder}
                  className="min-h-[3rem] w-full resize-none overflow-y-hidden bg-transparent text-[15px] leading-[1.68] text-ink placeholder:text-ink-muted/45 outline-none dark:text-[var(--fg)] dark:placeholder:text-[var(--muted)]"
                />

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
              </div>

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
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111827] text-white transition hover:bg-[#0b1220] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowContextPanel((value) => !value);
                  setShowModelMenu(false);
                }}
                className="app-control-rail group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
                title={contextTitle}
              >
                <FileCodeIcon className="h-3.5 w-3.5 theme-muted group-hover:theme-fg" />
                <span className="theme-fg">Context</span>
                <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] theme-muted dark:bg-white/[0.06]">{tokenPercent}%</span>
              </button>

              {/* Mode toggle — Agent / Ask / Plan */}
              <div className="inline-flex items-center rounded-full bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                {(["agent", "ask", "plan"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChatMode(mode)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize transition ${chatMode === mode ? "bg-white text-ink shadow-sm dark:bg-[#2a2a2a] dark:text-[var(--fg)]" : "text-ink-muted/60 hover:text-ink dark:text-[var(--muted)] dark:hover:text-[var(--fg)]"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <div className="relative">
                <button
                  ref={modelButtonRef}
                  type="button"
                  onClick={() => {
                    if (!showModelMenu && modelButtonRef.current) {
                      const rect = modelButtonRef.current.getBoundingClientRect();
                      setModelMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 6 });
                    }
                    setShowModelMenu((value) => !value);
                    setModelSearch("");
                    setShowContextPanel(false);
                  }}
                  className="app-control-rail inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold theme-fg transition"
                >
                  <span>{selectedModelMeta.label}</span>
                  <ChevronDownIcon className={`h-3.5 w-3.5 transition ${showModelMenu ? "rotate-180" : ""}`} />
                </button>
              </div>

              {showModelMenu && modelMenuPos ? createPortal(
                <div
                  ref={modelMenuRef}
                  className="fixed z-[9999] max-h-[min(420px,70vh)] w-[300px] overflow-hidden rounded-[1.2rem] border border-black/[0.08] bg-[rgba(255,255,255,0.98)] shadow-[0_20px_44px_rgba(0,0,0,0.14)] backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#1e1f25]/98 dark:shadow-[0_20px_44px_rgba(0,0,0,0.4)]"
                  style={{ left: modelMenuPos.left, bottom: modelMenuPos.bottom }}
                >
                  <div className="flex items-center gap-2 border-b border-black/[0.06] px-2.5 py-2 dark:border-white/[0.08]">
                    <SearchIcon className="h-3.5 w-3.5 theme-muted" />
                    <input
                      value={modelSearch}
                      onChange={(event) => setModelSearch(event.target.value)}
                      placeholder="Search models"
                      autoFocus
                      className="w-full bg-transparent text-[12px] theme-fg outline-none placeholder:theme-muted"
                    />
                  </div>
                  {hasMultipleProviders ? (
                    <div className="flex gap-1 border-b border-black/[0.06] px-2.5 py-1.5 dark:border-white/[0.08]">
                      {(["claude", "copilot", "codex"] as const)
                        .filter((tab) => {
                          if (tab === "claude") return !!featureFlags?.claudeCode;
                          if (tab === "copilot") return !!featureFlags?.githubCopilotCli;
                          return !!featureFlags?.codexCli;
                        })
                        .map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setProviderTab(tab)}
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${providerTab === tab ? "bg-[#0078d4] text-white" : "theme-muted hover:theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
                        >
                          {tab === "claude" ? "Claude Code" : tab === "codex" ? "Codex CLI" : "GitHub Copilot"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className={`custom-scroll overflow-y-auto pb-3 pt-1 ${hasMultipleProviders ? "max-h-[min(330px,calc(70vh-90px))]" : "max-h-[min(370px,calc(70vh-50px))]"}`}>
                    {(["featured", "other"] as const).map((group) => {
                      const groupModels = filteredModels.filter((entry) => entry.group === group);
                      if (groupModels.length === 0) return null;
                      return (
                        <div key={group} className="mb-0.5 last:mb-0">
                          <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] theme-muted">
                            {group === "featured" ? "Recommended" : "Other models"}
                          </p>
                          {groupModels.map((entry) => {
                            const isSelected = entry.id === selectedModel;
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => { onModelChange(entry.id); setShowModelMenu(false); setModelSearch(""); }}
                                className={`flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition ${isSelected ? "bg-[#0078d4] text-white" : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11.5px] font-medium">{entry.label}</span>
                                    {entry.warning ? <span className={`text-[10px] ${isSelected ? "text-white/70" : "theme-muted"}`}>{entry.warning}</span> : null}
                                  </div>
                                  <div className={`mt-0.5 flex items-center gap-2 text-[10px] ${isSelected ? "text-white/72" : "theme-muted"}`}>
                                    <span>{entry.provider}</span>
                                    <span>{entry.contextWindow}</span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className={`text-[10px] font-medium ${isSelected ? "text-white/70" : "theme-muted"}`}>{entry.usage}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>,
                document.body
              ) : null}

              <button
                type="button"
                onClick={onOpenUsagePage}
                className="app-control-rail rounded-full px-3 py-1.5 text-[11px] font-semibold theme-fg transition"
              >
                Usage
              </button>

              {taskAutomation ? (
                <>
                  <span className="mx-0.5 h-3 w-px bg-black/[0.1] dark:bg-white/[0.12]" />
                  {taskAutomation.canUseStartingPrompt ? (
                    <button
                      type="button"
                      onClick={taskAutomation.onUseStartingPrompt}
                      className="app-control-rail rounded-full px-3 py-1.5 text-[11px] font-semibold theme-fg transition"
                    >
                      Kickoff
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={taskAutomation.onAutoPrompt}
                    disabled={taskAutomation.isAutoPrompting || disabled}
                    className={`relative inline-flex items-center gap-2 overflow-hidden rounded-full px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-wait disabled:opacity-100 ${taskAutomation.isAutoPrompting ? "app-auto-prompt-loading text-white" : taskAutomation.autoAdvanceEnabled ? "bg-[#111827] text-white shadow-[0_10px_24px_rgba(17,24,39,0.16)]" : "bg-black/[0.06] theme-fg hover:bg-black/[0.1] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"}`}
                    title={taskAutomation.autoAdvanceEnabled ? "Auto + Flow: generates prompts and auto-advances to the next task when done" : "Generate the next best prompt for this task"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M8 1a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 1ZM5.03 2.97a.75.75 0 0 1 0 1.06L3.56 5.5a.75.75 0 0 1-1.06-1.06l1.47-1.47a.75.75 0 0 1 1.06 0Zm5.94 0a.75.75 0 0 1 1.06 0l1.47 1.47a.75.75 0 0 1-1.06 1.06L10.97 4.03a.75.75 0 0 1 0-1.06ZM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM1 8a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 1 8Zm10 0a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 11 8Zm-5.97 2.97a.75.75 0 0 1 0 1.06l-1.47 1.47a.75.75 0 0 1-1.06-1.06l1.47-1.47a.75.75 0 0 1 1.06 0Zm5.94 0a.75.75 0 0 1 1.06 0l1.47 1.47a.75.75 0 0 1-1.06 1.06l-1.47-1.47a.75.75 0 0 1 0-1.06ZM8 11a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 11Z" /></svg>
                    {taskAutomation.isAutoPrompting ? (
                      <>
                        <span>Generating</span>
                        <span className="flex items-center gap-[3px]">
                          <span className="app-auto-prompt-dot" />
                          <span className="app-auto-prompt-dot" style={{ animationDelay: "0.16s" }} />
                          <span className="app-auto-prompt-dot" style={{ animationDelay: "0.32s" }} />
                        </span>
                      </>
                    ) : taskAutomation.autoAdvanceEnabled ? (
                      <span className="flex items-center gap-1.5">
                        <span>Auto</span>
                        <span className="rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">Flow</span>
                      </span>
                    ) : "Auto"}
                  </button>
                  <button
                    type="button"
                    onClick={taskAutomation.onToggleAutoAdvance}
                    className={`rounded-full px-2 py-1.5 text-[10px] font-semibold transition ${taskAutomation.autoAdvanceEnabled ? "text-white/60 hover:text-white/90" : "app-control-rail theme-muted hover:theme-fg"}`}
                    title={taskAutomation.autoAdvanceEnabled ? "Flow is on — Auto will advance to the next task when done. Click to disable." : "Enable Flow — Auto will advance to the next task when done."}
                  >
                    {taskAutomation.autoAdvanceEnabled ? "●" : "○"}
                  </button>
                </>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] theme-muted">
              {attachedFiles.length > 0 ? <span>{attachedFiles.length} file{attachedFiles.length === 1 ? "" : "s"} attached</span> : null}
            </div>
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