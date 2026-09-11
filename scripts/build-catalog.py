#!/usr/bin/env python3
"""Regenerate lib/catalog.js from docs/GTS_Assignment_Catalog.json.

Edit the JSON (titles, scopes, evidence levels, new entries — keep IDs stable),
then run:  python3 scripts/build-catalog.py
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, 'docs', 'GTS_Assignment_Catalog.json')))
cats = [{'id': c['id'], 'name': c['name'], 'purpose': c['purpose'], 'fields': c['additional_log_fields'], 'resources': c['resource_types']} for c in d['categories']]
asg = [{'id': a['id'], 'cat': a['category_id'], 'title': a['title'], 'scope': a['scope'], 'evidence': a['completion_evidence'], 'level': a['evidence_level']} for a in d['assignments']]
inv = [{'id': t['id'], 'name': t['name'], 'examples': t['examples'], 'tracking': t['tracking'], 'attributes': t['attributes']} for t in d['inventory_type_templates']]
proj = [{'id': p['id'], 'name': p['name'], 'deliverable': p['deliverable'], 'done': p['done']} for p in d['project_backlog_templates']]
js = lambda v: json.dumps(v, ensure_ascii=False, indent=2)
out = f"""// ═══════════════════════════════════════════════════════════════════════════
//  GTS SERVICE CATALOG — generated from docs/GTS_Assignment_Catalog.json (v{d['schema_version']}, {d['prepared_on']})
//  {len(cats)} work areas · {len(asg)} assignment types · {len(inv)} inventory types · {len(proj)} projects
//  Evidence levels: core = established work area · discussed = previously
//  discussed request · proposed = suggested team process. All entries are
//  editable templates, not proof of an official service menu.
//  Regenerate with: python3 scripts/build-catalog.py
// ═══════════════════════════════════════════════════════════════════════════

export const CATALOG_META = {{ version: '{d['schema_version']}', preparedOn: '{d['prepared_on']}', department: {json.dumps(d['department'])} }};

export const EVIDENCE_LEVELS = {js(d['evidence_levels'])};

export const CATEGORIES = {js(cats)};

export const ASSIGNMENT_TYPES = {js(asg)};

export const INVENTORY_TYPES = {js(inv)};

export const PROJECT_TEMPLATES = {js(proj)};

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const ASSIGNMENT_BY_ID = Object.fromEntries(ASSIGNMENT_TYPES.map((a) => [a.id, a]));

export function assignmentsForCategory(catId) {{
  return ASSIGNMENT_TYPES.filter((a) => a.cat === catId);
}}

/** Full-text search across id, title, scope, evidence and category name. */
export function searchCatalog(query) {{
  const q = (query || '').trim().toLowerCase();
  if (!q) return ASSIGNMENT_TYPES;
  const terms = q.split(/\\s+/);
  return ASSIGNMENT_TYPES.filter((a) => {{
    const hay = `${{a.id}} ${{a.title}} ${{a.scope}} ${{a.evidence}} ${{CATEGORY_BY_ID[a.cat]?.name || ''}}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  }});
}}
"""
open(os.path.join(ROOT, 'lib', 'catalog.js'), 'w').write(out)
print(f'lib/catalog.js written: {len(cats)} areas, {len(asg)} types')
