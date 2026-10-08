# Agent Note: Settings layout follows available content width

Status: implemented

## Problem

A narrow Settings dialog can reserve more space for navigation than for settings. At a 390px window, the 342px dialog reserves 188px for navigation and leaves 154px for content; the preset and permission selectors extend past the dialog edge. Viewport-only row breakpoints cannot account for the space navigation and dialog padding consume.

## Decision

The [Settings shell](../../../../packages/client/ui-settings-general/README.md) uses a horizontal, scrollable section list below its title and actions on narrow screens. Its options area declares the named inline-size container `freddie-settings-content`. Each feature owns its row adaptation: preset, permission, busy-Enter behavior, and shortcut rows stack at 420px of available content width, while the Appearance cards share the available row. The shell does not select feature-specific row classes.

Navigation focus reveals the complete button with inline scroll padding. Option focus scrolls its control into view with 8px of block scroll padding, including focus reached through the modal trap. Section registration, translated text, modal ownership, and durable settings operations keep their existing owners.

## Alternatives considered

- Smaller navigation and selector labels preserve the split layout but still leave descriptions and longer translations with too little space.
- Horizontal scrolling for the entire dialog makes every row require two-axis navigation and obscures the relationship between each description and its control.
- Viewport breakpoints in each feature row ignore the space consumed by shell navigation. A named content container measures the row capacity without a shared feature-specific selector list.

## Consequences

Narrow dialogs use more vertical space for each General setting and preserve horizontal space for complete descriptions and controls. The options area scrolls independently; desktop dialogs retain their 800px panel and side navigation. Feature rows depend on the shell's named container rather than the window width.

Live verification uses the real web profile at 320px and 390px: all General controls fit horizontally, native Tab reveals the full Agent presets navigation button with a 2px outline, and Shift+Tab wraps within the modal to Edit shortcuts with 8px below its focus target. Native Escape closes Settings and returns focus to the localized Settings trigger. A 1280px window retains side navigation and horizontal setting rows; Dark applies its real appearance preference and System is restored afterward.
