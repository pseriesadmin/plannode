#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Merge two plannode.tree JSON documents (stdlib only). NOW-TREE-JSON-06.

- Normalizes each input: lifts node_type=global mirror rows (plannodeGlobalRootKey) to root keys,
  same spirit as Plannode export / plannodeTreeV1.
- Merges project, root global_* / tech_stack / … blobs, and nodes by id with explicit preferences.
"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

FORMAT_NAME = "plannode.tree"

# Must match src/lib/plannodeTreeV1.ts PLANNODE_GLOBAL_ROOT_MIRROR_SPECS rootKey list
GLOBAL_ROOT_KEYS: Tuple[str, ...] = (
    "global_schema",
    "global_api",
    "global_module",
    "tech_stack",
    "schema_notes",
    "_import_lock",
)

# plannodeTreeV1.ts — 집계 미러 metadata.plannodeGlobalRootKey (NOW-TREE-JSON-09)
UNKNOWN_ROOTS_AGG_KEY = "__unknown_roots__"
PROJECT_EXTRAS_KEY = "__project_extras__"


def _die(msg: str, code: int = 1) -> None:
    sys.stderr.write(msg.rstrip() + "\n")
    raise SystemExit(code)


def load_tree(path: Path) -> Dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as e:
        _die(f"read failed: {path}: {e}")
    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as e:
        _die(f"invalid JSON: {path}: {e}")
    if not isinstance(doc, dict):
        _die(f"root must be object: {path}")
    if doc.get("format") != FORMAT_NAME:
        _die(f"format must be {FORMAT_NAME!r}: {path}")
    if not isinstance(doc.get("nodes"), list):
        _die(f"nodes must be array: {path}")
    ver = doc.get("version")
    if not isinstance(ver, int) or ver < 1 or ver > 5:
        _die(f"version must be integer 1..5: {path}")
    if not isinstance(doc.get("project"), dict):
        _die(f"project must be object: {path}")
    return doc


def is_global_mirror_row(row: Any) -> bool:
    if not isinstance(row, dict):
        return False
    if str(row.get("node_type") or "").strip() != "global":
        return False
    meta = row.get("metadata")
    if not isinstance(meta, dict):
        return False
    k = meta.get("plannodeGlobalRootKey")
    return isinstance(k, str) and len(k.strip()) > 0


def ingest_root_global_blobs(doc: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k in GLOBAL_ROOT_KEYS:
        if k in doc:
            out[k] = deepcopy(doc[k])
    return out


def rehoist_globals_from_nodes(
    nodes: List[Any],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """Strip synthetic global mirror nodes; return (plain_nodes, root_key_blobs, project_field_extras)."""
    plain: List[Dict[str, Any]] = []
    blobs: Dict[str, Any] = {}
    project_extras: Dict[str, Any] = {}
    for row in nodes:
        if not isinstance(row, dict):
            continue
        if is_global_mirror_row(row):
            meta = row["metadata"]
            assert isinstance(meta, dict)
            key = str(meta["plannodeGlobalRootKey"]).strip()
            payload = deepcopy(meta.get("plannodeGlobalPayload"))
            if key == UNKNOWN_ROOTS_AGG_KEY:
                if isinstance(payload, dict):
                    for k2, v2 in payload.items():
                        blobs[k2] = deepcopy(v2)
            elif key == PROJECT_EXTRAS_KEY:
                if isinstance(payload, dict):
                    for k2, v2 in payload.items():
                        project_extras[k2] = deepcopy(v2)
            else:
                blobs[key] = payload
        else:
            plain.append(deepcopy(row))
    return plain, blobs, project_extras


def normalize_document(doc: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]]:
    """
    Root global keys + any mirrored globals in nodes → single blob map.
    Nodes list has mirror rows removed. project dict includes fields from __project_extras__ mirror.
    """
    proj = deepcopy(doc["project"])
    root_blobs = ingest_root_global_blobs(doc)
    nodes_raw = doc.get("nodes") or []
    if not isinstance(nodes_raw, list):
        _die("nodes must be array")
    plain, from_nodes, project_extras = rehoist_globals_from_nodes(nodes_raw)
    for k, v in from_nodes.items():
        root_blobs[k] = v
    for k, v in project_extras.items():
        proj[k] = v
    return root_blobs, plain, proj


def merge_root_blobs(
    base: Dict[str, Any], incoming: Dict[str, Any], prefer: str
) -> Dict[str, Any]:
    keys = set(base) | set(incoming)
    out: Dict[str, Any] = {}
    first, second = (incoming, base) if prefer == "incoming" else (base, incoming)
    for k in sorted(keys):
        if k in first:
            out[k] = deepcopy(first[k])
        elif k in second:
            out[k] = deepcopy(second[k])
    return out


def merge_nodes(
    base_nodes: List[Dict[str, Any]],
    incoming_nodes: List[Dict[str, Any]],
    prefer: str,
) -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []

    def add_list(rows: List[Dict[str, Any]], *, is_base: bool) -> None:
        for row in rows:
            if not isinstance(row, dict):
                continue
            nid = str(row.get("id") or "").strip()
            if not nid:
                continue
            if nid not in by_id:
                by_id[nid] = deepcopy(row)
                order.append(nid)
                continue
            if prefer == "incoming" and not is_base:
                by_id[nid] = deepcopy(row)
            elif prefer == "base" and is_base:
                by_id[nid] = deepcopy(row)

    if prefer == "incoming":
        add_list(base_nodes, is_base=True)
        add_list(incoming_nodes, is_base=False)
    else:
        add_list(incoming_nodes, is_base=False)
        add_list(base_nodes, is_base=True)

    return [by_id[i] for i in order]


def merge_normalized_project(
    base_proj: Dict[str, Any], incoming_proj: Dict[str, Any], prefer: str
) -> Dict[str, Any]:
    return deepcopy(incoming_proj if prefer == "incoming" else base_proj)


def build_output(
    base: Dict[str, Any],
    incoming: Dict[str, Any],
    *,
    prefer_project: str,
    prefer_nodes: str,
    prefer_globals: str,
) -> Dict[str, Any]:
    bg, bn, bp = normalize_document(base)
    ig, inn, ip = normalize_document(incoming)
    merged_globals = merge_root_blobs(bg, ig, prefer_globals)
    merged_nodes = merge_nodes(bn, inn, prefer_nodes)
    project = merge_normalized_project(bp, ip, prefer_project)
    v1 = int(base["version"])
    v2 = int(incoming["version"])
    out_ver = max(v1, v2)
    if out_ver > 5:
        out_ver = 5
    exported = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    out: Dict[str, Any] = {
        "format": FORMAT_NAME,
        "version": out_ver,
        "exportedAt": exported,
        "project": project,
        "nodes": merged_nodes,
    }
    out.update(merged_globals)
    return out


def main() -> None:
    p = argparse.ArgumentParser(
        description="Merge two plannode.tree JSON files (stdlib only).",
    )
    p.add_argument("--base", required=True, type=Path, help="Plannode or canonical tree JSON (local)")
    p.add_argument("--incoming", required=True, type=Path, help="Second tree (e.g. Claude export)")
    p.add_argument("-o", "--output", required=True, type=Path, help="Write merged JSON here")
    p.add_argument(
        "--prefer-project",
        choices=("base", "incoming"),
        default="base",
        help="Which file's `project` object wins entirely (default: base).",
    )
    p.add_argument(
        "--prefer-nodes",
        choices=("base", "incoming"),
        default="incoming",
        help="On duplicate node id, which row wins (default: incoming).",
    )
    p.add_argument(
        "--prefer-globals",
        choices=("base", "incoming"),
        default="incoming",
        help="On duplicate root global_* / tech_stack / … key, which side wins (default: incoming).",
    )
    args = p.parse_args()

    base_doc = load_tree(args.base)
    inc_doc = load_tree(args.incoming)
    merged = build_output(
        base_doc,
        inc_doc,
        prefer_project=args.prefer_project,
        prefer_nodes=args.prefer_nodes,
        prefer_globals=args.prefer_globals,
    )
    try:
        args.output.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError as e:
        _die(f"write failed: {args.output}: {e}")
    print(f"Wrote {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
