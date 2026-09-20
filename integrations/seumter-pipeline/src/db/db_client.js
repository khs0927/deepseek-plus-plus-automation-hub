/**
 * Database client abstraction
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

class DbClient {
  constructor(dbPath = "/tmp/seumter_local.db") {
    this.dbPath = dbPath;
    this.initSchema();
  }

  initSchema() {
    const schemaFile = path.join(__dirname, "sqlite_schema.sql");
    const script = `
import sqlite3
conn = sqlite3.connect("${this.dbPath}")
with open("${schemaFile}", "r", encoding="utf-8") as f:
    conn.executescript(f.read())
conn.close()
`;
    execSync("python3 -c '" + script + "'");
  }

  saveProject(project) {
    const pId = project.project_id || project.project_meta?.project_id || "PRJ-DEFAULT";
    const pTitle = project.project_title || project.project_meta?.project_title || "부산 사하구 근생 신축";
    const script = `
import sqlite3
conn = sqlite3.connect("${this.dbPath}")
cur = conn.cursor()
cur.execute("""
INSERT OR REPLACE INTO projects 
(project_id, project_title, architect_office, architect_name, business_number, site_area, building_area, gross_floor_area, floors_above, floors_below, use_type, zone_type, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (
  "${pId}",
  "${pTitle}",
  "건축사사무소 지음",
  "이동희",
  "604-08-99164",
  ${project.site_overview?.site_area_sqm || 330.5},
  ${project.building_overview?.building_area_sqm || 165.2},
  ${project.building_overview?.gross_floor_area_sqm || 495.6},
  ${project.building_overview?.floors_above || 3},
  ${project.building_overview?.floors_below || 0},
  "${project.building_overview?.main_usage || '제2종근린생활시설'}",
  "${project.site_overview?.zoning_primary || '제2종일반주거지역'}",
  "READY"
))
conn.commit()
conn.close()
`;
    execSync("python3 -c '" + script + "'");
    return { success: true, projectId: pId };
  }

  getProject(projectId) {
    const script = `
import sqlite3, json
conn = sqlite3.connect("${this.dbPath}")
conn.row_factory = sqlite3.Row
cur = conn.cursor()
row = cur.execute("SELECT * FROM projects WHERE project_id = ?", ("${projectId}",)).fetchone()
conn.close()
if row:
    print(json.dumps(dict(row), ensure_ascii=False))
else:
    print("{}")
`;
    const out = execSync("python3 -c '" + script + "'").toString();
    return JSON.parse(out);
  }
}

module.exports = { DbClient };
