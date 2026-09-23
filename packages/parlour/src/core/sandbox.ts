/**
 * Whether this process is inside the macOS App Sandbox, which is where the
 * Mac App Store build of the app runs Parlour. macOS sets
 * `APP_SANDBOX_CONTAINER_ID` in the environment of every sandboxed process,
 * and a child inherits both the sandbox and the variable from the app.
 *
 * Inside the sandbox there is no launchd to install into, no Homebrew to run
 * and no Keychain through `security`: HOME is the app's container, the tools
 * are the ones the app carries, and the app itself is what keeps Parlour
 * running. The few places that behave differently ask this, rather than each
 * guessing from a failure.
 */
export function sandboxed(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.APP_SANDBOX_CONTAINER_ID);
}

/** Said wherever something a sandboxed build cannot do is asked for. */
export const SANDBOXED_SERVICES =
  "This copy of Parlour runs inside the App Store app's sandbox, which keeps it running itself. There is no LaunchAgent to manage.";
