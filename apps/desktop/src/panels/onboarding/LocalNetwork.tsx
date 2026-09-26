// The local network, asked for before anything needs it. Since macOS 15 a
// process has to be let onto the house's network, and the prompt only appears
// when something first tries: left alone, that is the doctor at the end, or
// the phone looking for the Mac, and the question arrives out of nowhere.
// Asking here, with a sentence on why, means it is answered knowingly.

import { Wifi } from "lucide-react";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { localNetworkCheck, openPrivacySettings } from "@/lib/bridge";
import { Row, type Tone } from "@/panels/onboarding/parts";

/** How long to wait on the prompt: long enough to read it, short enough that a no already given is not a minute of spinning. */
const WAIT_MS = 60_000;
const EVERY_MS = 1500;

export type LocalNetworkState =
  | { kind: "unasked" }
  | { kind: "asking" }
  | { kind: "allowed"; detail: string }
  | { kind: "refused"; detail: string }
  /** Not a refusal: there is no multicast route, which an address typed by hand gets round. */
  | { kind: "unsure"; detail: string };

/**
 * The question, kept above the steps so the answer carries from one to the
 * next. The send that raises the prompt is refused while the prompt is up, and
 * macOS says nothing when it is answered, so the answer is found by asking
 * again until it comes back allowed or the wait runs out.
 */
export function useLocalNetwork(): { state: LocalNetworkState; ask: () => Promise<void> } {
  const [state, setState] = useState<LocalNetworkState>({ kind: "unasked" });
  /** Bumped by each ask and on unmount, so an older wait stops rather than overwriting a newer answer. */
  const turnRef = useRef(0);

  useEffect(
    () => () => {
      turnRef.current += 1;
    },
    [],
  );

  const ask = useCallback(async () => {
    const turn = ++turnRef.current;
    setState({ kind: "asking" });
    const until = Date.now() + WAIT_MS;
    try {
      for (;;) {
        const check = await localNetworkCheck();
        if (turn !== turnRef.current) return;
        if (check.status === "ok") return setState({ kind: "allowed", detail: check.detail });
        if (check.status === "warn") return setState({ kind: "unsure", detail: check.detail });
        if (Date.now() >= until) return setState({ kind: "refused", detail: check.detail });
        await new Promise((resolve) => setTimeout(resolve, EVERY_MS));
        if (turn !== turnRef.current) return;
      }
    } catch (error) {
      if (turn === turnRef.current) setState({ kind: "refused", detail: String(error) });
    }
  }, []);

  return { state, ask };
}

export function LocalNetwork({
  state,
  onAsk,
  why,
}: {
  state: LocalNetworkState;
  onAsk: () => void;
  /** What on this step needs the network, in a sentence. */
  why: string;
}): JSX.Element {
  if (state.kind === "unasked") {
    return (
      <div className="rounded-xl border bg-card px-4 py-4">
        <p className="font-medium">Allow the local network</p>
        <p className="mt-1 text-muted-foreground">
          {why} macOS asks once. Saying no keeps Parlour to this Mac, though it can be changed in System
          Settings.
        </p>
        <Button className="mt-3" onClick={onAsk}>
          <Wifi />
          Allow local network
        </Button>
      </div>
    );
  }

  const tone: Tone =
    state.kind === "asking"
      ? "busy"
      : state.kind === "allowed"
        ? "ok"
        : state.kind === "unsure"
          ? "warn"
          : "bad";
  const name =
    state.kind === "asking"
      ? "Asking for the local network"
      : state.kind === "allowed"
        ? "Local network allowed"
        : state.kind === "unsure"
          ? "Local network allowed, but quiet"
          : "No local network";
  const detail =
    state.kind === "asking"
      ? "Answer the prompt macOS puts up. If none appears, it was answered before, and the switch is in System Settings."
      : state.detail;

  return (
    <ul>
      <Row tone={tone} name={name} detail={detail}>
        {state.kind === "asking" || state.kind === "refused" ? (
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void openPrivacySettings("local-network")}>
              Open System Settings
            </Button>
            {state.kind === "refused" ? (
              <Button variant="ghost" size="sm" onClick={onAsk}>
                Check again
              </Button>
            ) : null}
          </div>
        ) : null}
      </Row>
    </ul>
  );
}
