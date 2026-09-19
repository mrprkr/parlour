import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

function Anchor({ href = "", children, ...rest }: ComponentPropsWithoutRef<"a">) {
  // Links within the site go through the router; everything else is a plain
  // link that opens where it is.
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

function Table(props: ComponentPropsWithoutRef<"table">) {
  // The tables in the docs are wider than a phone. Let them scroll on their
  // own rather than the whole page.
  return (
    <div className="table-scroll">
      <table {...props} />
    </div>
  );
}

export function useMDXComponents(): MDXComponents {
  return { a: Anchor, table: Table };
}
