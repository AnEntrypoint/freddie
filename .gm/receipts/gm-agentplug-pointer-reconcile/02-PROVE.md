# PROVE
Pre: gm parent index equals HEAD pointer 714ed34 (git_diff dispatch 1791868118477-500-1b2a0be371643b; git_show of pin commit 3d2664a, dispatch 1791868152203-500-60efd7f1e7da78f1: agentplug bc0db1f9f -> 714ed34b6).
Invariant: 714ed34 is an ancestor of origin/main. git_fetch dispatch 1791868129586-500-e8f2275aa165577f reports 714ed34..c732127 as a fast-forward of origin/main.
Post: pointer 714ed34 is reachable and published; no bump required.
