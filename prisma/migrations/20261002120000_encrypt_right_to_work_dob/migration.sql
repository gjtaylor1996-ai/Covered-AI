-- Dob becomes text so it can hold AES-256-GCM ciphertext. Existing values are
-- carried over as YYYY-MM-DD plaintext; scripts/encrypt-right-to-work-data.js
-- encrypts them (and the other right-to-work columns) in place.
ALTER TABLE "worker_profiles"
  ALTER COLUMN "rightToWorkDob" TYPE TEXT
  USING to_char("rightToWorkDob", 'YYYY-MM-DD');
