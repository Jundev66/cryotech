/**
 * Moved to `common/search` when the web listings started needing the same
 * matching the bot has always used. Re-exported here so the resolvers keep
 * their import path.
 */
export { similarity, normalize, rankByName, type Scored } from '../../../common/search/fuzzy.util';
