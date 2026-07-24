# Graph Report - .  (2026-07-24)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 37 nodes · 54 edges · 9 communities (7 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6

## God Nodes (most connected - your core abstractions)
1. `main()` - 8 edges
2. `fetch_agency()` - 7 edges
3. `merge_all_cache_to_json()` - 5 edges
4. `index()` - 4 edges
5. `main()` - 4 edges
6. `get_db()` - 3 edges
7. `query_all()` - 3 edges
8. `post_form()` - 3 edges
9. `fetch_all_classes()` - 3 edges
10. `fetch_class_schedule()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `merge_all_cache_to_json()` --calls--> `jsave()`  [INFERRED]
  import_polycc.py → run_merge.py

## Import Cycles
- None detected.

## Communities (9 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.43
Nodes (6): build_grid(), get_db(), index(), print_view(), query_all(), query_one()

### Community 1 - "Community 1"
Cohesion: 0.43
Nodes (5): extract_options(), fetch_agency(), make_ttid(), post_form(), Fetch all data for one agency. Returns dict with all entity lists.

### Community 2 - "Community 2"
Cohesion: 0.67
Nodes (5): decode_display_cells(), fetch_all_classes(), fetch_class_schedule(), main(), post_form()

### Community 3 - "Community 3"
Cohesion: 0.40
Nodes (3): merge_all_cache_to_json(), Merge all cached agency data into per-type JSON files for backward compatibility, jsave()

### Community 4 - "Community 4"
Cohesion: 0.50
Nodes (4): ensure_db(), fetch_text(), main(), save_to_cache()

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `merge_all_cache_to_json()` connect `Community 3` to `Community 1`, `Community 4`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 4` to `Community 1`, `Community 3`, `Community 6`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `fetch_agency()` connect `Community 1` to `Community 4`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._