export { emitAccentColour } from "./assets.ts";
/**
 * The design system as a module, for anything in the workspace that wants the
 * values rather than the generated stylesheet. The surfaces themselves read
 * the generated files; this is for scripts, tests and documentation.
 */
export { cssBanner, emitCss } from "./css.ts";
export { emitSwift, swiftBanner } from "./swift.ts";
export * from "./tokens.ts";
