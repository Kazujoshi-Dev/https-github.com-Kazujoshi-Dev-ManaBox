/**
 * Foldery w zakładce „Sprzedam”: podział oferty na grupy, każda z własnym publicznym linkiem
 * (/sprzedam/<nazwa>/<slug>). Zbiorczy link /sprzedam/<nazwa> nadal pokazuje wszystkie karty.
 *
 * Karta trafia do folderu przez kolumnę user_collections.sale_folder_id (NULL = lista domyślna).
 * Kolumna celowo nie ma klucza obcego: przywrócona kopia kolekcji może wskazywać folder,
 * którego już nie ma, i wtedy karta po prostu wraca na listę domyślną.
 */
import crypto from 'crypto';
import { CollectionItem } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, userGameFile } from '../storage';
import { DEFAULT_GAME, type GameId } from '../../../games';

export interface SaleFolder {
  id: string;
  name: string;
  slug: string;
  position: number;
  createdAt: string;
}

export const SALE_FOLDER_NAME_MAX = 60;
export const SALE_FOLDERS_MAX = 50;

export class SaleFolderError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const SLUG_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'; // bez znaków łatwych do pomylenia
/** Losowy fragment linku: link folderu nie jest do zgadnięcia (np. oferta dla jednej osoby). */
function newSlug(): string {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => SLUG_CHARS[b % SLUG_CHARS.length]).join('');
}

export function cleanFolderName(name: unknown): string {
  const v = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
  if (!v) throw new SaleFolderError('Podaj nazwę folderu.');
  if (v.length > SALE_FOLDER_NAME_MAX) throw new SaleFolderError(`Nazwa folderu może mieć najwyżej ${SALE_FOLDER_NAME_MAX} znaków.`);
  return v;
}

function mapRow(r: any): SaleFolder {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    position: Number(r.position) || 0,
    createdAt: new Date(r.created_at ?? r.createdAt).toISOString()
  };
}

const foldersFile = (userId: string, game: GameId) => userGameFile(userId, 'sale_folders', game);
const collectionFile = (userId: string, game: GameId) => userGameFile(userId, 'collection', game);
const sortFolders = (list: SaleFolder[]) => [...list].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));

export async function getSaleFolders(userId: string, game: GameId = DEFAULT_GAME): Promise<SaleFolder[]> {
  return withDb(
    async (p) => {
      const res = await p.query('SELECT * FROM sale_folders WHERE user_id = $1 AND game = $2 ORDER BY position, created_at', [userId, game]);
      return res.rows.map(mapRow);
    },
    () => sortFolders(readJsonFile<SaleFolder[]>(foldersFile(userId, game), []))
  );
}

export async function createSaleFolder(userId: string, rawName: unknown, game: GameId = DEFAULT_GAME): Promise<SaleFolder> {
  const name = cleanFolderName(rawName);
  const existing = await getSaleFolders(userId, game);
  if (existing.length >= SALE_FOLDERS_MAX) throw new SaleFolderError(`Możesz mieć najwyżej ${SALE_FOLDERS_MAX} folderów.`);
  const folder: SaleFolder = {
    id: `sf-${crypto.randomUUID()}`,
    name,
    slug: newSlug(),
    position: existing.reduce((m, f) => Math.max(m, f.position), 0) + 1,
    createdAt: new Date().toISOString()
  };
  return withDb(
    async (p) => {
      await p.query(
        'INSERT INTO sale_folders (id, user_id, name, slug, position, created_at, game) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [folder.id, userId, folder.name, folder.slug, folder.position, folder.createdAt, game]
      );
      return folder;
    },
    () => {
      writeJsonAtomic(foldersFile(userId, game), [...readJsonFile<SaleFolder[]>(foldersFile(userId, game), []), folder]);
      return folder;
    }
  );
}

export async function renameSaleFolder(userId: string, id: string, rawName: unknown, game: GameId = DEFAULT_GAME): Promise<SaleFolder | null> {
  const name = cleanFolderName(rawName);
  return withDb(
    async (p) => {
      const res = await p.query('UPDATE sale_folders SET name = $1 WHERE id = $2 AND user_id = $3 AND game = $4 RETURNING *', [name, id, userId, game]);
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
    () => {
      const list = readJsonFile<SaleFolder[]>(foldersFile(userId, game), []);
      const f = list.find((x) => x.id === id);
      if (!f) return null;
      f.name = name;
      writeJsonAtomic(foldersFile(userId, game), list);
      return f;
    }
  );
}

/** Usuwa folder; jego karty wracają na domyślną listę „Sprzedam” (nadal są na sprzedaż). */
export async function deleteSaleFolder(userId: string, id: string, game: GameId = DEFAULT_GAME): Promise<boolean> {
  return withDb(
    async (p) => {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query('DELETE FROM sale_folders WHERE id = $1 AND user_id = $2 AND game = $3', [id, userId, game]);
        await client.query('UPDATE user_collections SET sale_folder_id = NULL WHERE user_id = $1 AND sale_folder_id = $2', [userId, id]);
        await client.query('COMMIT');
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    () => {
      const list = readJsonFile<SaleFolder[]>(foldersFile(userId, game), []);
      const next = list.filter((x) => x.id !== id);
      if (next.length === list.length) return false;
      writeJsonAtomic(foldersFile(userId, game), next);
      const items = readJsonFile<CollectionItem[]>(collectionFile(userId, game), []);
      for (const i of items) if (i.saleFolderId === id) i.saleFolderId = null;
      writeJsonAtomic(collectionFile(userId, game), items);
      return true;
    }
  );
}

/**
 * Przenosi karty z oferty do folderu (albo na listę domyślną, gdy folderId = null).
 * Zmienia tylko pozycje tego użytkownika, które są na sprzedaż. Zwraca id przeniesionych pozycji.
 */
export async function moveItemsToSaleFolder(userId: string, itemIds: string[], folderId: string | null, game: GameId = DEFAULT_GAME): Promise<string[]> {
  const ids = [...new Set(itemIds.filter((x) => typeof x === 'string' && x.length <= 100))].slice(0, 2000);
  if (!ids.length) return [];
  if (folderId !== null) {
    const folders = await getSaleFolders(userId, game);
    if (!folders.some((f) => f.id === folderId)) throw new SaleFolderError('Nie znaleziono folderu.', 404);
  }
  return withDb(
    async (p) => {
      const res = await p.query(
        `UPDATE user_collections SET sale_folder_id = $1
          WHERE user_id = $2 AND game = $4 AND id = ANY($3::text[]) AND COALESCE(is_for_sale, FALSE)
          RETURNING id`,
        [folderId, userId, ids, game]
      );
      return res.rows.map((r: any) => r.id);
    },
    () => {
      const items = readJsonFile<CollectionItem[]>(collectionFile(userId, game), []);
      const wanted = new Set(ids);
      const moved: string[] = [];
      for (const i of items) {
        if (wanted.has(i.id) && i.isForSale) {
          i.saleFolderId = folderId;
          moved.push(i.id);
        }
      }
      writeJsonAtomic(collectionFile(userId, game), items);
      return moved;
    }
  );
}
