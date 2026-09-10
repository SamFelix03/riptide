/** Stringify bigints for JSON request bodies (Strategy objects, etc.). */
export function serializeForJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeForJson(v)]));
  }
  return value;
}
