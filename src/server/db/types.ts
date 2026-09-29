export interface DbUser {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string;
}
