import { MissingAnswerContributionService } from '@wordle-solver/solver';

/**
 * Reusable contribution service instance for the web application.
 * Defaults to the safe unconfigured provider in Stage 9B.
 */
export const webContributionService = new MissingAnswerContributionService();
