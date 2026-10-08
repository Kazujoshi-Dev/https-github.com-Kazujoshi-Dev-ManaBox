import path from 'path';
import { DbUser } from '../types';
import { withDb, readJsonFile, writeJsonAtomic, USERS_FILE, getUserDir } from '../storage';
import { mapUserRow } from '../mappers';
import { DEFAULT_CATALOGS } from '../schema';

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const cleanEmail = email.toLowerCase().trim();
  return withDb(
    async (p) => {
      const res = await p.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [cleanEmail]);
      return res.rows[0] ? mapUserRow(res.rows[0]) : null;
    },
    () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      return users.find((u) => u.email.toLowerCase() === cleanEmail) || null;
    }
  );
}

export async function getUserById(id: string): Promise<DbUser | null> {
  return withDb(
    async (p) => {
      const res = await p.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] ? mapUserRow(res.rows[0]) : null;
    },
    () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      return users.find((u) => u.id === id) || null;
    }
  );
}

export async function getUserByIdOrUsername(ref: string): Promise<DbUser | null> {
  const cleanRef = (ref || '').trim();
  const lowerRef = cleanRef.toLowerCase();
  return withDb(
    async (p) => {
      const res = await p.query(
        'SELECT * FROM users WHERE id = $1 OR LOWER(username) = $2 LIMIT 1',
        [cleanRef, lowerRef]
      );
      return res.rows[0] ? mapUserRow(res.rows[0]) : null;
    },
    () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      return users.find((u) => u.id === cleanRef || u.username.toLowerCase() === lowerRef) || null;
    }
  );
}

export async function updateUserPassword(
  email: string,
  passwordHash: string,
  salt: string
): Promise<DbUser | null> {
  const cleanEmail = email.toLowerCase().trim();
  return withDb(
    async (p) => {
      const res = await p.query(
        'UPDATE users SET password_hash = $1, salt = $2 WHERE email = $3 RETURNING *',
        [passwordHash, salt, cleanEmail]
      );
      return res.rows[0] ? mapUserRow(res.rows[0]) : null;
    },
    () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      const idx = users.findIndex((u) => u.email.toLowerCase() === cleanEmail);
      if (idx !== -1) {
        users[idx].password_hash = passwordHash;
        users[idx].salt = salt;
        writeJsonAtomic(USERS_FILE, users);
        return users[idx];
      }
      return null;
    }
  );
}

export async function createUser(
  id: string,
  email: string,
  username: string,
  passwordHash: string,
  salt: string
): Promise<DbUser> {
  const cleanEmail = email.toLowerCase().trim();
  const newUser: DbUser = {
    id,
    email: cleanEmail,
    username: username.trim(),
    password_hash: passwordHash,
    salt,
    created_at: new Date().toISOString()
  };

  return withDb(
    async (p) => {
      // Konto i startowe katalogi zapisujemy razem: błąd przy katalogach nie zostawi konta bez nich
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO users (id, email, username, password_hash, salt, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newUser.id, newUser.email, newUser.username, newUser.password_hash, newUser.salt, newUser.created_at]
        );
        for (const cat of DEFAULT_CATALOGS(id)) {
          await client.query(
            `INSERT INTO user_catalogs (id, user_id, name, description, color, is_default, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [cat.id, id, cat.name, cat.description, cat.color, cat.isDefault, cat.createdAt]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
      return newUser;
    },
    () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      users.push(newUser);
      writeJsonAtomic(USERS_FILE, users);

      const userDir = getUserDir(id);
      writeJsonAtomic(path.join(userDir, 'catalogs.json'), DEFAULT_CATALOGS(id));
      writeJsonAtomic(path.join(userDir, 'collection.json'), []);
      writeJsonAtomic(path.join(userDir, 'wishlist.json'), []);
      writeJsonAtomic(path.join(userDir, 'decks.json'), []);
      return newUser;
    }
  );
}

export async function getAllUsers(): Promise<Array<{ id: string; username: string; email: string; createdAt: string }>> {
  return withDb(
    async (p) => {
      const res = await p.query('SELECT id, username, email, created_at FROM users ORDER BY created_at DESC');
      return res.rows.map(r => ({
        id: r.id,
        username: r.username,
        email: r.email,
        createdAt: r.created_at || ''
      }));
    },
    () => {
      const users = readJsonFile<DbUser[]>(USERS_FILE, []);
      return users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        createdAt: u.created_at || ''
      }));
    }
  );
}
