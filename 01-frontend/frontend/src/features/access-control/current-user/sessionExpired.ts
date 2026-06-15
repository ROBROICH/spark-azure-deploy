const SESSION_EXPIRED_EVENT = 'spark:session-expired';

export function emitSessionExpired(): void {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

export function subscribeSessionExpired(handler: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);

  return () => {
    window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  };
}
