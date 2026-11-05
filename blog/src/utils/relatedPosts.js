/**
 * Up to `limit` other posts sharing a tag with `post`, newest first.
 * @template {{ id: string, data: { tags: string[], pubDatetime: Date } }} P
 * @param {P} post
 * @param {P[]} posts
 * @returns {P[]}
 */
export function getRelatedPosts(post, posts, limit = 3) {
  const tags = new Set(post.data.tags);
  return posts
    .filter(p => p.id !== post.id && p.data.tags.some(t => tags.has(t)))
    .sort((a, b) => b.data.pubDatetime.getTime() - a.data.pubDatetime.getTime())
    .slice(0, limit);
}
