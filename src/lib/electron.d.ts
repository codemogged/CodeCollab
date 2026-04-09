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
  imported?: boolean;
  createdAt: string;
  updatedAt: string;
  dashboard: ProjectDashboardState;
}

export interface ProjectDeleteResult {
  deletedProjectId: string;
  activeProjectId: string | null;
  deletedLocalFiles: boolean;
  deletedGithubRepo: boolean;
  githubWarning?: string | null;
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
  soloSessions?: SoloSession[];
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

export interface ProjectGenerateTaskPromptPayload {
  projectId: string;
  taskId: string;
  threadId?: string;
  model?: string;
}

export interface ProjectRestoreCheckpointPayload {
  projectId: string;
  checkpointId: string;
}

export interface ProjectSendTaskMessageResult {
  project: DesktopProject;
  threadId: string;
}

export interface SoloSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastModel: string | null;
  messages: ProjectDashboardMessage[];
}

export interface SendSoloMessagePayload {
  projectId: string;
  sessionId?: string;
  prompt: string;
  model?: string;
  attachedFiles?: string[];
  replaceFromMessageId?: string;
}

export interface SendSoloMessageResult {
  project: DesktopProject;
  sessionId: string;
}

export interface ProjectGenerateTaskPromptResult {
  prompt: string;
  taskStatus: "planned" | "building" | "review" | "done";
  reason: string;
}

export interface ProjectAgentEvent {
  timestamp: number;
  projectId?: string;
  taskId?: string;
  threadId?: string;
  checkpointId?: string;
  scope?: "project-manager" | "task-agent" | "solo-chat";
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
  onboardingCompleted: boolean;
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

export interface DesktopSettingsPatch {
  onboardingCompleted?: boolean;
  workspaceRoots?: string[];
  recentRepositories?: string[];
  projects?: DesktopProject[];
  activeProjectId?: string | null;
  projectDefaults?: Partial<DesktopSettings["projectDefaults"]>;
  shell?: string;
  cliTools?: Partial<DesktopSettings["cliTools"]>;
  featureFlags?: Partial<DesktopSettings["featureFlags"]>;
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

// ---------- Shared State types ----------

export interface SharedStateInitResult {
  initialized: boolean;
  path: string;
}

export interface SharedStateFileResult {
  exists: boolean;
  content: string | null;
}

export interface SharedStateWriteResult {
  path: string;
}

export interface SharedStateDirEntry {
  name: string;
  path: string;
  type: "directory" | "file";
}

export interface SharedConversationData {
  id: string;
  updatedAt: string;
  title?: string;
  type?: string;
  messages: Array<{
    id: string;
    from: string;
    text: string;
    time: string;
    isAI?: boolean;
    isMine?: boolean;
  }>;
}

export interface SharedConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  type: string;
}

export interface SharedMemberProfile {
  id: string;
  name: string;
  initials: string;
  role?: string;
  joinedAt?: string;
  updatedAt?: string;
}

export interface SharedStateReadFilePayload {
  repoPath: string;
  relativePath: string;
}

export interface SharedStateWriteFilePayload {
  repoPath: string;
  relativePath: string;
  content: string;
}

export interface SharedStateListDirPayload {
  repoPath: string;
  relativePath: string;
}

export interface SharedStateSaveConversationPayload {
  repoPath: string;
  conversationId: string;
  messages: SharedConversationData["messages"];
  metadata?: { title?: string; type?: string };
}

export interface SharedStateLoadConversationPayload {
  repoPath: string;
  conversationId: string;
}

export interface SharedStateSaveMemberPayload {
  repoPath: string;
  profile: SharedMemberProfile;
}

// ---------- P2P Collaboration types ----------

export interface P2PJoinPayload {
  projectId: string;
  repoPath: string;
  remoteUrl: string;
  member: {
    id: string;
    name: string;
    initials: string;
    role?: string;
  };
}

export interface P2PJoinResult {
  projectId: string;
  topic: string;
  joined: boolean;
}

export interface P2PStatus {
  projectId?: string;
  joined: boolean;
  topic: string | null;
  repoPath: string | null;
  peerCount: number;
  member: P2PJoinPayload["member"] | null;
  reconnecting?: boolean;
  reconnectAttempts?: number;
}

export interface P2PPeer {
  id: string;
  name: string;
  initials: string;
  role: string;
  status: "online" | "away";
}

export interface P2PPeerEvent {
  projectId?: string;
  peerId: string;
  name: string;
  initials?: string;
}

export interface P2PPresenceEvent {
  projectId?: string;
  peers: P2PPeer[];
  memberCount: number;
}

export interface P2PChatTokenEvent {
  projectId?: string;
  peerId: string;
  peerName: string;
  conversationId: string;
  token: string;
  scope: string;
}

export interface P2PChatMessageEvent {
  projectId?: string;
  peerId: string;
  peerName: string;
  conversationId: string;
  message: Record<string, unknown>;
  scope: string;
}

export interface P2PStateChangeEvent {
  projectId?: string;
  peerId: string;
  peerName: string;
  category: string;
  id: string;
  data: Record<string, unknown>;
}

export interface P2PReconnectingEvent {
  projectId?: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
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
    getRemoteUrl: (repoPath: string) => Promise<string | null>;
    push: (payload: { repoPath: string; remote?: string; branch?: string }) => Promise<RepoInspection>;
    pull: (payload: { repoPath: string; remote?: string; branch?: string }) => Promise<RepoInspection>;
    syncSharedState: (payload: { repoPath: string; commitMessage?: string }) => Promise<RepoInspection>;
  };
  settings: {
    get: () => Promise<DesktopSettings>;
    update: (patch: DesktopSettingsPatch) => Promise<DesktopSettings>;
    isFirstRun: () => Promise<boolean>;
    completeOnboarding: () => Promise<DesktopSettings>;
    onChanged: (callback: (settings: DesktopSettings) => void) => () => void;
  };
  project: {
    list: () => Promise<DesktopProject[]>;
    create: (payload: ProjectCreatePayload) => Promise<DesktopProject>;
    delete: (payload: ProjectDeletePayload) => Promise<ProjectDeleteResult>;
    grantDeleteScope: () => Promise<{ granted: boolean }>;
    setActive: (projectId: string) => Promise<DesktopProject>;
    importSyncedPlan: (projectId: string) => Promise<{ imported: boolean; subprojects?: number; reason?: string }>;
    syncWorkspace: (projectId: string) => Promise<{ success: boolean; subprojects?: number; tasks?: number; log: string[] }>;
    savePlan: (payload: { projectId: string; plan: unknown; taskThreads?: unknown[]; skipGitPush?: boolean }) => Promise<{ saved: boolean; reason?: string }>;
    generatePlan: (payload: ProjectGeneratePlanPayload) => Promise<DesktopProject>;
    ensureGithubRepo: (projectId: string) => Promise<DesktopProject>;
    listCollaborators: (repoPath: string) => Promise<Array<{ login: string; role: string }>>;
    setRepoVisibility: (payload: { repoPath: string; visibility: "public" | "private" }) => Promise<{ success: boolean; visibility?: string; error?: string }>;
    sendTaskMessage: (payload: ProjectSendTaskMessagePayload) => Promise<ProjectSendTaskMessageResult>;
    generateTaskPrompt: (payload: ProjectGenerateTaskPromptPayload) => Promise<ProjectGenerateTaskPromptResult>;
    sendPMMessage: (payload: ProjectSendPMMessagePayload) => Promise<DesktopProject>;
    sendSoloMessage: (payload: SendSoloMessagePayload) => Promise<SendSoloMessageResult>;
    cancelActiveRequest: () => Promise<{ cancelled: boolean }>;
    forceResetAgent: (payload?: { repoPath?: string }) => Promise<{ success: boolean }>;
    getActiveRequest: () => Promise<{ active: boolean; projectId?: string; taskId?: string; taskName?: string; threadId?: string; scope?: string; requestId?: string; output?: string; promptText?: string; sessionId?: string; sessionTitle?: string } | null>;
    launchDevServer: (payload: { projectId: string; model?: string }) => Promise<{ output: string; launchCommand: string; expectedPort?: number; previewMode?: "web" | "terminal" }>;
    restoreCheckpoint: (payload: ProjectRestoreCheckpointPayload) => Promise<DesktopProject>;
    onAgentStarted: (callback: (event: ProjectAgentEvent) => void) => () => void;
    onAgentOutput: (callback: (event: ProjectAgentEvent) => void) => () => void;
    onAgentCompleted: (callback: (event: ProjectAgentEvent) => void) => () => void;
    onAgentError: (callback: (event: ProjectAgentEvent) => void) => () => void;
    onAgentCancelled: (callback: (event: ProjectAgentEvent) => void) => () => void;
  };
  tools: {
    listStatus: () => Promise<ToolStatus[]>;
    installCopilot: () => Promise<{ success: boolean; detail: string; log: string[] }>;
    installClaude: () => Promise<{ success: boolean; detail: string; log: string[] }>;
    installNode: () => Promise<{ success: boolean; detail: string; log: string[] }>;
    installGit: () => Promise<{ success: boolean; detail: string; log: string[] }>;
    installGh: () => Promise<{ success: boolean; detail: string; log: string[] }>;
    runCopilotPrompt: (payload: CopilotPromptPayload) => Promise<TerminalResult>;
    githubAuthStatus: () => Promise<{ authenticated: boolean; username: string | null; detail: string }>;
    githubAuthLogin: () => Promise<{ success: boolean; stdout?: string; stderr?: string; deviceCode?: string | null; verificationUrl?: string | null; timedOut?: boolean }>;
    githubAuthLogout: (username?: string) => Promise<{ success: boolean; detail: string }>;
    onGithubAuthProgress: (callback: (event: { output: string; deviceCode: string | null; verificationUrl: string | null }) => void) => () => void;
    githubListAccounts: () => Promise<Array<{ host: string; username: string; active?: boolean }>>;
    githubSwitchAccount: (username: string) => Promise<{ success: boolean; detail: string }>;
    claudeAuthStatus: () => Promise<{ authenticated: boolean; detail: string }>;
    claudeAuthLogin: () => Promise<{ success: boolean; stdout?: string; stderr?: string; timedOut?: boolean }>;
    onClaudeAuthProgress: (callback: (event: { output: string }) => void) => () => void;
  };
  sharedState: {
    init: (repoPath: string) => Promise<SharedStateInitResult>;
    isInitialized: (repoPath: string) => Promise<boolean>;
    readFile: (payload: SharedStateReadFilePayload) => Promise<SharedStateFileResult>;
    writeFile: (payload: SharedStateWriteFilePayload) => Promise<SharedStateWriteResult>;
    listDir: (payload: SharedStateListDirPayload) => Promise<SharedStateDirEntry[]>;
    saveConversation: (payload: SharedStateSaveConversationPayload) => Promise<SharedConversationData>;
    loadConversation: (payload: SharedStateLoadConversationPayload) => Promise<SharedConversationData | null>;
    listConversations: (repoPath: string) => Promise<SharedConversationSummary[]>;
    saveMember: (payload: SharedStateSaveMemberPayload) => Promise<SharedMemberProfile>;
    listMembers: (repoPath: string) => Promise<SharedMemberProfile[]>;
  };
  p2p: {
    join: (payload: P2PJoinPayload) => Promise<P2PJoinResult>;
    leave: (payload?: { projectId: string }) => Promise<{ left: boolean }>;
    status: (payload?: { projectId?: string }) => Promise<P2PStatus | Record<string, P2PStatus>>;
    peers: (payload?: { projectId?: string }) => Promise<P2PPeer[]>;
    joinedProjects: () => Promise<string[]>;
    broadcastChatToken: (payload: { projectId: string; conversationId: string; token: string; scope?: string }) => Promise<{ sent: boolean }>;
    broadcastChatMessage: (payload: { projectId: string; conversationId: string; message: Record<string, unknown>; scope?: string }) => Promise<{ sent: boolean }>;
    broadcastStateChange: (payload: { projectId: string; category: string; id: string; data: Record<string, unknown> }) => Promise<{ sent: boolean }>;
    getActivePeerStreams: (payload?: { projectId?: string }) => Promise<Record<string, { peerName: string; conversationId: string; scope: string; tokens: string; updatedAt: number; taskId?: string | null; taskName?: string | null; sessionId?: string | null; sessionTitle?: string | null }>>;
    generateInvite: (payload: { remoteUrl: string; projectName: string }) => Promise<{ code: string }>;
    decodeInvite: (payload: { code: string }) => Promise<{ remoteUrl: string; projectName: string }>;
    acceptInvite: (payload: { code: string; memberName?: string; targetDirectory?: string }) => Promise<{ project: DesktopProject; p2p: { projectId: string; topic: string; joined: boolean } }>;
    onJoined: (callback: (event: { projectId: string; topic: string; repoPath: string; remoteUrl: string }) => void) => () => void;
    onLeft: (callback: (event: { projectId: string; topic: string }) => void) => () => void;
    onPeerJoined: (callback: (event: P2PPeerEvent) => void) => () => void;
    onPeerLeft: (callback: (event: P2PPeerEvent) => void) => () => void;
    onPresence: (callback: (event: P2PPresenceEvent) => void) => () => void;
    onChatToken: (callback: (event: P2PChatTokenEvent) => void) => () => void;
    onChatMessage: (callback: (event: P2PChatMessageEvent) => void) => () => void;
    onStateChanged: (callback: (event: P2PStateChangeEvent) => void) => () => void;
    onReconnecting: (callback: (event: P2PReconnectingEvent) => void) => () => void;
  };
  activity: {
    list: () => Promise<DesktopActivityEvent[]>;
    onCreated: (callback: (event: DesktopActivityEvent) => void) => () => void;
  };
  fileWatcher: {
    start: (payload: { repoPath: string }) => Promise<{ watching: boolean; repoPath?: string; error?: string }>;
    stop: () => Promise<{ watching: boolean }>;
    status: () => Promise<{ watching: boolean; repoPath: string | null; paused: boolean; syncing: boolean }>;
    triggerSync: () => Promise<{ triggered?: boolean; error?: string }>;
    pushToMain: (payload: { repoPath: string }) => Promise<{ success: boolean; message: string }>;
    onChanged: (callback: (data: { eventType: string; filePath: string }) => void) => () => void;
    onStatus: (callback: (data: { watching: boolean; repoPath: string | null }) => void) => () => void;
    onSyncStart: (callback: (data: { repoPath: string }) => void) => () => void;
    onSyncComplete: (callback: (data: { repoPath: string; success: boolean; commitMessage?: string; error?: string }) => void) => () => void;
    onPullComplete: (callback: (data: { repoPath: string; success: boolean; error?: string }) => void) => () => void;
    onPeerSync: (callback: (data: { peerName: string; branch: string; pullResult: { success: boolean; message: string } }) => void) => () => void;
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

  // Electron <webview> tag support for JSX
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: string;
        preload?: string;
        partition?: string;
        nodeintegration?: string;
        disablewebsecurity?: string;
        useragent?: string;
        httpreferrer?: string;
      };
    }
  }
}
