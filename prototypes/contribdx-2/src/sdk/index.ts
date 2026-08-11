// The facade barrel: mirrors the real sdk `api/index.ts`, which imports the
// mirror module for its ambient merge so every consumer, sealed or not, gets
// the full registry automatically.
export * from "./contribution-slots";
export * from "./types";
