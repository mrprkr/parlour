/// <reference types="vite/client" />

// The stylesheet is imported for its side effect and exports nothing, which
// TypeScript 7 wants told rather than inferred.
declare module "*.css" {}
