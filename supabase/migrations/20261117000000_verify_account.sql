-- ============================================================================
-- One-off authorized data migration: verify a specific user account.
-- ---
-- Requested by the account owner (mhhashim433@gmail.com). SMTP is not
-- configured in the deployed environment, so the verification email cannot
-- be delivered; the owner has explicitly authorized marking this account
-- verified. Idempotent and scoped to a single email with no collateral
-- changes to other users.
-- ============================================================================
UPDATE users
   SET email_verified = true
 WHERE email = 'mhhashim433@gmail.com';
