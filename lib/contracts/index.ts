/**
 * PRD-00 shared contracts barrel. The single source of truth for every shape
 * that crosses a module boundary. Any cross-module type is added HERE first,
 * then imported — never re-declared locally.
 */
export * from "./coerce";
export * from "./transactions";
export * from "./ingest";
export * from "./memory";
export * from "./receipts";
export * from "./tools";
export * from "./chat";
