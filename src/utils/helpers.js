/**
 * Utility helpers for VaultMCP
 */

/**
 * Checks if a string is a valid HTTP/HTTPS URL.
 * @param {string} str 
 * @returns {boolean}
 */
export function isValidUrl(str) {
  try {
    const url = new URL(str.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * Extracts and cleans the hostname of a URL for display labels.
 * @param {string} urlString 
 * @returns {string}
 */
export function getCleanHostLabel(urlString) {
  try {
    const url = new URL(urlString.trim());
    const host = url.hostname.replace('www.', '');
    return host.split('.')[0].toUpperCase();
  } catch (_) {
    return 'URL';
  }
}

/**
 * Formats a Date object into DD.MMM.YYYY retro format.
 * @param {Date} date 
 * @returns {string}
 */
export function formatRetroDate(date) {
  return date
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/ /g, '.');
}
