export interface DbUser {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
  banned_until?: string | null;
  ban_permanent?: boolean;
  ban_reason?: string | null;
  must_change_password?: boolean;
  sale_hidden?: boolean;
}
