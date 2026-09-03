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
   