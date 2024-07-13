import { pino, type LevelWithSilentOrString } from "pino";
const logger = pino();

export function setMinLogLevel(level: LevelWithSilentOrString) {
  logger.level = level;
}

export default logger;
