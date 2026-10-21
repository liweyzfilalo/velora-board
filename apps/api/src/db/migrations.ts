/** Ordered, append-only list of schema migrations. */
export const migrations: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: /* sql */ `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email         text NOT NULL UNIQUE,
        name          text NOT NULL,
        color         text NOT NULL,
        password_hash text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE boards (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title       text NOT NULL,
        owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invite_code text NOT NULL UNIQUE,
        created_at  timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE board_members (
        board_id  uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role      text NOT NULL CHECK (role IN ('owner', 'member')),
        joined_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (board_id, user_id)
      );
      CREATE INDEX board_members_user_idx ON board_members(user_id);

      CREATE TABLE lists (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id   uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        title      text NOT NULL,
        position   double precision NOT NULL,
        version    integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lists_board_position_idx ON lists(board_id, position);

      CREATE TABLE cards (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id    uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        list_id     uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        title       text NOT NULL,
        description text NOT NULL DEFAULT '',
        position    double precision NOT NULL,
        version     integer NOT NULL DEFAULT 1,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX cards_list_position_idx ON cards(list_id, position);
      CREATE INDEX cards_board_idx ON cards(board_id);

      CREATE TABLE messages (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id   uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content    text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX messages_board_created_idx ON messages(board_id, created_at DESC);
    `,
  },
  {
    // Used by @socket.io/postgres-adapter for payloads too large for NOTIFY.
    id: "002_socket_io_attachments",
    sql: /* sql */ `
      CREATE TABLE IF NOT EXISTS socket_io_attachments (
        id         bigserial UNIQUE,
        created_at timestamptz DEFAULT now(),
        payload    bytea
      );
    `,
  },
];
