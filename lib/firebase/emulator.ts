/**
 * Project id the local Firebase emulators run under.
 *
 * `demo-` prefixed ids are reserved by Firebase for emulator use: the CLI
 * refuses to deploy to them and the SDKs can never reach a real project with
 * one, so a stray `firebase deploy` from this repo cannot push the deny-all
 * emulator rules to production. The browser SDK, the Admin SDK, the seed
 * script and the `emulators` npm script must all agree on this value — Auth
 * tokens carry the project id and the server verifies it.
 */
export const EMULATOR_PROJECT_ID = "demo-lhr-recruiting";
