# Agent Note: txiki os.networkInterfaces and util.parseArgs

Status: implemented

## Problem

os.networkInterfaces and util.parseArgs were gaps under txiki. The txiki shape of networkInterfaces was unknown, and parseArgs is pure JS that agent code can reach.

## Decision

- networkInterfaces regroups tjs.system.networkInterfaces into Node's name-keyed shape in pure JS, deriving family from the address and cidr from the netmask. It is a present name, verified by parity cases against Node's output.
- parseArgs is implemented in pure JS for the common forms and Node's error codes and messages. Node is the oracle for every case in test/parity-cases.js.
- Omitting args stays a gap, because txiki has no JS-level argv equal to Node's.

## Alternatives considered

- Keep both as gaps. Rejected: the txiki shape of networkInterfaces is available, and parseArgs is pure JS.
- Depend on a maintained argument parser. Not taken: Node's parseArgs is the contract, and matching it directly is a small surface.

## Consequences

- The txiki gap list drops os.networkInterfaces and util.parseArgs, and adds util.parseArgs without args.
- The parity suite runs 159 shared cases; txiki matches all of them.
