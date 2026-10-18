# Agent Note: Narrow navigation preserves resident session state

Status: implemented

## Problem

Expanding a 280px sidebar in a 320px frame leaves 40px for the conversation. Closing navigation can also lose keyboard focus when the sidebar removes its brand after its collapse animation. A zero-width Details column must not retain keyboard targets.

## Decision

Below the existing auto-collapse breakpoint, expanded navigation uses the full frame width. Conversation and Details remain mounted but hidden and inert. Escape or a different session selection closes navigation. The sidebar marks its toggle for focus restoration and keeps a stable leading logo wrapper so the cached toggle is not detached when collapse settles. Details is also hidden and inert whenever its effective column width is zero.

## Alternatives considered

**Keep a squeezed conversation.** The 40px fallback exposes controls and text without usable space.

**Unmount the conversation.** Resident drafts, textarea identity and view state belong to the session; visibility changes do not replace that state.

**Use a delayed focus timer.** Focus continuity must follow the owner structure, rather than an assumed animation duration. A stable wrapper preserves the current toggle through the 150ms sidebar settlement.

**Use a modal drawer.** Navigation can occupy its own narrow view, preserving the existing return control without another overlay or focus trap.

## Consequences

Desktop column sizing and drag behavior retain their existing rules. Narrow navigation has one visible region and desktop-only sidebar drag handles. Hidden Details keeps its stored preference and mounted contents for reopening.

## Verification

Native Chrome Enter opens full-width 320px navigation, with the conversation hidden and inert. Native Escape restores the 56px rail and retains Open sidebar focus in a later settled dispatch, preserving the same textarea and opener. The zero-width Details column is hidden and inert with a zero-sized close control. Different-session selection and restored desktop Details access require the broader live integration review.
