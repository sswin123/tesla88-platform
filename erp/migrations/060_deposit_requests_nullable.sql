-- Migration 060: Make deposit_requests.provider and game_username nullable
--
-- API wallet integration removes the requirement to select a game provider
-- during deposit. New deposit flow: Select Bank → Upload Receipt → Submit →
-- ERP Approves → Credit Main Wallet. Provider selection is only in the
-- Game Account / Wallet Transfer module.
--
-- Legacy deposits retain their provider/game_username values.

DO $$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposit_requests'
        AND column_name = 'provider') = 'NO'
  THEN
    ALTER TABLE deposit_requests ALTER COLUMN provider DROP NOT NULL;
    RAISE NOTICE '[060] deposit_requests.provider: NOT NULL removed';
  ELSE
    RAISE NOTICE '[060] deposit_requests.provider: already nullable — skipped';
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'deposit_requests'
        AND column_name = 'game_username') = 'NO'
  THEN
    ALTER TABLE deposit_requests ALTER COLUMN game_username DROP NOT NULL;
    RAISE NOTICE '[060] deposit_requests.game_username: NOT NULL removed';
  ELSE
    RAISE NOTICE '[060] deposit_requests.game_username: already nullable — skipped';
  END IF;
END $$;
