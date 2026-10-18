# Agent Note: Trajectory inspect keeps keyboard focus

Status: implemented

## Problem

A tool row's Inspect action in Chat sets the inspect target and switches to Trajectory. The
Chat button is removed by the view change, so focus fell to `BODY`. A keyboard user lost their
place at the moment the inspector opened.

## Decision

When an Inspect request is applied, the trajectory table focuses its details pane
(`aside[aria-label="Event details"]`, now `tabIndex: -1`) after the render. The pane is always
mounted for a selected record, so focus does not depend on the virtualized row being mounted.
The focus request is consumed with the pending scroll and retried for a bounded number of frames
(`FOCUS_INSPECTOR_FRAMES`) if the pane is not yet in the DOM.

## Alternatives considered

Focus the target trajectory row. The row can be unmounted by virtualization after the scroll
(the table rendered index 40 as absent after Inspect), so focus would be lost again.

Keep focus on the removed Chat button. The button no longer exists after the view change.

## Consequences

Live: from a Chat tool row, Enter/click on Inspect lands focus on the `Event details` pane in a
fresh browser profile. Other inspector entries (timeline selection, search) keep their existing
focus behavior because they do not set the Inspect request.
