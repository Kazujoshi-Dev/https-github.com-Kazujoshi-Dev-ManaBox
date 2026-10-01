import { UserMessage } from '../../../types';
import { withDb, readJsonFile, writeJsonAtomic, MESSAGES_FILE } from '../storage';
import { mapMessageRow } from '../mappers';

export async function getInbox(userId: string): Promise<UserMessage[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, sender_id, sender_username, recipient_id, recipient_username,
                subject, body, is_read, created_at
         FROM user_messages
         WHERE recipient_id = $1 AND deleted_by_recipient = FALSE
         ORDER BY created_at DESC`,
        [userId]
      );
      return res.rows.map(mapMessageRow);
    },
    () => {
      const all = readJsonFile<any[]>(MESSAGES_FILE, []);
      return all
        .filter((m) => m.recipientId === userId && !m.deletedByRecipient)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(mapMessageRow);
    }
  );
}

export async function getSent(userId: string): Promise<UserMessage[]> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT id, sender_id, sender_username, recipient_id, recipient_username,
                subject, body, is_read, created_at
         FROM user_messages
         WHERE sender_id = $1 AND deleted_by_sender = FALSE
         ORDER BY created_at DESC`,
        [userId]
      );
      return res.rows.map(mapMessageRow);
    },
    () => {
      const all = readJsonFile<any[]>(MESSAGES_FILE, []);
      return all
        .filter((m) => m.senderId === userId && !m.deletedBySender)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(mapMessageRow);
    }
  );
}

export async function getUnreadCount(userId: string): Promise<number> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT COUNT(*) FROM user_messages
         WHERE recipient_id = $1 AND is_read = FALSE AND deleted_by_recipient = FALSE`,
        [userId]
      );
      return parseInt(res.rows[0]?.count || '0', 10);
    },
    () => {
      const all = readJsonFile<any[]>(MESSAGES_FILE, []);
      return all.filter((m) => m.recipientId === userId && !m.isRead && !m.deletedByRecipient).length;
    }
  );
}

export async function sendMessage(msg: UserMessage): Promise<UserMessage> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `INSERT INTO user_messages (
          id, sender_id, sender_username, recipient_id, recipient_username,
          subject, body, is_read, deleted_by_sender, deleted_by_recipient, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, FALSE, $9)
        RETURNING id, sender_id, sender_username, recipient_id, recipient_username,
                  subject, body, is_read, created_at`,
        [
          msg.id,
          msg.senderId,
          msg.senderUsername,
          msg.recipientId,
          msg.recipientUsername,
          msg.subject,
          msg.body,
          false,
          msg.createdAt || new Date().toISOString()
        ]
      );
      return mapMessageRow(res.rows[0]);
    },
    () => {
      const all = readJsonFile<any[]>(MESSAGES_FILE, []);
      const newEntry = {
        id: msg.id,
        senderId: msg.senderId,
        senderUsername: msg.senderUsername,
        recipientId: msg.recipientId,
        recipientUsername: msg.recipientUsername,
        subject: msg.subject,
        body: msg.body,
        isRead: false,
        deletedBySender: false,
        deletedByRecipient: false,
        createdAt: msg.createdAt || new Date().toISOString()
      };
      all.unshift(newEntry);
      writeJsonAtomic(MESSAGES_FILE, all);
      return mapMessageRow(newEntry);
    }
  );
}

export async function markAsRead(userId: string, messageId: string): Promise<boolean> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `UPDATE user_messages SET is_read = TRUE
         WHERE id = $1 AND recipient_id = $2`,
        [messageId, userId]
      );
      return (res.rowCount ?? 0) > 0;
    },
    () => {
      const all = readJsonFile<any[]>(MESSAGES_FILE, []);
      const target = all.find((m) => m.id === messageId && m.recipientId === userId);
      if (target) {
        target.isRead = true;
        writeJsonAtomic(MESSAGES_FILE, all);
        return true;
      }
      return false;
    }
  );
}

export async function markAllAsRead(userId: string): Promise<boolean> {
  return withDb(
    async (p) => {
      await p.query(
        `UPDATE user_messages SET is_read = TRUE
         WHERE recipient_id = $1 AND deleted_by_recipient = FALSE`,
        [userId]
      );
      return true;
    },
    () => {
      const all = readJsonFile<any[]>(MESSAGES_FILE, []);
      let changed = false;
      all.forEach((m) => {
        if (m.recipientId === userId && !m.deletedByRecipient && !m.isRead) {
          m.isRead = true;
          changed = true;
        }
      });
      if (changed) writeJsonAtomic(MESSAGES_FILE, all);
      return true;
    }
  );
}

export async function deleteMessage(userId: string, messageId: string): Promise<boolean> {
  return withDb(
    async (p) => {
      await p.query(
        `UPDATE user_messages
         SET deleted_by_recipient = CASE WHEN recipient_id = $1 THEN TRUE ELSE deleted_by_recipient END,
             deleted_by_sender = CASE WHEN sender_id = $1 THEN TRUE ELSE deleted_by_sender END
         WHERE id = $2 AND (recipient_id = $1 OR sender_id = $1)`,
        [userId, messageId]
      );
      await p.query(
        `DELETE FROM user_messages WHERE id = $1 AND deleted_by_sender = TRUE AND deleted_by_recipient = TRUE`,
        [messageId]
      );
      return true;
    },
    () => {
      const all = readJsonFile<any[]>(MESSAGES_FILE, []);
      const idx = all.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        const m = all[idx];
        if (m.recipientId === userId) m.deletedByRecipient = true;
        if (m.senderId === userId) m.deletedBySender = true;
        if (m.deletedByRecipient && m.deletedBySender) {
          all.splice(idx, 1);
        }
        writeJsonAtomic(MESSAGES_FILE, all);
        return true;
      }
      return false;
    }
  );
}
