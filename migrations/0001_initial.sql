PRAGMA foreign_keys = ON;

CREATE TABLE captures (
    id TEXT PRIMARY KEY,

    source TEXT NOT NULL
        CHECK (source IN ('telegram', 'web', 'migration')),

    source_chat_id TEXT,
    source_message_id TEXT,
    source_user_id TEXT,

    raw_text TEXT NOT NULL DEFAULT '',

    raw_payload_json TEXT
        CHECK (
            raw_payload_json IS NULL
            OR json_valid(raw_payload_json)
        ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (
        source,
        source_chat_id,
        source_message_id
    )
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,

    name TEXT NOT NULL,
    description TEXT,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TEXT
);

CREATE TABLE items (
    id TEXT PRIMARY KEY,

    capture_id TEXT,
    parent_id TEXT,
    project_id TEXT,

    kind TEXT NOT NULL DEFAULT 'inbox'
        CHECK (
            kind IN (
                'inbox',
                'note',
                'task',
                'reference',
                'purchase',
                'print_job'
            )
        ),

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'waiting',
                'done',
                'archived',
                'cancelled'
            )
        ),

    title TEXT,
    body TEXT NOT NULL DEFAULT '',

    due_at TEXT,

    properties_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties_json)),

    position INTEGER NOT NULL DEFAULT 0,

    triaged_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT,

    version INTEGER NOT NULL DEFAULT 1
        CHECK (version >= 1),

    FOREIGN KEY (capture_id)
        REFERENCES captures(id)
        ON DELETE SET NULL,

    FOREIGN KEY (parent_id)
        REFERENCES items(id)
        ON DELETE SET NULL,

    FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE SET NULL
);

CREATE TABLE attachments (
    id TEXT PRIMARY KEY,

    capture_id TEXT,
    item_id TEXT,

    source TEXT NOT NULL,

    telegram_file_id TEXT,
    telegram_file_unique_id TEXT,

    file_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,

    storage_key TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        capture_id IS NOT NULL
        OR item_id IS NOT NULL
    ),

    FOREIGN KEY (capture_id)
        REFERENCES captures(id)
        ON DELETE CASCADE,

    FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE
);

CREATE TABLE item_revisions (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,

    item_version INTEGER NOT NULL,

    snapshot_json TEXT NOT NULL
        CHECK (json_valid(snapshot_json)),

    change_source TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE item_tags (
    item_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,

    PRIMARY KEY (item_id, tag_id),

    FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE,

    FOREIGN KEY (tag_id)
        REFERENCES tags(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_captures_created_at
    ON captures(created_at DESC);

CREATE INDEX idx_items_capture_id
    ON items(capture_id);

CREATE INDEX idx_items_parent_id
    ON items(parent_id);

CREATE INDEX idx_items_project_id
    ON items(project_id);

CREATE INDEX idx_items_kind
    ON items(kind);

CREATE INDEX idx_items_status
    ON items(status);

CREATE INDEX idx_items_triaged_at
    ON items(triaged_at);

CREATE INDEX idx_items_due_at
    ON items(due_at);

CREATE INDEX idx_items_deleted_at
    ON items(deleted_at);

CREATE INDEX idx_items_created_at
    ON items(created_at DESC);

CREATE INDEX idx_item_revisions_item_id
    ON item_revisions(item_id, created_at DESC);
