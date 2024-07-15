const isString = (value: any): value is string =>
  typeof value === "string" || value instanceof String;

export default function parseStringToInt(data: any): number | null {
  if (!isString(data)) {
    return null;
  }

  return parseInt(data, 10);
}
