use serde_yaml::Value;
use super::cas;
use super::gm_dir;
use super::memorize;
use super::yaml_util::{invalidate_residual_marker, levenshtein, yaml_to_json};
use crate::pkfs;

pub fn mutables_path() -> std::path::PathBuf {
    gm_dir().join("mutables.yml")
}

fn extract_depends_on(map: &serde_yaml::Mapping) -> Vec<String> {
    map.get(&Value::String("depends_on".to_string()))
        .and_then(|v| v.as_sequence())
        .map(|seq| seq.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

fn find_cycle(start_id: &str, deps: &std::collections::HashMap<String, Vec<String>>) -> Option<Vec<String>> {
    let mut path: Vec<String> = vec![start_id.to_string()];
    let mut on_path: std::collections::HashSet<String> = std::collections::HashSet::new();
    on_path.insert(start_id.to_string());

    fn walk(
        node: &str,
        deps: &std::collections::HashMap<String, Vec<String>>,
        path: &mut Vec<String>,
        on_path: &mut std::collections::HashSet<String>,
    ) -> Option<Vec<String>> {
        let Some(children) = deps.get(node) else { return None };
        for child in children {
            if on_path.contains(child) {
                let mut cycle = path.clone();
                cycle.push(child.clone());
                return Some(cycle);
            }
            path.push(child.clone());
            on_path.insert(child.clone());
            if let Some(c) = walk(child, deps, path, on_path) {
                return Some(c);
            }
            path.pop();
            on_path.remove(child);
        }
        None
    }

    walk(start_id, deps, &mut path, &mut on_path)
}

pub fn handle_add(content: &str) -> (String, String, i32) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return (String::new(), "missing body".to_string(), 1);
    }
    let new_item: Value = match serde_yaml::from_str::<Value>(trimmed) {
        Ok(v) => v,
        Err(_) => match serde_json::from_str::<serde_json::Value>(trimmed)
            .ok()
            .and_then(|j| serde_yaml::to_value(j).ok()) {
            Some(v) => v,
            None => return (String::new(), "parse failed".to_string(), 1),
        },
    };
    let map = match new_item.as_mapping() {
        Some(m) => m.clone(),
        None => return (String::new(), "item must be a mapping".to_string(), 1),
    };
    let id = map.get(&Value::String("id".to_string()))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("mut-{}", crate::orchestrator::state::now_ms()));
    let new_depends_on = extract_depends_on(&map);
    let path = mutables_path();
    let path_s = path.to_string_lossy().to_string();
    let policy = super::fsm::graph().policy;

    let outcome = cas::cas_retry_write(&path_s, policy.cas_max_attempts, "mutable-add", |mut doc: Value| {
        if !new_depends_on.is_empty() {
            let mut deps: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
            if let Some(seq) = doc.as_sequence() {
                for item in seq {
                    if let Some(m) = item.as_mapping() {
                        if let Some(existing_id) = m.get(&Value::String("id".to_string())).and_then(|v| v.as_str()) {
                            deps.insert(existing_id.to_string(), extract_depends_on(m));
                        }
                    }
                }
            }
            deps.insert(id.clone(), new_depends_on.clone());
            if let Some(cycle) = find_cycle(&id, &deps) {
                return cas::CasOutcome::Abort(
                    String::new(),
                    format!("mutable-add rejected: depends_on introduces a cycle: {}", cycle.join(" -> ")),
                    1,
                );
            }
        }
        if let Some(seq) = doc.as_sequence_mut() {
            let mut new_with_id = map.clone();
            new_with_id.insert(Value::String("id".to_string()), Value::String(id.clone()));
            if !new_with_id.contains_key(&Value::String("status".to_string())) {
                new_with_id.insert(Value::String("status".to_string()), Value::String(policy.mutables_default_status.clone()));
            }
            seq.push(Value::Mapping(new_with_id));
        } else {
            return cas::CasOutcome::Abort(String::new(), "mutables.yml is not a sequence".to_string(), 1);
        }
        cas::CasOutcome::Write(doc, ())
    });
    if let Err((out, err, rc)) = outcome {
        return (out, err, rc);
    }
    invalidate_residual_marker();
    #[cfg(target_arch = "wasm32")]
    crate::wasm_dispatch::emit_event("mutable.added", serde_json::json!({ "id": id }));
    (serde_json::json!({ "added": id }).to_string(), String::new(), 0)
}

pub fn handle_list(_content: &str) -> (String, String, i32) {
    let path = mutables_path();
    let path_s = path.to_string_lossy().to_string();
    if !pkfs::exists(&path_s) {
        return (serde_json::json!({ "items": [] }).to_string(), String::new(), 0);
    }
    let raw = pkfs::read_to_string(&path_s).unwrap_or_default();
    let doc: Value = match serde_yaml::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return (String::new(), format!("parse failed: {}", e), 1),
    };
    let items: Vec<serde_json::Value> = doc.as_sequence().map(|seq| {
        seq.iter().filter_map(|v| {
            let m = v.as_mapping()?;
            let mut out = serde_json::Map::new();
            for (k, val) in m {
                if let Some(ks) = k.as_str() {
                    out.insert(ks.to_string(), yaml_to_json(val));
                }
            }
            Some(serde_json::Value::Object(out))
        }).collect()
    }).unwrap_or_default();
    (serde_json::json!({ "items": items }).to_string(), String::new(), 0)
}

pub const PROVE_OBLIGATION_KINDS: &[&str] = &["precondition", "invariant", "postcondition", "resource-bound", "type-shape"];
pub const STATE_OBLIGATION_KINDS: &[&str] = &["totality", "ownership", "replay", "effect-boundary"];
pub const CONC_OBLIGATION_KINDS: &[&str] = &["happens-before", "disjointness", "contention"];
pub const SEC_OBLIGATION_KINDS: &[&str] = &["secrets", "injection", "identity-authority", "message-timing"];
pub const RES_OBLIGATION_KINDS: &[&str] = &["exception-model", "partial-failure", "degradation", "crucible"];

pub fn all_obligation_kinds() -> Vec<&'static str> {
    PROVE_OBLIGATION_KINDS.iter()
        .chain(STATE_OBLIGATION_KINDS.iter())
        .chain(CONC_OBLIGATION_KINDS.iter())
        .chain(SEC_OBLIGATION_KINDS.iter())
        .chain(RES_OBLIGATION_KINDS.iter())
        .copied()
        .collect()
}

pub fn all_typed() -> bool {
    obligations_ready(PROVE_OBLIGATION_KINDS).is_ok()
}

pub fn obligations_ready(kinds: &[&str]) -> Result<(), Vec<String>> {
    let pending = pending_detailed();
    let pending_ids: std::collections::HashSet<String> = pending.iter()
        .filter_map(|item| item.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();
    let unclassified_rows_belong_to_prove = kinds == PROVE_OBLIGATION_KINDS;

    let mut blockers = Vec::new();
    for item in &pending {
        let obligation_kind = item.get("obligation_kind").and_then(|v| v.as_str());
        let in_scope = match obligation_kind {
            Some(k) => kinds.contains(&k),
            None => unclassified_rows_belong_to_prove,
        };
        if !in_scope {
            continue;
        }
        let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("<no-id>");
        match obligation_kind {
            None => blockers.push(format!("{} has no obligation_kind", id)),
            Some(k) if !all_obligation_kinds().contains(&k) => {
                blockers.push(format!("{} has unrecognized obligation_kind '{}'", id, k));
            }
            _ => {}
        }
        let depends_on = item.get("depends_on")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
            .unwrap_or_default();
        let unresolved_deps: Vec<&str> = depends_on.iter().filter(|d| pending_ids.contains(**d)).copied().collect();
        if !unresolved_deps.is_empty() {
            blockers.push(format!("{} blocked on unresolved depends_on: {}", id, unresolved_deps.join(", ")));
        }
    }
    if blockers.is_empty() { Ok(()) } else { Err(blockers) }
}

pub fn state_obligations_ready() -> bool { obligations_ready(STATE_OBLIGATION_KINDS).is_ok() }
pub fn conc_obligations_ready() -> bool { obligations_ready(CONC_OBLIGATION_KINDS).is_ok() }
pub fn sec_obligations_ready() -> bool { obligations_ready(SEC_OBLIGATION_KINDS).is_ok() }
pub fn res_obligations_ready() -> bool { obligations_ready(RES_OBLIGATION_KINDS).is_ok() }

pub fn obligations_blocker_message(kinds: &[&str]) -> String {
    match obligations_ready(kinds) {
        Ok(()) => String::new(),
        Err(blockers) => blockers.join("; "),
    }
}

fn mutable_blocked_external(item: &serde_yaml::Value) -> bool {
    item.get("blockedBy")
        .and_then(|v| v.as_sequence())
        .map(|seq| seq.iter().any(|x| matches!(x.as_str(), Some("external") | Some("out-of-reach"))))
        .unwrap_or(false)
}

pub fn pending_detailed() -> Vec<serde_json::Value> {
    let path = mutables_path();
    let path_s = path.to_string_lossy().to_string();
    if !pkfs::exists(&path_s) {
        return Vec::new();
    }
    let raw = match pkfs::read_to_string(&path_s) {
        Some(s) => s,
        None => return Vec::new(),
    };
    let doc: Value = match serde_yaml::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    let policy = super::fsm::graph().policy;
    let resolved_statuses = policy.mutables_resolved_statuses;
    if let Some(seq) = doc.as_sequence() {
        for item in seq {
            let status = item.get("status").and_then(|v| v.as_str()).unwrap_or(&policy.mutables_default_status);
            if !resolved_statuses.iter().any(|s| s == status) && !mutable_blocked_external(item) {
                if let Some(m) = item.as_mapping() {
                    let mut obj = serde_json::Map::new();
                    for (k, v) in m {
                        if let Some(ks) = k.as_str() {
                            obj.insert(ks.to_string(), yaml_to_json(v));
                        }
                    }
                    out.push(serde_json::Value::Object(obj));
                }
            }
        }
    }
    out
}

pub fn handle_resolve(content: &str) -> (String, String, i32) {
    let raw_trimmed = content.trim();
    if raw_trimmed.is_empty() {
        return (String::new(), "missing mutable id in body".to_string(), 1);
    }

    let (id_str, inline_evidence, measured_value): (String, Option<String>, Option<f64>) = match serde_json::from_str::<serde_json::Value>(raw_trimmed) {
        Ok(serde_json::Value::Object(map)) => {
            let id = map.get("mutable_id")
                .or_else(|| map.get("id"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| raw_trimmed.to_string());
            let evidence = map.get("witness_evidence")
                .or_else(|| map.get("evidence"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string());
            let measured = map.get("measured_value").and_then(|v| v.as_f64());
            (id, evidence, measured)
        }
        Ok(serde_json::Value::String(s)) => (s, None, None),
        _ => (raw_trimmed.to_string(), None, None),
    };
    let trimmed = id_str.as_str();

    let path = mutables_path();
    let path_s = path.to_string_lossy().to_string();
    if !pkfs::exists(&path_s) {
        return (String::new(), format!("{} does not exist", path.display()), 1);
    }
    let policy = super::fsm::graph().policy;

    let outcome = cas::cas_retry_write(&path_s, policy.cas_max_attempts, "mutable-resolve", |mut doc: Value| {
        let mut found_id = false;
        let mut resolved_id: Option<String> = None;
        let mut resolved_evidence: Option<String> = None;

        let resolved_statuses = policy.mutables_resolved_statuses.clone();
        let mut unresolved_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        if let Some(seq) = doc.as_sequence() {
            for item in seq {
                if let Some(m) = item.as_mapping() {
                    let status = m.get(&Value::String("status".to_string())).and_then(|v| v.as_str()).unwrap_or(&policy.mutables_default_status);
                    if !resolved_statuses.iter().any(|s| s == status) {
                        if let Some(iid) = m.get(&Value::String("id".to_string())).and_then(|v| v.as_str()) {
                            unresolved_ids.insert(iid.to_string());
                        }
                    }
                }
            }
        }

        if let Some(seq) = doc.as_sequence_mut() {
            for item in seq.iter_mut() {
                if let Some(map) = item.as_mapping_mut() {
                    let id_match = map
                        .get(&Value::String("id".to_string()))
                        .and_then(|v| v.as_str())
                        .map(|s| s == trimmed)
                        .unwrap_or(false);
                    if id_match {
                        let depends_on = extract_depends_on(map);
                        let blockers: Vec<&String> = depends_on.iter()
                            .filter(|d| unresolved_ids.contains(*d) && d.as_str() != trimmed)
                            .collect();
                        if !blockers.is_empty() {
                            let names: Vec<String> = blockers.into_iter().cloned().collect();
                            return cas::CasOutcome::Abort(
                                String::new(),
                                format!(
                                    "mutable-resolve refused: {} depends_on unresolved id(s): {} -- resolve those first.",
                                    trimmed, names.join(", ")
                                ),
                                1,
                            );
                        }
                        let row_kind = map.get(&Value::String("obligation_kind".to_string())).and_then(|v| v.as_str());
                        let row_bound = map.get(&Value::String("bound".to_string())).and_then(|v| v.as_f64());
                        if row_kind == Some("resource-bound") {
                            if let (Some(bound), Some(measured)) = (row_bound, measured_value) {
                                if measured > bound {
                                    return cas::CasOutcome::Abort(
                                        String::new(),
                                        format!(
                                            "mutable-resolve refused: {} is a resource-bound obligation with bound={}, but measured_value={} exceeds it -- the claim does not hold, resolve with a corrected implementation or a corrected bound.",
                                            trimmed, bound, measured
                                        ),
                                        1,
                                    );
                                }
                            }
                        }
                        found_id = true;
                        let row_evidence: Option<String> = map
                            .get(&Value::String("witness_evidence".to_string()))
                            .and_then(|v| v.as_str())
                            .or_else(|| {
                                map.get(&Value::String("evidence".to_string()))
                                    .and_then(|v| v.as_str())
                            })
                            .map(|s| s.to_string())
                            .filter(|s| !s.trim().is_empty());
                        let row_had_evidence = row_evidence.is_some();
                        let evidence = row_evidence.or_else(|| inline_evidence.clone()).unwrap_or_default();
                        if policy.mutables_require_witness_evidence && evidence.trim().is_empty() {
                            let msg = format!(
                                "Refused: mutable {} cannot be witnessed without evidence. Pass {{\"mutable_id\":\"{}\",\"witness_evidence\":\"<concrete proof>\"}} in the body, or add evidence to the .gm/mutables.yml row first.",
                                trimmed, trimmed
                            );
                            return cas::CasOutcome::Abort(String::new(), msg, 1);
                        }
                        if !row_had_evidence && !evidence.trim().is_empty() {
                            map.insert(
                                Value::String("witness_evidence".to_string()),
                                Value::String(evidence.clone()),
                            );
                        }
                        map.insert(
                            Value::String("status".to_string()),
                            Value::String(policy.mutables_witness_status.clone()),
                        );
                        resolved_id = Some(trimmed.to_string());
                        resolved_evidence = Some(evidence);
                    }
                }
            }
        }

        if !found_id {
            let mut candidates: Vec<(String, usize)> = Vec::new();
            if let Some(seq) = doc.as_sequence() {
                for item in seq.iter() {
                    if let Some(id) = item
                        .as_mapping()
                        .and_then(|m| m.get(&Value::String("id".to_string())))
                        .and_then(|v| v.as_str())
                    {
                        let d = levenshtein(trimmed, id);
                        candidates.push((id.to_string(), d));
                    }
                }
            }
            candidates.sort_by_key(|c| c.1);
            let hint = if candidates.is_empty() {
                String::from(" (no mutables in file)")
            } else {
                let near: Vec<String> = candidates.iter().take(3).map(|c| c.0.clone()).collect();
                format!(" -- did you mean one of: {}", near.join(", "))
            };
            return cas::CasOutcome::Abort(String::new(), format!("mutable id not found: {}{}", trimmed, hint), 1);
        }

        cas::CasOutcome::Write(doc, (resolved_id, resolved_evidence))
    });
    let (resolved_id, resolved_evidence) = match outcome {
        Ok(v) => v,
        Err((out, err, rc)) => return (out, err, rc),
    };

    let evidence_body = resolved_evidence.clone().unwrap_or_else(|| format!("mutable {} resolved", trimmed));
    let memo = format!(
        "## Resolved mutable: {}\n\n{}\n",
        resolved_id.as_deref().unwrap_or(""),
        evidence_body
    );
    let memo_body = serde_json::json!({ "text": memo, "namespace": "default" }).to_string();
    let (memo_stdout, _memo_stderr, memo_rc) = memorize::handle_fire(&memo_body);
    let memo_written: serde_json::Value = if memo_rc == 0 {
        serde_json::from_str(&memo_stdout).unwrap_or(serde_json::Value::Null)
    } else {
        serde_json::Value::Null
    };

    #[cfg(target_arch = "wasm32")]
    crate::wasm_dispatch::emit_event("mutable.resolved", serde_json::json!({ "id": resolved_id }));
    let payload = serde_json::json!({
        "resolved": resolved_id,
        "memorize_write": memo_written,
    });
    (payload.to_string(), String::new(), 0)
}

/// Mark an EXISTING, already-tracked mutable `blockedBy: ["external"]` so
/// `pending_detailed()` (the `mutables-all-resolved` COMPLETE-gate predicate, and the
/// `mutables_pending` list surfaced by `instruction`) stops treating it as an open row
/// blocking CONSOLIDATE -- without resolving it, which would falsely claim the unknown is
/// answered. Mirrors `prd::handle_defer` exactly: a mutable inherited from a prior,
/// unrelated session (a cross-session investigation with no fix available this session,
/// or a one-way-door decision only a human can make -- a credential, a history rewrite,
/// a product call) has no escape from `mutables-all-resolved` today even though the
/// equivalent PRD-row case already does via `prd-defer`, which is the exact asymmetry
/// that made the CONSOLIDATE gate's `prd-all-closed`+`mutables-all-resolved`+
/// `residual-scan-fired` triple unsatisfiable whenever a session inherited a genuinely
/// out-of-scope mutable: PRD could be emptied via `prd-defer`, but the mutable had no
/// matching move and stayed permanently pending. Same deviation gate as prd-defer/
/// prd-add: `reason` must name the actual concrete reach path, not bare deferral
/// language, so this cannot become a second "declare it externally blocked" exit.
pub fn handle_defer(content: &str) -> (String, String, i32) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return (String::new(), "missing body: {\"id\": \"<mutable-id>\", \"reason\": \"<why this is genuinely out of reach this session, and what session/path would resolve it>\"}".to_string(), 1);
    }
    let v: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return (String::new(), "parse failed: body must be JSON {\"id\":..,\"reason\":..}".to_string(), 1),
    };
    let id_target = match v.get("id").or_else(|| v.get("mutable_id")).or_else(|| v.get("slug")).and_then(|s| s.as_str()) {
        Some(s) if !s.trim().is_empty() => s.to_string(),
        _ => return (String::new(), "missing `id`".to_string(), 1),
    };
    let reason = match v.get("reason").or_else(|| v.get("witness_evidence")).and_then(|s| s.as_str()) {
        Some(s) if !s.trim().is_empty() => s.to_string(),
        _ => return (String::new(), "missing `reason`: name why this row is genuinely out of reach this session and what would resolve it -- bare deferral language is rejected, same as mutable-add/prd-defer".to_string(), 1),
    };
    if let Some(marker) = super::yaml_util::defer_marker_in_text(&reason) {
        let err = format!(
            "mutable-defer refused: deferral language detected ('{}'). Same rule as prd-defer's own gate -- name the concrete reason this is genuinely cross-session/out-of-reach (e.g. 'flaky multiplayer repro needs its own dedicated debugging session, unrelated to this session's rendering-pipeline fix'), not bare 'later'/'next session' phrasing with no substance.",
            marker
        );
        return (String::new(), err, 1);
    }
    let path = mutables_path();
    let path_s = path.to_string_lossy().to_string();
    if !pkfs::exists(&path_s) {
        return (String::new(), format!("{} does not exist", path.display()), 1);
    }
    let policy = super::fsm::graph().policy;
    let outcome = cas::cas_retry_write(&path_s, policy.cas_max_attempts, "mutable-defer", |mut doc: Value| {
        let mut found = false;
        if let Some(seq) = doc.as_sequence_mut() {
            for item in seq.iter_mut() {
                if let Some(map) = item.as_mapping_mut() {
                    if map.get(&Value::String("id".to_string())).and_then(|v| v.as_str()) == Some(&id_target) {
                        map.insert(
                            Value::String("blockedBy".to_string()),
                            Value::Sequence(vec![Value::String("external".to_string())]),
                        );
                        map.insert(Value::String("deferReason".to_string()), Value::String(reason.clone()));
                        found = true;
                    }
                }
            }
        }
        if !found {
            let body = serde_json::json!({
                "error": format!("mutable id not found: {}", id_target),
                "deviation_kind": "mutable-defer-unknown-id",
                "deviation_severity": "deny",
                "mutable_id": id_target,
            }).to_string();
            return cas::CasOutcome::Abort(body, format!("mutable id not found: {}", id_target), 1);
        }
        cas::CasOutcome::Write(doc, ())
    });
    match outcome {
        Ok(()) => {
            invalidate_residual_marker();
            #[cfg(target_arch = "wasm32")]
            crate::wasm_dispatch::emit_event("mutable.deferred", serde_json::json!({ "id": id_target, "reason": reason }));
            (serde_json::json!({ "deferred": id_target, "blockedBy": ["external"] }).to_string(), String::new(), 0)
        }
        Err((out, err, rc)) => (out, err, rc),
    }
}
