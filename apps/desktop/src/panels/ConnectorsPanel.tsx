import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { type FormEvent, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { type Connector, connectorAdd, connectorRemove, getConnectors } from "@/lib/bridge";

interface ConnectorsPanelProps {
  /** Bumped when the tab is opened, which is when the old app reloaded the list. */
  reloadKey?: number;
}

export function ConnectorsPanel({ reloadKey }: ConnectorsPanelProps): JSX.Element {
  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [adding, setAdding] = useState(false);

  // Opening the tab, removing one and a finished sign in can all be in flight
  // at once, and the last list to arrive is not necessarily the newest. Only the
  // most recent request is allowed to paint.
  const loadId = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    try {
      const list = await getConnectors();
      if (id !== loadId.current) return;
      setConnectors(list);
      setListError(null);
    } catch (error) {
      if (id !== loadId.current) return;
      setConnectors(null);
      setListError(String(error));
    }
  }, []);

  // `reloadKey` is the signal to look again, not an input to the load, so it
  // sits in the list on purpose.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the trigger, not an input
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function remove(connectorName: string) {
    try {
      await connectorRemove(connectorName);
      await load();
    } catch (error) {
      setListError(String(error));
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    setStatusIsError(false);
    setStatus("Finish the sign in in your browser.");
    try {
      // The CLI waits for the browser round trip, so this resolves when the
      // sign in is done rather than guessing at how long a password takes.
      await connectorAdd(name.trim(), url.trim(), scope.trim() || null);
      setStatus("Connected.");
      setName("");
      setUrl("");
      setScope("");
      await load();
    } catch (error) {
      setStatusIsError(true);
      setStatus(String(error));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A connector is a remote MCP server the house has signed in to. Its tools appear alongside the lights
        at the next start; its tokens live in the Keychain, never in the config.
      </p>

      <Card>
        <CardContent className="px-0">
          {listError !== null ? (
            <Alert variant="destructive" className="mx-6 w-auto">
              <CircleX />
              <AlertDescription>{listError}</AlertDescription>
            </Alert>
          ) : connectors === null ? (
            <p className="px-6 text-sm text-muted-foreground">Loading...</p>
          ) : connectors.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">Nothing connected yet.</p>
          ) : (
            <ul>
              {connectors.map((connector, index) => (
                <li key={connector.name}>
                  {index > 0 ? <Separator /> : null}
                  <div className="flex items-center gap-3 px-6 py-3">
                    {connector.signedIn ? (
                      <CircleCheck aria-label="Signed in" className="size-4 shrink-0 text-primary" />
                    ) : (
                      <CircleX aria-label="Signed out" className="size-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{connector.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {connector.signedIn
                          ? connector.url
                          : `${connector.url}, signed out. Connect it again.`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(connector.name)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add one</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void add(event)}>
            <div className="space-y-2">
              <Label htmlFor="connector-name">Name</Label>
              <Input
                id="connector-name"
                name="name"
                placeholder="calendar"
                spellCheck={false}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="connector-url">Server URL</Label>
              <Input
                id="connector-url"
                name="url"
                placeholder="https://example.com/mcp"
                spellCheck={false}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="connector-scope">Scopes, if the service needs them named</Label>
              <Input
                id="connector-scope"
                name="scope"
                spellCheck={false}
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={adding}>
                {adding ? <LoaderCircle className="animate-spin" /> : null}
                Connect
              </Button>
              {status !== null ? (
                <span
                  className={statusIsError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                >
                  {status}
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
