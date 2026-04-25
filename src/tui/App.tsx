/**
 * App — root Ink component for the log analyzer TUI.
 * Composes all panels into a full-terminal dashboard with keyboard navigation.
 * @module tui/App
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { RunSelector } from './components/RunSelector.js';
import { IssuesPanel } from './components/IssuesPanel.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { DetailOverlay } from './components/DetailOverlay.js';
import { LLMStreamPanel } from './components/LLMStreamPanel.js';
import { FileTree } from './components/FileTree.js';
import { FileViewer } from './components/FileViewer.js';
import {
  PromptSplitViewer,
  isPromptFile,
  isAnalysisFile,
  isWorkflowLogFile,
} from './components/PromptSplitViewer.js';
import { PromptPartsViewer } from './components/PromptPartsViewer.js';
import { PartAnalysisOverlay, type PartAnalysisKind } from './components/PartAnalysisOverlay.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { buildPromptFolderAnalysisPrompt } from './prompt_folder_analysis.js';
import { buildPromptLogConsolidationPrompt } from './prompt_log_consolidation.js';
import { buildPromptLogValidationPrompt } from './prompt_log_validation.js';
import { buildWorkflowLogExecutionAnalysisPrompt } from './workflow_log_execution_analysis.js';
import {
  buildPromptResponseFixPrompt,
  hasPromptResponseIssueCandidates,
  NO_ACTIONABLE_PROMPT_RESPONSE_ISSUES_MESSAGE,
} from './prompt_response_fix.js';
import { useRunSelector } from './hooks/useRunSelector.js';
import { useAnalysis } from './hooks/useAnalysis.js';
import { useFileTree } from './hooks/useFileTree.js';
import type { PanelId, Issue, ThresholdConfig } from '../types/index.js';
import { parsePromptFileContent } from '../parsers/prompt_parser.js';

export interface AppProps {
  projectRoot: string;
  thresholds?: ThresholdConfig;
  skipPromptQuality?: boolean;
  provider?: import('../lib/ai_client.js').AIProvider;
}

type AppMode = 'analysis' | 'files';
type PromptAnalysisTarget = {
  label: string;
  lines: string[];
};

type PartAnalysisRequest = {
  kind: PartAnalysisKind;
  target: PromptAnalysisTarget;
};

const ANALYSIS_PANELS: PanelId[] = ['runs', 'issues', 'metrics', 'detail'];
const FILES_PANELS: PanelId[] = ['runs', 'filetree', 'fileviewer'];

export function App({ projectRoot, thresholds, skipPromptQuality = false, provider = 'copilot' }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { setRawMode } = useStdin();
  const cols = stdout?.columns ?? 120;
  const rows = stdout?.rows ?? 40;
  // Header (3) + StatusBar (3) = 6 rows of fixed chrome; the rest is the content area.
  const contentRows = Math.max(10, rows - 6);

  const aiWorkflowDir = `${projectRoot}/.ai_workflow`;

  const { runs, selectedIndex: runIndex, selectedRun, loading: runsLoading, select: selectRun } =
    useRunSelector(aiWorkflowDir);

  const { state, report, error, progress, filter, filteredIssues, run, cycleFilter } =
    useAnalysis(thresholds);

  const analysisDir = selectedRun ? `${aiWorkflowDir}/analysis/${selectedRun.runId}` : null;
  const fileTree = useFileTree(selectedRun?.path ?? null, analysisDir);

  const [mode, setMode] = useState<AppMode>('analysis');
  const [focusedPanel, setFocusedPanel] = useState<PanelId>('runs');
  const [issueIndex, setIssueIndex] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [showStream, setShowStream] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [openedFilePath, setOpenedFilePath] = useState<string | null>(null);
  const [promptSplitMode, setPromptSplitMode] = useState(false);
  const [promptPartsMode, setPromptPartsMode] = useState(false);
  const [promptFocusedPane, setPromptFocusedPane] = useState<'prompt' | 'response'>('prompt');
  const [promptZoomedPane, setPromptZoomedPane] = useState<'prompt' | 'response' | null>(null);
  const [partAnalysisRequest, setPartAnalysisRequest] = useState<PartAnalysisRequest | null>(null);
  const [planCliPending, setPlanCliPending] = useState<string | null>(null);
  const [consolidateLogsCliPending, setConsolidateLogsCliPending] = useState<string | null>(null);
  const [analyzeFolderCliPending, setAnalyzeFolderCliPending] = useState<string | null>(null);
  const [validatePromptCliPending, setValidatePromptCliPending] = useState<string | null>(null);
  const [fixPromptResponseCliPending, setFixPromptResponseCliPending] = useState<string | null>(null);
  const [workflowLogCliPending, setWorkflowLogCliPending] = useState<string | null>(null);
  const [auditSkillPending, setAuditSkillPending] = useState(false);
  const [viewerNotice, setViewerNotice] = useState<string | null>(null);

  const selectedIssue: Issue | null = filteredIssues[issueIndex] ?? null;

  const cycleFocus = useCallback((forward: boolean) => {
    setFocusedPanel((prev) => {
      const panels = mode === 'files'
        ? (openedFilePath ? FILES_PANELS : ['runs', 'filetree'] as PanelId[])
        : ANALYSIS_PANELS;
      const idx = panels.indexOf(prev as PanelId);
      const base = idx === -1 ? 0 : idx;
      const next = forward ? (base + 1) % panels.length : (base - 1 + panels.length) % panels.length;
      return panels[next];
    });
  }, [mode, openedFilePath]);

  const runInteractiveCopilot = useCallback((prompt: string, cwd = projectRoot) => {
    setRawMode(false);
    process.stdout.write('\x1b[?1049l');

    try {
      spawnSync('copilot', ['--allow-all', '-i', prompt], {
        stdio: 'inherit',
        cwd,
        env: { ...process.env },
      });
    } finally {
      process.stdout.write('\x1b[?1049h');
      setRawMode(true);
    }
  }, [projectRoot, setRawMode]);

  // Spawn an interactive copilot plan session from an analysis file.
  useEffect(() => {
    if (!planCliPending) return;
    const filePath = planCliPending;
    let cancelled = false;

    (async () => {
      const content = await readFile(filePath, 'utf8').catch(() => '');
      if (cancelled) return;

      const aiWorkflowRoot = join(dirname(projectRoot), 'ai_workflow.js');
      const runId = basename(dirname(filePath)); // e.g. workflow_20260408_201258
      const promptsDir = `${projectRoot}/.ai_workflow/logs/${runId}/prompts/`;
      const templateDir = `${aiWorkflowRoot}/.workflow_core/config/ai_helpers`;
      const indexFile = `${templateDir}/index.yaml`;
      const generatedFile = `${aiWorkflowRoot}/.workflow_core/config/ai_helpers.yaml`;
      const buildScript = `${aiWorkflowRoot}/.workflow_core/scripts/build_ai_helpers.py`;
      const versionSource = buildScript;

      const prompt =
        `[[PLAN]] Fix the issues reported in this analysis by updating the prompt ` +
        `template in the ${aiWorkflowRoot} project.\n\n` +
        `Analysis file: ${filePath}\n` +
        `Rendered prompts for this run: ${promptsDir}\n\n` +
        `**How to find and fix the template:**\n` +
        `1. Prompt templates live in partitioned sub-files under \`${templateDir}/\`.\n` +
        `   \`${generatedFile}\` is auto-generated — do NOT edit it directly.\n` +
        `2. Use \`${indexFile}\` to find which sub-file contains the step key ` +
        `(format: \`step_key: sub-file.yaml\`).\n` +
        `3. The rendered prompt files in \`${promptsDir}\` show which step key was used — ` +
        `open the relevant step subdirectory to confirm the key name.\n` +
        `4. Edit the \`task_template:\` block inside the matching step key in the sub-file.\n` +
        `5. Bump the \`# Version: X.Y.Z\` line in \`${versionSource}\` (the HEADER constant).\n` +
        `6. Rebuild: \`python3 ${buildScript}\`\n` +
        `7. Validate the generated YAML: \`python3 -c "import yaml; yaml.safe_load(open('${generatedFile}'))"\` and commit.\n\n` +
        `${content}`;
      runInteractiveCopilot(prompt);
      setPlanCliPending(null);
    })();

    return () => { cancelled = true; };
  }, [planCliPending, projectRoot, runInteractiveCopilot]);

  // Spawn an interactive copilot consolidation session from a run's prompt-log folder.
  useEffect(() => {
    if (!consolidateLogsCliPending) return;
    runInteractiveCopilot(buildPromptLogConsolidationPrompt(consolidateLogsCliPending));
    setConsolidateLogsCliPending(null);
  }, [consolidateLogsCliPending, runInteractiveCopilot]);

  // Spawn an interactive copilot analysis session for the open prompt file's parent folder.
  useEffect(() => {
    if (!analyzeFolderCliPending) return;

    runInteractiveCopilot(
      buildPromptFolderAnalysisPrompt(dirname(analyzeFolderCliPending), analyzeFolderCliPending),
    );
    setAnalyzeFolderCliPending(null);
  }, [analyzeFolderCliPending, runInteractiveCopilot]);

  // Spawn an interactive copilot validation session from a prompt log file.
  useEffect(() => {
    if (!validatePromptCliPending) return;

    const prompt = buildPromptLogValidationPrompt(validatePromptCliPending);

    runInteractiveCopilot(prompt);
    setValidatePromptCliPending(null);
  }, [runInteractiveCopilot, validatePromptCliPending]);

  // Spawn an interactive copilot execution-analysis session from workflow.log.
  useEffect(() => {
    if (!workflowLogCliPending) return;
    const filePath = workflowLogCliPending;
    let cancelled = false;

    (async () => {
      const aiWorkflowRoot = join(dirname(projectRoot), 'ai_workflow.js');

      try {
        await access(aiWorkflowRoot);
      } catch (error) {
        if (!cancelled) {
          const detail = error instanceof Error ? error.message : String(error);
          setViewerNotice(`Could not access sibling ai_workflow.js repository: ${aiWorkflowRoot} (${detail})`);
          setWorkflowLogCliPending(null);
        }
        return;
      }

      if (cancelled) return;

      setViewerNotice(null);
      runInteractiveCopilot(buildWorkflowLogExecutionAnalysisPrompt(filePath), aiWorkflowRoot);
      setWorkflowLogCliPending(null);
    })();

    return () => { cancelled = true; };
  }, [projectRoot, runInteractiveCopilot, workflowLogCliPending]);

  // Spawn an interactive copilot fix session from a prompt log response.
  useEffect(() => {
    if (!fixPromptResponseCliPending) return;
    const filePath = fixPromptResponseCliPending;
    let cancelled = false;

    (async () => {
      const content = await readFile(filePath, 'utf8').catch(() => '');
      if (cancelled) return;

      const parsed = parsePromptFileContent(content);
      if (!parsed) {
        setViewerNotice('Could not parse prompt log response.');
        setFixPromptResponseCliPending(null);
        return;
      }

      if (!hasPromptResponseIssueCandidates(parsed.response)) {
        setViewerNotice(NO_ACTIONABLE_PROMPT_RESPONSE_ISSUES_MESSAGE);
        setFixPromptResponseCliPending(null);
        return;
      }

      setViewerNotice(null);
      runInteractiveCopilot(buildPromptResponseFixPrompt(filePath, parsed.response));
      setFixPromptResponseCliPending(null);
    })();

    return () => { cancelled = true; };
  }, [fixPromptResponseCliPending, runInteractiveCopilot]);

  // Spawn the audit-and-fix skill in an interactive copilot session.
  useEffect(() => {
    if (!auditSkillPending) return;

    runInteractiveCopilot('Run the audit-and-fix skill');
    setAuditSkillPending(false);
  }, [auditSkillPending, runInteractiveCopilot]);

  useEffect(() => {
    setViewerNotice(null);
  }, [openedFilePath]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) { exit(); return; }

    // h: toggle help
    if (input === 'h') { setShowHelp((s) => !s); return; }

    // v: toggle files / analysis mode
    if (input === 'v') {
      setMode((m) => {
        const next = m === 'files' ? 'analysis' : 'files';
        setFocusedPanel(next === 'files' ? 'filetree' : 'issues');
        return next;
      });
      return;
    }

    if (key.tab) { cycleFocus(!key.shift); return; }
    if (key.escape) {
      if (showHelp) { setShowHelp(false); return; }
      // Close part analysis overlay first
      if (partAnalysisRequest) {
        const ctrl = (globalThis as Record<string, unknown>).__partAnalysisScroll as Record<string, () => void> | undefined;
        ctrl?.cancel?.();
        setPartAnalysisRequest(null);
        return;
      }
      if (mode === 'files' && openedFilePath) {
        // Close viewer, return focus to tree
        setOpenedFilePath(null);
        setPromptSplitMode(false);
        setPromptPartsMode(false);
        setPromptZoomedPane(null);
        setFocusedPanel('filetree');
        return;
      }
      setShowDetail(false);
      setShowStream(false);
      return;
    }

    // ── FILES MODE ────────────────────────────────────────────────────────────
    if (mode === 'files') {
      if (focusedPanel === 'runs') {
        if (key.upArrow) selectRun(runIndex - 1);
        if (key.downArrow) selectRun(runIndex + 1);
        if (key.return && selectedRun) {
          setFocusedPanel('filetree');
        }
        return;
      }

      if (focusedPanel === 'filetree') {
        if (key.upArrow) fileTree.moveUp();
        if (key.downArrow) fileTree.moveDown();
        if (input === 'w' && fileTree.selectedEntry?.filePath && isWorkflowLogFile(fileTree.selectedEntry.filePath)) {
          setViewerNotice(null);
          setWorkflowLogCliPending(fileTree.selectedEntry.filePath);
          return;
        }
        if (key.return) {
          const entry = fileTree.selectedEntry;
          if (entry?.isDir) {
            fileTree.toggleExpand();
          } else if (entry?.filePath) {
                setOpenedFilePath(entry.filePath);
                setFocusedPanel('fileviewer');
              }
        }
        return;
      }

      if (focusedPanel === 'fileviewer') {
        if (input === 'w' && openedFilePath && isWorkflowLogFile(openedFilePath) && !partAnalysisRequest) {
          setViewerNotice(null);
          setWorkflowLogCliPending(openedFilePath);
          return;
        }
        // a: analyze selected prompt part vs codebase (parts mode only)
        if (input === 'a' && promptPartsMode && !partAnalysisRequest) {
          const partsCtrl = (globalThis as Record<string, unknown>).__promptPartsScroll as Record<string, () => unknown> | undefined;
          const part = partsCtrl?.getSelectedPart?.() as PromptAnalysisTarget | null;
          if (part) setPartAnalysisRequest({ kind: 'codebase', target: part });
          return;
        }
        // b: reverse-prompt the selected prompt part (parts mode only)
        if (input === 'b' && promptPartsMode && !partAnalysisRequest) {
          const partsCtrl = (globalThis as Record<string, unknown>).__promptPartsScroll as Record<string, () => unknown> | undefined;
          const part = partsCtrl?.getSelectedPart?.() as PromptAnalysisTarget | null;
          if (part) setPartAnalysisRequest({ kind: 'reverse_prompt', target: part });
          return;
        }
        // e: reverse-prompt the whole prompt (prompt-log files in parts mode only)
        if (input === 'e' && promptPartsMode && openedFilePath && isPromptFile(openedFilePath) && !partAnalysisRequest) {
          const partsCtrl = (globalThis as Record<string, unknown>).__promptPartsScroll as Record<string, () => unknown> | undefined;
          const wholePrompt = partsCtrl?.getWholePrompt?.() as PromptAnalysisTarget | null;
          if (wholePrompt) {
            setViewerNotice(null);
            setPartAnalysisRequest({ kind: 'reverse_prompt_full', target: wholePrompt });
          } else {
            setViewerNotice('Could not load the full prompt text for analysis.');
          }
          return;
        }
        // c: consolidate the selected run's prompts folder in an interactive Copilot session
        if (input === 'c' && openedFilePath && selectedRun && !partAnalysisRequest) {
          setViewerNotice(null);
          setConsolidateLogsCliPending(join(selectedRun.path, 'prompts'));
          return;
        }
        // d: analyze the open prompt file's parent folder in an interactive Copilot session
        if (input === 'd' && openedFilePath && isPromptFile(openedFilePath) && !partAnalysisRequest) {
          setViewerNotice(null);
          setAnalyzeFolderCliPending(openedFilePath);
          return;
        }
        // x: send analysis file to copilot CLI with [[PLAN]] prompt (parts mode + analysis file only)
        if (input === 'x' && promptPartsMode && openedFilePath && isAnalysisFile(openedFilePath) && !partAnalysisRequest) {
          setPlanCliPending(openedFilePath);
          return;
        }
        // g: validate the current prompt log file in an interactive Copilot session (parts mode only)
        if (input === 'g' && promptPartsMode && openedFilePath && isPromptFile(openedFilePath) && !partAnalysisRequest) {
          setValidatePromptCliPending(openedFilePath);
          return;
        }
        // f: extract actionable issues from the prompt response and fix them
        if (input === 'f' && openedFilePath && isPromptFile(openedFilePath) && !partAnalysisRequest) {
          setViewerNotice(null);
          setFixPromptResponseCliPending(openedFilePath);
          return;
        }
        // p: toggle prompt split view (only for prompt .md files)
        if (input === 'p' && openedFilePath && isPromptFile(openedFilePath)) {
          setPromptSplitMode((s) => !s);
          setPromptPartsMode(false);
          setPromptFocusedPane('prompt');
          setPromptZoomedPane(null);
          return;
        }
        // s: toggle prompt parts view (any open file)
        if (input === 's' && openedFilePath) {
          setPromptPartsMode((s) => !s);
          setPartAnalysisRequest(null);
          setPromptSplitMode(false);
          setPromptZoomedPane(null);
          return;
        }
        // z: zoom focused pane to full-screen (only in split mode)
        if (input === 'z' && promptSplitMode) {
          setPromptZoomedPane((z) => z ? null : promptFocusedPane);
          return;
        }
        // In prompt split mode, Tab switches between prompt/response panes.
        // While zoomed, also move the zoomed pane so the display follows.
        if (promptSplitMode && key.tab) {
          const next: 'prompt' | 'response' = promptFocusedPane === 'prompt' ? 'response' : 'prompt';
          setPromptFocusedPane(next);
          if (promptZoomedPane) setPromptZoomedPane(next);
          return;
        }
        // Route scroll to analysis overlay when open, otherwise to file/parts viewer
        const scrollTarget = partAnalysisRequest
          ? '__partAnalysisScroll'
          : promptPartsMode ? '__promptPartsScroll'
          : promptSplitMode ? '__promptSplitScroll'
          : '__fileViewerScroll';
        const ctrl = (globalThis as Record<string, unknown>)[scrollTarget] as Record<string, () => void> | undefined;
        if (key.upArrow) {
          if (promptPartsMode && !partAnalysisRequest) {
            ctrl?.prevPart?.();
          } else {
            ctrl?.up?.();
          }
        }
        if (key.downArrow) {
          if (promptPartsMode && !partAnalysisRequest) {
            ctrl?.nextPart?.();
          } else {
            ctrl?.down?.();
          }
        }
        if (key.pageUp || (key.ctrl && input === 'u')) ctrl?.pageUp?.();
        if (key.pageDown || (key.ctrl && input === 'd')) ctrl?.pageDown?.();
        if (input === 'g') ctrl?.jumpStart?.();
        if (input === 'G') ctrl?.jumpEnd?.();
        return;
      }
      return;
    }

    // ── ANALYSIS MODE ─────────────────────────────────────────────────────────
    if (key.upArrow) {
      if (focusedPanel === 'runs') selectRun(runIndex - 1);
      else if (focusedPanel === 'issues') setIssueIndex((i) => Math.max(0, i - 1));
    }
    if (key.downArrow) {
      if (focusedPanel === 'runs') selectRun(runIndex + 1);
      else if (focusedPanel === 'issues') setIssueIndex((i) => Math.min(filteredIssues.length - 1, i + 1));
    }
    if (key.return) {
      if (focusedPanel === 'runs' && selectedRun && state !== 'running') {
        setIssueIndex(0);
        setShowDetail(false);
        setShowStream(false);
        run(selectedRun, projectRoot, skipPromptQuality);
        setFocusedPanel('issues');
      } else if (focusedPanel === 'issues' && selectedIssue) {
        setShowDetail(true);
        setShowStream(false);
        setFocusedPanel('detail');
      }
    }
    if (input === 'f' && focusedPanel === 'issues') { cycleFilter(); setIssueIndex(0); }
    if (input === 'r' && selectedIssue) {
      setShowStream(true);
      setShowDetail(false);
      setFocusedPanel('detail');
    }
    // a: run audit-and-fix skill
    if (input === 'a') { setAuditSkillPending(true); }
  });

  const runId = selectedRun?.runId ?? report?.runId;
  const isRunning = state === 'running';

  return (
    <Box flexDirection="column" width={cols}>
      <Header
        runId={runId}
        status={state === 'running' ? 'running' : state === 'done' ? 'done' : state === 'error' ? 'error' : 'idle'}
        mode={mode}
        projectRoot={projectRoot}
        provider={provider}
      />

      <Box flexGrow={1}>
        {showHelp ? (
          <HelpOverlay onClose={() => setShowHelp(false)} />
        ) : (
          <>
            {/* Left: run selector (always visible) */}
            <RunSelector
              runs={runs}
              selectedIndex={runIndex}
              focused={focusedPanel === 'runs'}
              loading={runsLoading}
            />

            {mode === 'files' ? (
              /* ── Files mode ─────────────────────────────────── */
              openedFilePath ? (
                /* File open: tree as narrow sidebar + dedicated viewer */
                <>
                  {/* Hide tree when zoomed, in parts mode, or in part analysis for maximum screen real estate */}
                  {!(promptPartsMode || partAnalysisRequest || (promptSplitMode && promptZoomedPane)) && (
                    <FileTree
                      entries={fileTree.entries}
                      selectedIndex={fileTree.selectedIndex}
                      focused={focusedPanel === 'filetree'}
                      loading={fileTree.loading}
                      openedPath={openedFilePath}
                      height={contentRows}
                    />
                  )}
                  {partAnalysisRequest ? (
                    <PartAnalysisOverlay
                      target={partAnalysisRequest.target}
                      projectRoot={projectRoot}
                      runId={selectedRun?.runId ?? `analysis_${new Date().toISOString().replace(/[:.]/g, '-')}`}
                      analysisKind={partAnalysisRequest.kind}
                    />
                  ) : promptPartsMode ? (
                    <PromptPartsViewer filePath={openedFilePath} />
                  ) : promptSplitMode ? (
                    <PromptSplitViewer
                      filePath={openedFilePath}
                      focusedPane={promptFocusedPane}
                      zoomedPane={promptZoomedPane}
                    />
                  ) : (
                    <FileViewer
                      filePath={openedFilePath}
                      focused={focusedPanel === 'fileviewer'}
                    />
                  )}
                </>
              ) : (
                /* No file open: tree takes full width */
                <FileTree
                  entries={fileTree.entries}
                  selectedIndex={fileTree.selectedIndex}
                  focused={focusedPanel === 'filetree'}
                  loading={fileTree.loading}
                  openedPath={null}
                  fullWidth
                  height={contentRows}
                />
              )
            ) : (
              /* ── Analysis mode ───────────────────────────────── */
              <>
                <IssuesPanel
                  issues={filteredIssues}
                  selectedIndex={issueIndex}
                  focused={focusedPanel === 'issues'}
                  filter={filter}
                  loading={isRunning}
                  loadingPhase={progress.phase}
                />
                {(showDetail && selectedIssue) ? (
                  <DetailOverlay issue={selectedIssue} onClose={() => setShowDetail(false)} />
                ) : (showStream && selectedIssue) ? (
                  <LLMStreamPanel issue={selectedIssue} focused={focusedPanel === 'detail'} />
                ) : (
                  <MetricsPanel metrics={report?.metrics ?? null} focused={focusedPanel === 'metrics'} />
                )}
              </>
            )}
          </>
        )}
      </Box>

      {error && (
        <Box paddingX={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {viewerNotice && (
        <Box paddingX={1}>
          <Text color="yellow">Notice: {viewerNotice}</Text>
        </Box>
      )}

      <StatusBar
        filter={filter}
        focusedPanel={focusedPanel}
        canExport={!!report}
        mode={mode}
        fileOpen={!!openedFilePath}
        promptSplitMode={promptSplitMode}
        promptPartsMode={promptPartsMode}
        partAnalysisOpen={!!partAnalysisRequest}
        isPromptFile={!!(openedFilePath && isPromptFile(openedFilePath))}
        isAnalysisFile={!!(openedFilePath && isAnalysisFile(openedFilePath))}
        isWorkflowLogFile={!!(
          mode === 'files' &&
          ((focusedPanel === 'filetree' && fileTree.selectedEntry?.filePath && isWorkflowLogFile(fileTree.selectedEntry.filePath)) ||
          (focusedPanel === 'fileviewer' && openedFilePath && isWorkflowLogFile(openedFilePath)))
        )}
        promptZoomed={!!promptZoomedPane}
        analysisState={state}
        progressPhase={progress.phase}
        issueCount={report?.counts.total}
        criticalCount={report?.counts.critical}
        runId={selectedRun?.runId ?? report?.runId}
      />
    </Box>
  );
}
