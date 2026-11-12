import DOMPurify from 'dompurify';

/**
 * Sanitize chatbot HTML responses to prevent Stored & DOM-based XSS attacks.
 * Whitelists safe structural tags and enforces safe links.
 */
export function sanitizeChatHtml(dirtyHtml: string): string {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';

  const clean = DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS: ['p', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'br', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ['target', 'rel'],
  });

  // Ensure external links have rel="noopener noreferrer"
  const parser = new DOMParser();
  const doc = parser.parseFromString(clean, 'text/html');
  const links = doc.querySelectorAll('a');
  links.forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return doc.body.innerHTML;
}

