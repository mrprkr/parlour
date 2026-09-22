import { language as bash } from "@twinkleplop/bash";
import { language as json } from "@twinkleplop/json";
import { language as markdown } from "@twinkleplop/markdown";
import rehypeTwinkleplop from "@twinkleplop/rehype";
import { language as typescript } from "@twinkleplop/typescript";
import { language as yaml } from "@twinkleplop/yaml";
import { loader } from "fumadocs-core/source";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { applyMdxPreset } from "fumadocs-mdx/config";
import { defineDocs } from "fumadocs-mdx/macro";

// The docs are content/docs/*.mdx with a title and a description in their
// frontmatter; meta.json beside them sets the reading order.
const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    // Twinkleplop highlights the code blocks in place of Fumadocs' own Shiki
    // pass. It writes classes rather than inline colours, so the theme is one
    // stylesheet (imported in globals.css) that follows the site's dark class.
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: false,
      rehypePlugins: [
        [
          rehypeTwinkleplop,
          {
            languages: {
              ts: typescript(),
              json: json(),
              bash: bash(),
              sh: "bash",
              md: markdown(),
              yaml: yaml(),
            },
            // `text` fences, and anything else unregistered, stay plain rather than failing the build.
            on_unknown_language: "plain",
          },
        ],
      ],
    }),
  },
  meta: { schema: metaSchema },
});

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
