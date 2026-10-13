// Public settings only. Protected submissions use the deployed server workflow.
window.tenGrandVoiceSecurity = {
  enabled: true,
  endpoint: 'https://ten-grand-voices.laindoe.workers.dev', // e.g. https://ten-grand-voices.YOUR-SUBDOMAIN.workers.dev
  turnstileSiteKey: '0x4AAAAAAFUscJqeDfTYMOXJ', // Public site key, never the secret key.
  mediaEndpoint: 'https://ufsegzkdklwgizqkdayz.supabase.co/functions/v1/voices-media'
};
