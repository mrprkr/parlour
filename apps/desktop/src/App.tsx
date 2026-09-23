// The window's shell: the header, the tabs and the state everything else
// reads. Only this file listens to Parlour, so a panel never has to wonder
// whether someone else is already subscribed.
import { type JSX, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getLogs,
  getStatus,
  onAgentError,
  onAgentLog,
  onAgentStatus,
  type Status,
  startAgent,
  stopAgent,
} from "@/lib/bridge";
import { cn } from "@/lib/utils";
import { LogsPanel } from "@/panels/LogsPanel";
import { Onboarding } from "@/panels/Onboarding";
import { PipelinePanel } from "@/panels/PipelinePanel";
import { SettingsPanel } from "@/panels/SettingsPanel";
import { StatusPanel } from "@/panels/StatusPanel";
import { ToolsPanel } from "@/panels/ToolsPanel";

type TabName = "status" | "test" | "tools" | "settings" | "logs";

const TABS: { value: TabName; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "test", label: "Test" },
  { value: "tools", label: "Tools" },
  { value: "settings", label: "Settings" },
  { value: "logs", label: "Logs" },
];

/**
 * The dot, per state. The colour and the cadence come from the shared state
 * vocabulary in packages/design, so the dot here, the lamp on the site, the
 * phone page and the iOS app all breathe in step: idle is a steady green and
 * the three working states pulse faster the closer the agent is to speaking.
 */
const DOT: Record<string, string> = {
  idle: "bg-[var(--state-idle)]",
  listening: "animate-pulse bg-[var(--state-listening)] [animation-duration:var(--state-listening-pulse)]",
  thinking: "animate-pulse bg-[var(--state-thinking)] [animation-duration:var(--state-thinking-pulse)]",
  speaking: "animate-pulse bg-[var(--state-speaking)] [animation-duration:var(--state-speaking-pulse)]",
  stopped: "border border-[var(--state-stopped)] bg-border",
};

/** What the window shows before the first status arrives. */
const UNKNOWN: Status = { running: false, state: "stopped", tools: 0, cloud: false };

/** Inactive panels stay mounted and hidden, so a tab switch keeps unsaved edits. */
const PANEL = "min-h-0 flex-1 data-[state=inactive]:hidden";

/**
 * The window sits in the menu bar for days at a time and a chatty Parlour
 * never stops writing, so the oldest lines fall off the front. The whole log
 * is still on disk; this is only what the panel keeps in hand.
 */
const KEPT_LINES = 2000;

/** The tail of `lines` plus `extra`, dropping the oldest to stay within the cap. */
function tail(lines: string[], extra: string[]): string[] {
  const next = [...lines, ...extra];
  return next.length > KEPT_LINES ? next.slice(next.length - KEPT_LINES) : next;
}

export function App(): JSX.Element {
  const [status, setStatus] = useState<Status>(UNKNOWN);
  const [lines, setLines] = useState<string[]>([]);
  const [tab, setTab] = useState<TabName>("status");
  const [setupOpen, setSetupOpen] = useState(false);
  /** Bumped when a save may have changed the token, so the network card re-reads. */
  const [networkKey, setNetworkKey] = useState(0);
  /** Bumped when the onboarding wrote settings the Settings tab is also showing. */
  const [settingsKey, setSettingsKey] = useState(0);
  /**
   * Bumped on every visit to Tools, which is when the lists are read again:
   * a sign in finished in the browser, or a skill edited in a text editor,
   * shows up without a button for it. Test is bumped too, since a change in
   * Settings can change which voice or model it tries.
   */
  const [toolsKey, setToolsKey] = useState(0);
  const [testKey, setTestKey] = useState(0);

  // A new array each time, because the log panel follows the tail by identity.
  const append = useCallback((line: string) => {
    setLines((previous) => tail(previous, [line]));
  }, []);

  const apply = useCallback(
    (next: Status) => {
      setStatus(next);
      // An error carried on the status is worth reading later, so it is written
      // down, but it does not steal the tab the way a thrown one does.
      if (next.error) append(`error: ${next.error}`);
    },
    [append],
  );

  useEffect(() => {
    let live = true;

    const subscriptions = [
      onAgentStatus((next) => {
        if (live) apply(next);
      }),
      onAgentLog((line) => {
        if (live) append(line);
      }),
      onAgentError((message) => {
        if (!live) return;
        append(message);
        setTab("logs");
      }),
    ];

    // The history goes in front of whatever arrived while it was being fetched,
    // since anything live is newer than the file it was read from.
    void getLogs()
      .then((history) => {
        if (live) setLines((current) => tail(history, current));
      })
      .catch((error: unknown) => {
        if (live) append(`could not read the log: ${String(error)}`);
      });

    void getStatus()
      .then((next) => {
        if (live) apply(next);
      })
      .catch((error: unknown) => {
        if (live) append(String(error));
      });

    return () => {
      live = false;
      for (const pending of subscriptions) void pending.then((unlisten) => unlisten());
    };
  }, [append, apply]);

  /** Start or stop, then say what actually happened rather than what was asked. */
  async function power(): Promise<void> {
    try {
      const before = await getStatus();
      try {
        await (before.running ? stopAgent() : startAgent());
      } catch (error) {
        append(String(error));
        setTab("logs");
      }
      apply(await getStatus());
    } catch (error) {
      append(String(error));
      setTab("logs");
    }
  }

  const state = status.state || "stopped";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 px-5 pt-4.5 pb-3.5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn("size-3 shrink-0 rounded-full", DOT[state] ?? "bg-muted-foreground")}
          />
          <div>
            <h1 className="text-[15px] leading-tight font-semibold">Parlour</h1>
            <p className="tracking-[0.04em] text-muted-foreground [font-variant-caps:all-small-caps]">
              {state}
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => void power()}>
          {status.running ? "Stop" : "Start"}
        </Button>
      </header>

      <Tabs
        value={tab}
        onValueChange={(next) => {
          setTab(next as TabName);
          if (next === "tools") setToolsKey((key) => key + 1);
          if (next === "test") setTestKey((key) => key + 1);
        }}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList variant="line" className="w-full justify-start gap-1 rounded-none border-b px-4">
          {TABS.map((entry) => (
            <TabsTrigger
              key={entry.value}
              value={entry.value}
              className="flex-none px-2.5"
              // Clicking the tab you are already on reloads its lists, which is
              // how the sign in a browser just finished gets picked up. The tabs
              // only report a change of tab, so that click has to be caught here
              // rather than in onValueChange.
              onClick={() => {
                if (entry.value === "tools" && tab === "tools") setToolsKey((key) => key + 1);
              }}
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-4 pb-5">
          <TabsContent value="status" forceMount className={cn(PANEL, "overflow-y-auto")}>
            <StatusPanel status={status} reloadKey={networkKey} />
          </TabsContent>

          <TabsContent value="test" forceMount className={cn(PANEL, "overflow-y-auto")}>
            <PipelinePanel running={status.running} reloadKey={testKey} />
          </TabsContent>

          <TabsContent value="tools" forceMount className={cn(PANEL, "overflow-y-auto")}>
            <ToolsPanel running={status.running} reloadKey={toolsKey} />
          </TabsContent>

          <TabsContent value="settings" forceMount className={cn(PANEL, "overflow-y-auto")}>
            <SettingsPanel
              reloadKey={settingsKey}
              onSaved={() => setNetworkKey((key) => key + 1)}
              onOpenSetup={() => setSetupOpen(true)}
            />
          </TabsContent>

          {/* The log box scrolls itself, so this one gets a height rather than a scrollbar. */}
          <TabsContent value="logs" forceMount className={cn(PANEL, "flex flex-col")}>
            <LogsPanel lines={lines} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Mounted whether or not it is showing: it decides for itself whether the
          machine still needs setting up, and it draws nothing until it does. */}
      <Onboarding
        open={setupOpen}
        running={status.running}
        onClose={() => setSetupOpen(false)}
        onSaved={() => {
          setSettingsKey((key) => key + 1);
          setNetworkKey((key) => key + 1);
        }}
      />
    </div>
  );
}
