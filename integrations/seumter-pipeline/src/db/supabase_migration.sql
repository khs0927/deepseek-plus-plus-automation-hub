-- Supabase PostgreSQL Migration
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS projects (
    project_id VARCHAR(50) PRIMARY KEY,
    project_title VARCHAR(200) NOT NULL,
    architect_office VARCHAR(100) DEFAULT '건축사사무소 지음',
    architect_name VARCHAR(50) DEFAULT '이동희',
    business_number VARCHAR(20) DEFAULT '604-08-99164',
    site_area NUMERIC(10, 2) NOT NULL,
    building_area NUMERIC(10, 2) NOT NULL,
    gross_floor_area NUMERIC(10, 2) NOT NULL,
    bcr NUMERIC(5, 2) GENERATED ALWAYS AS (ROUND((building_area / site_area) * 100.0, 2)) STORED,
    far NUMERIC(5, 2) GENERATED ALWAYS AS (ROUND((gross_floor_area / site_area) * 100.0, 2)) STORED,
    floors_above INT NOT NULL,
    floors_below INT NOT NULL,
    use_type VARCHAR(100) NOT NULL,
    zone_type VARCHAR(100) NOT NULL,
    status VARCHAR(30) DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS precedent_embeddings (
    id VARCHAR(50) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    statutory_reference TEXT NOT NULL,
    seumter_pleading_sample TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_precedents_embedding ON precedent_embeddings USING hnsw (embedding vector_cosine_ops);
