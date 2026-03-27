// Type declarations for the Electron API exposed via preload.js
// This makes window.electronAPI fully typed in your React components.

export interface TerminalResult {
  processId: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface RunningProcess {
  processId: string;
}

export interface ProcessRunPayload {
  command: string;
  cwd: string;
  options?: {
    timeoutMs?: number;
    env?: Record<string, string>;
  };
}

export interface ProcessOutputEvent {
  processId: string;
  stream: "stdout" | "stderr";
  chunk: string;
}

export interface ProcessLifecycleEvent {
  processId: string;
  cwd?: string;
  command?: string;
  exitCode?: number | null;
  timeoutMs?: number;
  message?: string;
}

export interface RepoStatusFile {
  indexStatus: string;
  workTreeStatus: string;
  path: string;
}

export interface RepoCommitSummary {
  hash: string;
  message: string;
}

export interface RepoInspection {
  repoPath: string;
  branch: string;
  branches: string[];
  changedFiles: RepoStatusFile[];
  recentCommits: RepoCommitSummary[];
}

export interface RepoDirectoryEntry {
  name: string;
  path: string;
  type: "directory" | "file";
}

export interface RepoFileContent {
  path: string;
  content: string;
}

export interface RepoWriteFilePayload {
  targetPath: string;
  content: string;
}

export interface RepoFileDiff {
  path: string;
  diff: string;
  staged: boolean;
}

export interface RepoFileSelectionPayload {
  repoPath: string;
  filePaths: string[];
}

export interface RepoBranchPayload {
  repoPath: string;
  branchName: string;
  create?: boolean;
}

export interface RepoCommitPayload {
  repoPath: string;
  message: string;
}

export interface RepoDiffPayload {
  repoPath: string;
  targetPath: string;
  staged?: boolean;
}

export interface RepoCommitDetailPayload {
  repoPath: string;
  commitHash: string;
}

export interface RepoCommitFileChange {
  status: string;
  path: string;
}

export interface RepoCommitDetails {
  hash: string;
  author: string;
  date: string;
  subject: string;
  body: string;
  files: RepoCommitFileChange[];
  diff: string;
}

export interface DesktopProject {
  id: string;
  name: string;
  description: string;
  stage: "Planning" | "Building" | "Review" | "Live";
  repoPath: string;
  folderName: string;
  githubVisibility: "private" | "public";
  githubRepoUrl: string | null;
  githubRepoWarning?: string | null;
  createdAt: string;
  updatedAt: string;
  dashboard: ProjectDashboardState;
}

export interface ProjectDeleteResult {
  deletedProjectId: string;
  activeProjectId: string | null;
  deletedLocalFiles: boolean;
  deletedGithubRepo: boolean;
}

export interface ProjectDeletePayload {
  projectId: string;
  deleteLocalFiles?: boolean;
  deleteGithubRepo?: boolean;
}

export interface ProjectDashboardTask {
  id: string;
  title: string;
  status: "planned" | "building" | "review" | "done";
  owner: string;
  reviewer?: string;
  note: string;
  dueDate: string;
  startingPrompt: string;
}

export interface ProjectDashboardSubproject {
  id: string;
  title: string;
  goal: string;
  status: "planned" | "building" | "review" | "done";
  updatedAgo: string;
  agentName: string;
  agentBrief: string;
  preview: {
    eyebrow: string;
    title: string;
    subtitle: string;
    accent: string;
    cards: string[];
  };
  tasks: ProjectDashboardTask[];
}

export interface ProjectDashboardPlan {
  id: string;
  projectId: string;
  prompt: string;
  summary: string;
  nextAction: string;
  projectPreview: {
    eyebrow: string;
    title: string;
    subtitle: string;
    accent: string;
    cards: string[];
  };
  buildOrder: Array<{
    id: string;
    sequence: number;
    title: string;
    summary: string;
    subprojectId: string;
    taskIds: string[];
  }>;
  subprojects: ProjectDashboardSubproject[];
}

export interface ProjectDashboardMessage {
  id: string;
  from: string;
  initials: string;
  text: string;
  time: string;
  isAI?: boolean;
  isMine?: boolean;
  buildId?: string;
  attachments?: string[];
  modelId?: string;
  checkpointId?: string | null;
}

export interface ProjectDashboardThread {
  id: string;
  taskId: string;
  subprojectId: string;
  subprojectTitle: string;
  title: string;
  agentName: string;
  updatedAgo: string;
  summary: string;
  purpose?: string;
  sessionType?: "task";
  systemPromptMarkdown?: string;
  contextMarkdown?: string;
  contextFilePath?: string | null;
  lastModel?: string | null;
  attachedFiles?: string[];
  messages: ProjectDashboardMessage[];
}

export interface ProjectDashboardArtifact {
  id: string;
  title: string;
  description: string;
  status: "done" | "building" | "planned";
  updatedAgo: string;
  changes: string[];
  code: string;
  preview: {
    mode: "interface" | "flow" | "runtime" | "data";
    artifactType: string;
    summary: string;
    primaryActionLabel: string;
    views: Array<{ id: string; label: string; description: string }>;
    codeFileName?: string;
  };
}

export interface ProjectDashboardChannel {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  updatedAgo: string;
  messages: Array<{
    id: string;
    from: string;
    initials: string;
    text: string;
    time: string;
    isMine?: boolean;
  }>;
}

export interface ProjectDashboardDirectThread {
  id: string;
  name: string;
  initials: string;
  role: string;
  online: boolean;
  updatedAgo: string;
  preview: string;
  messages: Array<{
    id: string;
    from: string;
    initials: string;
    text: string;
    time: string;
    isMine?: boolean;
  }>;
}

export interface ProjectDashboardState {
  systemPromptMarkdown: string;
  initialPrompt: string;
  lastPlanGeneratedAt: string | null;
  projectManagerContextMarkdown?: string;
  projectManagerContextPath?: string | null;
  plan: ProjectDashboardPlan | null;
  conversation: ProjectDashboardMessage[];
  taskThreads: ProjectDashboardThread[];
  activity: DesktopActivityEvent[];
  artifacts: ProjectDashboardArtifact[];
  channels: ProjectDashboardChannel[];
  directMessages: ProjectDashboardDirectThread[];
}

export interface ProjectCreatePayload {
  name: string;
  description?: string;
  baseDirectory?: string;
  folderName?: string;
  createGithubRepo?: boolean;
  githubVisibility?: "private" | "public";
  importExistingPath?: string;
}

export interface ProjectGeneratePlanPayload {
  projectId: string;
  prompt: string;
  model?: string;
}

export interface ProjectSendPMMessagePayload {
  projectId: string;
  prompt: string;
  model?: string;
  attachedFiles?: string[];
  replaceFromMessageId?: string;
}

export interface ProjectSendTaskMessagePayload {
  projectId: string;
  taskId: string;
  threadId?: string;
  prompt: string;
  model?: string;
  attachedFiles?: string[];
  replaceFromMessageId?: string;
}

export interface ProjectRestoreCheckpointPayload {
  projectId: string;
  checkpointId: string;
}

export interface ProjectSendTaskMessageResult {
  project: DesktopProject;
  threadId: string;
}

export interface ProjectAgentEvent {
  timestamp: number;
  projectId?: string;
  taskId?: string;
  threadId?: string;
  checkpointId?: string;
  scope?: "project-manager" | "task-agent";
  phase?: "plan" | "chat";
  model?: string;
  command?: string;
  message?: string;
  stream?: "stdout" | "stderr" | "system";
  chunk?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
}

export interface DesktopSettings {
  workspaceRoots: string[];
  recentRepositories: string[];
  projects: DesktopProject[];
  activeProjectId: string | null;
  projectDefaults: {
    rootDirectory: string;
    createGithubRepo: boolean;
    githubVisibility: "private" | "public";
    systemPromptMarkdown: string;
    copilotModel: string;
  };
  shell: string;
  cliTools: Record<string, string>;
  featureFlags: {
    githubCopilotCli: boolean;
    claudeCode: boolean;
    githubCompanion: boolean;
  };
}

export interface ToolStatus {
  id: string;
  label: string;
  available: boolean;
  command: string;
  detail: string;
}

export interface DesktopActivityEvent {
  id: string;
  type: "build" | "review" | "comment" | "status" | "deploy" | "join";
  title: string;
  description: string;
  actor: string;
  actorInitials: string;
  time: string;
  relatedFile?: string;
}

export interface CopilotPromptPayload {
  prompt: string;
  cwd: string;
  allowTools?: string[];
  timeoutMs?: number;
  model?: string;
}

export interface CommonSystemPaths {
  desktop: string;
  documents: string;
  downloads: string;
  home: string;
}

export interface ElectronAPI {
  system: {
    openDirectory: () => Promise<string | null>;
    openExternal: (url: string) => Promise<void>;
    getCommonPaths: () => Promise<CommonSystemPaths>;
    platform: "win32" | "darwin" | "linux";
  };
  process: {
    run: (payload: ProcessRunPayload) => Promise<TerminalResult>;
    cancel: (processId: string) => Promise<{ ok: boolean }>;
    listRunning: () => Promise<RunningProcess[]>;
    onStarted: (callback: (event: ProcessLifecycleEvent) => void) => () => void;
    onOutput: (callback: (event: ProcessOutputEvent) => void) => () => void;
    onCompleted: (callback: (event: ProcessLifecycleEvent) => void) => () => void;
    onError: (callback: (event: ProcessLifecycleEvent) => void) => () => void;
    onCancelled: (callback: (event: ProcessLifecycleEvent) => void) => () => void;
    onTimeout: (callback: (event: ProcessLifecycleEvent) => void) => () => void;
  };
  repo: {
    inspect: (repoPath: string) => Promise<RepoInspection>;
    listDirectory: (targetPath: string) => Promise<RepoDirectoryEntry[]>;
    readFileContent: (targetPath: string) => Promise<RepoFileContent>;
    writeFileContent: (payload: RepoWriteFilePayload) => Promise<RepoFileContent>;
    getFileDiff: (payload: RepoDiffPayload) => Promise<RepoFileDiff>;
    stageFiles: (payload: RepoFileSelectionPayload) => Promise<RepoInspection>;
    unstageFiles: (payload: RepoFileSelectionPayload) => Promise<RepoInspection>;
    commit: (payload: RepoCommitPayload) => Promise<RepoInspection>;
    checkoutBranch: (payload: RepoBranchPayload) => Promise<RepoInspection>;
    getCommitDetails: (payload: RepoCommitDetailPayload) => Promise<RepoCommitDetails>;
  };
  settings: {
    get: () => Promise<DesktopSettings>;
    update: (patch: Partial<DesktopSettings>) => Promise<DesktopSettings>;
    onChanged: (callback: (settings: DesktopSettings) => void) => () => void;
  };
  project: {
    list: () => Promise<DesktopProject[]>;
    create: (payload: ProjectCreatePayload) => Promise<DesktopProject>;
    delete: (payload: ProjectDeletePayload) => Promise<ProjectDeleteResult>;
    setActive: (projectId: string) => Promise<DesktopProject>;
    generatePlan: (payload: ProjectGeneratePlanPayload) => Promise<DesktopProject>;
    ensureGithubRepo: (projectId: string) => Promise<DesktopProject>;
    sendTaskMessage: (payload: ProjectSendTaskMessagePayload) => Promise<ProjectSendTaskMessageResult>;
    sendPMMessage: (payload: ProjectSendPMMessagePayload) => Promise<DesktopProject>;
    cancelActiveRequest: () => Promise<{ cancelled: boolean }>;
    restoreCheckpoint: (payload: ProjectRestoreCheckpointPayload) => Promise<DesktopProject>;
    onAgentStarted: (callback: (event: ProjectAgentEvent) => void) => () => void;
    onAgentOutput: (callback: (event: ProjectAgentEvent) => void) => () => void;
    onAgentCompleted: (callback: (event: ProjectAgentEvent) => void) => () => void;
    onAgentError: (callback: (event: ProjectAgentEvent) => void) => () => void;
    onAgentCancelled: (callback: (event: ProjectAgentEvent) => void) => () => void;
  };
  tools: {
    listStatus: () => Promise<ToolStatus[]>;
    runCopilotPrompt: (payload: CopilotPromptPayload) => Promise<TerminalResult>;
  };
  activity: {
    list: () => Promise<DesktopActivityEvent[]>;
    onCreated: (callback: (event: DesktopActivityEvent) => void) => () => void;
  };
  openDirectory: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  runCommand: (command: string, cwd: string) => Promise<TerminalResult>;
  onTerminalOutput: (callback: (data: string) => void) => () => void;
  platform: "win32" | "darwin" | "linux";
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
