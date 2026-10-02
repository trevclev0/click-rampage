// Worker entry: the Hono app handles fetch; Durable Object classes must be
// exported from this module so the runtime can find them.
export { default } from "@worker/app";
export { Room } from "@worker/durable-objects/Room";
