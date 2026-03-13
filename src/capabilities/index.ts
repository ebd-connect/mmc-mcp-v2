export type { Capability, CapabilityContext, CapabilityResult } from "./capability.js";
export { CapabilityRegistry } from "./capability.js";
export { jsonReadCapability, jsonWriteCapability } from "./jsonCapabilities.js";

import { CapabilityRegistry } from "./capability.js";
import { jsonReadCapability, jsonWriteCapability } from "./jsonCapabilities.js";

/**
 * Create a CapabilityRegistry pre-loaded with the built-in json:read and json:write capabilities.
 * Additional capabilities can be registered on the returned instance before it is passed to
 * the ToolRegistry.
 */
export function createDefaultRegistry(): CapabilityRegistry {
  return new CapabilityRegistry().register(jsonReadCapability, jsonWriteCapability);
}
