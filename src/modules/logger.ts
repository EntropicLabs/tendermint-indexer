import { pino, type LevelWithSilentOrString } from "pino";
const logger = pino();

/**
 * Updates the logger level for minimal or maximal logs
 * @param level pino log level (https://github.com/pinojs/pino/blob/main/docs/api.md#logger-level)
 */
export function setMinLogLevel(level: LevelWithSilentOrString) {
  logger.level = level;
}

export default logger;
