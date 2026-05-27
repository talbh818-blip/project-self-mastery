// Row shape of public.profiles. Keep in sync with migrations 0011 + 0012.
export type Theme = 'dark' | 'light';

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  theme: Theme;
  trees_planted: number;
  score_adjustment: number;
  blocked: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};
