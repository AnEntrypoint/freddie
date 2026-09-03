use serde_yaml::Value;
use super::cas;
use super::gm_dir;
use super::yaml_util::{defer_marker_in_text, invalidate_residual_marker, levenshtein, yaml_to_json};
use crate::pkfs;

pub fn prd_path() -> std::path::PathBuf {
    gm_dir().join("prd.yml")
}

pub fn prd_path_for(cwd: Option<&str>) -> std::path::PathBuf {
    match cwd {
        Some(c) => std::path::Path::new(c).join(".gm").join("prd.yml"),
        None => prd_path(),
    }
}

pub fn peek_pending_commit_comments(cwd: Option<&str>) -> Vec<(String, String)> {
    let path = prd_path_for(cwd);
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
    if let Some(seq) = doc.as_sequence() {
        for item in seq {
            if let Some(map) = item.as_mapping() {
                let status = map.get(&Value::String("status".to_string())).and_then(|v| v.as_str()).unwrap_or("");
                let comment = map.get(&Value::String("commit_comment".to_string())).and_then(|v| v.as_str());
                if !status_is_open(status) {
                    if let Some(c) = comment {
                        if !c.trim().is_empty() {
                            let id = map.get(&Value::String("id".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                            out.push((id, c.trim().to_string()));
                        }
                    }
                }
            }
        }
    }
    out
}

pub fn drain_pending_commit_comments(cwd: Option<&str>) -> Vec<(String, String)> {
    let path = prd_path_for(cwd);
    let path_s = path.to_string_lossy().to_string();
    if !pkfs::exists(&path_s) {
        return Vec::new();
    }
    let mut drained: Vec<(String, String)> = Vec::new();
    let cas_max_attempts = super::fsm::graph().policy.cas_max_attempts;
    let _ = cas::cas_retry_write(&path_s, cas_max_attempts, "prd-drain-commit-comments", |mut doc: Value| {
        drained.clear();
        if let Some(seq) = doc.as_sequence_mut() {
            seq.retain(|item| {
                let Some(map) = item.as_mapping() else { return true };
                let status = map.get(&Value::String("status".to_string())).and_then(|v| v.as_str()).unwrap_or("");
                if status_is_open(status) {
                    return true;
                }
                let id = map.get(&Value::String("id".to_string())).and_then(|v| v.as_str()).unwrap_or("").to_string();
                let comment = map.get(&Value::String("commit_comment".to_string())).and_then(|v| v.as_str())
                    .map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
                if let Some(c) = comment {
                    drained.push((id, c));
                }
                false
            });
        }
        cas::CasOutcome::Write(doc, ())
    });
    drained
}

pub fn status_is_open(status: &str) -> bool {
    let normalized = status.trim().to_ascii_lowercase();
    !super::fsm::graph().policy.prd_closed_statuses.iter().any(|s| s.eq_ignore_ascii_case(&normalized))
}

fn subject_from_fields(item_map: &serde_yaml::Mapping) -> &str {
    ["subject", "title", "name", "task", "goal", "description", "notes"]
        .iter()
        .find_map(|f| item_map.get(&Value::String(f.to_string()))
            .and_then(|v| v.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty()))
        .unwrap_or("")
}

fn slug_from_subject(subject: &str) -> Option<String> {
    let s = subject.trim();
    if s.is_empty() { return None; }
    let mut out = String::with_capacity(s.len());
    let mut prev_dash = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') { out.pop(); }
    if out.is_empty() { return None; }
    if out.len() > 64 { out.truncate(64); while out.ends_with('-') { out.pop(); } }
    Some(out)
}

pub fn handle_list(_content: &str) -> (String, String, i32) {
    let path = prd_path();
    let path_s = path.to_string_lossy().to_string();
    if !pkfs::exists(&path_s) {
        return (serde_json::json!({ "items": [], "count": 0 }).to_string(), String::new(), 0);
    }
    let raw = match pkfs::read_to_string(&path_s) {
        Some(s) => s,
        None => return (String::new(), "read failed".to_string(), 1),
    };
    let doc: Value = match serde_yaml::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return (String::new(), format!("parse failed: {}", e), 1),
    };
    let seq = doc.as_sequence().cloned()
        .or_else(|| doc.get("items").and_then(|v| v.as_sequence()).cloned())
        .unwrap_or_default();
    let items: Vec<serde_json::Value> = seq.iter().filter_map(|item| {
        let m = item.as_mapping()?;
        let mut out = serde_json::Map::new();
        for (k, v) in m {
            if let Some(ks) = k.as_str() {
                out.insert(ks.to_string(), yaml_to_json(v));
            }
        }
        Some(serde_json::Value::Object(out))
    }).collect();
    let count = items.len();
    (serde_json::json!({ "items": items, "count": count }).to_string(), String::new(), 0)
}


pub fn handle_add(content: &str) -> (String, String, i32) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return (String::new(), "missing body: provide PRD item as JSON or YAML".to_string(), 1);
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
    let item_map = match new_item.as_mapping() {
        Some(m) => m.clone(),
        None => return (String::new(), "item must be a mapping with id/subject/status".to_string(), 1),
    };
    let has_external_block = item_map.get(&Value::String("blockedBy".to_string()))
        .and_then(|v| v.as_sequence())
        .map(|seq| seq.iter().any(|x| matches!(x.as_str(), Some("external") | Some("out-of-reach"))))
        .unwrap_or(false);
    if !has_external_block {
        let mut scan_buf = String::new();
        for field in &["description", "subject", "notes"] {
            if let Some(s) = item_map.get(&Value::String(field.to_string())).and_then(|v| v.as_str()) {
                scan_buf.push_str(s);
                scan_buf.push('\n');
            }
        }
        if let Some(marker) = defer_marker_in_text(&scan_buf) {
            let err = format!(
                "PRD item rejected: deferral language detected ('{}'). Per §22 Fix on Sight and §17 Maximal Cover, in-spirit reachable work must be executed this turn, not deferred. Everything is fixable: drop the deferral phrasing and either execute this turn, or -- if the fix depends on something outside the tree -- rescope the row to the concrete reach action that builds past it (drive the crashing tool's protocol directly, spawn your own instance, open the cross-repo change, script the credential path) and execute THAT. There is no 'declare it externally blocked' exit; `blockedBy` may only transiently carry the reach path while it is being built.",
                marker
            );
            return (String::new(), err, 1);
        }
    }
    let provided_id = item_map.get(&Value::String("id".to_string()))
        .or_else(|| item_map.get(&Value::String("slug".to_string())))
        .or_else(|| item_map.get(&Value::String("prd_id".to_string())))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let subject_str = subject_from_fields(&item_map);
    let slug = if provided_id.is_none() { slug_from_subject(subject_str) } else { None };
    if provided_id.is_none() && slug.is_none() {
        #[cfg(target_arch = "wasm32")]
        crate::wasm_dispatch::emit_event("deviation.prd-add-no-id", serde_json::json!({
            "subject": subject_str,
            "hint": "Pass `id` in prd-add body. No usable text in any of id/slug/prd_id or subject/title/name/task/goal/description/notes -- every one was empty or unslugifiable, so the row was REJECTED. An item-<ms> fallback cannot be referenced by intent in recall or prd-resolve, so it is never admitted. Pass `id` directly, or put the intent in any of subject/title/name/task/goal/description so slug derivation succeeds.",
        }));
        let err = "PRD item rejected: no usable `id` and no slugifiable text in subject/title/name/task/goal/description/notes. A referenceable handle is mandatory -- every later prd-resolve / recall names the row by id. Pass `id` directly (kebab-case slug derived from intent) or provide a meaningful subject/title/description. Auto `item-<ms>` ids are not admitted because they cannot be referenced by intent.";
        return (String::new(), err.to_string(), 1);
    }
    let id = provided_id.clone()
        .or_else(|| slug.clone())
        .unwrap_or_else(|| format!("item-{}", crate::orchestrator::state::now_ms()));
    let path = prd_path();
    let path_s = path.to_string_lossy().to_string();
    let cas_max_attempts = super::fsm::graph().policy.cas_max_attempts;

    let outcome = cas::cas_retry_write(&path_s, cas_max_attempts, "prd-add", |mut doc: Value| {
        let mut upserted = false;
        if let Some(seq) = doc.as_sequence_mut() {
            let mut new_with_id = item_map.clone();
            new_with_id.insert(Value::String("id".to_string()), Value::String(id.clone()));
            if !new_with_id.contains_key(&Value::String("status".to_string())) {
                new_with_id.insert(Value::String("status".to_string()), Value::String("pending".to_string()));
            }
            let existing = seq.iter_mut().find(|it| {
                it.as_mapping()
                    .and_then(|m| m.get(&Value::String("id".to_string())))
                    .and_then(|v| v.as_str())
                    == Some(id.as_str())
            });
            match existing {
                Some(slot) => { *slot = Value::Mapping(new_with_id); upserted = true; }
                None => seq.push(Value::Mapping(new_with_id)),
            }
        } else {
            return cas::CasOutcome::Abort(String::new(), "prd.yml is not a sequence".to_string(), 1);
        }
        cas::CasOutcome::Write(doc, upserted)
    });
    let upserted = match outcome {
        Ok(u) => u,
        Err((out, err, rc)) => return (out, err, rc),
    };
    invalidate_residual_marker();
    let key = if upserted { "rescoped" } else { "added" };
    #[cfg(target_arch = "wasm32")]
    crate::wasm_dispatch::emit_event("prd.added", serde_json::json!({ "id": id, "rescoped": upserted }));
    (serde_json::json!({ key: id }).to_string(), String::new(), 0)
}

/// Mark an EXISTING, already-tracked PRD row `blockedBy: ["external"]` so residual-scan's
/// `status_is_open(...) && !blocked_external` check (residual.rs) stops treating it as an
/// open row blocking CONSOLIDATE -- without resolving it, which would falsely claim the work
/// is done. `handle_add` already lets a NEW row carry `blockedBy` at creation time, gated by
/// `defer_marker_in_text`'s deviation check; this closes the matching gap for a row that was
/// only discovered to be genuinely cross-session/out-of-reach AFTER it was already added (the
/// common case: a session inherits an open row from a prior session, investigates it, and
/// confirms it is real, correctly-scoped, but requires its own dedicated session -- e.g. a
/// flaky multiplayer/networking repro that is out of scope for the current fix). Same
/// deviation gate as handle_add: `reason` must name the actual concrete reach path, not bare
/// deferral language, so this cannot become a second "declare it externally blocked" exit.
pub fn handle_defer(content: &str) -> (String, String, i32) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return (String::new(), "missing body: {\"id\": \"<prd-item-id>\", \"reason\": \"<why this is genuinely out of reach this session, and what session/path would resolve it>\"}".to_string(), 1);
    }
    let v: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return (String::new(), "parse failed: body must be JSON {\"id\":..,\"reason\":..}".to_string(), 1),
    };
    let id_target = match v.get("id").or_else(|| v.get("prd_id")).or_else(|| v.get("slug")).and_then(|s| s.as_str()) {
        Some(s) if !s.trim().is_empty() => s.to_string(),
        _ => return (String::new(), "missing `id`".to_string(), 1),
    };
    let reason = match v.get("reason").or_else(|| v.get("witness_evidence")).and_then(|s| s.as_str()) {
        Some(s) if !s.trim().is_empty() => s.to_string(),
        _ => return (String::new(), "missing `reason`: name why this row is genuinely out of reach this session and what would resolve it -- bare deferral language is rejected, same as prd-add".to_string(), 1),
    };
    if let Some(marker) = defer_marker_in_text(&reason) {
        let err = format!(
            "prd-defer refused: deferral language detected ('{}'). Same rule as prd-add's own gate -- name the concrete reason this is genuinely cross-session/out-of-reach (e.g. 'flaky multiplayer repro needs its own dedicated debugging session, unrelated to this session's rendering-pipeline fix'), not bare 'later'/'next session' phrasing with no substance.",
            marker
        );
        return (String::new(), err, 1);
    }
    let path = prd_path();
    let path_s = path.to_string_lossy().to_string();
    if !pkfs::exists(&path_s) {
        return (String::new(), format!("{} does not exist", path.display()), 1);
    }
    let policy = super::fsm::graph().policy;
    let outcome = cas::cas_retry_write(&path_s, policy.cas_max_attempts, "prd-defer", |mut doc: Value| {
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
                "error": format!("prd id not found: {}", id_target),
                "deviation_kind": "prd-defer-unknown-id",
                "deviation_severity": "deny",
                "prd_id": id_target,
            }).to_string();
            return cas::CasOutcome::Abort(body, format!("prd id not found: {}", id_target), 1);
        }
        cas::CasOutcome::Write(doc, ())
    });
    match outcome {
        Ok(()) => {
            invalidate_residual_marker();
            #[cfg(target_arch = "wasm32")]
            crate::wasm_dispatch::emit_event("prd.deferred", serde_json::json!({ "id": id_target, "reason": reason }));
            (serde_json::json!({ "deferred": id_target, "blockedBy": ["external"] }).to_string(), String::new(), 0)
        }
        Err((out, err, rc)) => (out, err, rc),
    }
}

fn parse_resolve_target(trimmed: &str) -> (String, Option<String>, Option<String>, Option<String>, Option<String>) {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        let id = v.get("id")
            .or_else(|| v.get("prd_id"))
            .or_else(|| v.get("mutable_id"))
            .or_else(|| v.get("item_id"))
            .or_else(|| v.get("slug"))
            .or_else(|| v.get("key"))
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| trimmed.to_string());
        let mut wit = v.get("witness_evidence")
            .or_else(|| v.get("witness"))
            .or_else(|| v.get("evidence"))
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());
        let mut comment = v.get("commit_comment")
            .or_else(|| v.get("commit_message"))
            .or_else(|| v.get("resolution_note"))
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());
        let mut witness_dispatch_id = v.get("witness_dispatch_id")
            .or_else(|| v.get("dispatch_id"))
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());
        let cwd = v.get("cwd").and_then(|s| s.as_str()).map(|s| s.to_string());
        let id = if let Ok(inner) = serde_json::from_str::<serde_json::Value>(&id) {
            if let Some(im) = inner.as_object() {
                let recovered = im.get("key")
                    .or_else(|| im.get("id"))
                    .or_else(|| im.get("prd_id"))
                    .or_else(|| im.get("slug"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                if wit.is_none() {
                    wit = im.get("witness_evidence")
                        .or_else(|| im.get("witness"))
                        .or_else(|| im.get("evidence"))
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string());
                }
                if comment.is_none() {
                    comment = im.get("commit_comment")
                        .or_else(|| im.get("commit_message"))
                        .or_else(|| im.get("resolution_note"))
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string());
                }
                if witness_dispatch_id.is_none() {
                    witness_dispatch_id = im.get("witness_dispatch_id")
                        .or_else(|| im.get("dispatch_id"))
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string());
                }
                recovered.unwrap_or(id)
            } else {
                id
            }
        } else {
            id
        };
        (id, wit, comment, witness_dispatch_id, cwd)
    } else if let Some((id, wit)) = recover_truncated_envelope(trimmed) {
        (id, wit, None, None, None)
    } else {
        let parts: Vec<&str> = trimmed.splitn(2, char::is_whitespace).collect();
        let id = parts.first().map(|s| s.to_string()).unwrap_or_else(|| trimmed.to_string());
        let wit = parts.get(1).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        (id, wit, None, None, None)
    }
}

fn recover_truncated_envelope(s: &str) -> Option<(String, Option<String>)> {
    let s = s.trim_start();
    if !s.starts_with('{') { return None; }
    let extract = |key: &str| -> Option<String> {
        let needle = format!("\"{}\"", key);
        let after_key = s.find(&needle)? + needle.len();
        let rest = &s[after_key..];
        let colon = rest.find(':')?;
        let after_colon = rest[colon + 1..].trim_start();
        if !after_colon.starts_with('"') { return None; }
        let val = &after_colon[1..];
        let mut out = String::new();
        let mut chars = val.chars();
        while let Some(c) = chars.next() {
            if c == '\\' { if let Some(n) = chars.next() { out.push(n); } continue; }
            if c == '"' { return Some(out); }
            out.push(c);
        }
        if out.is_empty() { None } else { Some(out) }
    };
    let id = extract("id").or_else(|| extract("prd_id")).or_else(|| extract("mutable_id"))
        .or_else(|| extract("item_id")).or_else(|| extract("slug")).or_else(|| extract("key"))?;
    let wit = extract("witness_evidence").or_else(|| extract("witness")).or_else(|| extract("evidence"));
    Some((id, wit))
}

fn nearest_known_id(target: &str, known: &[String]) -> Option<String> {
    if target.is_empty() {
        return None;
    }
    let mut best: Option<(usize, &String)> = None;
    for id in known {
        let d = levenshtein(target, id);
        match best {
            Some((bd, _)) if d >= bd => {}
            _ => best = Some((d, id)),
        }
    }
    best.and_then(|(d, id)| {
        let bound = (target.len().max(id.len()) / 3).max(2);
        if d <= bound { Some(id.clone()) } else { None }
    })
}

/// Whether a registry kind still refuses, after policy overrides.
///
/// These three kinds default to Severity::Deny in the registry, matching the
/// structural refusal each already performed, so with the default empty override
/// map this returns true at every call site and behaviour is unchanged. It exists
/// for the demotion direction: a project whose workflow legitimately resolves rows
/// without per-row witness text sets the kind to "log" and gets the event without
/// the refusal, instead of having to disable the whole policy flag.
fn deviation_refuses(kind: &str) -> bool {
    super::deviations::effective_severity(kind) == super::deviations::Severity::Deny
}

pub fn handle_resolve(content: &str) -> (String, String, i32) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return (String::new(), "missing PRD item id".to_string(), 1);
    }
    let (id_target, witness, commit_comment, witness_dispatch_id, resolve_cwd) = parse_resolve_target(trimmed);
    let policy = super::fsm::graph().policy;
    let has_witness = witness.as_ref().map(|w| !w.trim().is_empty()).unwrap_or(false);
    if policy.require_witness_evidence && !has_witness && deviation_refuses("prd-resolve-no-witness") {
        let body = serde_json::json!({
            "error": format!("prd-resolve refused: no witness_evidence for {}", id_target),
            "deviation_kind": "prd-resolve-no-witness",
            "deviation_severity": "deny",
            "prd_id": id_target,
            "hint": "resolve requires non-empty witness_evidence (file:line | codesearch hit | exec snippet | browser page.evaluate result). A row cannot be marked completed without evidence the work is real - this gate exists because an agent under closure-pressure marked undone tasks completed with an absent witness. Body shape: {\"id\": \"<prd-item-id>\", \"witness_evidence\": \"<file:line or codesearch hit>\", \"commit_comment\": \"<optional one-line resolution note, bundled into the next commit message>\"}. Do the work, capture its witness, then resolve.",
        }).to_string();
        return (body, format!("prd-resolve refused: no witness_evidence for {}", id_target), 1);
    }
    #[cfg(target_arch = "wasm32")]
    if let Some(dispatch_id) = witness_dispatch_id.as_ref() {
        let cwd = resolve_cwd.as_deref().unwrap_or("");
        if crate::dispatch_ledger::lookup(cwd, dispatch_id).is_none() {
            let body = serde_json::json!({
                "error": format!("prd-resolve refused: witness_dispatch_id {} not found in this guest's dispatch ledger", dispatch_id),
                "deviation_kind": "prd-resolve-fabricated-dispatch",
                "deviation_severity": "deny",
                "prd_id": id_target,
                "witness_dispatch_id": dispatch_id,
                "hint": "witness_dispatch_id must be the `dispatch_id` field returned in a PRIOR spool response (every verb's response now carries one). This id was not found in .gm/exec-spool/.dispatch-ledger.json, so it does not correspond to a real dispatch that actually ran -- either it was invented, or it belongs to a different cwd/project. Resolve again either omitting witness_dispatch_id, or with the exact dispatch_id copied from the response of the dispatch that produced this row's evidence.",
            }).to_string();
            return (body, format!("prd-resolve refused: unknown witness_dispatch_id for {}", id_target), 1);
        }
    }
    let path = prd_path();
    let path_s = path.to_string_lossy().to_string();
    if !pkfs::exists(&path_s) {
        return (String::new(), format!("{} does not exist", path.display()), 1);
    }

    if policy.reject_duplicate_witness && deviation_refuses("prd-resolve-duplicate-witness") {
    if let Some(w) = witness.as_ref() {
        let trimmed_w = w.trim();
        if trimmed_w.len() >= 24 {
            if let Some(existing) = pkfs::read_to_string(&path_s) {
                if let Ok(doc) = serde_yaml::from_str::<Value>(&existing) {
                    if let Some(seq) = doc.as_sequence() {
                        for item in seq {
                            if let Some(map) = item.as_mapping() {
                                let other_id = map.get(&Value::String("id".to_string())).and_then(|v| v.as_str());
                                if other_id == Some(id_target.as_str()) { continue; }
                                let other_witness = map.get(&Value::String("witness".to_string())).and_then(|v| v.as_str());
                                if other_witness.map(|ow| ow.trim() == trimmed_w).unwrap_or(false) {
                                    let body = serde_json::json!({
                                        "error": format!("prd-resolve refused: witness_evidence for {} is byte-identical to the witness already recorded for {}", id_target, other_id.unwrap_or("?")),
                                        "deviation_kind": "prd-resolve-duplicate-witness",
                                        "deviation_severity": "deny",
                                        "prd_id": id_target,
                                        "duplicate_of": other_id,
                                        "hint": "Identical witness text across structurally distinct PRD rows is the rubber-stamp tell -- generic phrasing like 'code written and tested' copy-pasted across multiple ids means the rows were marked completed without each one's own real, distinct evidence. Every row's witness_evidence must be specific to what THAT row actually did: a distinct file:line, a distinct exec_js/browser output, a distinct codesearch hit. If the rows genuinely share one piece of evidence (rare), that itself is a sign they should have been one row, not three -- re-scope via prd-add instead of resolving separately with copy-pasted text.",
                                    }).to_string();
                                    return (body, format!("prd-resolve refused: duplicate witness_evidence for {}", id_target), 1);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    }

    let resolved_status = if policy
        .prd_closed_statuses
        .iter()
        .any(|s| s.eq_ignore_ascii_case("completed"))
    {
        "completed".to_string()
    } else {
        policy
            .prd_closed_statuses
            .first()
            .cloned()
            .unwrap_or_else(|| "completed".to_string())
    };

    let outcome = cas::cas_retry_write(&path_s, policy.cas_max_attempts, "prd-resolve", |mut doc: Value| {
        let mut found = false;
        if let Some(seq) = doc.as_sequence_mut() {
            for item in seq.iter_mut() {
                if let Some(map) = item.as_mapping_mut() {
                    if map.get(&Value::String("id".to_string())).and_then(|v| v.as_str()) == Some(&id_target) {
                        map.insert(Value::String("status".to_string()), Value::String(resolved_status.clone()));
                        if let Some(w) = witness.as_ref() {
                            map.insert(Value::String("witness".to_string()), Value::String(w.clone()));
                        }
                        if let Some(c) = commit_comment.as_ref() {
                            map.insert(Value::String("commit_comment".to_string()), Value::String(c.clone()));
                        }
                        found = true;
                    }
                }
            }
        }
        if !found {
            let mut known_ids: Vec<String> = Vec::new();
            if let Some(seq) = doc.as_sequence() {
                for item in seq {
                    if let Some(m) = item.as_mapping() {
                        if let Some(id_v) = m.get(&Value::String("id".to_string())) {
                            if let Some(id_s) = id_v.as_str() {
                                known_ids.push(id_s.to_string());
                            }
                        }
                    }
                }
            }
            let suggested_id = nearest_known_id(&id_target, &known_ids);
            let body = serde_json::json!({
                "error": format!("prd id not found: {}", id_target),
                "deviation_kind": "prd-resolve-unknown-id",
                "deviation_severity": "deny",
                "prd_id": id_target,
                "known_ids": known_ids,
                "suggested_id": suggested_id,
                "hint": "body shape: {\"id\": \"<prd-item-id>\", \"witness_evidence\": \"<file:line or codesearch hit>\", \"commit_comment\": \"<optional one-line resolution note>\"}; aliases accepted: prd_id, mutable_id, item_id, slug, key (all map to id); commit_message, resolution_note (map to commit_comment). commit_comment is optional -- when present it rides on the row until the next git_commit/git_finalize bundles it into that commit's message and clears the row. A nested envelope (prd_id holding a stringified {\"key\":..,\"witness\":..} object) is unwrapped automatically and the inner key/id/prd_id/slug is recovered. Raw text body: first whitespace-delimited token = id, rest = witness_evidence. If `suggested_id` is non-null it is the closest known id to what you passed -- likely a typo; re-dispatch with it. If the recovered id is not in `known_ids` above, the row was never `prd-add`ed in this chain -- your next dispatch is `prd-add` with this id, THEN `prd-resolve`. Do not invent ids; resolve only what was added; never retry the same unknown id unchanged.",
            }).to_string();
            return cas::CasOutcome::Abort(body, format!("prd id not found: {}", id_target), 1);
        }
        cas::CasOutcome::Write(doc, ())
    });
    match outcome {
        Ok(()) => {
            #[cfg(target_arch = "wasm32")]
            crate::wasm_dispatch::emit_event("prd.resolved", serde_json::json!({ "id": id_target }));
            (serde_json::json!({ "resolved": id_target, "commit_comment_attached": commit_comment.is_some(), "witness_dispatch_id_verified": witness_dispatch_id.is_some() }).to_string(), String::new(), 0)
        }
        Err((out, err, rc)) => (out, err, rc),
    }
}
