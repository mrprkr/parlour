import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNetwork, runDoctor, type Check as DoctorCheck, type Status } from "@/lib/bridge";
import { cn } from "@/lib/utils";

interface StatusPanelProps {
  status: Status;
  /** Bumped by a save elsewhere so the network line picks the new token up. */
  reloadKey?: number;
}

/** What the network card is showing. An error takes the url's place, as before. */
type NetworkView = { url: string; note: string | null };

type DoctorView =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "done"; checks: DoctorCheck[] }
  | { kind: "failed"; message: string };

const CARD = "gap-2 py-3";
const CARD_PAD = "px-3.5";
const HEADING = "text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase";

export function StatusPanel({ status, reloadKey }: StatusPanelProps): JSX.Element {
  // The two quotes are sticky: a status that says nothing about what was heard
  // leaves the last thing heard on screen rather than blanking the card.
  const [heard, setHeard] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkView | null>(null);
  const [doctor, setDoctor] = useState<DoctorView>({ kind: "idle" });

  useEffect(() => {
    if (status.lastHeard) setHeard(status.lastHeard);
  }, [status.lastHeard]);

  useEffect(() => {
    if (status.lastReply) setReply(status.lastReply);
  }, [status.lastReply]);

  useEffect(() => {
    let live = true;
    void getNetwork()
      .then((net) => {
        if (!live) return;
        setNetwork({
          url: net.url,
          note: net.tokenSet
            ? "Phones open that address. Home Assistant points at it with /v1 on the end."
            : "No AGENT_TOKEN is set, so the agent only answers this machine. Add one in Settings to let the house in.",
        });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setNetwork({ url: String(error), note: null });
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  async function check(): Promise<void> {
    setDoctor({ kind: "checking" });
    try {
      setDoctor({ kind: "done", checks: await runDoctor() });
    } catch (error) {
      setDoctor({ kind: "failed", message: `Could not run the check: ${String(error)}` });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5">
        <Card className={CARD}>
          <CardHeader className={CARD_PAD}>
            <CardTitle className={HEADING}>Last heard</CardTitle>
          </CardHeader>
          <CardContent className={CARD_PAD}>
            <Quote text={heard} />
          </CardContent>
        </Card>

        <Card className={CARD}>
          <CardHeader className={CARD_PAD}>
            <CardTitle className={cn(HEADING, "flex items-center gap-2")}>
              Last reply
              {status.via ? (
                <Badge
                  variant={status.via === "cloud" ? "default" : "secondary"}
                  className="text-[11px] tracking-[0.04em] normal-case"
                >
                  {status.via}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className={CARD_PAD}>
            <Quote text={reply} />
          </CardContent>
        </Card>
      </div>

      <dl className="flex gap-[26px]">
        <Fact label="Tools">{status.running ? String(status.tools) : "-"}</Fact>
        <Fact label="Cloud escalation">
          {status.running ? (status.cloud ? "on" : "off") : "-"}
        </Fact>
      </dl>

      <Card className={CARD}>
        <CardHeader className={CARD_PAD}>
          <CardTitle className={HEADING}>On the network</CardTitle>
        </CardHeader>
        <CardContent className={cn(CARD_PAD, "space-y-1")}>
          <p className="break-all font-mono text-[13px]">{network ? network.url : "-"}</p>
          {network?.note ? (
            <p className="text-muted-foreground">{network.note}</p>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className={HEADING}>Dependencies</h2>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => void check()}
            disabled={doctor.kind === "checking"}
          >
            Check
          </Button>
        </div>

        <ul className="grid gap-1.5">
          {doctor.kind === "idle" ? <Note>Not checked yet.</Note> : null}
          {doctor.kind === "checking" ? <Note>Checking...</Note> : null}
          {doctor.kind === "failed" ? <Note>{doctor.message}</Note> : null}
          {doctor.kind === "done"
            ? doctor.checks.map((entry) => <CheckRow key={entry.name} check={entry} />)
            : null}
        </ul>
      </section>
    </div>
  );
}

function Quote({ text }: { text: string | null }): JSX.Element {
  return <p className="break-words">{text ? `"${text}"` : "Nothing yet."}</p>;
}

function Fact({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 ml-0 font-semibold">{children}</dd>
    </div>
  );
}

/** A line of the doctor's list, or one of the messages that stand in for it. */
function Note({ children }: { children: ReactNode }): JSX.Element {
  return (
    <li className="rounded-xl border bg-card px-3 py-2.5 text-muted-foreground">{children}</li>
  );
}

function CheckRow({ check }: { check: DoctorCheck }): JSX.Element {
  const tone = check.ok ? "text-primary" : check.required ? "text-destructive" : "text-warn";
  const Glyph = check.ok ? Check : check.required ? X : TriangleAlert;

  return (
    <li
      className={cn(
        "grid grid-cols-[16px_130px_1fr] items-start gap-2.5",
        "rounded-xl border bg-card px-3 py-2.5",
        !check.ok && check.required && "text-destructive",
      )}
    >
      <Glyph className={cn("mt-0.5 size-3.5", tone)} aria-hidden="true" />
      <span className="font-medium">{check.name}</span>
      <span className={cn("break-words", check.ok || !check.required ? "text-muted-foreground" : "")}>
        {check.detail}
      </span>
    </li>
  );
}
