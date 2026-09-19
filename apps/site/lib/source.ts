import { loader } from "fumadocs-core/source";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";

// The docs are content/docs/*.mdx with a title and a description in their
// frontmatter; meta.json beside them sets the reading order.
const docs = defineDocs({
  dir: "content/docs",
  docs: { schema: pageSchema },
  meta: { schema: metaSchema },
});

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
