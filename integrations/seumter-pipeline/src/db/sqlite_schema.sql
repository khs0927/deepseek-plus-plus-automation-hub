-- SQLite Schema for Seumter Automation Hub
CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    project_title TEXT NOT NULL,
    architect_office TEXT DEFAULT '건축사사무소 지음',
    architect_name TEXT DEFAULT '이동희',
    business_number TEXT DEFAULT '604-08-99164',
    site_area REAL NOT NULL,
    building_area REAL NOT NULL,
    gross_floor_area REAL NOT NULL,
    bcr REAL GENERATED ALWAYS AS (ROUND((building_area / site_area) * 100.0, 2)) STORED,
    far REAL GENERATED ALWAYS AS (ROUND((gross_floor_area / site_area) * 100.0, 2)) STORED,
    floors_above INTEGER NOT NULL,
    floors_below INTEGER NOT NULL,
    use_type TEXT NOT NULL,
    zone_type TEXT NOT NULL,
    status TEXT DEFAULT 'DRAFT',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS floors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    floor_name TEXT NOT NULL,
    area REAL NOT NULL,
    use_type TEXT NOT NULL,
    structure TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    category TEXT NOT NULL,
    law_code TEXT NOT NULL,
    status TEXT NOT NULL,
    comment TEXT NOT NULL,
    tier INTEGER NOT NULL,
    resolved_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seumter_payloads (
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    version INTEGER DEFAULT 1,
    raw_config TEXT NOT NULL,
    status TEXT DEFAULT 'READY',
    PRIMARY KEY (project_id, version)
);
