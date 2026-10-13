// Public settings only. Leave disabled until the backend and cutover are tested.
window.tenGrandVoiceSecurity = {
  enabled: false,
  endpoint: 'https://ten-grand-voices.laindoe.workers.dev', // e.g. https://ten-grand-voices.YOUR-SUBDOMAIN.workers.dev
  turnstileSiteKey: '0x4AAAAAAFUscJqeDfTYMOXJ', // Public site key, never the secret key.
  mediaEndpoint: 'https://ufsegzkdklwgizqkdayz.supabase.co/functions/v1/voices-media'
};
