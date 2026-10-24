import { MissingAnswerContributionService } from '@wordle-solver/solver';

/**
 * Reusable contribution service instance for the Chrome extension.
 * Defaults to the safe unconfigured provider in Stage 9B.
 */
export const extensionContributionService = new MissingAnswerContributionService();
