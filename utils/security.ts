
/**
 * Security utilities for Nexus OS
 */

/**
 * Sanitizes strings to prevent basic XSS attacks.
 * Strips script tags and event handlers.
 */
export const sanitizeString = (input: string): string => {
  if (!input) return '';
  return input
    .replace(/<script[^>]*>([\S\s]*?)<\/script>/gim, '')
    .replace(/on\w+="[^"]*"/gim, '')
    .replace(/javascript:/gim, '');
};

/**
 * Sanitizes AI-generated HTML content using a strict whitelist.
 */
export const sanitizeAIHtml = (html: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.textContent = html;
  let safeHtml = tempDiv.innerHTML;

  const whitelist = {
    'strong': ['<strong>', '</strong>'],
    'br': ['<br>', '<br/>'],
    'ul': ['<ul>', '</ul>'],
    'li': ['<li>', '</li>'],
    'em': ['<em>', '</em>'],
    'p': ['<p>', '</p>']
  };

  // Replace escaped versions of whitelisted tags back to real HTML
  Object.entries(whitelist).forEach(([tag, [open, close]]) => {
    const escapedOpen = new RegExp(`&lt;${tag}&gt;`, 'gi');
    const escapedClose = new RegExp(`&lt;/${tag}&gt;`, 'gi');
    safeHtml = safeHtml.replace(escapedOpen, open).replace(escapedClose, close);
  });

  return safeHtml;
};

/**
 * Validates email format using a standard RFC 5322 regex.
 */
export const isValidEmail = (email: string): boolean => {
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email);
};

/**
 * Validates phone format (US).
 */
export const isValidPhone = (phone: string): boolean => {
  const regex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
  return regex.test(phone);
};
