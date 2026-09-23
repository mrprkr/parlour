// The iPhone app, paired by scanning rather than typing. The code carries the
// address and the network token, so there is no code to draw until the house
// is on the network at all, and switching that on is the one thing asked first.

import { QrCode, Smartphone, Wifi } from "lucide-react";
import { type JSX, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { hostName, type Pairing, pairingCode } from "@/lib/bridge";
import { Mark } from "@/panels/onboarding/parts";

type View = { kind: "loading" } | { kind: "shown"; code: Pairing } | { kind: "failed"; message: string };

export function PairPhone({
  tokenSet,
  onEnableNetwork,
}: {
  /** Without a token Parlour answers this Mac only, so there is nothing for a phone to reach. */
  tokenSet: boolean;
  /** Mints the token and saves it, the same as switching Other devices on. */
  onEnableNetwork: () => Promise<void>;
}): JSX.Element {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  const show = useCallback(async () => {
    setView({ kind: "loading" });
    try {
      setView({ kind: "shown", code: await pairingCode(await hostName()) });
    } catch (error) {
      setView({ kind: "failed", message: String(error) });
    }
  }, []);

  // Once the network is on there is nothing else to press before the code.
  useEffect(() => {
    if (tokenSet) void show();
  }, [tokenSet, show]);

  if (!tokenSet) {
    return (
      <div className="rounded-xl border bg-card px-4 py-4">
        <div className="flex items-start gap-3">
          <Wifi className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Let other devices in first</p>
            <p className="text-muted-foreground">
              Parlour only answers this Mac until it has a network token. Switching it on makes one, and the
              phone learns it from the code.
            </p>
            <Button
              className="mt-3"
              disabled={enabling}
              onClick={() => {
                setEnabling(true);
                setEnableError(null);
                void onEnableNetwork()
                  .catch((error: unknown) => setEnableError(String(error)))
                  .finally(() => setEnabling(false));
              }}
            >
              <Wifi />
              {enabling ? "Switching on..." : "Switch on"}
            </Button>
            {enableError ? <p className="mt-2 text-destructive">{enableError}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <ol className="grid gap-2">
        {[
          "Put the iPhone on the same Wi-Fi as this Mac.",
          "Open Parlour on the iPhone, go to Settings and tap Scan pairing code. The Camera app works too.",
          "Point it at the code. The phone keeps the address and the token, and connects when Parlour is running.",
        ].map((text, index) => (
          <li key={text} className="flex gap-3 rounded-lg border bg-card px-3 py-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-border text-[11px] tabular-nums">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{text}</span>
          </li>
        ))}
      </ol>

      <div className="flex min-h-52 items-center justify-center rounded-xl border bg-card p-4">
        {view.kind === "shown" ? (
          <div className="flex flex-col items-center gap-2 text-center">
            {/* A white ground whatever the theme, because scanners want dark on light. */}
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(view.code.svg)}`}
              alt={`Pairing code for ${view.code.name}`}
              className="size-48 rounded-md bg-white p-1"
            />
            <p className="font-mono text-[12px] break-all text-muted-foreground">{view.code.url}</p>
          </div>
        ) : view.kind === "failed" ? (
          <div className="grid justify-items-center gap-2 text-center">
            <p className="flex gap-2 text-destructive">
              <Mark tone="bad" />
              {view.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => void show()}>
              <QrCode />
              Try again
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Mark tone="busy" className="mt-0" />
            Drawing the code...
          </p>
        )}
      </div>

      <p className="flex gap-2 text-[13px] text-muted-foreground">
        <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
        The code lets a phone into the house, so show it only to phones you mean to let in. It is on the
        Status tab whenever you need it again.
      </p>
    </div>
  );
}
