-- Fix 1: Production correction for MEGA888 APP (MEGAAPP) wallet_type
--
-- Root cause: Brand Center General Tab save (PATCH /api/brands/[code]/providers/[providerCode])
-- overwrote brand_providers.wallet_type from TRANSFER to SEAMLESS after Migration 089 ran correctly.
--
-- Run this on Production DB to restore the correct runtime value:

UPDATE brand_providers
SET    wallet_type = 'TRANSFER',
       updated_at  = NOW()
WHERE  brand_id    = (SELECT id FROM brands        WHERE code = 'TESLA88')
  AND  provider_id = (SELECT id FROM gp_providers  WHERE code = 'MEGAAPP');

-- Verify: should return 1 row with wallet_type = 'TRANSFER'
SELECT bp.wallet_type, b.code AS brand_code, p.code AS provider_code, bp.updated_at
FROM   brand_providers bp
JOIN   brands       b ON b.id = bp.brand_id
JOIN   gp_providers p ON p.id = bp.provider_id
WHERE  b.code = 'TESLA88'
  AND  p.code = 'MEGAAPP';
