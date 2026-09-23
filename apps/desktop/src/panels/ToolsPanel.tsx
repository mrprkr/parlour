// What the house can do beyond the built-ins, in one place: its own rules
// (skills), the MCP servers it talks to, the accounts it has signed in to
// (connectors) and the packages that bring all three (plugins). Each list is
// the CLI's, so a skill written here is the same file `parlour skills` shows.

import { BookOpen, CircleAlert, Package, Plug, RotateCw, Server, Trash2 } from "lucide-react";
import { type FormEvent, type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  addMcp,
  addPlugin,
  listMcp,
  listPlugins,
  listSkills,
  type McpServer,
  type Plugin,
  removeMcp,
  removePlugin,
  removeSkill,
  restartAgent,
  type SkillList,
  setNamedSecret,
  showSkill,
  splitCommandLine,
  writeSkill,
} from "@/lib/bridge";
import { cn } from "@/lib/utils";
import { ConnectorsPanel } from "@/panels/ConnectorsPanel";
import { Mark } from "@/panels/onboarding/parts";

type Section = "skills" | "mcp" | "connectors" | "plugins";

/** What a skill name may be, as the CLI checks it: it is a file name and a tool argument. */
const SKILL_NAME = /^[a-z0-9][a-z0-9_-]*$/;

/** Somewhere to start from, since a blank page is the hardest part of writing a rule. */
const EXAMPLES: { name: string; description: string; body: string }[] = [
  {
    name: "goodnight",
    description: 'What to do when someone says "goodnight"',
    body: "Turn off every light except the porch light, and set the heating to 17 degrees.\nThen say goodnight back, in a few words.",
  },
  {
    name: "guests",
    description: "When guests are staying",
    body: "The spare room is called the study. When someone asks for the guest room, they mean the study.\nPut the study heating on at 20 degrees when they arrive, and keep replies short.",
  },
];

export function ToolsPanel({
  running,
  reloadKey,
  compact,
}: {
  running: boolean;
  reloadKey?: number;
  /** In the onboarding, where the explanation above already says what this is. */
  compact?: boolean;
}): JSX.Element {
  const [section, setSection] = useState<Section>("skills");
  /** Something was changed that the running agent will not see until it restarts. */
  const [stale, setStale] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const changed = useCallback(() => setStale(true), []);

  async function restart(): Promise<void> {
    setRestarting(true);
    setRestartError(null);
    try {
      await restartAgent();
      setStale(false);
    } catch (error) {
      setRestartError(String(error));
    } finally {
      setRestarting(false);
    }
  }

  return (
    <div className="space-y-4">
      {compact ? null : (
        <p className="text-muted-foreground">
          What Parlour can do beyond lights and timers. Everything here is optional, and it takes effect the
          next time Parlour starts.
        </p>
      )}

      {stale && running ? (
        <Alert>
          <RotateCw />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Parlour picks this up when it restarts.</span>
            <Button size="xs" variant="outline" disabled={restarting} onClick={() => void restart()}>
              {restarting ? "Restarting..." : "Restart now"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {restartError ? <p className="text-destructive">{restartError}</p> : null}

      <Tabs value={section} onValueChange={(next) => setSection(next as Section)} className="gap-3">
        <TabsList className="w-full">
          <TabsTrigger value="skills">
            <BookOpen />
            Skills
          </TabsTrigger>
          <TabsTrigger value="mcp">
            <Server />
            MCP
          </TabsTrigger>
          <TabsTrigger value="connectors">
            <Plug />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="plugins">
            <Package />
            Plugins
          </TabsTrigger>
        </TabsList>
        <TabsContent value="skills">
          <SkillsSection reloadKey={reloadKey} onChanged={changed} />
        </TabsContent>
        <TabsContent value="mcp">
          <McpSection reloadKey={reloadKey} onChanged={changed} />
        </TabsContent>
        <TabsContent value="connectors">
          <ConnectorsPanel reloadKey={reloadKey} />
        </TabsContent>
        <TabsContent value="plugins">
          <PluginsSection reloadKey={reloadKey} onChanged={changed} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------ skills

interface Draft {
  /** Null for a new skill, whose name is still being chosen. */
  editing: string | null;
  name: string;
  description: string;
  body: string;
}

function SkillsSection({ reloadKey, onChanged }: { reloadKey?: number; onChanged: () => void }): JSX.Element {
  const [list, setList] = useState<SkillList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** A plugin's skill, shown to read rather than to edit. */
  const [reading, setReading] = useState<{ name: string; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await listSkills());
      setError(null);
    } catch (failure) {
      setError(String(failure));
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the trigger, not an input
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function open(name: string, own: boolean, description: string): Promise<void> {
    setNote(null);
    try {
      const body = await showSkill(name);
      if (own) {
        setReading(null);
        setDraft({ editing: name, name, description, body });
      } else {
        setDraft(null);
        setReading({ name, body });
      }
    } catch (failure) {
      setNote(String(failure));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!draft) return;
    const name = draft.name.trim().toLowerCase();
    if (!SKILL_NAME.test(name)) {
      setNote("A name is lower case letters, digits, - and _, like goodnight or school-run.");
      return;
    }
    if (!draft.body.trim()) {
      setNote("Say what the house should do; that part is what the model reads.");
      return;
    }
    if (draft.editing === null && list?.skills.some((skill) => skill.name === name)) {
      setNote(`There is already a skill called ${name}.`);
      return;
    }
    setSaving(true);
    setNote(null);
    try {
      // The description is one line of frontmatter, so a pasted newline would
      // end it early and push the rest into the body.
      const description = draft.description.replace(/\s+/g, " ").trim();
      const text = [
        "---",
        `name: ${name}`,
        ...(description ? [`description: ${description}`] : []),
        "---",
        "",
        draft.body.trim(),
        "",
      ].join("\n");
      await writeSkill(name, text);
      setDraft(null);
      onChanged();
      await load();
    } catch (failure) {
      setNote(String(failure));
    } finally {
      setSaving(false);
    }
  }

  async function remove(name: string): Promise<void> {
    try {
      await removeSkill(name);
      setDraft(null);
      onChanged();
      await load();
    } catch (failure) {
      setNote(String(failure));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        House rules, written in plain words. Parlour reads one when it applies, so "goodnight" can mean
        exactly what it means in this house.
      </p>

      {error ? <Problem>{error}</Problem> : null}

      <List
        loading={list === null && !error}
        empty="No skills yet. Start one below, or from an example."
        items={(list?.skills ?? []).map((skill) => ({
          key: skill.name,
          title: skill.name,
          detail: skill.description,
          tag: skill.own ? undefined : "plugin",
          selected: draft?.editing === skill.name || reading?.name === skill.name,
          onOpen: () => void open(skill.name, skill.own, skill.description),
          action: skill.own ? <Remove onConfirm={() => void remove(skill.name)} /> : null,
        }))}
      />

      {list?.problems.length ? (
        <ul className="grid gap-1.5">
          {list.problems.map((problem) => (
            <li key={problem.source} className="flex gap-2 text-muted-foreground">
              <Mark tone="warn" />
              <span className="min-w-0 break-words">
                {problem.detail} <span className="text-[12px]">({problem.source})</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {reading ? (
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{reading.name}</h3>
            <Button variant="ghost" size="xs" onClick={() => setReading(null)}>
              Close
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            From a plugin. Write a skill with the same name to replace it in this house.
          </p>
          <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-mono text-[12px]">
            {reading.body}
          </pre>
        </div>
      ) : null}

      {draft ? (
        <form
          className="grid gap-3 rounded-xl border border-primary/40 bg-card px-4 py-3"
          onSubmit={(event) => void save(event)}
        >
          <h3 className="font-medium">{draft.editing ? `Edit ${draft.editing}` : "New skill"}</h3>
          <Field id="skill-name" label="Name">
            <Input
              id="skill-name"
              spellCheck={false}
              placeholder="goodnight"
              disabled={draft.editing !== null}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field id="skill-description" label="When it applies">
            <Input
              id="skill-description"
              placeholder='When someone says "goodnight"'
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          <Field id="skill-body" label="What to do">
            <Textarea
              id="skill-body"
              className="min-h-28"
              placeholder="Say which lights, which rooms and what to reply. Keep the reply to a sentence."
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setReading(null);
              setNote(null);
              setDraft({ editing: null, name: "", description: "", body: "" });
            }}
          >
            New skill
          </Button>
          {EXAMPLES.filter((example) => !list?.skills.some((skill) => skill.name === example.name)).map(
            (example) => (
              <Button
                key={example.name}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReading(null);
                  setNote(null);
                  setDraft({ editing: null, ...example });
                }}
              >
                Start from "{example.name}"
              </Button>
            ),
          )}
        </div>
      )}

      {note ? <p className="text-destructive">{note}</p> : null}
    </div>
  );
}

// --------------------------------------------------------------------- mcp

function McpSection({ reloadKey, onChanged }: { reloadKey?: number; onChanged: () => void }): JSX.Element {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"http" | "stdio">("http");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [line, setLine] = useState("");
  const [token, setToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setServers(await listMcp());
      setError(null);
    } catch (failure) {
      setError(String(failure));
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the trigger, not an input
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const label = name.trim();
    const command = splitCommandLine(line);
    if (!label) {
      setNote("Give it a name, which is how its tools are told apart.");
      return;
    }
    if (kind === "http" ? !url.trim() : !command.length) {
      setNote(kind === "http" ? "Paste the server's address." : "Paste the command that starts it.");
      return;
    }
    setAdding(true);
    setNote(null);
    try {
      // The token goes in secrets.env under a name of its own and the config
      // only names the variable, so the file stays safe to read out.
      const tokenEnv = token ? `MCP_${label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_TOKEN` : undefined;
      await addMcp(label, kind === "http" ? { url: url.trim() } : { command }, tokenEnv);
      if (tokenEnv) await setNamedSecret(tokenEnv, token);
      setName("");
      setUrl("");
      setLine("");
      setToken("");
      onChanged();
      await load();
    } catch (failure) {
      setNote(String(failure));
    } finally {
      setAdding(false);
    }
  }

  async function remove(server: string): Promise<void> {
    try {
      await removeMcp(server);
      onChanged();
      await load();
    } catch (failure) {
      setNote(String(failure));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        MCP servers bring their tools to Parlour: a calendar, a notes app, a shopping list. For one that needs
        you to sign in, use Accounts instead.
      </p>

      {error ? <Problem>{error}</Problem> : null}

      <List
        loading={servers === null && !error}
        empty="No MCP servers yet."
        items={(servers ?? []).map((server) => ({
          key: server.name,
          title: server.name,
          detail: server.transport === "http" ? server.url : [server.command, ...server.args].join(" "),
          tag: server.transport === "http" ? "network" : "this Mac",
          action: <Remove onConfirm={() => void remove(server.name)} />,
        }))}
      />

      <form className="grid gap-3 rounded-xl border bg-card px-4 py-3" onSubmit={(event) => void add(event)}>
        <h3 className="font-medium">Add a server</h3>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Where the server runs">
          {(
            [
              ["http", "On the network", "It has an address"],
              ["stdio", "On this Mac", "Parlour starts it"],
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-2 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                kind === value && "border-primary bg-primary/10",
              )}
            >
              <input
                type="radio"
                name="mcp-kind"
                className="sr-only"
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              <span className="block font-medium">{title}</span>
              <span className="block text-[12px] text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
        <Field id="mcp-name" label="Name">
          <Input
            id="mcp-name"
            spellCheck={false}
            placeholder="notes"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {kind === "http" ? (
          <Field id="mcp-url" label="Address">
            <Input
              id="mcp-url"
              spellCheck={false}
              placeholder="https://example.com/mcp"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
        ) : (
          <Field id="mcp-command" label="Command">
            <Input
              id="mcp-command"
              spellCheck={false}
              className="font-mono text-[12px]"
              placeholder="npx -y @modelcontextprotocol/server-filesystem ~/Documents"
              value={line}
              onChange={(event) => setLine(event.target.value)}
            />
          </Field>
        )}
        <Field id="mcp-token" label="Token, if it needs one">
          <Input
            id="mcp-token"
            type="password"
            autoComplete="off"
            placeholder="Kept in secrets.env, never in the config"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-destructive">{note}</p>
          <Button type="submit" disabled={adding}>
            {adding ? "Adding..." : "Add"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------- plugins

function PluginsSection({
  reloadKey,
  onChanged,
}: {
  reloadKey?: number;
  onChanged: () => void;
}): JSX.Element {
  const [plugins, setPlugins] = useState<Plugin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [specifier, setSpecifier] = useState("");
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlugins(await listPlugins());
      setError(null);
    } catch (failure) {
      setError(String(failure));
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the trigger, not an input
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!specifier.trim()) return;
    setAdding(true);
    setNote(null);
    try {
      await addPlugin(specifier.trim());
      setSpecifier("");
      onChanged();
      await load();
    } catch (failure) {
      setNote(String(failure));
    } finally {
      setAdding(false);
    }
  }

  async function remove(plugin: string): Promise<void> {
    try {
      await removePlugin(plugin);
      onChanged();
      await load();
    } catch (failure) {
      setNote(String(failure));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        A plugin is an npm package that brings voices, models, skills or integrations in one go.
      </p>

      {error ? <Problem>{error}</Problem> : null}

      <List
        loading={plugins === null && !error}
        empty="No plugins."
        items={(plugins ?? []).map((plugin) => ({
          key: plugin.specifier,
          title: plugin.name,
          detail: plugin.description || brings(plugin) || plugin.specifier,
          tag: brings(plugin) && plugin.description ? brings(plugin) : undefined,
          action: <Remove onConfirm={() => void remove(plugin.specifier)} />,
        }))}
      />

      <form className="grid gap-3 rounded-xl border bg-card px-4 py-3" onSubmit={(event) => void add(event)}>
        <h3 className="font-medium">Add a plugin</h3>
        <Field id="plugin-specifier" label="Package name, or the path to a checkout">
          <Input
            id="plugin-specifier"
            spellCheck={false}
            className="font-mono text-[12px]"
            placeholder="parlour-plugin-example"
            value={specifier}
            onChange={(event) => setSpecifier(event.target.value)}
          />
        </Field>
        <p className="text-[12px] text-muted-foreground">
          Install the package next to parlour first (npm install -g, the same way parlour was installed). It
          is loaded and checked before it is added.
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-destructive">{note}</p>
          <Button type="submit" disabled={adding || !specifier.trim()}>
            {adding ? "Checking..." : "Add"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** The short "what is in it" line, only the parts that are there. */
function brings(plugin: Plugin): string {
  const parts: string[] = [];
  if (plugin.providers.length) parts.push(plugin.providers.join(", "));
  if (plugin.skills || plugin.skillsDir) parts.push(plugin.skills ? `${plugin.skills} skills` : "skills");
  if (plugin.integrations.length) parts.push(plugin.integrations.join(", "));
  return parts.join("; ");
}

// ------------------------------------------------------------------ pieces

interface Item {
  key: string;
  title: string;
  detail: string;
  tag?: string;
  selected?: boolean;
  onOpen?: () => void;
  action?: ReactNode;
}

function List({ loading, empty, items }: { loading: boolean; empty: string; items: Item[] }): JSX.Element {
  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!items.length) {
    return <p className="rounded-xl border border-dashed px-4 py-3 text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => (
        <li key={item.key} className={cn("flex items-center gap-2 px-3 py-2", item.selected && "bg-accent")}>
          {item.onOpen ? (
            <button type="button" onClick={item.onOpen} className="min-w-0 flex-1 text-left">
              <Line item={item} />
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <Line item={item} />
            </div>
          )}
          {item.action}
        </li>
      ))}
    </ul>
  );
}

function Line({ item }: { item: Item }): JSX.Element {
  return (
    <>
      <span className="flex items-center gap-2">
        <span className="truncate font-medium">{item.title}</span>
        {item.tag ? (
          <span className="shrink-0 rounded-full border px-1.5 text-[11px] text-muted-foreground">
            {item.tag}
          </span>
        ) : null}
      </span>
      <span className="block truncate text-[12px] text-muted-foreground">{item.detail}</span>
    </>
  );
}

/** Two clicks, because the second is where a stray one is caught. */
function Remove({ onConfirm }: { onConfirm: () => void }): JSX.Element {
  const [asking, setAsking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return asking ? (
    <Button
      variant="destructive"
      size="xs"
      onClick={() => {
        setAsking(false);
        onConfirm();
      }}
    >
      Remove
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Remove"
      onClick={() => {
        setAsking(true);
        // Left armed for a moment only, so a later click in passing does nothing.
        timer.current = setTimeout(() => setAsking(false), 3000);
      }}
    >
      <Trash2 />
    </Button>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function Problem({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
