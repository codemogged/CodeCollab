"use client";

import React, { useState } from "react";
import { RunInTerminalButton } from "./run-in-terminal-button";

/* ────────────────────────────────────────────────────────────
   FormattedLiveOutput
   Renders raw agent text as structured, Copilot-style blocks.
   ──────────────────────────────────────────────────────────── */

type Block =
  | { type: "code"; lang: string; code: string }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; text: string };

/* ── Parse raw text into blocks ── */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Table (| header | header |)
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r.split("|").slice(1, -1).map((c) => c.trim());
        const headers = parseRow(tableLines[0]);
        // Skip separator row (|---|---|)
        const startRow = tableLines[1].includes("---") ? 2 : 1;
        const rows = tableLines.slice(startRow).map(parseRow);
        blocks.push({ type: "table", headers, rows });
        continue;
      }
    }

    // Bullet list (-, *, or numbered)
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !lines[i].match(/^#{1,4}\s+/) &&
      !(lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

/* ── Render inline markdown: bold, inline code, italic ── */
function renderInline(text: string): React.ReactNode[] {
  // Split by inline code first, then handle bold/italic in non-code parts
  const parts = text.split(/(`[^`]+`)/g);
  const nodes: React.ReactNode[] = [];

  parts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <code key={i} className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[0.88em] dark:bg-white/[0.1] text-violet-600 dark:text-violet-400">
          {part.slice(1, -1)}
        </code>
      );
    } else {
      // Handle **bold** and *italic*
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      boldParts.forEach((bp, j) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          nodes.push(<strong key={`${i}-${j}`} className="font-semibold">{bp.slice(2, -2)}</strong>);
        } else {
          nodes.push(<span key={`${i}-${j}`}>{bp}</span>);
        }
      });
    }
  });

  return nodes;
}

/* ── Collapsible code block ── */
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const lineCount = code.split("\n").length;
  const displayLang = lang || "text";

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-black/[0.06] dark:border-white/[0.08]">
      <div
        className="flex cursor-pointer items-center justify-between bg-[#0d1117] px-3 py-1.5 border-b border-white/[0.08]"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-white/70">
            <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v5.5A2.25 2.25 0 0 1 11.75 12h-1.312c.1.128.21.248.328.36a.75.75 0 0 1 .302.635 7.01 7.01 0 0 1-3.044.74h-.048a7.01 7.01 0 0 1-3.044-.74.75.75 0 0 1 .302-.635c.118-.112.228-.232.328-.36H4.25A2.25 2.25 0 0 1 2 9.75v-5.5Zm2.25-.75a.75.75 0 0 0-.75.75v5.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-5.5a.75.75 0 0 0-.75-.75h-7.5Z" clipRule="evenodd" />
          </svg>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/85">{displayLang}</span>
          <span className="text-[10px] font-medium text-white/55">{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <RunInTerminalButton code={code} lang={lang} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              try { navigator.clipboard.writeText(code); } catch { /* */ }
            }}
            className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-white/85 hover:text-white transition"
          >
            Copy
          </button>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`h-3 w-3 theme-muted transition ${collapsed ? "" : "rotate-180"}`}
          >
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      {!collapsed && (
        <pre className="overflow-x-auto bg-[#0d1117] px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-green-300/90 selection:bg-green-600/30 dark:bg-[#0a0e14]">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

/* ── Main component ── */
export default function FormattedLiveOutput({
  text,
  isStreaming = false,
  className = "",
  scrollRef,
}: {
  text: string;
  isStreaming?: boolean;
  className?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  if (!text) {
    return (
      <div className={`flex items-center gap-2 px-4 py-6 ${className}`}>
        <span className="theme-muted italic text-[12px]">Waiting for model response...</span>
      </div>
    );
  }

  const blocks = parseBlocks(text);

  return (
    <div ref={scrollRef} className={`custom-scroll overflow-y-auto px-4 py-3 text-[13px] leading-[1.75] ${className}`}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return (
              <div key={i} className="mt-3 mb-1.5 first:mt-0">
                {block.level === 1 ? (
                  <h3 className="text-[15px] font-bold theme-fg">{renderInline(block.text)}</h3>
                ) : block.level === 2 ? (
                  <h4 className="text-[14px] font-semibold theme-fg">{renderInline(block.text)}</h4>
                ) : (
                  <h5 className="text-[13px] font-semibold theme-fg">{renderInline(block.text)}</h5>
                )}
              </div>
            );

          case "code":
            return <CodeBlock key={i} lang={block.lang} code={block.code} />;

          case "list":
            return (
              <ul key={i} className="my-1.5 space-y-1 pl-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-[13px] theme-soft">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500/50" />
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );

          case "table":
            return (
              <div key={i} className="my-2 overflow-x-auto rounded-lg border border-black/[0.06] dark:border-white/[0.08]">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.03]">
                      {block.headers.map((h, j) => (
                        <th key={j} className="px-3 py-1.5 text-left font-semibold theme-fg">{renderInline(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j} className="border-b border-black/[0.04] last:border-0 dark:border-white/[0.04]">
                        {row.map((cell, k) => (
                          <td key={k} className="px-3 py-1.5 theme-soft">{renderInline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "paragraph":
            return (
              <p key={i} className="my-1.5 theme-soft first:mt-0">
                {renderInline(block.text)}
              </p>
            );

          default:
            return null;
        }
      })}

      {/* Streaming cursor */}
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-violet-500/60 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
      )}
    </div>
  );
}
