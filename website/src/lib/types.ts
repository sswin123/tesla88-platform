export interface MemberJWTPayload {
  sub: number;
  phone: string;
  first_name: string;
}

export interface WebsiteSettings {
  site_brand_name: string;
  site_primary_color: string;
  site_logo_media_id: string;
  site_banner_text: string;
  site_banner_media_id: string;
  site_contact_email: string;
  site_contact_phone: string;
  site_seo_title: string;
  site_seo_description: string;
  site_terms_url: string;
  website_enabled: string;
}

export interface MemberProfile {
  id: number;
  public_id: string | null;
  first_name: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  bank_holder_name: string;
  status: string;
  total_deposit: string;
  total_withdraw: string;
  total_bonus: string;
  net_deposit: string;
  available_balance: string;
  pending_withdrawal: string;
  referral_code: string | null;
  referral_count: number;
  referred_by: number | null;
  created_at: string;
  last_seen_at: string | null;
  // Active bonus (from bonus_claims — optional, present only when member has an active promo)
  active_bonus_id?:           number | null;
  active_promo_name?:         string | null;
  active_bonus_amount?:       string | null;
  active_turnover_required?:  string | null;
  active_turnover_completed?: string | null;
}

export interface PublicPromotion {
  id: number;
  name: string;
  description: string | null;
  promotion_type: string;
  bonus_type: string;
  bonus_value: string;
  min_deposit: string;
  max_bonus: string | null;
  turnover_multiplier: string;
  expiry_date: string | null;
}

export interface ApkVersion {
  id: number;
  version_name: string;
  version_code: number;
  release_notes: string | null;
  media_id: number | null;
  min_android: string;
  is_current: boolean;
  force_update: boolean;
  download_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  sender_type: 'USER' | 'AGENT';
  message_type: string;
  content: string | null;
  caption: string | null;
  created_at: string;
  reply_to_message_id: number | null;
  reply_to_content: string | null;
  reply_to_sender_type: string | null;
}

export interface ChatSession {
  id: number;
  status: string;
  created_at: string;
}
