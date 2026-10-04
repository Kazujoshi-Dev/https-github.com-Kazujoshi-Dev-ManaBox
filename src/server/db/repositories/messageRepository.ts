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

// ---------- Ochrona przed spamem ----------

export interface SenderActivity {
  /** Wiadomości wysłane w ostatniej dobie. */
  sentDay: number;
  /** Różni odbiorcy w ostatniej dobie, z którymi nie było wcześniej rozmowy. */
  newRecipientsDay: number;
  /** Wiadomości do tego odbiorcy w ostatniej dobie. */
  toRecipientDay: number;
  /** Czy odbiorca kiedykolwiek pisał do nadawcy (trwająca rozmowa). */
  recipientReplied: boolean;
  /** Do ilu różnych odbiorców poszła ta sama treść w ostatniej dobie. */
  sameBodyRecipientsDay: number;
}

export async function getSenderActivity(senderId: string, recipientId: string, body: string): Promise<SenderActivity> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `WITH recent AS (
           SELECT recipient_id, body FROM user_messages
            WHERE sender_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
         ),
         partners AS (
           SELECT DISTINCT sender_id AS uid FROM user_messages WHERE recipient_id = $1
         ),
         earlier AS (
           SELECT DISTINCT recipient_id AS uid FROM user_messages
            WHERE sender_id = $1 AND created_at <= NOW() - INTERVAL '24 hours'
         )
         SELECT
           (SELECT COUNT(*) FROM recent)::int AS sent_day,
           (SELECT COUNT(DISTINCT r.recipient_id) FROM recent r
             WHERE r.recipient_id NOT IN (SELECT uid FROM partners)
               AND r.recipient_id NOT IN (SELECT uid FROM earlier))::int AS new_recipients_day,
           (SELECT COUNT(*) FROM recent WHERE recipient_id = $2)::int AS to_recipient_day,
           EXISTS (SELECT 1 FROM partners WHERE uid = $2) AS recipient_replied,
           (SELECT COUNT(DISTINCT recipient_id) FROM recent WHERE body = $3)::int AS same_body_day`,
        [senderId, recipientId, body]
      );
      const r = res.rows[0];
      return {
        sentDay: r.sent_day,
        newRecipientsDay: r.new_recipients_day,
        toRecipientDay: r.to_recipient_day,
        recipientReplied: Boolean(r.recipient_replied),
        sameBodyRecipientsDay: r.same_body_day
      };
    },
    () => {
      const all = readJsonFile<any[]>(MESSAGES_FILE, []);
      const since = Date.now() - 24 * 3600 * 1000;
      const recent = all.filter((m) => m.senderId === senderId && new Date(m.createdAt).getTime() > since);
      const partners = new Set(all.filter((m) => m.recipientId === senderId).map((m) => m.senderId));
      const earlier = new Set(all.filter((m) => m.senderId === senderId && new Date(m.createdAt).getTime() <= since).map((m) => m.recipientId));
      return {
        sentDay: recent.length,
        newRecipientsDay: new Set(recent.filter((m) => !partners.has(m.recipientId) && !earlier.has(m.recipientId)).map((m) => m.recipientId)).size,
        toRecipientDay: recent.filter((m) => m.recipientId === recipientId).length,
        recipientReplied: partners.has(recipientId),
        sameBodyRecipientsDay: new Set(recent.filter((m) => m.body === body).map((m) => m.recipientId)).size
      };
    }
  );
}

export async function isBlocked(userId: string, blockedId: string): Promise<boolean> {
  return withDb(
    async (p) => (await p.query('SELECT 1 FROM user_blocks WHERE user_id = $1 AND blocked_id = $2', [userId, blockedId])).rowCount! > 0,
    () => false
  );
}

export async function blockUser(userId: string, blockedId: string): Promise<void> {
  await withDb(
    async (p) => {
      await p.query('INSERT INTO user_blocks (user_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, blockedId]);
    },
    () => undefined
  );
}

export async function unblockUser(userId: string, blockedId: string): Promise<void> {
  await withDb(
    async (p) => {
      await p.query('DELETE FROM user_blocks WHERE user_id = $1 AND blocked_id = $2', [userId, blockedId]);
    },
    () => undefined
  );
}

export async function listBlocked(userId: string): Promise<Array<{ id: string; username: string; blockedAt: string }>> {
  return withDb(
    async (p) => {
      const res = await p.query(
        `SELECT u.id, u.username, b.created_at FROM user_blocks b JOIN users u ON u.id = b.blocked_id
          WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
        [userId]
      );
      return res.rows.map((r) => ({ id: r.id, username: r.username, blockedAt: new Date(r.created_at).toISOString() }));
    },
    () => []
  );
}
