import logger from "../modules/logger";

const isString = (value: any): value is string =>
  typeof value === "string" || value instanceof String;

export default function parseStringToInt(data: any): number | null {
  try {
    if (!isString(data)) {
      return null;
    }

    return parseInt(data, 10);
  } catch (error) {
    logger.error(`Error in parseStringToInt()`, error);
    return null;
  }
}
