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
  /** Brak pola (stare konta w plikach JSON) oznacza adres potwierdzony. */
  email_verified?: boolean;
}

/** Czy użytkownik potwierdził adres e-mail. */
export const isEmailVerified = (u: Pick<DbUser, 'email_verified'> | null | undefined): boolean => Boolean(u) && u!.email_verified !== false;
