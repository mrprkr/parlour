"use client";

import { useEffect, useState } from "react";

const command = "npm install -g parlour";

/** One job: copy the install command. Everything else on the page is a link. */
export function InstallButton() {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(""), 1800);
    return () => clearTimeout(timer);
  }, [note]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setNote("copied");
    } catch {
      setNote("select and copy");
    }
  }

  return (
    <button className="install" type="button" onClick={copy} aria-label="Copy the install command">
      <code>{command}</code>
      <span className="copied" aria-live="polite">
        {note}
      </span>
    </button>
  );
}
