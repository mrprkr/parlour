import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

const CodeBlock = defaultMdxComponents.pre;

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // Fumadocs styles its code blocks for Shiki, colouring every span from an
    // inline variable. Twinkleplop colours by class, so the blocks opt out of
    // those rules and keep the frame, the scroll area and the copy button.
    pre: (props) => (
      <div className="not-fumadocs-codeblock">
        <CodeBlock {...props} />
      </div>
    ),
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;
