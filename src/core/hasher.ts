/**
 * SHA-256 hashing using the Web Crypto API.
 * Produces deterministic, salted hashes for deidentification.
 */

/**
 * Hash a single value with a salt using SHA-256.
 *
 * @param salt - The salt to prepend to the value
 * @param idSource - The identity source string to hash
 * @returns 64-character lowercase hex string of sha256(salt + idSource)
 */
export async function hashValue(salt: string, idSource: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + idSource);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash multiple values in batch using Promise.all for performance.
 *
 * @param salt - The salt to prepend to each value
 * @param idSources - Array of identity source strings to hash
 * @returns Array of 64-character lowercase hex strings, in the same order as input
 */
export async function hashBatch(salt: string, idSources: string[]): Promise<string[]> {
  return Promise.all(idSources.map((idSource) => hashValue(salt, idSource)));
}
