-- Hand-written (see prisma/sql/constraints.sql): usernames are unique ignoring case.
-- Login still matches the exact spelling.
CREATE UNIQUE INDEX users_username_lower_key
  ON users (lower(username));
