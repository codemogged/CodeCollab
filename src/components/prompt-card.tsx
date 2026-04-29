"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/* ────────────────────────────────────────────────────────
   PromptCard — first-class prompt artifact component
   Used across Freestyle, IDE, and Chat views.
   ──────────────────────────────────────────────────────── */

export type ChatMode = "agent" | "ask" | "plan";

export interface ModelCatalogEntry {
  id: string;
  label: string;
  provider: string;
  contextWindow: string;
  maxTokens: number;
  usage: string;
  group: "featured" | "other";
  warning?: string;
}

export type ProviderKey = "claude" | "copilot" | "codex";

interface PromptCardProps {
  text: string;
  sender?: string;
  initials?: string;
  time?: string;
  badge?: string;
  attachments?: string[];
  onEdit?: (newText: string, opts?: { model?: string; mode?: ChatMode }) => void;
  /** @deprecated Use modelCatalog instead */
  models?: { value: string; label: string }[];
  /** Full model catalog entries, grouped by provider */
  modelCatalog?: Record<ProviderKey, ModelCatalogEntry[]>;
  /** Which providers are enabled */
  enabledProviders?: ProviderKey[];
  /** Current model value (pre-selected when entering edit mode) */
  currentModel?: string;
  /** Available modes to show in edit toolbar */
  modes?: ChatMode[];
  /** Current mode (pre-selected) */
  currentMode?: ChatMode;
  showEdit?: boolean;
  compact?: boolean;
  className?: string;
}

export default function PromptCard({
  text,
  sender,
  initials,
  time,
  badge,
  attachments,
  onEdit,
  models,
  modelCatalog,
  enabledProviders,
  currentModel,
  modes,
  currentMode,
  showEdit = true,
  compact = false,
  className = "",
}: PromptCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [editModel, setEditModel] = useState(currentModel ?? "");
  const [editMode, setEditMode] = useState<ChatMode>(currentMode ?? "agent");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [providerTab, setProviderTab] = useState<ProviderKey>("copilot");
  // Attachment image data URLs (avoids CSP file:// block)
  const [attachImgUrls, setAttachImgUrls] = useState<Map<string, string>>(new Map());
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!attachments || attachments.length === 0) return;
    const api = typeof window !== "undefined" ? (window as { electronAPI?: { system?: { readFileAsDataUrl?: (p: string) => Promise<string | null> } } }).electronAPI : null;
    if (!api?.system?.readFileAsDataUrl) return;
    let cancelled = false;
    const imgPaths = attachments.filter((f) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));
    if (imgPaths.length === 0) return;
    (async () => {
      for (const p of imgPaths) {
        if (cancelled) break;
        const url = await api.system!.readFileAsDataUrl!(p);
        if (url && !cancelled) setAttachImgUrls((prev) => { const m = new Map(prev); m.set(p, url); return m; });
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments?.join("|")]);
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Dark mode detection
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Determine if we have the rich catalog
  const hasRichCatalog = !!modelCatalog && !!enabledProviders && enabledProviders.length > 0;
  const hasMultipleProviders = (enabledProviders?.length ?? 0) > 1;

  // All models flattened for lookup
  const allModels = hasRichCatalog
    ? enabledProviders!.flatMap((p) => modelCatalog![p] ?? [])
    : [];
  const selectedModelMeta = allModels.find((m) => m.id === editModel) ?? allModels[0];

  // Filtered models for rich picker
  const filteredModels = hasRichCatalog ? (() => {
    let src: ModelCatalogEntry[];
    if (hasMultipleProviders) {
      src = modelCatalog![providerTab] ?? [];
    } else {
      src = allModels;
    }
    if (!modelSearch.trim()) return src;
    const q = modelSearch.toLowerCase();
    return src.filter((e) => e.label.toLowerCase().includes(q) || e.provider.toLowerCase().includes(q));
  })() : [];

  // Set initial provider tab based on current model
  useEffect(() => {
    if (!hasRichCatalog || !currentModel) return;
    for (const p of enabledProviders!) {
      if ((modelCatalog![p] ?? []).some((m) => m.id === currentModel)) {
        setProviderTab(p);
        break;
      }
    }
  }, [currentModel, hasRichCatalog]);

  // Click-outside for model menu
  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node) &&
          modelBtnRef.current && !modelBtnRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
        setModelSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelPicker]);

  // Sync draft when text prop changes externally
  useEffect(() => { setDraft(text); }, [text]);
  useEffect(() => { if (currentModel) setEditModel(currentModel); }, [currentModel]);
  useEffect(() => { if (currentMode) setEditMode(currentMode); }, [currentMode]);

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      el.selectionStart = el.value.length;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [editing]);

  const save = useCallback(() => {
    const t = draft.trim();
    if (t && t !== text) {
      onEdit?.(t, {
        model: editModel || undefined,
        mode: editMode,
      });
    }
    setEditing(false);
    setShowModelPicker(false);
  }, [draft, text, onEdit, editModel, editMode]);

  const cancel = useCallback(() => {
    setDraft(text);
    setEditing(false);
    setShowModelPicker(false);
  }, [text]);

  const begin = useCallback(() => {
    setDraft(text);
    if (currentModel) setEditModel(currentModel);
    if (currentMode) setEditMode(currentMode);
    setEditing(true);
  }, [text, currentModel, currentMode]);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); }
  }, [cancel, save]);

  const resize = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  }, []);

  const hasMeta = !!(sender || initials || time || badge);

  // ─── Long-text clamping ────
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current && !editing) {
      setNeedsClamp(bodyRef.current.scrollHeight > 180);
    }
  }, [text, editing]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <>
    <div
      className={[
        "group/prompt relative",
        className,
      ].join(" ")}
    >
      {/* ── Outer card: left accent + content ── */}
      <div className="flex overflow-hidden rounded-[0.85rem] bg-gradient-to-br from-black/[0.014] to-black/[0.028] dark:from-white/[0.018] dark:to-white/[0.032] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">

        {/* Left accent bar — the "briefing" visual signature */}
        <div className="w-[3px] shrink-0 bg-gradient-to-b from-black/[0.08] via-black/[0.04] to-transparent dark:from-white/[0.14] dark:via-white/[0.06] dark:to-transparent" />

        <div className="min-w-0 flex-1">
          {/* ── Header row ── */}
          {hasMeta && (
            <div className={compact ? "flex items-center gap-2 px-3 pt-2 pb-0" : "flex items-center gap-2.5 px-3.5 pt-2.5 pb-0"}>
              {/* Sender pill */}
              {sender && (
                <span className={`inline-flex items-center gap-1.5 ${compact ? "text-[9px]" : "text-[9.5px]"}`}>
                  <span className="h-[5px] w-[5px] rounded-full bg-black/[0.12] dark:bg-white/[0.16]" />
                  <span className="font-semibold uppercase tracking-[0.06em] text-black/30 dark:text-white/30">
                    {sender}
                  </span>
                </span>
              )}
              {time && (
                <span className={`text-black/18 dark:text-white/18 font-medium ${compact ? "text-[8.5px]" : "text-[9px]"}`}>{time}</span>
              )}
              <div className="flex-1" />
              {/* Hover actions — copy & edit */}
              {!editing && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover/prompt:opacity-100 transition-opacity duration-200">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1 rounded-md text-black/15 hover:text-black/40 hover:bg-black/[0.03] dark:text-white/15 dark:hover:text-white/40 dark:hover:bg-white/[0.04] transition-all"
                    title={copied ? "Copied" : "Copy prompt"}
                  >
                    {copied ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 text-emerald-500">
                        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                        <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h5.5A1.5 1.5 0 0 1 14 3.5v7a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 10.5v-7Z" />
                        <path d="M3 5a1 1 0 0 0-1 1v7.5A1.5 1.5 0 0 0 3.5 15H11a1 1 0 0 0 1-1H3.5a.5.5 0 0 1-.5-.5V5Z" />
                      </svg>
                    )}
                  </button>
                  {showEdit && (
                    <button
                      type="button"
                      onClick={begin}
                      className="p-1 rounded-md text-black/15 hover:text-black/40 hover:bg-black/[0.03] dark:text-white/15 dark:hover:text-white/40 dark:hover:bg-white/[0.04] transition-all"
                      title="Edit prompt"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                        <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.098a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.354L12.427 2.488z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Floating hover actions for header-less cards */}
          {!hasMeta && !editing && (
            <div className="absolute top-2 right-2.5 flex items-center gap-0.5 opacity-0 group-hover/prompt:opacity-100 transition-opacity duration-200 z-10">
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded-md text-black/15 hover:text-black/40 hover:bg-black/[0.03] dark:text-white/15 dark:hover:text-white/40 dark:hover:bg-white/[0.04] transition-all"
                title={copied ? "Copied" : "Copy prompt"}
              >
                {copied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 text-emerald-500">
                    <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                    <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h5.5A1.5 1.5 0 0 1 14 3.5v7a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 10.5v-7Z" />
                    <path d="M3 5a1 1 0 0 0-1 1v7.5A1.5 1.5 0 0 0 3.5 15H11a1 1 0 0 0 1-1H3.5a.5.5 0 0 1-.5-.5V5Z" />
                  </svg>
                )}
              </button>
              {showEdit && (
                <button
                  type="button"
                  onClick={begin}
                  className="p-1 rounded-md text-black/15 hover:text-black/40 hover:bg-black/[0.03] dark:text-white/15 dark:hover:text-white/40 dark:hover:bg-white/[0.04] transition-all"
                  title="Edit prompt"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                    <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.463 11.098a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.354L12.427 2.488z" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* ── Body ── */}
          <div className={hasMeta
            ? (compact ? "px-3 pt-1.5 pb-2.5" : "px-3.5 pt-2 pb-3")
            : (compact ? "px-3 py-2.5" : "px-3.5 py-3")}
          >
        {editing ? (
          <div>
            <textarea
              ref={taRef}
              value={draft}
              onChange={resize}
              onKeyDown={onKey}
              rows={2}
              className={[
                "w-full resize-none rounded-lg",
                "border border-black/[0.08] dark:border-white/[0.1]",
                "bg-black/[0.03] dark:bg-white/[0.04]",
                "outline-none transition-colors",
                "focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20",
                "theme-fg",
                compact
                  ? "px-2.5 py-2 text-[12.5px] leading-[1.65] tracking-[-0.003em]"
                  : "px-3.5 py-2.5 text-[13.5px] leading-[1.7] tracking-[-0.006em]",
              ].join(" ")}
            />
            <div className={`flex items-center gap-2 ${compact ? "mt-1.5" : "mt-2.5"}`}>
              <button
                type="button"
                onClick={save}
                className="rounded-lg bg-[#111214] px-3 py-1.5 text-[10.5px] font-semibold tracking-[0.01em] text-[#f4efe6] transition-colors hover:bg-[#0b1220] dark:bg-white/90 dark:text-[#111214] dark:hover:bg-white"
              >
                Send
              </button>
              <button
                type="button"
                onClick={cancel}
                className="rounded-lg px-3 py-1.5 text-[10.5px] font-medium text-black/40 dark:text-white/40 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                Cancel
              </button>

              {/* Mode toggle */}
              {modes && modes.length > 1 && (
                <div className="inline-flex items-center rounded-full bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                  {modes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEditMode(m)}
                      className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.01em] capitalize transition ${editMode === m ? "bg-white text-ink shadow-sm dark:bg-[#2a2a2a] dark:text-[var(--fg)]" : "text-ink-muted/60 hover:text-ink dark:text-[var(--muted)] dark:hover:text-[var(--fg)]"}`}
                    >
                      {m === "agent" ? "Agent" : m === "ask" ? "Ask" : "Plan"}
                    </button>
                  ))}
                </div>
              )}

              {/* Model picker — matches the main Freestyle/IDE/Chat picker design */}
              {(hasRichCatalog || (models && models.length > 0)) && (
                <div className="relative ml-auto">
                  <button
                    ref={modelBtnRef}
                    type="button"
                    onClick={() => {
                      if (!showModelPicker && modelBtnRef.current) {
                        const rect = modelBtnRef.current.getBoundingClientRect();
                        const menuH = Math.min(420, window.innerHeight * 0.7);
                        const spaceAbove = rect.top;
                        const spaceBelow = window.innerHeight - rect.bottom;
                        if (spaceAbove >= menuH || spaceAbove > spaceBelow) {
                          // Open upward
                          setModelMenuPos({ left: Math.max(8, rect.left), bottom: window.innerHeight - rect.top + 6 });
                        } else {
                          // Open downward
                          setModelMenuPos({ left: Math.max(8, rect.left), top: rect.bottom + 6 });
                        }
                      }
                      setShowModelPicker(!showModelPicker);
                      setModelSearch("");
                    }}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition text-[10px] text-black/50 dark:text-white/50"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500/40" />
                    {hasRichCatalog
                      ? (selectedModelMeta?.label ?? "Auto")
                      : (models?.find((m) => m.value === editModel)?.label || "Model")}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-2.5 w-2.5 transition ${showModelPicker ? "rotate-180" : ""}`}>
                      <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}

              {!compact && !hasRichCatalog && !models?.length && (
                <span className="ml-auto text-[9px] text-black/25 dark:text-white/25 select-none">
                  Ctrl+Enter send · Esc cancel
                </span>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* Inner content panel — the "briefing body" */}
            <div className="rounded-[0.55rem] bg-white/60 dark:bg-white/[0.025] ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
              <div
                ref={bodyRef}
                className={[
                  "whitespace-pre-wrap break-words text-black/72 dark:text-white/78",
                  compact ? "px-2.5 py-2 text-[12.5px] leading-[1.7] tracking-[-0.003em]" : "px-3 py-2.5 text-[13px] leading-[1.75] tracking-[-0.006em]",
                  !expanded && needsClamp ? "overflow-hidden" : "",
                ].join(" ")}
                style={!expanded && needsClamp ? { maxHeight: 160, WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 2rem), transparent)", maskImage: "linear-gradient(to bottom, black calc(100% - 2rem), transparent)" } : undefined}
              >
                {text}
              </div>
            </div>
            {needsClamp && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-black/20 hover:text-black/40 dark:text-white/20 dark:hover:text-white/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-2.5 w-2.5 transition-transform ${expanded ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Rich model picker portal (same design as Freestyle/IDE) ── */}
      {showModelPicker && modelMenuPos && hasRichCatalog ? createPortal(
        <div
          ref={modelMenuRef}
          className="fixed z-[9999] max-h-[min(420px,70vh)] w-[300px] overflow-hidden rounded-[1.2rem] backdrop-blur-xl"
          style={{ left: modelMenuPos.left, ...(modelMenuPos.top != null ? { top: modelMenuPos.top } : { bottom: modelMenuPos.bottom }), background: isDark ? '#1e1f25' : 'rgba(255,255,255,0.98)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`, boxShadow: isDark ? '0 20px 44px rgba(0,0,0,0.4)' : '0 20px 44px rgba(0,0,0,0.14)', color: isDark ? '#f0ece4' : '#020202' }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-2.5 py-2" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" style={{ color: isDark ? 'rgba(240,236,228,0.28)' : 'rgba(2,2,2,0.28)' }}>
              <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
            </svg>
            <input
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder="Search models"
              autoFocus
              className="w-full bg-transparent text-[12.5px] tracking-[-0.003em] outline-none"
              style={{ color: isDark ? '#f0ece4' : '#020202' }}
            />
          </div>
          {/* Provider tabs */}
          {hasMultipleProviders ? (
            <div className="flex gap-1 px-2.5 py-1.5" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
              {enabledProviders!.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setProviderTab(tab)}
                  className="rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.01em] transition"
                  style={providerTab === tab ? { background: '#0078d4', color: 'white' } : { color: isDark ? 'rgba(240,236,228,0.52)' : 'rgba(2,2,2,0.52)' }}
                >
                  {tab === "claude" ? "Claude Code" : tab === "codex" ? "Codex CLI" : "GitHub Copilot"}
                </button>
              ))}
            </div>
          ) : null}
          {/* Grouped model list */}
          <div className={`overflow-y-auto pb-3 pt-1 ${hasMultipleProviders ? "max-h-[min(330px,calc(70vh-90px))]" : "max-h-[min(370px,calc(70vh-50px))]"}`}>
            {(["featured", "other"] as const).map((group) => {
              const groupModels = filteredModels.filter((entry) => entry.group === group);
              if (groupModels.length === 0) return null;
              return (
                <div key={group} className="mb-0.5 last:mb-0">
                  <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: isDark ? 'rgba(240,236,228,0.28)' : 'rgba(2,2,2,0.28)' }}>
                    {group === "featured" ? "Recommended" : "Other models"}
                  </p>
                  {groupModels.map((entry) => {
                    const isSelected = entry.id === editModel;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => { setEditModel(entry.id); setShowModelPicker(false); setModelSearch(""); }}
                        className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition"
                        style={isSelected ? { background: '#0078d4', color: 'white' } : { color: isDark ? '#f0ece4' : '#020202' }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11.5px] font-medium tracking-[-0.006em]">{entry.label}</span>
                            {entry.warning ? <span className="text-[10px]" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : isDark ? 'rgba(240,236,228,0.4)' : 'rgba(2,2,2,0.4)' }}>{entry.warning}</span> : null}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px]" style={{ color: isSelected ? 'rgba(255,255,255,0.72)' : isDark ? 'rgba(240,236,228,0.52)' : 'rgba(2,2,2,0.52)' }}>
                            <span>{entry.provider}</span>
                            <span>{entry.contextWindow}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {entry.usage ? <span className="text-[10px] font-medium" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : isDark ? 'rgba(240,236,228,0.4)' : 'rgba(2,2,2,0.4)' }}>{entry.usage}</span> : null}
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

      {/* Legacy simple model picker fallback (non-portal, for old callers) */}
      {showModelPicker && !hasRichCatalog && models && models.length > 0 && (
        <div className="absolute bottom-full right-0 z-50 mb-1 min-w-[160px] rounded-lg border border-black/[0.08] bg-white p-1 shadow-lg dark:border-white/[0.1] dark:bg-[#1c1c1c]">
          {models.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => { setEditModel(m.value); setShowModelPicker(false); }}
              className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[10.5px] transition ${editModel === m.value ? "bg-violet-500/10 font-semibold text-violet-600 dark:text-violet-400" : "font-medium theme-soft hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Attachments footer ── */}
      {attachments && attachments.length > 0 && !editing && (
        <div
          className={[
            "flex flex-wrap gap-1.5",
            compact ? "px-3 pb-2" : "px-3.5 pb-2.5",
          ].join(" ")}
        >
          {attachments.map((file, i) => {
            const name = file.split(/[/\\]/).pop() ?? file;
            const isImg = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name);
            const imgSrc = isImg ? (attachImgUrls.get(file) ?? null) : null;
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] px-2 py-0.5 text-[9.5px] font-medium text-black/30 dark:text-white/30 cursor-pointer hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition"
                onClick={() => { if (isImg && imgSrc) setLightboxSrc(imgSrc); }}
              >
                {imgSrc ? (
                  <img src={imgSrc} alt="" className="h-4 w-4 rounded object-cover" />
                ) : null}
                {name}
              </span>
            );
          })}
        </div>
      )}
        </div>{/* end flex child */}
      </div>{/* end flex container */}
    </div>

    {/* Image lightbox */}
    {lightboxSrc && typeof document !== "undefined" ? createPortal(
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setLightboxSrc(null)}
      >
        <img
          src={lightboxSrc}
          alt="Preview"
          className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl ring-1 ring-white/10"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={() => setLightboxSrc(null)}
          className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>,
      document.body
    ) : null}
    </>
  );
}
