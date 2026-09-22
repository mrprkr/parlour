"use client";

import { useEffect, useRef, useState } from "react";

const command = "npm install -g parlour";

// One job: copy the install command. Everything else on the page is a link.
export function InstallButton() {
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setNote("copied");
    } catch {
      setNote("select and copy");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(""), 1800);
  }

  return (
    <button
      className="install"
      type="button"
      data-copy={command}
      aria-label="Copy the install command"
      onClick={copy}
    >
      <span className="prompt" aria-hidden="true">
        $
      </span>
      <code>{command}</code>
      <span className="copied" aria-live="polite">
        {note}
      </span>
    </button>
  );
}
