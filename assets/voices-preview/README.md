# Voices Heard design fixtures

The 16 fictional entries in voices.json cover all four existing roles, both
response types, and photo/no-photo combinations. The portrait is the existing
site director photo, reused solely as a layout sample. Audio is synthetic speech
generated locally with FFmpeg/libflite; it is not an actual submission.

/voices-preview/ renders these fixtures through the normal Community Wall card
components without loading a Supabase client, verifying CAPTCHA, uploading files,
or creating submission records. Preview numbers exist only in this JSON file.

Keep these fixtures for future branding work. Before the official launch, remove
the real test submissions, related security/session records and uploaded media
using Supabase Storage's API or dashboard, then reset the official campaign-number
sequence to start at 1. Approve the owner's real, scanned entry first. Do not reset
the sequence while numbered test records remain. These fixtures need no reset.
