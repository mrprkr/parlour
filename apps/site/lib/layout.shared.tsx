import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Wordmark } from "@/app/wordmark";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Wordmark /> },
    githubUrl: "https://github.com/mrprkr/parlour",
    // Both schemes follow the system, on the front page and in the docs alike.
    themeSwitch: { enabled: false },
  };
}
